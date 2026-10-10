// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assessWorkflowCapabilities,
  createDefaultCapabilityRegistry,
  loadCapabilityRegistry,
  saveCapabilityRegistry,
  setCapabilityStatus,
  updateCapability,
  validateCapabilityRegistry,
} from "../../server/hermes-agent/capability-registry-state.js";
import { createDefaultExecutionRegistry } from "../../server/hermes-agent/execution-registry-state.js";
import type { CapabilityRegistryState } from "../../src/features/capabilities/types";
import type { ExecutionRegistryState } from "../../src/features/execution/types";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const registryPath = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-capability-registry-"));
  directories.push(directory);
  return path.join(directory, "capability-registry.json");
};

const workflow = (id: string) => (createDefaultExecutionRegistry() as ExecutionRegistryState).workflows.find((entry) => entry.id === id)!;

describe("capability registry persistence and routing policy", () => {
  it("ships a secret-free, governed capability inventory", () => {
    const registry = validateCapabilityRegistry(createDefaultCapabilityRegistry()) as CapabilityRegistryState;
    expect(registry.capabilities.length).toBeGreaterThan(8);
    expect(registry.capabilities.some((capability) => capability.id === "erpnext-production" && capability.enforcement === "block")).toBe(true);
    expect(registry.capabilities.every((capability) => !/password\s*[=:]|api[_-]?key\s*[=:]|bearer\s+[a-z0-9]/i.test(capability.connectionReference))).toBe(true);
  });

  it("blocks a workflow when a required blocking capability is not verified", () => {
    const registry = createDefaultCapabilityRegistry() as CapabilityRegistryState;
    const production = registry.capabilities.find((capability) => capability.id === "erpnext-production")!;
    production.workflowIds = ["personal-daily-planning"];
    production.ownerKey = "personal-assistant";
    production.allowedAgentKeys = ["personal-assistant"];
    const assessment = assessWorkflowCapabilities(workflow("personal-daily-planning"), registry);

    expect(assessment.decision).toBe("blocked");
    expect(assessment.blockers.join(" ")).toContain("ERPNext production environment");
  });

  it("keeps review-level dependencies visible without treating them as authorization", () => {
    const registry = createDefaultCapabilityRegistry() as CapabilityRegistryState;
    const assessment = assessWorkflowCapabilities(workflow("pabk-erp-change"), registry);

    expect(assessment.decision).toBe("review");
    expect(assessment.warnings.join(" ")).toContain("ERPNext development environment");
    expect(assessment.blockers).toEqual([]);
  });

  it("records status updates and persists validated state atomically", () => {
    const registry = createDefaultCapabilityRegistry() as CapabilityRegistryState;
    const updated = setCapabilityStatus(registry, {
      capabilityId: "erpnext-development",
      status: "available",
      statusNote: "Verified against the approved development connection.",
      actor: "Faza",
    }).state as CapabilityRegistryState;
    const withBoundary = updateCapability(updated, {
      capabilityId: "erpnext-development",
      patch: { usageBoundary: "Development only; production remains outside this capability." },
      actor: "Faza",
    }).state as CapabilityRegistryState;
    const file = registryPath();
    const saved = saveCapabilityRegistry(withBoundary, file) as CapabilityRegistryState;

    expect(saved.auditEvents.some((event) => event.type === "capability_status_changed")).toBe(true);
    expect(loadCapabilityRegistry(file)).toEqual(saved);
    expect(fs.readdirSync(path.dirname(file)).some((entry) => entry.endsWith(".tmp"))).toBe(false);
  });
});
