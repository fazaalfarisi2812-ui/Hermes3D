import type { ExecutionRegistryState } from "@/features/execution/types";
import type { CapabilityRegistryState } from "@/features/capabilities/types";
import type { AgentIdentityRegistryState } from "@/features/identities/types";
import type { OperationsLoopState } from "@/features/operations/types";
import type { EvaluationLearningState } from "@/features/evaluations/types";
import {
  addEvidence,
  approveWorkOrder,
  blockWorkOrder,
  completeWorkOrder,
  createSignal,
  dismissSignal,
  ensureOperationsLoop,
  recordWorkOrderLearning,
  rejectWorkOrder,
  requestEvidence,
  resumeWorkOrder,
  routeSignal,
  saveOperationsLoop,
  startWorkOrder,
} from "../../../../server/hermes-agent/operations-loop-state";
import { ensureExecutionRegistry } from "../../../../server/hermes-agent/execution-registry-state";
import { ensureCapabilityRegistry } from "../../../../server/hermes-agent/capability-registry-state";
import { ensureAgentIdentityRegistry } from "../../../../server/hermes-agent/agent-identity-registry-state";
import { loadOrganizationState } from "../../../../server/hermes-agent/organization-state";
import {
  ensureEvaluationLearningState,
  evaluateWorkOrder,
  saveEvaluationLearningState,
} from "../../../../server/hermes-agent/evaluation-learning-state";
import {
  ensureOversightCapacity,
  getOversightSummary,
  recordHandoff,
  recordOversightReview,
  saveOversightCapacity,
} from "../../../../server/hermes-agent/oversight-capacity-state";

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
  const registry = ensureExecutionRegistry() as ExecutionRegistryState;
  const capabilityRegistry = ensureCapabilityRegistry() as CapabilityRegistryState;
  const organizationState = loadOrganizationState();
  if (!isRecord(organizationState) || !Array.isArray(organizationState.agents)) {
    throw new Error("Organization state tidak tersedia.");
  }
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

