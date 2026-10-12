"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { resolveStateDir } = require("../studio-settings");

const EVALUATION_STATUSES = new Set(["proposed", "reviewed", "accepted", "dismissed"]);
const EVALUATION_DECISIONS = new Set(["retain", "improve", "escalate"]);
const IMPROVEMENT_TYPES = new Set(["monitor", "update_sop", "develop_agent", "review_mandate", "recruit_or_rebalance"]);
const IMPROVEMENT_STATUSES = new Set(["proposed", "accepted", "in_progress", "completed", "dismissed"]);
const IMPROVEMENT_PRIORITIES = new Set(["low", "normal", "high", "critical"]);
const AUDIT_TYPES = new Set([
  "evaluation_recorded",
  "evaluation_status_changed",
  "improvement_created",
  "improvement_status_changed",
  "improvement_linked",
  "memory_recorded",
]);
const MAX_AUDIT_EVENTS = 1200;
const MAX_MEMORIES = 1200;
const MAX_TEXT_LENGTH = 12000;

function resolveEvaluationLearningPath(env = process.env) {
  return path.join(resolveStateDir(env), "hermes3d", "evaluation-learning.json");
}

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

function copyState(state) {
  return JSON.parse(JSON.stringify(state));
}

function requireString(value, label, { allowEmpty = false, maxLength = MAX_TEXT_LENGTH } = {}) {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  return normalized;
}

function requireSafeText(value, label, options = {}) {
  const text = requireString(value, label, options);
  if (/\b(?:api[_-]?key|authorization|bearer\s+[a-z0-9._-]+|password\s*[=:]|secret\s*[=:]|token\s*[=:])\b/i.test(text)) {
    throw new Error(`${label} must not contain credentials or secrets.`);
  }
  return text;
}

function redactLearningText(value, label, maxLength = 1800) {
  const text = requireString(value ?? "", label, { allowEmpty: true, maxLength: MAX_TEXT_LENGTH });
  return text
    .replace(/(?:api[_-]?key|authorization|password|secret|token)\s*[=:]\s*[^\s,;]+/gi, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, maxLength);
}

function requireId(value, label) {
  const id = requireString(value, label, { maxLength: 160 });
  if (!/^[a-z0-9][a-z0-9-]{2,159}$/.test(id)) throw new Error(`${label} is invalid.`);
  return id;
}

function requireEnum(value, values, label) {
  const normalized = requireString(value, label, { maxLength: 64 });
  if (!values.has(normalized)) throw new Error(`Invalid ${label}: ${normalized}`);
  return normalized;
}

function requireScore(value, label) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error(`${label} must be between 0 and 100.`);
  return Math.round(score);
}

function validateDimension(dimension) {
  if (!dimension || typeof dimension !== "object" || Array.isArray(dimension)) throw new Error("Evaluation dimension must be an object.");
  return {
    score: requireScore(dimension.score, "Evaluation dimension score"),
    rationale: requireSafeText(dimension.rationale ?? "", "Evaluation dimension rationale", { allowEmpty: true, maxLength: 4000 }),
  };
}

