import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveEvaluationLearningPath } from "../../server/hermes-agent/evaluation-learning-state.js";
import { resolveOperationsLoopPath } from "../../server/hermes-agent/operations-loop-state.js";

const operationsEndpoint = "http://localhost:3001/api/operations-loop";
const evaluationsEndpoint = "http://localhost:3001/api/evaluations";
const operationsPath = resolveOperationsLoopPath();
const evaluationPath = resolveEvaluationLearningPath();
const originalOperations = fs.existsSync(operationsPath) ? fs.readFileSync(operationsPath) : null;
const originalEvaluation = fs.existsSync(evaluationPath) ? fs.readFileSync(evaluationPath) : null;

const post = async (endpoint, payload) => {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json();
  assert.equal(response.ok, true, body.error || `Request ${payload.action} failed.`);
  return body;
};

try {
  const first = await post(operationsEndpoint, {
    action: "create_signal",
    title: "Integration test: evaluation loop",
    description: "Temporary signal; state is restored after verification.",
    source: "manual",
    workflowId: "personal-daily-planning",
  });
  const workOrder = first.operations.workOrders[0];
  await post(operationsEndpoint, { action: "start_work_order", workOrderId: workOrder.id });
  await post(operationsEndpoint, { action: "request_evidence", workOrderId: workOrder.id });
  await post(operationsEndpoint, { action: "add_evidence", workOrderId: workOrder.id, description: "Evidence recorded by integration test.", source: "Integration test" });
  const completed = await post(operationsEndpoint, {
    action: "complete_work_order",
    workOrderId: workOrder.id,
    outcome: "Evaluation loop completed.",
    lessons: "Automatic evaluation should happen at completion.",
  });
  assert.ok(completed.evaluationLearning?.evaluations?.some((entry) => entry.workOrderId === workOrder.id), "Completion must trigger automatic evaluation.");
  const evaluation = await post(evaluationsEndpoint, { action: "reconcile_completed" });
  assert.ok(Array.isArray(evaluation.evaluationLearning.evaluations));
  const getResponse = await fetch(evaluationsEndpoint, { cache: "no-store" });
  assert.equal(getResponse.ok, true);
  const getBody = await getResponse.json();
  assert.ok(Array.isArray(getBody.evaluationLearning.memories));
  console.log("PASS: completed work orders automatically create evaluations and learning memory.");
} finally {
  if (originalOperations) fs.writeFileSync(operationsPath, originalOperations); else fs.rmSync(operationsPath, { force: true });
  if (originalEvaluation) fs.writeFileSync(evaluationPath, originalEvaluation); else fs.rmSync(evaluationPath, { force: true });
}
