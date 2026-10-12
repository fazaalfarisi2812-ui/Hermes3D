import type { ExecutionMode, ExecutionRegistryState, OversightMode, ProductionReadiness, ReadinessCheckKey } from "@/features/execution/types";
import {
  EXECUTION_MODES,
  OVERSIGHT_MODES,
  READINESS_CHECK_KEYS,
  ensureExecutionRegistry,
  getExecutionReadinessSummary,
  saveExecutionRegistry,
} from "../../../../server/hermes-agent/execution-registry-state";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const checkKeys = new Set<string>(READINESS_CHECK_KEYS);

const asString = (value: unknown) => typeof value === "string" ? value.trim() : "";

const readChecklistPatch = (value: unknown) => {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error("Checklist kesiapan harus berupa object.");
  const patch: Partial<ProductionReadiness> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!checkKeys.has(key)) throw new Error(`Pemeriksaan kesiapan tidak dikenal: ${key}`);
    if (typeof entry !== "boolean") throw new Error(`Nilai pemeriksaan ${key} harus boolean.`);
    patch[key as ReadinessCheckKey] = entry;
  }
  return patch;
};

export async function GET() {
  try {
    const registry = ensureExecutionRegistry() as ExecutionRegistryState;
    return json({ updatedAt: registry.updatedAt, summary: getExecutionReadinessSummary(registry) });
  } catch (error) {
    console.error("[execution-readiness] GET failed:", error);
    return json({ error: "Production readiness tidak tersedia." }, 500);
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Payload JSON tidak valid." }, 400);
  }

  if (!isRecord(body)) return json({ error: "Payload readiness diperlukan." }, 400);

  try {
    const workflowId = asString(body.workflowId);
    if (!workflowId) throw new Error("workflowId diperlukan.");
    const registry = ensureExecutionRegistry() as ExecutionRegistryState;
    const workflow = registry.workflows.find((entry) => entry.id === workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} tidak ditemukan.`);

    const executionMode = body.executionMode === undefined ? workflow.executionMode : asString(body.executionMode);
    if (!EXECUTION_MODES.has(executionMode)) throw new Error("executionMode tidak valid.");
    const oversightMode = body.oversightMode === undefined ? workflow.oversightMode : asString(body.oversightMode);
    if (!OVERSIGHT_MODES.has(oversightMode)) throw new Error("oversightMode tidak valid.");
    const checklistPatch = readChecklistPatch(body.checklist);
    const nextReadiness = {
      ...workflow.productionReadiness,
      ...checklistPatch,
      lastReviewedAt: new Date().toISOString(),
      reviewer: asString(body.reviewer) || "Faza",
    };
    const nextRegistry = saveExecutionRegistry({
      ...registry,
      workflows: registry.workflows.map((entry) => entry.id === workflowId ? {
        ...entry,
        systemOfRecord: body.systemOfRecord === undefined ? entry.systemOfRecord : (asString(body.systemOfRecord) || entry.systemOfRecord),
        executionMode: executionMode as ExecutionMode,
        oversightMode: oversightMode as OversightMode,
        escalationOwner: body.escalationOwner === undefined ? entry.escalationOwner : (asString(body.escalationOwner) || entry.escalationOwner),
        productionReadiness: nextReadiness,
      } : entry),
    }) as ExecutionRegistryState;

    return json({ updatedAt: nextRegistry.updatedAt, summary: getExecutionReadinessSummary(nextRegistry) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Production readiness tidak dapat disimpan.";
    return json({ error: message }, 400);
  }
}
