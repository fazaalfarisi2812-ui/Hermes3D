import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error("Provide a screenshot output directory.");
fs.mkdirSync(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", args: ["--use-angle=swiftshader"] });
try {
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://localhost:3001/evaluations", { waitUntil: "load" });
    await page.getByRole("heading", { name: "Kualitas kerja dan pembelajaran agent", exact: true }).waitFor();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Sinkronkan" }).click();
    await page.getByRole("status").getByText("Work order selesai sudah disinkronkan.", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(outputDirectory, `evaluation-learning-${name}.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `${name} horizontal overflow`);
    assert.deepEqual(errors, [], `${name} runtime errors`);
    console.log(`PASS ${name}: evaluation and learning surface renders without overflow or runtime errors.`);
    await page.close();
  }
} finally {
  await browser.close();
}
