import { IdentityRegistry } from "@/features/identities/IdentityRegistry";
import type {
  AgentIdentityRegistryState,
  IdentityCapability,
  IdentityOrganizationAgent,
  IdentityWorkflow,
} from "@/features/identities/types";
import type { CapabilityRegistryState } from "@/features/capabilities/types";
import type { ExecutionRegistryState } from "@/features/execution/types";
import { ensureAgentIdentityRegistry } from "../../../server/hermes-agent/agent-identity-registry-state";
import { ensureCapabilityRegistry } from "../../../server/hermes-agent/capability-registry-state";
import { ensureExecutionRegistry } from "../../../server/hermes-agent/execution-registry-state";
import { loadOrganizationState } from "../../../server/hermes-agent/organization-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const readAgents = (value: unknown): IdentityOrganizationAgent[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.organizationKey !== "string" || !entry.organizationKey) return [];
        return [{
          key: entry.organizationKey,
          name: typeof entry.name === "string" ? entry.name : entry.organizationKey,
          role: typeof entry.role === "string" ? entry.role : "",
          department: typeof entry.department === "string" ? entry.department : "",
          project: typeof entry.project === "string" ? entry.project : "",
          projectStatus: entry.projectStatus === "inactive" ? "inactive" : "active",
        }];
      })
    : [];

export default function IdentitiesPage() {
  const organizationState = loadOrganizationState();
  const rawAgents = isRecord(organizationState) && Array.isArray(organizationState.agents) ? organizationState.agents : [];
  const executionRegistry = ensureExecutionRegistry() as ExecutionRegistryState;
  const capabilityRegistry = ensureCapabilityRegistry() as CapabilityRegistryState;
  const registry = ensureAgentIdentityRegistry({
    agents: rawAgents,
    workflows: executionRegistry.workflows,
    capabilities: capabilityRegistry.capabilities,
  }) as AgentIdentityRegistryState;
  const agents = readAgents(rawAgents);
  const workflows: IdentityWorkflow[] = executionRegistry.workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    project: workflow.project,
    lifecycle: workflow.lifecycle,
    executionLevel: workflow.executionLevel,
    ownerKey: workflow.ownerKey,
    allowedAgentKeys: workflow.allowedAgentKeys,
  }));
  const capabilities: IdentityCapability[] = capabilityRegistry.capabilities.map((capability) => ({
    id: capability.id,
    name: capability.name,
    dataClassification: capability.dataClassification,
    workflowIds: capability.workflowIds,
    status: capability.status,
  }));

  return <IdentityRegistry initialRegistry={registry} agents={agents} workflows={workflows} capabilities={capabilities} />;
}
