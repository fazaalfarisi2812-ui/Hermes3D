import { ExecutionRegistry } from "@/features/execution/ExecutionRegistry";
import type { ExecutionAgent, ExecutionProject, ExecutionRegistryState } from "@/features/execution/types";
import { ensureExecutionRegistry } from "../../../server/hermes-agent/execution-registry-state";
import { loadOrganizationState } from "../../../server/hermes-agent/organization-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const readProjects = (value: unknown): ExecutionProject[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.key !== "string" || typeof entry.name !== "string") return [];
        return [{
          key: entry.key,
          name: entry.name,
          status: entry.status === "inactive" ? "inactive" : "active",
          focus: typeof entry.focus === "string" ? entry.focus : "",
        }];
      })
    : [];

const readAgents = (value: unknown): ExecutionAgent[] =>
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

export default function ExecutionPage() {
  const registry = ensureExecutionRegistry() as ExecutionRegistryState;
  const organizationState = loadOrganizationState();
  const organization = isRecord(organizationState) && isRecord(organizationState.organization)
    ? organizationState.organization
    : {};
  const agents = isRecord(organizationState) ? readAgents(organizationState.agents) : [];
  const projects = readProjects(organization.projects);

  return <ExecutionRegistry initialRegistry={registry} agents={agents} projects={projects} />;
}
