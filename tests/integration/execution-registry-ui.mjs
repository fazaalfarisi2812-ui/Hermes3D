import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error("Provide a screenshot output directory.");
fs.mkdirSync(outputDirectory, { recursive: true });

const response = await fetch("http://localhost:3001/api/execution-registry", { cache: "no-store" });
assert.equal(response.ok, true, "Execution Registry API must be available.");
const { registry } = await response.json();
assert.ok(registry?.workflows?.length, "Execution Registry must contain workflows.");
const readyWorkflow = registry.workflows.find((workflow) => workflow.lifecycle === "ready");
const sharedWorkflow = registry.workflows.find((workflow) => !workflow.project);
assert.ok(readyWorkflow, "At least one ready workflow is required.");
assert.ok(sharedWorkflow, "At least one shared workflow is required.");

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  args: ["--use-angle=swiftshader"],
});

try {
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("http://localhost:3001/execution", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Execution Registry", exact: true }).waitFor();
    await page.getByRole("region", { name: "Ringkasan registry" }).getByText(`${registry.workflows.length} workflow`, { exact: true }).waitFor();
    await page.getByRole("region", { name: "Daftar workflow" }).getByRole("button", { name: new RegExp(readyWorkflow.name) }).waitFor();
    await page.getByRole("region", { name: "Daftar workflow" }).getByRole("button", { name: new RegExp(sharedWorkflow.name) }).click();
    await page.getByRole("combobox", { name: "Filter proyek workflow" }).selectOption("__shared");
    await page.getByRole("region", { name: "Daftar workflow" }).getByRole("button", { name: new RegExp(sharedWorkflow.name) }).waitFor();
    await page.getByRole("combobox", { name: "Filter status workflow" }).selectOption(sharedWorkflow.lifecycle);
    await page.getByRole("region", { name: "Detail workflow" }).getByLabel("Nama workflow").waitFor();
    await page.screenshot({ path: path.join(outputDirectory, `execution-registry-${name}.png`), fullPage: true });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `${name} horizontal overflow`);
    assert.deepEqual(errors, [], `${name} runtime errors`);
    console.log(`PASS ${name}: registry list, shared filter, detail editor, and responsive layout.`);
    await page.close();
  }
} finally {
  await browser.close();
}
