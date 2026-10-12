import type { AgentIdentityRegistryState } from "@/features/identities/types";
import type { CapabilityRegistryState } from "@/features/capabilities/types";
import type { ExecutionRegistryState } from "@/features/execution/types";
import type { EvaluationLearningState } from "@/features/evaluations/types";
import type { OperationsLoopState } from "@/features/operations/types";
import {
  ensureEvaluationLearningState,
  evaluateWorkOrder,
  getEvaluationLearningSummary,
  linkImprovementWorkOrder,
  saveEvaluationLearningState,
  setEvaluationStatus,
  setImprovementStatus,
} from "../../../../server/hermes-agent/evaluation-learning-state";
import { ensureExecutionRegistry } from "../../../../server/hermes-agent/execution-registry-state";
import { ensureCapabilityRegistry } from "../../../../server/hermes-agent/capability-registry-state";
import { ensureAgentIdentityRegistry } from "../../../../server/hermes-agent/agent-identity-registry-state";
import {
  createSignal,
  ensureOperationsLoop,
  routeSignal,
  saveOperationsLoop,
} from "../../../../server/hermes-agent/operations-loop-state";
import { loadOrganizationState } from "../../../../server/hermes-agent/organization-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const requiredString = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} diperlukan.`);
  return value.trim();
};
const optionalString = (value: unknown) => typeof value === "string" ? value.trim() : "";

const loadContext = () => {
  const registry = ensureExecutionRegistry() as ExecutionRegistryState;
  const capabilityRegistry = ensureCapabilityRegistry() as CapabilityRegistryState;
  const organizationState = loadOrganizationState();
  if (!isRecord(organizationState) || !Array.isArray(organizationState.agents)) throw new Error("Organization state tidak tersedia.");
  const organization = isRecord(organizationState.organization) ? organizationState.organization : {};
  const identityRegistry = ensureAgentIdentityRegistry({
    agents: organizationState.agents,
    workflows: registry.workflows,
    capabilities: capabilityRegistry.capabilities,
  }) as AgentIdentityRegistryState;
  return {
    registry,
    capabilityRegistry,
    identityRegistry,
    organizationAgents: organizationState.agents,
    organizationProjects: Array.isArray(organization.projects) ? organization.projects : [],
  };
};

const readyWorkflow = (workflowId: string, registry: ExecutionRegistryState) => {
  const workflow = registry.workflows.find((entry) => entry.id === workflowId);
  if (!workflow) throw new Error("Workflow tidak ditemukan.");
  return workflow;
};

const snapshot = () => {
  const evaluationLearning = ensureEvaluationLearningState() as EvaluationLearningState;
  const operations = ensureOperationsLoop() as OperationsLoopState;
  const context = loadContext();
  return { evaluationLearning, operations, ...context };
};

export async function GET() {
  try {
    const state = snapshot();
    return json({
      evaluationLearning: state.evaluationLearning,
      operations: state.operations,
      registry: state.registry,
      summary: getEvaluationLearningSummary(state.evaluationLearning),
    });
  } catch (error) {
    console.error("[evaluations] GET failed:", error);
    return json({ error: "Evaluation & Learning tidak tersedia." }, 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Payload JSON tidak valid." }, 400); }
  if (!isRecord(body)) return json({ error: "Payload evaluasi diperlukan." }, 400);

  try {
    const action = requiredString(body.action, "Action");
    const state = snapshot();
    const actor = "Faza";
    let selectedEvaluation = null;
    let selectedImprovement = null;

    if (action === "evaluate_work_order") {
      const workOrder = state.operations.workOrders.find((entry) => entry.id === requiredString(body.workOrderId, "Work order"));
      if (!workOrder) throw new Error("Work order tidak ditemukan.");
      const result = evaluateWorkOrder(state.evaluationLearning, { workOrder, actor });
      state.evaluationLearning = saveEvaluationLearningState(result.state) as EvaluationLearningState;
      selectedEvaluation = result.evaluation;
      selectedImprovement = result.improvement;
    } else if (action === "reconcile_completed") {
      const existing = new Set(state.evaluationLearning.evaluations.map((entry) => entry.workOrderId));
      for (const workOrder of state.operations.workOrders.filter((entry) => entry.status === "completed" && !existing.has(entry.id))) {
        const result = evaluateWorkOrder(state.evaluationLearning, { workOrder, actor: "Hermes" });
        state.evaluationLearning = result.state as EvaluationLearningState;
      }
      state.evaluationLearning = saveEvaluationLearningState(state.evaluationLearning) as EvaluationLearningState;
    } else if (action === "set_evaluation_status") {
      const result = setEvaluationStatus(state.evaluationLearning, { evaluationId: requiredString(body.evaluationId, "Evaluation"), status: requiredString(body.status, "Status"), actor });
      state.evaluationLearning = saveEvaluationLearningState(result.state) as EvaluationLearningState;
      selectedEvaluation = result.evaluation;
    } else if (action === "set_improvement_status") {
      const result = setImprovementStatus(state.evaluationLearning, { improvementId: requiredString(body.improvementId, "Improvement"), status: requiredString(body.status, "Status"), actor });
      state.evaluationLearning = saveEvaluationLearningState(result.state) as EvaluationLearningState;
      selectedImprovement = result.improvement;
    } else if (action === "route_improvement") {
      const improvementId = requiredString(body.improvementId, "Improvement");
      const improvement = state.evaluationLearning.improvements.find((entry) => entry.id === improvementId);
      if (!improvement) throw new Error("Improvement tidak ditemukan.");
      const workflowId = optionalString(body.workflowId) || improvement.targetWorkflowId;
      if (!workflowId) throw new Error("Improvement ini hanya membutuhkan monitoring.");
      if (improvement.targetWorkflowId && workflowId !== improvement.targetWorkflowId) {
        throw new Error("Improvement hanya boleh dirutekan ke workflow yang direkomendasikan.");
      }
      const created = createSignal(state.operations, {
        title: improvement.title,
        description: improvement.description,
        source: "monitor",
        priority: improvement.priority === "critical" || improvement.priority === "high" ? "high" : "normal",
        actor,
      });
      const routed = routeSignal(created.state, {
        signalId: created.signal.id,
        workflow: readyWorkflow(workflowId, state.registry),
        organizationAgents: state.organizationAgents,
        organizationProjects: state.organizationProjects,
        capabilityRegistry: state.capabilityRegistry,
        identityRegistry: state.identityRegistry,
        actor,
      });
      state.operations = saveOperationsLoop(routed.state) as OperationsLoopState;
      const linked = linkImprovementWorkOrder(state.evaluationLearning, { improvementId, workOrderId: created.signal.workOrderId || routed.signal.workOrderId, actor });
      state.evaluationLearning = saveEvaluationLearningState(linked.state) as EvaluationLearningState;
      selectedImprovement = linked.improvement;
    } else {
      throw new Error("Action Evaluation & Learning tidak dikenal.");
    }

    return json({ evaluationLearning: state.evaluationLearning, operations: state.operations, registry: state.registry, selectedEvaluation, selectedImprovement, summary: getEvaluationLearningSummary(state.evaluationLearning) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evaluasi tidak dapat diproses.";
    return json({ error: message }, 400);
  }
}
