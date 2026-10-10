import { CapabilityRegistry } from "@/features/capabilities/CapabilityRegistry";
import type { CapabilityAgent, CapabilityRegistryState, CapabilityWorkflow } from "@/features/capabilities/types";
import type { ExecutionRegistryState } from "@/features/execution/types";
import { ensureCapabilityRegistry } from "../../../server/hermes-agent/capability-registry-state";
import { ensureExecutionRegistry } from "../../../server/hermes-agent/execution-registry-state";
import { loadOrganizationState } from "../../../server/hermes-agent/organization-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const readAgents = (value: unknown): CapabilityAgent[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.organizationKey !== "string" || !entry.organizationKey) return [];
        return [{
          key: entry.organizationKey,
          name: typeof entry.name === "string" ? entry.name : entry.organizationKey,
          role: typeof entry.role === "string" ? entry.role : "",
          project: typeof entry.project === "string" ? entry.project : "",
          projectStatus: entry.projectStatus === "inactive" ? "inactive" : "active",
        }];
      })
    : [];

export default function CapabilitiesPage() {
  const registry = ensureCapabilityRegistry() as CapabilityRegistryState;
  const executionRegistry = ensureExecutionRegistry() as ExecutionRegistryState;
  const organizationState = loadOrganizationState();
  const agents = isRecord(organizationState) ? readAgents(organizationState.agents) : [];
  const workflows = executionRegistry.workflows.map((workflow): CapabilityWorkflow => ({
    id: workflow.id,
    name: workflow.name,
    project: workflow.project,
    lifecycle: workflow.lifecycle,
    ownerKey: workflow.ownerKey,
  }));

  return <CapabilityRegistry initialRegistry={registry} agents={agents} workflows={workflows} />;
}
