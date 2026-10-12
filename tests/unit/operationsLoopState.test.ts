// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createDefaultExecutionRegistry } from "../../server/hermes-agent/execution-registry-state.js";
import {
  addEvidence,
  approveWorkOrder,
  completeWorkOrder,
  createDefaultOperationsLoop,
  createSignal,
  loadOperationsLoop,
  requestEvidence,
  routeSignal,
  saveOperationsLoop,
  startWorkOrder,
} from "../../server/hermes-agent/operations-loop-state.js";
import type { ExecutionRegistryState } from "../../src/features/execution/types";
import type { OperationsLoopState } from "../../src/features/operations/types";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const statePath = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-operations-loop-"));
  directories.push(directory);
  return path.join(directory, "operations-loop.json");
};

const organizationAgents = [
  { organizationKey: "personal-assistant", project: "", projectStatus: "active" },
  { organizationKey: "personal-research", project: "", projectStatus: "active" },
  { organizationKey: "corporate-secretary", project: "", projectStatus: "active" },
  { organizationKey: "chief-of-staff", project: "", projectStatus: "active" },
  { organizationKey: "governance", project: "", projectStatus: "active" },
];

const workflow = (id: string) => (createDefaultExecutionRegistry() as ExecutionRegistryState).workflows.find((entry) => entry.id === id)!;

describe("autonomous operations loop", () => {
  it("starts empty so operational history is never fabricated", () => {
    const state = createDefaultOperationsLoop() as OperationsLoopState;
    expect(state.signals).toEqual([]);
    expect(state.workOrders).toEqual([]);
    expect(state.auditEvents).toEqual([]);
  });

  it("routes an approval workflow through Faza before work can start", () => {
    const created = createSignal(createDefaultOperationsLoop(), {
      title: "Tindak lanjut keputusan perusahaan",
      description: "Siapkan owner dan register keputusan.",
      actor: "Faza",
    });
    const routed = routeSignal(created.state, {
      signalId: created.signal.id,
      workflow: workflow("corporate-decision-follow-up"),
      organizationAgents,
      actor: "Hermes",
    });

    expect(routed.workOrder.status).toBe("waiting_approval");
    expect(routed.workOrder.approvalState).toBe("pending");
    const approved = approveWorkOrder(routed.state, { workOrderId: routed.workOrder.id, actor: "Faza" });
    expect(approved.workOrder.status).toBe("queued");
    expect(approved.workOrder.approvalState).toBe("approved");
  });

  it("requires evidence and an outcome before closing a work order", () => {
    const created = createSignal(createDefaultOperationsLoop(), { title: "Susun prioritas hari ini" });
    const routed = routeSignal(created.state, {
      signalId: created.signal.id,
      workflow: workflow("personal-daily-planning"),
      organizationAgents,
    });
    const started = startWorkOrder(routed.state, { workOrderId: routed.workOrder.id });
    expect(() => completeWorkOrder(started.state, { workOrderId: routed.workOrder.id, outcome: "Selesai" })).toThrow("tanpa bukti");

    const awaitingEvidence = requestEvidence(started.state, { workOrderId: routed.workOrder.id });
    const evidenced = addEvidence(awaitingEvidence.state, {
      workOrderId: routed.workOrder.id,
      description: "Agenda dan prioritas telah ditinjau.",
    });
    const completed = completeWorkOrder(evidenced.state, {
      workOrderId: routed.workOrder.id,
      outcome: "Prioritas hari ini terdokumentasi.",
      lessons: "Mulai dari agenda dan tenggat yang paling dekat.",
    });

    expect(completed.workOrder.status).toBe("completed");
    expect(completed.workOrder.evidence).toHaveLength(1);
    expect(completed.state.auditEvents.some((event: { type: string }) => event.type === "learning_recorded")).toBe(true);
  });

  it("refuses routing to an inactive project agent and persists validated history atomically", () => {
    const created = createSignal(createDefaultOperationsLoop(), { title: "Campaign Gooru" });
    expect(() => routeSignal(created.state, {
      signalId: created.signal.id,
      workflow: workflow("gooru-campaign-execution"),
      organizationAgents: [{ organizationKey: "gooru-lead", project: "Gooru", projectStatus: "inactive" }],
      organizationProjects: [{ name: "Gooru", status: "active" }],
    })).toThrow("proyek nonaktif");

    const file = statePath();
    const saved = saveOperationsLoop(created.state as OperationsLoopState, file) as OperationsLoopState;
    expect(loadOperationsLoop(file)).toEqual(saved);
    expect(fs.readdirSync(path.dirname(file)).some((entry) => entry.endsWith(".tmp"))).toBe(false);
  });
});
