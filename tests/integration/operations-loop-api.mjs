import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveOperationsLoopPath } from "../../server/hermes-agent/operations-loop-state.js";

const endpoint = "http://localhost:3001/api/operations-loop";
const statePath = resolveOperationsLoopPath();
const existed = fs.existsSync(statePath);
const original = existed ? fs.readFileSync(statePath) : null;

const action = async (payload) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(response.ok, true, body.error || `Operation ${payload.action} failed.`);
  return body;
};

try {
  const first = await action({
    action: "create_signal",
    title: "Integration test: daily priorities",
    description: "Temporary test signal; restored after verification.",
    source: "manual",
    priority: "normal",
    workflowId: "personal-daily-planning",
  });
  const workOrder = first.operations.workOrders[0];
  assert.equal(workOrder.status, "queued");
  assert.equal(workOrder.approvalState, "not_required");

  const started = await action({ action: "start_work_order", workOrderId: workOrder.id });
  assert.equal(started.operations.workOrders.find((entry) => entry.id === workOrder.id).status, "in_progress");
  await action({ action: "request_evidence", workOrderId: workOrder.id });
  const withEvidence = await action({
    action: "add_evidence",
    workOrderId: workOrder.id,
    description: "Temporary integration evidence.",
    source: "Integration test",
  });
  assert.equal(withEvidence.operations.workOrders.find((entry) => entry.id === workOrder.id).evidence.length, 1);
  const completed = await action({
    action: "complete_work_order",
    workOrderId: workOrder.id,
    outcome: "Integration flow completed.",
    lessons: "The governed loop preserved approval and evidence gates.",
  });
  assert.equal(completed.operations.workOrders.find((entry) => entry.id === workOrder.id).status, "completed");
  console.log("PASS: API routes a ready workflow, records evidence, and closes only with an outcome.");
} finally {
  if (existed && original) {
    fs.writeFileSync(statePath, original);
  } else {
    fs.rmSync(statePath, { force: true });
  }
}
