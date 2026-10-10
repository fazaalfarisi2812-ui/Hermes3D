import type { AgentIdentityRegistryState } from "@/features/identities/types";
import type { CapabilityRegistryState } from "@/features/capabilities/types";
import type { ExecutionRegistryState } from "@/features/execution/types";
import {
  createDelegation,
  ensureAgentIdentityRegistry,
  saveAgentIdentityRegistry,
  setDelegationStatus,
  setIdentityLifecycle,
  updateDelegation,
  updateIdentity,
  validateAgentIdentityRegistry,
} from "../../../../server/hermes-agent/agent-identity-registry-state";
import { ensureCapabilityRegistry } from "../../../../server/hermes-agent/capability-registry-state";
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
  const workflows = ensureExecutionRegistry() as ExecutionRegistryState;
  const capabilities = ensureCapabilityRegistry() as CapabilityRegistryState;
  return {
    agents: organizationState.agents,
    workflows,
    capabilities,
  };
};

const identityContext = (context: ReturnType<typeof loadContext>) => ({
  agents: context.agents,
  workflows: context.workflows.workflows,
  capabilities: context.capabilities.capabilities,
});

const validateReferences = (registry: AgentIdentityRegistryState, context: ReturnType<typeof loadContext>) => {
  const workflowIds = new Set(context.workflows.workflows.map((workflow) => workflow.id));
  const capabilityIds = new Set(context.capabilities.capabilities.map((capability) => capability.id));
  for (const delegation of registry.delegations) {
    for (const workflowId of delegation.workflowIds) {
      if (!workflowIds.has(workflowId)) throw new Error(`Workflow ${workflowId} pada mandat tidak ditemukan di Execution Registry.`);
    }
    for (const capabilityId of delegation.capabilityIds) {
      if (!capabilityIds.has(capabilityId)) throw new Error(`Capability ${capabilityId} pada mandat tidak ditemukan di Capability Registry.`);
    }
  }
};

const response = (registry: AgentIdentityRegistryState, context: ReturnType<typeof loadContext>) => ({
  registry,
  agents: context.agents,
  workflows: context.workflows.workflows,
  capabilities: context.capabilities.capabilities,
});

export async function GET() {
  try {
    const context = loadContext();
    const registry = ensureAgentIdentityRegistry(identityContext(context)) as AgentIdentityRegistryState;
    return json(response(registry, context));
  } catch (error) {
    console.error("[agent-identities] GET failed:", error);
    return json({ error: "Agent Identity Registry tidak tersedia." }, 500);
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
    const actor = "Faza";
    let registry = ensureAgentIdentityRegistry(identityContext(context)) as AgentIdentityRegistryState;

    if (action === "update_identity") {
      if (!isRecord(body.patch)) throw new Error("Perubahan identitas diperlukan.");
      registry = updateIdentity(registry, {
        identityId: requiredString(body.identityId, "Identitas"),
        patch: body.patch,
        actor,
      }).state as AgentIdentityRegistryState;
    } else if (action === "set_identity_lifecycle") {
      registry = setIdentityLifecycle(registry, {
        identityId: requiredString(body.identityId, "Identitas"),
        lifecycle: requiredString(body.lifecycle, "Lifecycle"),
        statusNote: optionalString(body.statusNote),
        actor,
      }).state as AgentIdentityRegistryState;
    } else if (action === "create_delegation") {
      if (!isRecord(body.delegation)) throw new Error("Data mandat delegasi diperlukan.");
      registry = createDelegation(registry, { ...body.delegation, actor }).state as AgentIdentityRegistryState;
    } else if (action === "update_delegation") {
      if (!isRecord(body.patch)) throw new Error("Perubahan mandat delegasi diperlukan.");
      registry = updateDelegation(registry, {
        delegationId: requiredString(body.delegationId, "Mandat delegasi"),
        patch: body.patch,
        actor,
      }).state as AgentIdentityRegistryState;
    } else if (action === "set_delegation_status") {
      registry = setDelegationStatus(registry, {
        delegationId: requiredString(body.delegationId, "Mandat delegasi"),
        status: requiredString(body.status, "Status mandat"),
        statusNote: optionalString(body.statusNote),
        actor,
      }).state as AgentIdentityRegistryState;
    } else if (action === "reconcile_identities") {
      registry = ensureAgentIdentityRegistry(identityContext(context)) as AgentIdentityRegistryState;
    } else {
      return json({ error: "Action Agent Identity Registry tidak dikenal." }, 400);
    }

    const validated = validateAgentIdentityRegistry(registry) as AgentIdentityRegistryState;
    validateReferences(validated, context);
    return json(response(saveAgentIdentityRegistry(validated) as AgentIdentityRegistryState, context));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent Identity Registry tidak dapat diperbarui.";
    return json({ error: message }, 400);
  }
}
