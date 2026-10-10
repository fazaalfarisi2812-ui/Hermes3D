// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadOrganizationState, saveOrganizationState } from "../../server/hermes-agent/organization-state.js";
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });
const state = () => ({ version: 1, organization: {
  companyName: "Test", ownerName: "Owner", operatingModel: {
    title: "Human approval", summary: "Human owner keeps final control.",
    authority: [{ label: "Draft", detail: "Prepare a recommendation." }], controls: [], escalationPath: ["Owner"],
  },
}, files: [["specialist/AGENTS.md", "Review evidence"]], agents: [
  { id: "hermes", name: "Hermes", reportsTo: "human-owner", settings: { model: "test" } },
  { id: "specialist", name: "Specialist", reportsTo: "hermes", responsibilities: ["Review"], settings: { model: "test" } },
] });
const filePath = () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-org-")); directories.push(directory); return path.join(directory, "state.json"); };

describe("Hermes organization persistence", () => {
  it("restores managers, role instructions, and specialist settings after saving", () => {
    const file = filePath();
    const value = state();
    saveOrganizationState(value, file);
    expect(loadOrganizationState(file)).toEqual(value);
  });
  it("rejects cyclic reporting lines without overwriting saved state", () => {
    const file = filePath();
    const original = state();
    saveOrganizationState(original, file);
    const invalid = state();
    invalid.agents[0].reportsTo = "specialist";
    expect(() => saveOrganizationState(invalid, file)).toThrow("cycle");
    expect(loadOrganizationState(file)).toEqual(original);
  });
  it("rejects missing managers and duplicate agent IDs", () => {
    const invalid = state();
    invalid.agents[1].reportsTo = "missing";
    expect(() => saveOrganizationState(invalid, filePath())).toThrow("not found");
    invalid.agents[1].id = "hermes";
    expect(() => saveOrganizationState(invalid, filePath())).toThrow("duplicate");
  });
  it("surfaces corrupt persisted data instead of replacing it", () => {
    const file = filePath();
    fs.writeFileSync(file, "{broken");
    expect(() => loadOrganizationState(file)).toThrow();
    expect(fs.readFileSync(file, "utf8")).toBe("{broken");
  });
});
