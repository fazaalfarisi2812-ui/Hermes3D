// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  createDefaultEvaluationLearningState,
  evaluateWorkOrder,
  linkImprovementWorkOrder,
  setEvaluationStatus,
  setImprovementStatus,
} from "../../server/hermes-agent/evaluation-learning-state.js";

const workOrder = (overrides: Record<string, unknown> = {}) => ({
  id: "work-order-001",
  workflowId: "personal-daily-planning",
  workflowName: "Personal Daily Planning",
  ownerKey: "personal-assistant",
  project: "",
  status: "completed",
  startedAt: new Date().toISOString(),
  evidenceRequirements: ["Catatan hasil"],
  evidence: [{ id: "evidence-001", description: "Catatan", source: "test", recordedAt: new Date().toISOString(), recordedBy: "Faza" }],
  outcome: "Agenda selesai.",
  lessons: "Checklist evidence dipakai.",
  ...overrides,
});

describe("evaluation and learning state", () => {
  it("scores a completed work order once and keeps improvement plus memory linked", () => {
    const initial = createDefaultEvaluationLearningState();
    const first = evaluateWorkOrder(initial, { workOrder: workOrder(), actor: "Hermes" });
    const second = evaluateWorkOrder(first.state, { workOrder: workOrder(), actor: "Hermes" });

    expect(first.evaluation.score).toBe(100);
    expect(first.evaluation.decision).toBe("retain");
    expect(second.state.evaluations).toHaveLength(1);
    expect(second.state.improvements).toHaveLength(1);
    expect(second.state.memories).toHaveLength(1);
    expect(second.state.improvements[0].evaluationId).toBe(second.state.evaluations[0].id);
  });

  it("redacts credential-shaped learning text before persistence", () => {
    const result = evaluateWorkOrder(createDefaultEvaluationLearningState(), {
      workOrder: workOrder({ outcome: "Selesai; api_key=super-secret", lessons: "password=secret-value" }),
    });

    expect(result.memory.content).not.toContain("super-secret");
    expect(result.memory.content).not.toContain("secret-value");
    expect(result.memory.content).toContain("[redacted]");
  });

  it("recommends recruitment or rebalancing after repeated low evaluations", () => {
    let state = createDefaultEvaluationLearningState();
    for (let index = 1; index <= 2; index += 1) {
      state = evaluateWorkOrder(state, { workOrder: workOrder({ id: `work-order-00${index}`, evidence: [], outcome: "", lessons: "" }) }).state;
    }
    const result = evaluateWorkOrder(state, { workOrder: workOrder({ id: "work-order-003", evidence: [], outcome: "", lessons: "" }) });

    expect(result.improvement.type).toBe("recruit_or_rebalance");
    expect(result.improvement.targetWorkflowId).toBe("agent-lifecycle-review");
  });

  it("supports human review and links an approved improvement to a work order", () => {
    const evaluated = evaluateWorkOrder(createDefaultEvaluationLearningState(), { workOrder: workOrder({ evidence: [] }) });
    const reviewed = setEvaluationStatus(evaluated.state, { evaluationId: evaluated.evaluation.id, status: "reviewed", actor: "Faza" });
    const accepted = setImprovementStatus(reviewed.state, { improvementId: evaluated.improvement.id, status: "accepted", actor: "Faza" });
    const linked = linkImprovementWorkOrder(accepted.state, { improvementId: evaluated.improvement.id, workOrderId: "work-order-999", actor: "Hermes" });

    expect(linked.improvement.status).toBe("accepted");
    expect(linked.improvement.linkedWorkOrderId).toBe("work-order-999");
    expect(linked.state.auditEvents.map((event: { type: string }) => event.type)).toEqual(expect.arrayContaining(["evaluation_status_changed", "improvement_status_changed", "improvement_linked"]));
  });
});