function validateEvaluation(evaluation) {
  if (!evaluation || typeof evaluation !== "object" || Array.isArray(evaluation)) throw new Error("Evaluation must be an object.");
  const dimensions = evaluation.dimensions && typeof evaluation.dimensions === "object" ? evaluation.dimensions : {};
  return {
    id: requireId(evaluation.id, "Evaluation id"),
    workOrderId: requireId(evaluation.workOrderId, "Evaluation work order id"),
    workflowId: requireId(evaluation.workflowId, "Evaluation workflow id"),
    workflowName: requireString(evaluation.workflowName, "Evaluation workflow name", { maxLength: 240 }),
    agentKey: requireString(evaluation.agentKey, "Evaluation agent key", { maxLength: 160 }),
    project: requireString(evaluation.project ?? "", "Evaluation project", { allowEmpty: true, maxLength: 160 }),
    status: requireEnum(evaluation.status, EVALUATION_STATUSES, "Evaluation status"),
    decision: requireEnum(evaluation.decision, EVALUATION_DECISIONS, "Evaluation decision"),
    score: requireScore(evaluation.score, "Evaluation score"),
    dimensions: {
      outcome: validateDimension(dimensions.outcome),
      evidence: validateDimension(dimensions.evidence),
      governance: validateDimension(dimensions.governance),
      execution: validateDimension(dimensions.execution),
      learning: validateDimension(dimensions.learning),
    },
    recommendation: requireSafeText(evaluation.recommendation, "Evaluation recommendation", { maxLength: 6000 }),
    outcomeSummary: requireSafeText(evaluation.outcomeSummary ?? "", "Evaluation outcome summary", { allowEmpty: true, maxLength: 2400 }),
    learningSummary: requireSafeText(evaluation.learningSummary ?? "", "Evaluation learning summary", { allowEmpty: true, maxLength: 2400 }),
    improvementId: evaluation.improvementId ? requireId(evaluation.improvementId, "Evaluation improvement id") : null,
    memoryId: evaluation.memoryId ? requireId(evaluation.memoryId, "Evaluation memory id") : null,
    evaluatedAt: requireString(evaluation.evaluatedAt, "Evaluation timestamp", { maxLength: 80 }),
    createdAt: requireString(evaluation.createdAt, "Evaluation createdAt", { maxLength: 80 }),
    updatedAt: requireString(evaluation.updatedAt, "Evaluation updatedAt", { maxLength: 80 }),
  };
}

function validateImprovement(improvement) {
  if (!improvement || typeof improvement !== "object" || Array.isArray(improvement)) throw new Error("Improvement action must be an object.");
  return {
    id: requireId(improvement.id, "Improvement id"),
    evaluationId: requireId(improvement.evaluationId, "Improvement evaluation id"),
    agentKey: requireString(improvement.agentKey, "Improvement agent key", { maxLength: 160 }),
    workflowId: requireId(improvement.workflowId, "Improvement workflow id"),
    type: requireEnum(improvement.type, IMPROVEMENT_TYPES, "Improvement type"),
    title: requireSafeText(improvement.title, "Improvement title", { maxLength: 400 }),
    description: requireSafeText(improvement.description, "Improvement description", { maxLength: 6000 }),
    priority: requireEnum(improvement.priority, IMPROVEMENT_PRIORITIES, "Improvement priority"),
    status: requireEnum(improvement.status, IMPROVEMENT_STATUSES, "Improvement status"),
    approvalRequired: Boolean(improvement.approvalRequired),
    targetWorkflowId: improvement.targetWorkflowId ? requireId(improvement.targetWorkflowId, "Improvement target workflow id") : null,
    linkedWorkOrderId: improvement.linkedWorkOrderId ? requireId(improvement.linkedWorkOrderId, "Improvement linked work order id") : null,
    createdAt: requireString(improvement.createdAt, "Improvement createdAt", { maxLength: 80 }),
    updatedAt: requireString(improvement.updatedAt, "Improvement updatedAt", { maxLength: 80 }),
  };
}

function validateMemory(memory) {
  if (!memory || typeof memory !== "object" || Array.isArray(memory)) throw new Error("Learning memory must be an object.");
  return {
    id: requireId(memory.id, "Learning memory id"),
    agentKey: requireString(memory.agentKey, "Learning memory agent key", { maxLength: 160 }),
    workflowId: requireId(memory.workflowId, "Learning memory workflow id"),
    workOrderId: requireId(memory.workOrderId, "Learning memory work order id"),
    content: requireSafeText(memory.content, "Learning memory content", { maxLength: 2400 }),
    source: requireSafeText(memory.source, "Learning memory source", { maxLength: 240 }),
    createdAt: requireString(memory.createdAt, "Learning memory createdAt", { maxLength: 80 }),
  };
}

function validateAuditEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Evaluation audit event must be an object.");
  return {
    id: requireId(event.id, "Evaluation audit id"),
    at: requireString(event.at, "Evaluation audit timestamp", { maxLength: 80 }),
    actor: requireString(event.actor, "Evaluation audit actor", { maxLength: 160 }),
    type: requireEnum(event.type, AUDIT_TYPES, "Evaluation audit type"),
    evaluationId: event.evaluationId ? requireId(event.evaluationId, "Evaluation audit evaluation id") : null,
    improvementId: event.improvementId ? requireId(event.improvementId, "Evaluation audit improvement id") : null,
    memoryId: event.memoryId ? requireId(event.memoryId, "Evaluation audit memory id") : null,
    note: requireSafeText(event.note ?? "", "Evaluation audit note", { allowEmpty: true, maxLength: 4000 }),
  };
}

