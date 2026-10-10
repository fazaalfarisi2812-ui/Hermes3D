import type { CapabilityRegistryState } from "@/features/capabilities/types";
import type { ExecutionRegistryState } from "@/features/execution/types";
import {
  archiveCapability,
  createCapability,
  ensureCapabilityRegistry,
  saveCapabilityRegistry,
  setCapabilityStatus,
  updateCapability,
  validateCapabilityRegistry,
} from "../../../../server/hermes-agent/capability-registry-state";
import { ensureExecutionRegistry } from "../../../../server/hermes-agent/execution-registry-state";
import { loadOrganizationState } from "../../../../server/hermes-agent/organization-state";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const requiredString = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} diperlukan.`);
  return value.trim();
};

const optionalString = (value: unknown) => typeof value === "string" ? value.trim() : "";

const loadContext = () => {
  const organizationState = loadOrganizationState();
  if (!isRecord(organizationState) || !Array.isArray(organizationState.agents)) {
    throw new Error("Organization state tidak tersedia.");
  }
  return {
    agents: organizationState.agents,
    workflows: ensureExecutionRegistry() as ExecutionRegistryState,
  };
};

const validateReferences = (registry: CapabilityRegistryState, context: ReturnType<typeof loadContext>) => {
  const agentKeys = new Set(
    context.agents.flatMap((agent) => isRecord(agent) && typeof agent.organizationKey === "string" && agent.organizationKey
      ? [agent.organizationKey]
      : []),
  );
  const workflowIds = new Set(context.workflows.workflows.map((workflow) => workflow.id));

  for (const capability of registry.capabilities) {
    if (!agentKeys.has(capability.ownerKey)) {
      throw new Error(`Owner capability ${capability.name} tidak ditemukan di organisasi.`);
    }
    for (const agentKey of capability.allowedAgentKeys) {
      if (agentKey !== "*" && !agentKeys.has(agentKey)) {
        throw new Error(`Agent ${agentKey} pada ${capability.name} tidak ditemukan di organisasi.`);
      }
    }
    for (const workflowId of capability.workflowIds) {
      if (!workflowIds.has(workflowId)) {
        throw new Error(`Workflow ${workflowId} pada ${capability.name} tidak ditemukan di Execution Registry.`);
      }
    }
  }
};

export async function GET() {
  try {
    const context = loadContext();
    return json({ registry: ensureCapabilityRegistry() as CapabilityRegistryState, workflows: context.workflows.workflows, agents: context.agents });
  } catch (error) {
    console.error("[capability-registry] GET failed:", error);
    return json({ error: "Capability Registry tidak tersedia." }, 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Payload JSON tidak valid." }, 400);
  }
  if (!isRecord(body)) return json({ error: "Payload operasi diperlukan." }, 400);

  try {
    const action = requiredString(body.action, "Action");
    const context = loadContext();
    let registry = ensureCapabilityRegistry() as CapabilityRegistryState;
    const actor = "Faza";

    if (action === "create_capability") {
      if (!isRecord(body.capability)) throw new Error("Data capability diperlukan.");
      registry = createCapability(registry, { ...body.capability, actor }).state as CapabilityRegistryState;
    } else if (action === "update_capability") {
      if (!isRecord(body.patch)) throw new Error("Perubahan capability diperlukan.");
      registry = updateCapability(registry, {
        capabilityId: requiredString(body.capabilityId, "Capability"),
        patch: body.patch,
        actor,
      }).state as CapabilityRegistryState;
    } else if (action === "set_status") {
      registry = setCapabilityStatus(registry, {
        capabilityId: requiredString(body.capabilityId, "Capability"),
        status: requiredString(body.status, "Status"),
        statusNote: optionalString(body.statusNote),
        actor,
      }).state as CapabilityRegistryState;
    } else if (action === "archive_capability") {
      registry = archiveCapability(registry, {
        capabilityId: requiredString(body.capabilityId, "Capability"),
        reason: optionalString(body.reason),
        actor,
      }).state as CapabilityRegistryState;
    } else {
      return json({ error: "Action Capability Registry tidak dikenal." }, 400);
    }

    const validated = validateCapabilityRegistry(registry) as CapabilityRegistryState;
    validateReferences(validated, context);
    return json({ registry: saveCapabilityRegistry(validated) as CapabilityRegistryState, workflows: context.workflows.workflows, agents: context.agents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Capability Registry tidak dapat diperbarui.";
    return json({ error: message }, 400);
  }
}
