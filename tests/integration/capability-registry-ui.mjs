import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error("Provide a screenshot output directory.");
fs.mkdirSync(outputDirectory, { recursive: true });

const response = await fetch("http://localhost:3001/api/capability-registry", { cache: "no-store" });
assert.equal(response.ok, true, "Capability Registry API must be available.");
const { registry } = await response.json();
assert.ok(registry?.capabilities?.length, "Capability Registry must contain capabilities.");

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

    await page.goto("http://localhost:3001/capabilities", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Capabilities & Connectors", exact: true }).waitFor();
    await page.getByRole("region", { name: "Ringkasan capability" }).getByText(`${registry.capabilities.length} capability`, { exact: true }).waitFor();
    await page.getByRole("region", { name: "Daftar capability" }).getByRole("button", { name: new RegExp(registry.capabilities[0].name) }).click();
    await page.getByRole("region", { name: "Detail capability" }).getByLabel("Nama capability").waitFor();
    await page.getByRole("region", { name: "Status dan verifikasi capability" }).getByLabel("Status capability", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(outputDirectory, `capability-registry-${name}.png`), fullPage: true });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `${name} horizontal overflow`);
    assert.deepEqual(errors, [], `${name} runtime errors`);
    console.log(`PASS ${name}: capability control plane renders without overflow or runtime errors.`);
    await page.close();
  }
} finally {
  await browser.close();
}