function validateEvaluationLearningState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state) || state.version !== 1) {
    throw new Error("Invalid evaluation and learning state.");
  }
  if (!Array.isArray(state.evaluations) || !Array.isArray(state.improvements) || !Array.isArray(state.memories) || !Array.isArray(state.auditEvents)) {
    throw new Error("Evaluation and learning collections are required.");
  }
  const evaluations = state.evaluations.map(validateEvaluation);
  const improvements = state.improvements.map(validateImprovement);
  const memories = state.memories.map(validateMemory);
  const auditEvents = state.auditEvents.map(validateAuditEvent);
  const ids = (entries, label) => {
    const seen = new Set();
    for (const entry of entries) {
      if (seen.has(entry.id)) throw new Error(`Duplicate ${label} id: ${entry.id}`);
      seen.add(entry.id);
    }
  };
  ids(evaluations, "evaluation");
  ids(improvements, "improvement");
  ids(memories, "memory");
  ids(auditEvents, "audit");
  const evaluationIds = new Set(evaluations.map((entry) => entry.id));
  const improvementIds = new Set(improvements.map((entry) => entry.id));
  const memoryIds = new Set(memories.map((entry) => entry.id));
  const workOrderIds = new Set();
  for (const evaluation of evaluations) {
    if (workOrderIds.has(evaluation.workOrderId)) throw new Error(`Duplicate evaluation work order: ${evaluation.workOrderId}`);
    workOrderIds.add(evaluation.workOrderId);
    if (evaluation.improvementId && !improvementIds.has(evaluation.improvementId)) throw new Error(`Evaluation references unknown improvement: ${evaluation.id}`);
    if (evaluation.memoryId && !memoryIds.has(evaluation.memoryId)) throw new Error(`Evaluation references unknown memory: ${evaluation.id}`);
  }
  for (const improvement of improvements) {
    if (!evaluationIds.has(improvement.evaluationId)) throw new Error(`Improvement references unknown evaluation: ${improvement.id}`);
  }
  for (const event of auditEvents) {
    if (event.evaluationId && !evaluationIds.has(event.evaluationId)) throw new Error(`Audit references unknown evaluation: ${event.id}`);
    if (event.improvementId && !improvementIds.has(event.improvementId)) throw new Error(`Audit references unknown improvement: ${event.id}`);
    if (event.memoryId && !memoryIds.has(event.memoryId)) throw new Error(`Audit references unknown memory: ${event.id}`);
  }
  return {
    version: 1,
    updatedAt: requireString(state.updatedAt, "Evaluation state updatedAt", { maxLength: 80 }),
    evaluations,
    improvements,
    memories: memories.slice(-MAX_MEMORIES),
    auditEvents: auditEvents.slice(-MAX_AUDIT_EVENTS),
  };
}

function createDefaultEvaluationLearningState() {
  return { version: 1, updatedAt: now(), evaluations: [], improvements: [], memories: [], auditEvents: [] };
}

