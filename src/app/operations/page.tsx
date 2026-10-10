import { AutonomousOperations } from "@/features/operations/AutonomousOperations";
import type { ExecutionRegistryState } from "@/features/execution/types";
import type { OperationsAgent, OperationsLoopState } from "@/features/operations/types";
import { ensureExecutionRegistry } from "../../../server/hermes-agent/execution-registry-state";
import { ensureOperationsLoop } from "../../../server/hermes-agent/operations-loop-state";
import { loadOrganizationState } from "../../../server/hermes-agent/organization-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const readAgents = (value: unknown): OperationsAgent[] =>
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

export default function OperationsPage() {
  const registry = ensureExecutionRegistry() as ExecutionRegistryState;
  const operations = ensureOperationsLoop() as OperationsLoopState;
  const organizationState = loadOrganizationState();
  const agents = isRecord(organizationState) ? readAgents(organizationState.agents) : [];

  return <AutonomousOperations initialOperations={operations} initialRegistry={registry} agents={agents} />;
}
