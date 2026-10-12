import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error("Provide a screenshot output directory.");
fs.mkdirSync(outputDirectory, { recursive: true });

const response = await fetch("http://localhost:3001/api/operations-loop", { cache: "no-store" });
assert.equal(response.ok, true, "Autonomous Operations API must be available.");
const { operations, registry } = await response.json();
assert.ok(operations, "Operations state must be available.");
assert.ok(registry?.workflows?.some((workflow) => workflow.lifecycle === "ready"), "At least one ready workflow is required.");

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

    await page.goto("http://localhost:3001/operations", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Autonomous Operations", exact: true }).waitFor();
    await page.getByRole("region", { name: "Ringkasan operasi" }).getByText(`${operations.signals.filter((signal) => signal.status === "new").length} signal baru`, { exact: true }).waitFor();
    await page.getByRole("heading", { name: "Signal masuk", exact: true }).waitFor();
    await page.getByRole("textbox", { name: "Judul signal" }).fill("Uji tampilan Autonomous Operations");
    await page.getByRole("textbox", { name: "Detail signal" }).fill("Tidak dikirim; pengujian hanya memeriksa field antarmuka.");
    await page.screenshot({ path: path.join(outputDirectory, `autonomous-operations-${name}.png`), fullPage: true });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `${name} horizontal overflow`);
    assert.deepEqual(errors, [], `${name} runtime errors`);
    console.log(`PASS ${name}: operations control plane renders without overflow or runtime errors.`);
    await page.close();
  }
} finally {
  await browser.close();
}