export async function GET() {
  try {
    const { registry, capabilityRegistry, identityRegistry } = loadContext();
    return json({
      operations: ensureOperationsLoop() as OperationsLoopState,
      evaluationLearning: ensureEvaluationLearningState(),
      oversight: getOversightSummary(ensureOversightCapacity()),
      registry,
      capabilityRegistry,
      identityRegistry,
    });
  } catch (error) {
    console.error("[operations-loop] GET failed:", error);
    return json({ error: "Autonomous Operations tidak tersedia." }, 500);
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
    const { registry, capabilityRegistry, identityRegistry, organizationAgents, organizationProjects } = loadContext();
    let operations = ensureOperationsLoop() as OperationsLoopState;
    let oversight = ensureOversightCapacity();
    const actor = "Faza";

    if (action === "create_signal") {
      const created = createSignal(operations, {
        title: requiredString(body.title, "Judul signal"),
        description: optionalString(body.description),
        source: optionalString(body.source) || "manual",
        priority: optionalString(body.priority) || "normal",
        actor,
      });
      operations = created.state as OperationsLoopState;
      const workflowId = optionalString(body.workflowId);
      if (workflowId) {
        const routed = routeSignal(operations, {
          signalId: created.signal.id,
          workflow: readyWorkflow(workflowId, registry),
          organizationAgents,
          organizationProjects,
          capabilityRegistry,
          identityRegistry,
          actor,
        });
        operations = routed.state as OperationsLoopState;
        oversight = recordHandoff(oversight, {
          workOrderId: routed.workOrder.id,
          fromAgentKey: "hermes-orchestrator",
          toAgentKey: routed.workOrder.ownerKey,
          supervisorKey: "Faza",
          reason: `Assignment awal ke workflow ${routed.workOrder.workflowName}.`,
          recordedBy: "Hermes3D",
        }).state;
      }
    } else if (action === "route_signal") {
      const routed = routeSignal(operations, {
        signalId: requiredString(body.signalId, "Signal"),
        workflow: readyWorkflow(requiredString(body.workflowId, "Workflow"), registry),
        organizationAgents,
        organizationProjects,
        capabilityRegistry,
        identityRegistry,
        actor,
      });
      operations = routed.state as OperationsLoopState;
      oversight = recordHandoff(oversight, {
        workOrderId: routed.workOrder.id,
        fromAgentKey: "hermes-orchestrator",
        toAgentKey: routed.workOrder.ownerKey,
        supervisorKey: "Faza",
        reason: `Assignment awal ke workflow ${routed.workOrder.workflowName}.`,
        recordedBy: "Hermes3D",
      }).state;
    } else if (action === "dismiss_signal") {
      operations = dismissSignal(operations, {
        signalId: requiredString(body.signalId, "Signal"),
        reason: optionalString(body.reason),
        actor,
      }).state as OperationsLoopState;
    } else if (action === "approve_work_order") {
      operations = approveWorkOrder(operations, { workOrderId: requiredString(body.workOrderId, "Work order"), actor }).state as OperationsLoopState;
    } else if (action === "reject_work_order") {
      operations = rejectWorkOrder(operations, {
        workOrderId: requiredString(body.workOrderId, "Work order"),
        reason: requiredString(body.reason, "Alasan penolakan"),
        actor,
      }).state as OperationsLoopState;
    } else if (action === "start_work_order") {
      operations = startWorkOrder(operations, { workOrderId: requiredString(body.workOrderId, "Work order"), actor }).state as OperationsLoopState;
    } else if (action === "request_evidence") {
      operations = requestEvidence(operations, { workOrderId: requiredString(body.workOrderId, "Work order"), actor }).state as OperationsLoopState;
    } else if (action === "add_evidence") {
      operations = addEvidence(operations, {
        workOrderId: requiredString(body.workOrderId, "Work order"),
        description: requiredString(body.description, "Bukti"),
        source: optionalString(body.source) || "Hermes Workspace",
        actor,
      }).state as OperationsLoopState;
    } else if (action === "block_work_order") {
      operations = blockWorkOrder(operations, {
        workOrderId: requiredString(body.workOrderId, "Work order"),
        reason: requiredString(body.reason, "Alasan blocker"),
        actor,
      }).state as OperationsLoopState;
    } else if (action === "resume_work_order") {
      operations = resumeWorkOrder(operations, { workOrderId: requiredString(body.workOrderId, "Work order"), actor }).state as OperationsLoopState;
    } else if (action === "complete_work_order") {
      operations = completeWorkOrder(operations, {
        workOrderId: requiredString(body.workOrderId, "Work order"),
        outcome: requiredString(body.outcome, "Outcome"),
        lessons: optionalString(body.lessons),
        actor,
      }).state as OperationsLoopState;
    } else if (action === "record_learning") {
      operations = recordWorkOrderLearning(operations, {
        workOrderId: requiredString(body.workOrderId, "Work order"),
        lessons: requiredString(body.lessons, "Pembelajaran"),
        actor,
      }).state as OperationsLoopState;
    } else if (action === "record_handoff") {
      if (!isRecord(body.handoff)) throw new Error("Data handoff diperlukan.");
      oversight = recordHandoff(oversight, { ...body.handoff, recordedBy: actor }).state;
    } else if (action === "record_oversight_review") {
      if (!isRecord(body.review)) throw new Error("Data review pengawasan diperlukan.");
      oversight = recordOversightReview(oversight, { ...body.review, recordedBy: actor }).state;
    } else {
      return json({ error: "Action Autonomous Operations tidak dikenal." }, 400);
    }

    const savedOperations = saveOperationsLoop(operations) as OperationsLoopState;
    const savedOversight = saveOversightCapacity(oversight);
    let evaluationLearning = ensureEvaluationLearningState() as EvaluationLearningState;
    const workOrderId = optionalString(body.workOrderId);
    const completedWorkOrder = workOrderId
      ? savedOperations.workOrders.find((entry) => entry.id === workOrderId && entry.status === "completed")
      : null;
    const shouldRefreshEvaluation = action === "record_learning";
    if (completedWorkOrder && (shouldRefreshEvaluation || !evaluationLearning.evaluations.some((entry) => entry.workOrderId === completedWorkOrder.id))) {
      try {
        evaluationLearning = saveEvaluationLearningState(evaluateWorkOrder(evaluationLearning, {
          workOrder: completedWorkOrder,
          actor: "Hermes",
        }).state) as EvaluationLearningState;
      } catch (error) {
        console.warn("[operations-loop] automatic evaluation skipped:", error);
      }
    }
    return json({ operations: savedOperations, evaluationLearning, oversight: getOversightSummary(savedOversight), registry, capabilityRegistry, identityRegistry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operasi tidak dapat diproses.";
    return json({ error: message }, 400);
  }
}
