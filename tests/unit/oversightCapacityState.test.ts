// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  createDefaultOversightCapacityState,
  getOversightSummary,
  recordHandoff,
  recordOversightReview,
} from "../../server/hermes-agent/oversight-capacity-state.js";

describe("oversight capacity registry", () => {
  it("measures handoffs, supervisor load, and review quality", () => {
    const initial = createDefaultOversightCapacityState();
    const withHandoff = recordHandoff(initial, {
      workOrderId: "work-test-001",
      fromAgentKey: "hermes-orchestrator",
      toAgentKey: "erp-owner",
      supervisorKey: "Faza",
      reason: "Assignment workflow.",
    }).state;
    const withReview = recordOversightReview(withHandoff, {
      workOrderId: "work-test-001",
      agentKey: "erp-owner",
      supervisorKey: "Faza",
      reviewType: "quality",
      qualityScore: 92,
      note: "Output memenuhi evidence.",
    }).state;

    const summary = getOversightSummary(withReview);
    expect(summary.totals).toMatchObject({ handoffs: 1, reviews: 1, agentToAgentHandoffs: 1, supervisors: 1 });
    expect(summary.supervisors[0]).toMatchObject({ supervisorKey: "Faza", handoffs: 1, reviews: 1, averageQuality: 92, capacityStatus: "within_limit" });
  });

  it("rejects a quality score outside the governance range", () => {
    expect(() => recordOversightReview(createDefaultOversightCapacityState(), {
      workOrderId: "work-test-002",
      agentKey: "agent",
      reviewType: "quality",
      qualityScore: 101,
      note: "Invalid score.",
    })).toThrow("antara 0 dan 100");
  });
});