function loadEvaluationLearningState(filePath = resolveEvaluationLearningPath()) {
  if (!fs.existsSync(filePath)) return createDefaultEvaluationLearningState();
  return validateEvaluationLearningState(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function saveEvaluationLearningState(state, filePath = resolveEvaluationLearningPath()) {
  const validated = validateEvaluationLearningState({ ...state, updatedAt: now() });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(validated, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
  return validated;
}

function ensureEvaluationLearningState(filePath = resolveEvaluationLearningPath()) {
  if (fs.existsSync(filePath)) return loadEvaluationLearningState(filePath);
  return saveEvaluationLearningState(createDefaultEvaluationLearningState(), filePath);
}

function withAudit(state, { actor = "Hermes", type, evaluationId = null, improvementId = null, memoryId = null, note = "" }) {
  state.auditEvents.push(validateAuditEvent({
    id: createId("evaluation-audit"), at: now(), actor, type, evaluationId, improvementId, memoryId, note,
  }));
  if (state.auditEvents.length > MAX_AUDIT_EVENTS) state.auditEvents = state.auditEvents.slice(-MAX_AUDIT_EVENTS);
}

function scoreDimension(workOrder, key) {
  if (key === "outcome") return workOrder.outcome?.trim() ? { score: 100, rationale: "Outcome hasil tercatat." } : { score: 0, rationale: "Outcome belum tercatat." };
  if (key === "evidence") {
    const required = Math.max(1, workOrder.evidenceRequirements?.length || 1);
    const actual = workOrder.evidence?.length || 0;
    const score = Math.min(100, Math.round((actual / required) * 100));
    return { score, rationale: `${actual} bukti tercatat dari minimal ${required} requirement.` };
  }
  if (key === "governance") {
    const capability = workOrder.capabilityAssessment?.decision || "allowed";
    const identity = workOrder.identityAssessment?.decision || "allowed";
    const score = capability === "blocked" || identity === "blocked" ? 0 : capability === "review" || identity === "review" ? 70 : 100;
    return { score, rationale: `Capability ${capability}; identity ${identity}.` };
  }
  if (key === "execution") return workOrder.status === "completed" && workOrder.startedAt ? { score: 100, rationale: "Work order berjalan dan ditutup melalui lifecycle operasi." } : { score: 60, rationale: "Lifecycle eksekusi tidak lengkap." };
  return workOrder.lessons?.trim() ? { score: 100, rationale: "Pembelajaran tercatat untuk siklus berikutnya." } : { score: 0, rationale: "Pembelajaran belum tercatat." };
}

function determineImprovement(state, workOrder, score, dimensions) {
  const recent = state.evaluations
    .filter((entry) => entry.agentKey === workOrder.ownerKey)
    .sort((a, b) => Date.parse(b.evaluatedAt) - Date.parse(a.evaluatedAt))
    .slice(0, 2);
  const repeatedLow = recent.length >= 2 && recent.every((entry) => entry.score < 70);
  if (repeatedLow) {
    return {
      type: "recruit_or_rebalance",
      priority: "high",
      title: `Review kapasitas dan kebutuhan agent ${workOrder.ownerKey}`,
      description: "Dua evaluasi terakhir berada di bawah ambang 70. Agent Recruitment perlu menilai gap kapasitas, pembagian kerja, pengembangan, atau kebutuhan agent baru.",
      targetWorkflowId: "agent-lifecycle-review",
    };
  }
  if (dimensions.governance.score < 100) {
    return {
      type: "review_mandate",
      priority: score < 70 ? "high" : "normal",
      title: `Tinjau mandat dan kontrol ${workOrder.ownerKey}`,
      description: "Evaluasi menemukan kontrol capability atau identity yang masih membutuhkan review. Tinjau mandat sebelum pekerjaan sejenis berikutnya.",
      targetWorkflowId: "risk-audit-gate",
    };
  }
  if (dimensions.evidence.score < 100 || dimensions.learning.score < 100) {
    return {
      type: "update_sop",
      priority: score < 70 ? "high" : "normal",
      title: `Perbaiki SOP workflow ${workOrder.workflowName}`,
      description: "Bukti atau pembelajaran belum lengkap. Perjelas checklist evidence dan langkah penutupan agar siklus berikutnya dapat dievaluasi dengan lebih baik.",
      targetWorkflowId: "risk-audit-gate",
    };
  }
  if (score < 70) {
    return {
      type: "develop_agent",
      priority: "high",
      title: `Kembangkan agent ${workOrder.ownerKey}`,
      description: "Skor evaluasi berada di bawah ambang 70. Siapkan coaching, skill, atau pendampingan sebelum memberi mandat serupa.",
      targetWorkflowId: "agent-lifecycle-review",
    };
  }
  return {
    type: "monitor",
    priority: "low",
    title: `Pertahankan dan monitor ${workOrder.workflowName}`,
    description: "Hasil memenuhi kontrol yang tersedia. Simpan pembelajaran dan monitor konsistensi pada siklus berikutnya.",
    targetWorkflowId: null,
  };
}

function evaluateWorkOrder(state, input = {}) {
  const next = copyState(validateEvaluationLearningState(state));
  const workOrder = input.workOrder;
  if (!workOrder || typeof workOrder !== "object" || workOrder.status !== "completed") throw new Error("Hanya work order selesai yang dapat dievaluasi.");
  const at = now();
  const dimensions = {
    outcome: scoreDimension(workOrder, "outcome"),
    evidence: scoreDimension(workOrder, "evidence"),
    governance: scoreDimension(workOrder, "governance"),
    execution: scoreDimension(workOrder, "execution"),
    learning: scoreDimension(workOrder, "learning"),
  };
  const score = Math.round(
    dimensions.outcome.score * 0.30 +
    dimensions.evidence.score * 0.25 +
    dimensions.governance.score * 0.20 +
    dimensions.execution.score * 0.15 +
    dimensions.learning.score * 0.10,
  );
  const decision = score >= 85 ? "retain" : score >= 70 ? "improve" : "escalate";
  const improvementPlan = determineImprovement(next, workOrder, score, dimensions);
  const existing = next.evaluations.find((entry) => entry.workOrderId === workOrder.id);
  const evaluationId = existing?.id || createId("evaluation");
  const memoryId = existing?.memoryId || createId("learning-memory");
  const improvementId = existing?.improvementId || createId("improvement");
  const evaluation = validateEvaluation({
    id: evaluationId,
    workOrderId: workOrder.id,
    workflowId: workOrder.workflowId,
    workflowName: workOrder.workflowName,
    agentKey: workOrder.ownerKey,
    project: workOrder.project || "",
    status: existing?.status || "proposed",
    decision,
    score,
    dimensions,
    recommendation: improvementPlan.description,
    outcomeSummary: redactLearningText(workOrder.outcome, "Outcome summary"),
    learningSummary: redactLearningText(workOrder.lessons, "Learning summary"),
    improvementId,
    memoryId,
    evaluatedAt: at,
    createdAt: existing?.createdAt || at,
    updatedAt: at,
  });
  const memory = validateMemory({
    id: memoryId,
    agentKey: workOrder.ownerKey,
    workflowId: workOrder.workflowId,
    workOrderId: workOrder.id,
    content: redactLearningText(`Workflow ${workOrder.workflowName}. Skor evaluasi ${score}/100. Outcome: ${workOrder.outcome || "belum ada"}. Pembelajaran: ${workOrder.lessons || "belum ada"}. Rekomendasi: ${improvementPlan.description}`, "Learning memory", 2200),
    source: `Evaluation ${evaluationId}`,
    createdAt: existing?.createdAt || at,
  });
  const improvement = validateImprovement({
    id: improvementId,
    evaluationId,
    agentKey: workOrder.ownerKey,
    workflowId: workOrder.workflowId,
    type: improvementPlan.type,
    title: improvementPlan.title,
    description: improvementPlan.description,
    priority: improvementPlan.priority,
    status: existing?.improvementId ? next.improvements.find((entry) => entry.id === improvementId)?.status || "proposed" : "proposed",
    approvalRequired: improvementPlan.type !== "monitor",
    targetWorkflowId: improvementPlan.targetWorkflowId,
    linkedWorkOrderId: next.improvements.find((entry) => entry.id === improvementId)?.linkedWorkOrderId || null,
    createdAt: next.improvements.find((entry) => entry.id === improvementId)?.createdAt || at,
    updatedAt: at,
  });
  const evaluationIndex = next.evaluations.findIndex((entry) => entry.id === evaluationId);
  if (evaluationIndex >= 0) next.evaluations[evaluationIndex] = evaluation;
  else next.evaluations.unshift(evaluation);
  const memoryIndex = next.memories.findIndex((entry) => entry.id === memoryId);
  if (memoryIndex >= 0) next.memories[memoryIndex] = memory;
  else next.memories.unshift(memory);
  const improvementIndex = next.improvements.findIndex((entry) => entry.id === improvementId);
  if (improvementIndex >= 0) next.improvements[improvementIndex] = improvement;
  else {
    next.improvements.unshift(improvement);
    withAudit(next, { actor: input.actor || "Hermes", type: "improvement_created", evaluationId, improvementId, note: `Improvement dibuat: ${improvement.title}.` });
  }
  withAudit(next, { actor: input.actor || "Hermes", type: "evaluation_recorded", evaluationId, improvementId, note: `Work order ${workOrder.id} dievaluasi dengan skor ${score}/100.` });
  withAudit(next, { actor: input.actor || "Hermes", type: "memory_recorded", evaluationId, memoryId, note: `Learning memory diperbarui untuk ${workOrder.ownerKey}.` });
  return { state: next, evaluation, improvement, memory, changed: !existing || existing.updatedAt !== evaluation.updatedAt };
}

function setEvaluationStatus(state, input = {}) {
  const next = copyState(validateEvaluationLearningState(state));
  const evaluation = next.evaluations.find((entry) => entry.id === requireId(input.evaluationId, "Evaluation id"));
  if (!evaluation) throw new Error("Evaluasi tidak ditemukan.");
  const status = requireEnum(input.status, EVALUATION_STATUSES, "Evaluation status");
  evaluation.status = status;
  evaluation.updatedAt = now();
  withAudit(next, { actor: input.actor || "Faza", type: "evaluation_status_changed", evaluationId: evaluation.id, note: `Status evaluasi diubah menjadi ${status}.` });
  return { state: next, evaluation };
}

function setImprovementStatus(state, input = {}) {
  const next = copyState(validateEvaluationLearningState(state));
  const improvement = next.improvements.find((entry) => entry.id === requireId(input.improvementId, "Improvement id"));
  if (!improvement) throw new Error("Improvement action tidak ditemukan.");
  const status = requireEnum(input.status, IMPROVEMENT_STATUSES, "Improvement status");
  improvement.status = status;
  improvement.updatedAt = now();
  withAudit(next, { actor: input.actor || "Faza", type: "improvement_status_changed", improvementId: improvement.id, evaluationId: improvement.evaluationId, note: `Status improvement ${improvement.title} diubah menjadi ${status}.` });
  return { state: next, improvement };
}

function linkImprovementWorkOrder(state, input = {}) {
  const next = copyState(validateEvaluationLearningState(state));
  const improvement = next.improvements.find((entry) => entry.id === requireId(input.improvementId, "Improvement id"));
  if (!improvement) throw new Error("Improvement action tidak ditemukan.");
  improvement.linkedWorkOrderId = requireId(input.workOrderId, "Linked work order id");
  improvement.status = "accepted";
  improvement.updatedAt = now();
  withAudit(next, { actor: input.actor || "Hermes", type: "improvement_linked", improvementId: improvement.id, evaluationId: improvement.evaluationId, note: `Improvement dirutekan ke work order ${improvement.linkedWorkOrderId}.` });
  return { state: next, improvement };
}

function getAgentLearningContext(state, agentKeys, { limit = 6 } = {}) {
  const normalizedKeys = new Set((Array.isArray(agentKeys) ? agentKeys : [agentKeys]).filter((key) => typeof key === "string" && key.trim()).map((key) => key.trim()));
  const validated = validateEvaluationLearningState(state);
  return validated.memories
    .filter((memory) => normalizedKeys.has(memory.agentKey))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.max(1, Math.min(20, limit)))
    .map((memory) => `- ${memory.content}`)
    .join("\n");
}

function getEvaluationLearningSummary(state, { limit = 8 } = {}) {
  const validated = validateEvaluationLearningState(state);
  const improvements = validated.improvements
    .filter((entry) => !["completed", "dismissed"].includes(entry.status))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, Math.max(1, Math.min(20, limit)));
  const memories = validated.memories
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.max(1, Math.min(20, limit)));
  const lines = [];
  if (improvements.length) {
    lines.push("Open improvement proposals:");
    for (const improvement of improvements) lines.push(`- ${improvement.title} [${improvement.type}] | ${improvement.priority} | status: ${improvement.status}`);
  }
  if (memories.length) {
    lines.push("Recent learning memory:");
    for (const memory of memories) lines.push(`- ${memory.agentKey}: ${memory.content}`);
  }
  return lines.join("\n");
}

module.exports = {
  AUDIT_TYPES,
  EVALUATION_DECISIONS,
  EVALUATION_STATUSES,
  IMPROVEMENT_PRIORITIES,
  IMPROVEMENT_STATUSES,
  IMPROVEMENT_TYPES,
  createDefaultEvaluationLearningState,
  ensureEvaluationLearningState,
  evaluateWorkOrder,
  getAgentLearningContext,
  getEvaluationLearningSummary,
  linkImprovementWorkOrder,
  loadEvaluationLearningState,
  resolveEvaluationLearningPath,
  saveEvaluationLearningState,
  setEvaluationStatus,
  setImprovementStatus,
  validateEvaluationLearningState,
};
