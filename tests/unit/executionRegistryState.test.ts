// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createDefaultExecutionRegistry,
  getExecutionReadinessSummary,
  getWorkflowReadiness,
  loadExecutionRegistry,
  saveExecutionRegistry,
  validateExecutionRegistry,
} from "../../server/hermes-agent/execution-registry-state.js";
import type { ExecutionRegistryState } from "../../src/features/execution/types";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const registryPath = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-execution-registry-"));
  directories.push(directory);
  return path.join(directory, "execution-registry.json");
};

describe("execution registry persistence", () => {
  it("ships ready, governed workflows with owners, evidence, and rollback plans", () => {
    const registry = createDefaultExecutionRegistry() as ExecutionRegistryState;
    const workflows = (validateExecutionRegistry(registry) as ExecutionRegistryState).workflows;

    expect(workflows).toHaveLength(11);
    expect(workflows.filter((workflow) => workflow.lifecycle === "ready")).not.toHaveLength(0);
    expect(workflows.every((workflow) => workflow.allowedAgentKeys.includes(workflow.ownerKey))).toBe(true);
    expect(workflows.every((workflow) => workflow.evidence.length > 0 && workflow.rollback.length > 0)).toBe(true);
    expect(workflows.every((workflow) => workflow.systemOfRecord && workflow.executionMode && workflow.oversightMode && workflow.escalationOwner)).toBe(true);
    expect(workflows.every((workflow) => Object.values(workflow.productionReadiness).filter((value) => typeof value === "boolean").length === 5)).toBe(true);
    expect(workflows.every((workflow) => workflow.controlProfile.interruptible && workflow.controlProfile.pauseAndResume && workflow.controlProfile.partialResultsAllowed && workflow.controlProfile.promptInjectionReview)).toBe(true);
    expect(workflows.every((workflow) => workflow.controlProfile.confirmationRequiredFor.includes("external") && workflow.controlProfile.confirmationRequiredFor.includes("irreversible"))).toBe(true);
    expect(workflows.every((workflow) => workflow.qualityGate.mode === "independent_review" && workflow.qualityGate.selfReviewProhibited && workflow.qualityGate.maxIterations === 3)).toBe(true);
    expect(workflows.every((workflow) => workflow.qualityGate.requiredReviewRoles.includes("critic") && workflow.qualityGate.failOn.includes("critical"))).toBe(true);
  });

  it("exposes an explicit pilot-to-production readiness gap", () => {
    const registry = validateExecutionRegistry(createDefaultExecutionRegistry()) as ExecutionRegistryState;
    const workflow = registry.workflows[0];
    const readiness = getWorkflowReadiness(workflow);
    const summary = getExecutionReadinessSummary(registry);

    expect(readiness.status).toBe("not_assessed");
    expect(readiness.gaps).toHaveLength(5);
    expect(summary.notAssessed).toBe(registry.workflows.length);
  });

  it("rejects duplicate workflow IDs and owners outside the assigned team", () => {
    const duplicate = createDefaultExecutionRegistry() as ExecutionRegistryState;
    duplicate.workflows[1].id = duplicate.workflows[0].id;
    expect(() => validateExecutionRegistry(duplicate)).toThrow("Duplicate workflow id");

    const invalidOwner = createDefaultExecutionRegistry() as ExecutionRegistryState;
    invalidOwner.workflows[0].ownerKey = "agent-not-assigned";
    expect(() => validateExecutionRegistry(invalidOwner)).toThrow("owner must be included");
  });

  it("rejects malformed action control profiles", () => {
    const invalid = createDefaultExecutionRegistry() as ExecutionRegistryState;
    invalid.workflows[0].controlProfile = { recurrenceAllowed: "yes" } as never;
    expect(() => validateExecutionRegistry(invalid)).toThrow("Control recurrenceAllowed must be a boolean");
  });

  it("rejects unsafe quality gate configuration", () => {
    const invalid = createDefaultExecutionRegistry() as ExecutionRegistryState;
    invalid.workflows[0].qualityGate = { maxIterations: 9 } as never;
    expect(() => validateExecutionRegistry(invalid)).toThrow("Quality gate maxIterations must be an integer between 1 and 5");
  });

  it("persists validated state atomically and restores it unchanged", () => {
    const file = registryPath();
    const saved = saveExecutionRegistry(createDefaultExecutionRegistry() as ExecutionRegistryState, file) as ExecutionRegistryState;

    expect(fs.existsSync(file)).toBe(true);
    expect(loadExecutionRegistry(file)).toEqual(saved);
    expect(fs.readdirSync(path.dirname(file)).some((entry) => entry.endsWith(".tmp"))).toBe(false);
  });
});
