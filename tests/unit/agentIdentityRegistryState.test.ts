// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createDefaultCapabilityRegistry } from "../../server/hermes-agent/capability-registry-state.js";
import { createDefaultExecutionRegistry } from "../../server/hermes-agent/execution-registry-state.js";
import {
  assessWorkflowDelegation,
  createDefaultAgentIdentityRegistry,
  loadAgentIdentityRegistry,
  saveAgentIdentityRegistry,
  setDelegationStatus,
  setIdentityLifecycle,
  updateIdentity,
  validateAgentIdentityRegistry,
} from "../../server/hermes-agent/agent-identity-registry-state.js";
import type { CapabilityRegistryState } from "../../src/features/capabilities/types";
import type { ExecutionRegistryState } from "../../src/features/execution/types";
import type { AgentIdentityRegistryState } from "../../src/features/identities/types";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const registryPath = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-agent-identities-"));
  directories.push(directory);
  return path.join(directory, "agent-identity-registry.json");
};

const organizationAgents = [
  { organizationKey: "personal-assistant", name: "Personal Assistant", project: "", projectStatus: "active" },
  { organizationKey: "personal-finance", name: "Personal Finance", project: "", projectStatus: "active" },
  { organizationKey: "corporate-secretary", name: "Corporate Secretary", project: "", projectStatus: "active" },
  { organizationKey: "agent-recruitment", name: "Agent Recruitment", project: "", projectStatus: "active" },
  { organizationKey: "quality-lead", name: "Quality Lead", project: "", projectStatus: "active" },
  { organizationKey: "gooru-lead", name: "Gooru Lead", project: "Gooru", projectStatus: "active" },
  { organizationKey: "pabk-lead", name: "PABK Lead", project: "PABK", projectStatus: "active" },
  { organizationKey: "fcp-lead", name: "FCP Lead", project: "FCP", projectStatus: "active" },
  { organizationKey: "rd-lead", name: "R&D Lead", project: "", projectStatus: "active" },
  { organizationKey: "gmm-lead", name: "GMM Lead", project: "Gaya Makmur Mobil", projectStatus: "inactive" },
];

const workflows = (createDefaultExecutionRegistry() as ExecutionRegistryState).workflows;
const capabilityRegistry = createDefaultCapabilityRegistry() as CapabilityRegistryState;
const capabilities = capabilityRegistry.capabilities;
const workflow = (id: string) => workflows.find((entry) => entry.id === id)!;

describe("agent identity and delegation registry", () => {
  it("seeds managed identities, suspends inactive-project agents, and creates bounded workflow mandates", () => {
    const registry = validateAgentIdentityRegistry(createDefaultAgentIdentityRegistry({ organizationAgents, agents: organizationAgents, workflows, capabilities })) as AgentIdentityRegistryState;
    const personal = registry.identities.find((identity) => identity.agentKey === "personal-assistant")!;
    const gmm = registry.identities.find((identity) => identity.agentKey === "gmm-lead")!;

    expect(personal.agentClass).toBe("personal_agent");
    expect(personal.maxDataClassification).toBe("confidential");
    expect(gmm.lifecycle).toBe("suspended");
    expect(registry.delegations.some((delegation) => delegation.agentKey === "personal-assistant" && delegation.workflowIds.includes("personal-daily-planning"))).toBe(true);
    expect(registry.auditEvents.some((event) => event.type === "registry_initialized")).toBe(true);
  });

  it("blocks routing when identity lifecycle or capability-specific mandate is no longer valid", () => {
    const initial = createDefaultAgentIdentityRegistry({ agents: organizationAgents, workflows, capabilities }) as AgentIdentityRegistryState;
    const allowed = assessWorkflowDelegation(workflow("personal-daily-planning"), initial, capabilityRegistry);
    expect(allowed.decision).toBe("allowed");

    const personalIdentity = initial.identities.find((identity) => identity.agentKey === "personal-assistant")!;
    const suspended = setIdentityLifecycle(initial, { identityId: personalIdentity.id, lifecycle: "suspended", statusNote: "Temporary policy test." }).state as AgentIdentityRegistryState;
    const suspendedAssessment = assessWorkflowDelegation(workflow("personal-daily-planning"), suspended, capabilityRegistry);
    expect(suspendedAssessment.decision).toBe("blocked");
    expect(suspendedAssessment.blockers.join(" ")).toContain("berstatus suspended");

    const defaultGrant = initial.delegations.find((delegation) => delegation.agentKey === "personal-assistant" && delegation.workflowIds.includes("personal-daily-planning"))!;
    const revoked = setDelegationStatus(initial, { delegationId: defaultGrant.id, status: "revoked", statusNote: "Temporary policy test." }).state as AgentIdentityRegistryState;
    const revokedAssessment = assessWorkflowDelegation(workflow("personal-daily-planning"), revoked, capabilityRegistry);
    expect(revokedAssessment.decision).toBe("blocked");
    expect(revokedAssessment.blockers.join(" ")).toContain("Tidak ada mandat delegasi aktif");
  });

  it("rejects secrets in identity fields and persists lifecycle changes atomically", () => {
    const initial = createDefaultAgentIdentityRegistry({ agents: organizationAgents, workflows, capabilities }) as AgentIdentityRegistryState;
    const personal = initial.identities.find((identity) => identity.agentKey === "personal-assistant")!;
    expect(() => updateIdentity(initial, {
      identityId: personal.id,
      patch: { purpose: "api_key=do-not-store" },
    })).toThrow("must not contain credentials or secrets");

    const updated = setIdentityLifecycle(initial, {
      identityId: personal.id,
      lifecycle: "review",
      statusNote: "Quarterly review.",
      actor: "Faza",
    }).state as AgentIdentityRegistryState;
    const file = registryPath();
    const saved = saveAgentIdentityRegistry(updated, file) as AgentIdentityRegistryState;

    expect(saved.auditEvents.some((event) => event.type === "identity_lifecycle_changed")).toBe(true);
    expect(loadAgentIdentityRegistry(file)).toEqual(saved);
    expect(fs.readdirSync(path.dirname(file)).some((entry) => entry.endsWith(".tmp"))).toBe(false);
  });
});
