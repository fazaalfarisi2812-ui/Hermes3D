import type { ExecutionRegistryState } from "@/features/execution/types";
import {
  ensureExecutionRegistry,
  saveExecutionRegistry,
  validateExecutionRegistry,
} from "../../../../server/hermes-agent/execution-registry-state";
import { loadOrganizationState } from "../../../../server/hermes-agent/organization-state";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const validateOrganizationReferences = (registry: ExecutionRegistryState) => {
  const state = loadOrganizationState();
  if (!isRecord(state) || !Array.isArray(state.agents)) {
    throw new Error("Organization state is unavailable.");
  }

  const agents = new Map<string, { project: string; projectStatus: string }>();
  for (const entry of state.agents) {
    if (!isRecord(entry) || typeof entry.organizationKey !== "string" || !entry.organizationKey) continue;
    agents.set(entry.organizationKey, {
      project: typeof entry.project === "string" ? entry.project : "",
      projectStatus: entry.projectStatus === "inactive" ? "inactive" : "active",
    });
  }

  const organization = isRecord(state.organization) ? state.organization : {};
  const projects = new Map<string, string>();
  if (Array.isArray(organization.projects)) {
    for (const entry of organization.projects) {
      if (!isRecord(entry) || typeof entry.name !== "string" || !entry.name) continue;
      projects.set(entry.name, entry.status === "inactive" ? "inactive" : "active");
    }
  }

  for (const workflow of registry.workflows) {
    const owner = agents.get(workflow.ownerKey);
    if (!owner) throw new Error(`Workflow ${workflow.name} has an unknown owner.`);
    if (owner.projectStatus === "inactive") {
      throw new Error(`Workflow ${workflow.name} cannot use an inactive project agent as owner.`);
    }
    for (const agentKey of workflow.allowedAgentKeys) {
      const agent = agents.get(agentKey);
      if (!agent) throw new Error(`Workflow ${workflow.name} references an unknown agent.`);
      if (agent.projectStatus === "inactive") {
        throw new Error(`Workflow ${workflow.name} cannot assign an inactive project agent.`);
      }
      if (workflow.project && agent.project && agent.project !== workflow.project) {
        throw new Error(`Workflow ${workflow.name} cannot assign ${agentKey} outside ${workflow.project}.`);
      }
    }
    if (!workflow.project) continue;
    const projectStatus = projects.get(workflow.project);
    if (!projectStatus) throw new Error(`Workflow ${workflow.name} references an unknown project.`);
    if (projectStatus === "inactive" && workflow.lifecycle !== "paused" && workflow.lifecycle !== "archived") {
      throw new Error(`Workflow ${workflow.name} must be paused while ${workflow.project} is inactive.`);
    }
  }
};

export async function GET() {
  try {
    return json({ registry: ensureExecutionRegistry() });
  } catch (error) {
    console.error("[execution-registry] GET failed:", error);
    return json({ error: "Execution registry is unavailable." }, 500);
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }
  if (!isRecord(body) || !isRecord(body.registry)) {
    return json({ error: "Registry payload is required." }, 400);
  }

  try {
    const registry = validateExecutionRegistry(body.registry) as ExecutionRegistryState;
    validateOrganizationReferences(registry);
    return json({ registry: saveExecutionRegistry(registry) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save execution registry.";
    return json({ error: message }, 400);
  }
}
