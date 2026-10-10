import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error("Provide a screenshot output directory.");
fs.mkdirSync(outputDirectory, { recursive: true });

const response = await fetch("http://localhost:3001/api/agent-identities", { cache: "no-store" });
assert.equal(response.ok, true, "Agent Identity Registry API must be available.");
const { registry } = await response.json();
assert.ok(registry?.identities?.length, "Agent Identity Registry must contain identities.");

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

    await page.goto("http://localhost:3001/identities", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Agent Identity & Delegation", exact: true }).waitFor();
    await page.getByRole("region", { name: "Ringkasan Agent Identity Registry" }).getByText(`${registry.identities.length} identitas`, { exact: true }).waitFor();
    await page.getByRole("region", { name: "Daftar identitas agent" }).getByRole("button", { name: new RegExp(registry.identities[0].displayName) }).click();
    await page.getByRole("region", { name: "Detail identitas dan mandat" }).getByLabel("Kelas agent").waitFor();
    await page.getByRole("region", { name: "Mandat delegasi" }).getByLabel("Workflow mandat baru").waitFor();
    await page.screenshot({ path: path.join(outputDirectory, `agent-identity-${name}.png`), fullPage: true });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `${name} horizontal overflow`);
    assert.deepEqual(errors, [], `${name} runtime errors`);
    console.log(`PASS ${name}: agent identity control plane renders without overflow or runtime errors.`);
    await page.close();
  }
} finally {
  await browser.close();
}
