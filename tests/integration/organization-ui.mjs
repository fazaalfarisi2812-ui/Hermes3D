import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import organizationState from "../../server/hermes-agent/organization-state.js";

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error("Provide a screenshot output directory.");
fs.mkdirSync(outputDirectory, { recursive: true });
const expected = organizationState.loadOrganizationState();
assert.ok(expected?.organization, "An organization must be configured before UI verification.");
const projectRoles = expected.agents.filter((agent) => agent.project);
const project = projectRoles[0].project;
const projectTeam = projectRoles.filter((agent) => agent.project === project);
const otherProject = projectRoles.find((agent) => agent.project !== project);
const inactiveProjects = expected.organization.projects.filter((entry) => entry.status === "inactive");
assert.ok(inactiveProjects.length >= 2, "Expected at least two inactive projects.");
const inactiveProject = inactiveProjects[0];
const inactiveProjectTeam = projectRoles.filter((agent) => agent.project === inactiveProject.name);
assert.ok(inactiveProjectTeam.length > 0, "Expected agents for the inactive project.");
assert.ok(inactiveProjectTeam.every((agent) => agent.projectStatus === "inactive"), "Inactive project agents must be marked inactive.");
const specialist = projectTeam.find((agent) => agent.hierarchyRole === "member");
const sharedDepartment = expected.agents.find((agent) => !agent.project &&
  expected.agents.filter((entry) => entry.department === agent.department).length > 1).department;
const departmentSize = expected.agents.filter((agent) => agent.department === sharedDepartment).length;
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", args: ["--use-angle=swiftshader"] });
try {
  for (const [name, viewport] of process.env.ORGANIZATION_OFFICE_ONLY ? [] : [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://localhost:3001/organization", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: expected.organization.companyName, exact: true }).waitFor();
    await page.getByText(String(expected.agents.length), { exact: true }).first().waitFor();
    await page.getByRole("region", { name: "Model operasi organisasi" }).waitFor();
    await page.getByRole("region", { name: "Ruang kolaborasi agent" }).waitFor();
    await page.getByRole("heading", { name: "Ruang kerja bersama", exact: true }).waitFor();
    await page.getByRole("region", { name: "Ruang kolaborasi agent" }).getByRole("heading", { name: `${project} room`, exact: true }).waitFor();
    await page.getByText("Wajib persetujuan Faza", { exact: true }).waitFor();
    await page.getByRole("region", { name: "Proyek nonaktif" }).getByText(inactiveProject.name, { exact: true }).waitFor();
    await page.screenshot({ path: path.join(outputDirectory, `organization-${name}.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `${name} horizontal overflow`);
    await page.getByRole("textbox", { name: "Cari agen atau proyek" }).fill(project);
    const chart = page.getByRole("region", { name: "Bagan organisasi" });
    await chart.getByText(projectTeam[0].name, { exact: true }).waitFor();
    assert.equal(await chart.getByText(otherProject.name, { exact: true }).count(), 0);
    await chart.getByText(specialist.name, { exact: true }).click();
    await page.getByRole("complementary", { name: "Detail agen" }).getByRole("heading", { name: specialist.name, exact: true }).waitFor();
    await page.getByRole("tab", { name: "Direktori" }).click();
    assert.equal(await page.getByRole("region", { name: "Direktori agen" }).getByRole("button").count(), projectTeam.length);
    await page.getByRole("textbox", { name: "Cari agen atau proyek" }).fill(inactiveProject.name);
    await page.getByRole("region", { name: "Direktori agen" }).getByText(`${inactiveProject.name} · Nonaktif`, { exact: true }).first().waitFor();
    await page.getByRole("region", { name: "Direktori agen" }).getByText(inactiveProjectTeam[0].name, { exact: true }).click();
    await page.getByRole("complementary", { name: "Detail agen" }).getByText("Nonaktif — tidak menerima pekerjaan baru", { exact: true }).waitFor();
    await page.getByRole("textbox", { name: "Cari agen atau proyek" }).fill("");
    await page.getByRole("combobox", { name: "Filter fungsi" }).selectOption(sharedDepartment);
    assert.equal(await page.getByRole("region", { name: "Direktori agen" }).getByRole("button").count(), departmentSize);
    assert.deepEqual(errors, [], `${name} runtime errors`);
    console.log(`PASS ${name}: operating model, inactive project status, chart, role details, project search, department filter, and layout.`);
    await page.close();
  }
  const office = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  office.on("pageerror", (error) => console.error(`Office error: ${error.message}`));
  await office.addInitScript(() => window.localStorage.setItem("hermes3d:onboarding:completed", "true"));
  await office.goto("http://localhost:3001/office", { waitUntil: "domcontentloaded", timeout: 60000 });
  await office.getByRole("link", { name: "Struktur organisasi", exact: true }).waitFor({ timeout: 45000 });
  await office.getByRole("link", { name: "Execution Registry", exact: true }).waitFor({ timeout: 45000 });
  await office.getByText(new RegExp(`agents ${expected.agents.length} \\| events`, "i")).waitFor({ timeout: 45000 });
  await office.locator("canvas:visible").first().waitFor({ state: "visible", timeout: 45000 });
  await office.screenshot({ path: path.join(outputDirectory, "office-with-organization.png") });
  await office.locator("canvas:visible").first().screenshot({ path: path.join(outputDirectory, "office-canvas.png") });
  console.log(`PASS office: organization link, ${expected.agents.length} agents loaded, and office canvas visible.`);
  await office.close();
} finally {
  await browser.close();
}
