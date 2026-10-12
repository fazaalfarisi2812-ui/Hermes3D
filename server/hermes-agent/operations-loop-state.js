"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { resolveStateDir } = require("../studio-settings");
const { assertWorkflowCapabilities } = require("./capability-registry-state");
const { assertWorkflowDelegation } = require("./agent-identity-registry-state");

const SIGNAL_SOURCES = new Set(["manual", "chat", "monitor", "erp", "schedule"]);
const PRIORITIES = new Set(["low", "normal", "high"]);
const SIGNAL_STATUSES = new Set(["new", "routed", "dismissed"]);
const WORK_ORDER_STATUSES = new Set([
  "waiting_approval",
  "queued",
  "in_progress",
  "evidence_required",
  "blocked",
  "completed",
  "cancelled",
]);
const APPROVAL_STATES = new Set(["not_required", "pending", "approved", "rejected"]);
const AUDIT_TYPES = new Set([
  "signal_created",
  "signal_routed",
  "signal_dismissed",
  "approval_granted",
  "approval_rejected",
  "work_started",
  "evidence_requested",
  "evidence_added",
  "work_blocked",
  "work_resumed",
  "work_completed",
  "learning_recorded",
]);
const MAX_AUDIT_EVENTS = 1000;

function resolveOperationsLoopPath(env = process.env) {
  return path.join(resolveStateDir(env), "hermes3d", "operations-loop.json");
}

function requireString(value, label, { allowEmpty = false, maxLength = 12000 } = {}) {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  return normalized;
}

function requireEnum(value, values, label) {
  const normalized = requireString(value, label, { maxLength: 64 });
  if (!values.has(normalized)) throw new Error(`Invalid ${label}: ${normalized}`);
  return normalized;
}

function requireStringArray(value, label, { minimum = 0, maxLength = 64 } = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const normalized = value.map((entry) => requireString(entry, label, { maxLength })).filter(Boolean);
  if (normalized.length < minimum) throw new Error(`${label} requires at least ${minimum} value.`);
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicate values.`);
  return normalized;
}

function requireId(value, label) {
  const id = requireString(value, label, { maxLength: 160 });
  if (!/^[a-z0-9][a-z0-9-]{2,159}$/.test(id)) throw new Error(`${label} is invalid.`);
  return id;
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

function validateSignal(signal) {
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) throw new Error("Operation signal must be an object.");
  const status = requireEnum(signal.status, SIGNAL_STATUSES, "Signal status");
  const workflowId = signal.workflowId === null || signal.workflowId === undefined || signal.workflowId === ""
    ? null
    : requireId(signal.workflowId, "Signal workflow id");
  const workOrderId = signal.workOrderId === null || signal.workOrderId === undefined || signal.workOrderId === ""
    ? null
    : requireId(signal.workOrderId, "Signal work order id");
  if (status === "routed" && !workOrderId) throw new Error("A routed signal requires a work order.");
  return {
    id: requireId(signal.id, "Signal id"),
    title: requireString(signal.title, "Signal title", { maxLength: 240 }),
    description: requireString(signal.description ?? "", "Signal description", { allowEmpty: true, maxLength: 12000 }),
    source: requireEnum(signal.source, SIGNAL_SOURCES, "Signal source"),
    priority: requireEnum(signal.priority, PRIORITIES, "Signal priority"),
    status,
    workflowId,
    workOrderId,
    createdAt: requireString(signal.createdAt, "Signal createdAt", { maxLength: 80 }),
    updatedAt: requireString(signal.updatedAt, "Signal updatedAt", { maxLength: 80 }),
  };
}

function validateEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new Error("Evidence entry must be an object.");
  return {
    id: requireId(evidence.id, "Evidence id"),
    description: requireString(evidence.description, "Evidence description", { maxLength: 12000 }),
    source: requireString(evidence.source, "Evidence source", { maxLength: 240 }),
    recordedAt: requireString(evidence.recordedAt, "Evidence recordedAt", { maxLength: 80 }),
    recordedBy: requireString(evidence.recordedBy, "Evidence recordedBy", { maxLength: 120 }),
  };
}

function validateCapabilityAssessment(assessment) {
  const value = assessment && typeof assessment === "object" && !Array.isArray(assessment)
    ? assessment
    : { decision: "allowed", capabilityIds: [], blockers: [], warnings: [], checkedAt: null };
  const decision = requireEnum(value.decision, new Set(["allowed", "review", "blocked"]), "Capability decision");
  const checkedAt = value.checkedAt ? requireString(value.checkedAt, "Capability checkedAt", { maxLength: 80 }) : null;
  const decisions = Array.isArray(value.decisions)
    ? value.decisions.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Capability decision entry must be an object.");
      return {
        capabilityId: requireId(entry.capabilityId, "Capability decision id"),
        decision: requireEnum(entry.decision, new Set(["allowed", "review", "blocked"]), "Capability decision result"),
        reason: requireString(entry.reason, "Capability decision reason", { maxLength: 4000 }),
      };
    })
    : [];
  return {
    decision,
    capabilityIds: requireStringArray(value.capabilityIds ?? [], "Capability ids", { maxLength: 120 }),
    blockers: requireStringArray(value.blockers ?? [], "Capability blockers", { maxLength: 4000 }),
    warnings: requireStringArray(value.warnings ?? [], "Capability warnings", { maxLength: 4000 }),
    decisions,
    checkedAt,
  };
}

function validateIdentityAssessment(assessment) {
  const value = assessment && typeof assessment === "object" && !Array.isArray(assessment)
    ? assessment
    : { decision: "allowed", identityId: null, delegationIds: [], blockers: [], warnings: [], checkedAt: null };
  return {
    decision: requireEnum(value.decision, new Set(["allowed", "review", "blocked"]), "Identity decision"),
    identityId: value.identityId ? requireId(value.identityId, "Identity assessment id") : null,
    delegationIds: requireStringArray(value.delegationIds ?? [], "Identity delegation ids", { maxLength: 120 }),
    blockers: requireStringArray(value.blockers ?? [], "Identity blockers", { maxLength: 4000 }),
    warnings: requireStringArray(value.warnings ?? [], "Identity warnings", { maxLength: 4000 }),
    checkedAt: value.checkedAt ? requireString(value.checkedAt, "Identity checkedAt", { maxLength: 80 }) : null,
  };
}

function validateWorkOrder(workOrder) {
  if (!workOrder || typeof workOrder !== "object" || Array.isArray(workOrder)) throw new Error("Work order must be an object.");
  const status = requireEnum(workOrder.status, WORK_ORDER_STATUSES, "Work order status");
  const approvalState = requireEnum(workOrder.approvalState, APPROVAL_STATES, "Approval state");
  if (status === "waiting_approval" && approvalState !== "pending") {
    throw new Error("A waiting work order must have pending approval.");
  }
  if (status === "completed" && (!Array.isArray(workOrder.evidence) || workOrder.evidence.length === 0)) {
    throw new Error("A completed work order requires evidence.");
  }
  return {
    id: requireId(workOrder.id, "Work order id"),
    signalId: requireId(workOrder.signalId, "Work order signal id"),
    workflowId: requireId(workOrder.workflowId, "Work order workflow id"),
    workflowName: requireString(workOrder.workflowName, "Workflow name", { maxLength: 240 }),
    title: requireString(workOrder.title, "Work order title", { maxLength: 240 }),
    description: requireString(workOrder.description ?? "", "Work order description", { allowEmpty: true, maxLength: 12000 }),
    project: requireString(workOrder.project ?? "", "Work order project", { allowEmpty: true, maxLength: 160 }),
    ownerKey: requireString(workOrder.ownerKey, "Work order owner", { maxLength: 160 }),
    allowedAgentKeys: requireStringArray(workOrder.allowedAgentKeys, "Work order agents", { minimum: 1, maxLength: 160 }),
    executionLevel: requireEnum(workOrder.executionLevel, new Set(["advisory", "approval", "bounded"]), "Work order execution level"),
    approvalState,
    approvalGate: requireString(workOrder.approvalGate, "Work order approval gate", { maxLength: 2000 }),
    evidenceRequirements: requireStringArray(workOrder.evidenceRequirements, "Evidence requirements", { minimum: 1, maxLength: 1000 }),
    status,
    statusReason: requireString(workOrder.statusReason ?? "", "Work order status reason", { allowEmpty: true, maxLength: 4000 }),
    evidence: Array.isArray(workOrder.evidence) ? workOrder.evidence.map(validateEvidence) : (() => { throw new Error("Work order evidence must be an array."); })(),
    capabilityAssessment: validateCapabilityAssessment(workOrder.capabilityAssessment),
    identityAssessment: validateIdentityAssessment(workOrder.identityAssessment),
    outcome: requireString(workOrder.outcome ?? "", "Work order outcome", { allowEmpty: true, maxLength: 12000 }),
    lessons: requireString(workOrder.lessons ?? "", "Work order lessons", { allowEmpty: true, maxLength: 12000 }),
    createdAt: requireString(workOrder.createdAt, "Work order createdAt", { maxLength: 80 }),
    updatedAt: requireString(workOrder.updatedAt, "Work order updatedAt", { maxLength: 80 }),
    startedAt: workOrder.startedAt ? requireString(workOrder.startedAt, "Work order startedAt", { maxLength: 80 }) : null,
    completedAt: workOrder.completedAt ? requireString(workOrder.completedAt, "Work order completedAt", { maxLength: 80 }) : null,
  };
}

function validateAuditEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Audit event must be an object.");
  const type = requireEnum(event.type, AUDIT_TYPES, "Audit event type");
  return {
    id: requireId(event.id, "Audit event id"),
    at: requireString(event.at, "Audit event timestamp", { maxLength: 80 }),
    actor: requireString(event.actor, "Audit event actor", { maxLength: 120 }),
    type,
    signalId: event.signalId ? requireId(event.signalId, "Audit event signal id") : null,
    workOrderId: event.workOrderId ? requireId(event.workOrderId, "Audit event work order id") : null,
    note: requireString(event.note ?? "", "Audit event note", { allowEmpty: true, maxLength: 4000 }),
  };
}

function validateOperationsLoop(state) {
  if (!state || typeof state !== "object" || Array.isArray(state) || state.version !== 1) {
    throw new Error("Invalid autonomous operations state.");
  }
  if (!Array.isArray(state.signals) || !Array.isArray(state.workOrders) || !Array.isArray(state.auditEvents)) {
    throw new Error("Autonomous operations collections are required.");
  }
  const signals = state.signals.map(validateSignal);
  const workOrders = state.workOrders.map(validateWorkOrder);
  const auditEvents = state.auditEvents.map(validateAuditEvent);
  const signalIds = new Set();
  for (const signal of signals) {
    if (signalIds.has(signal.id)) throw new Error(`Duplicate signal id: ${signal.id}`);
    signalIds.add(signal.id);
  }
  const workOrderIds = new Set();
  for (const workOrder of workOrders) {
    if (workOrderIds.has(workOrder.id)) throw new Error(`Duplicate work order id: ${workOrder.id}`);
    workOrderIds.add(workOrder.id);
    if (!signalIds.has(workOrder.signalId)) throw new Error(`Work order references an unknown signal: ${workOrder.id}`);
  }
  for (const signal of signals) {
    if (signal.workOrderId && !workOrderIds.has(signal.workOrderId)) {
      throw new Error(`Signal references an unknown work order: ${signal.id}`);
    }
  }
  const auditIds = new Set();
  for (const event of auditEvents) {
    if (auditIds.has(event.id)) throw new Error(`Duplicate audit event id: ${event.id}`);
    auditIds.add(event.id);
  }
  return {
    version: 1,
    updatedAt: requireString(state.updatedAt, "Autonomous operations updatedAt", { maxLength: 80 }),
    signals,
    workOrders,
    auditEvents: auditEvents.slice(-MAX_AUDIT_EVENTS),
  };
}

function createDefaultOperationsLoop() {
  return { version: 1, updatedAt: now(), signals: [], workOrders: [], auditEvents: [] };
}

function loadOperationsLoop(filePath = resolveOperationsLoopPath()) {
  if (!fs.existsSync(filePath)) return createDefaultOperationsLoop();
  return validateOperationsLoop(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function saveOperationsLoop(state, filePath = resolveOperationsLoopPath()) {
  const validated = validateOperationsLoop({ ...state, updatedAt: now() });
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

function ensureOperationsLoop(filePath = resolveOperationsLoopPath()) {
  if (fs.existsSync(filePath)) return loadOperationsLoop(filePath);
  return saveOperationsLoop(createDefaultOperationsLoop(), filePath);
}

function withAudit(state, { actor = "Faza", type, signalId = null, workOrderId = null, note = "" }) {
  const at = now();
  state.auditEvents.push({ id: createId("audit"), at, actor: requireString(actor, "Audit actor", { maxLength: 120 }), type, signalId, workOrderId, note });
  if (state.auditEvents.length > MAX_AUDIT_EVENTS) state.auditEvents.splice(0, state.auditEvents.length - MAX_AUDIT_EVENTS);
  state.updatedAt = at;
}

function getSignal(state, signalId) {
  const signal = state.signals.find((entry) => entry.id === signalId);
  if (!signal) throw new Error("Signal tidak ditemukan.");
  return signal;
}

function getWorkOrder(state, workOrderId) {
  const workOrder = state.workOrders.find((entry) => entry.id === workOrderId);
  if (!workOrder) throw new Error("Work order tidak ditemukan.");
  return workOrder;
}

function requireEligibleWorkflow(workflow, organizationAgents, organizationProjects = []) {
  if (!workflow || typeof workflow !== "object") throw new Error("Workflow tidak ditemukan.");
  if (workflow.lifecycle !== "ready") throw new Error("Hanya workflow berstatus siap yang dapat dirutekan.");
  if (!Array.isArray(organizationAgents)) throw new Error("Organization state is unavailable.");
  if (workflow.project) {
    if (!Array.isArray(organizationProjects)) throw new Error("Project state is unavailable.");
    const project = organizationProjects.find((entry) => entry && entry.name === workflow.project);
    if (!project) throw new Error(`Workflow memakai proyek yang tidak ditemukan: ${workflow.project}.`);
    if (project.status === "inactive") throw new Error(`Workflow memakai proyek nonaktif: ${workflow.project}.`);
  }
  const agents = new Map(organizationAgents
    .filter((agent) => agent && typeof agent.organizationKey === "string")
    .map((agent) => [agent.organizationKey, agent]));
  const involvedAgentKeys = [workflow.ownerKey, ...(Array.isArray(workflow.allowedAgentKeys) ? workflow.allowedAgentKeys : [])];
  for (const agentKey of involvedAgentKeys) {
    const agent = agents.get(agentKey);
    if (!agent) throw new Error(`Workflow memakai agent yang tidak ditemukan: ${agentKey}.`);
    if (agent.projectStatus === "inactive") throw new Error(`Workflow memakai agent proyek nonaktif: ${agentKey}.`);
    if (workflow.project && agent.project && agent.project !== workflow.project) {
      throw new Error(`Workflow tidak dapat memakai ${agentKey} di luar proyek ${workflow.project}.`);
    }
  }
}

function createSignal(state, input = {}) {
  const next = copyState(validateOperationsLoop(state));
  const at = now();
  const signal = {
    id: createId("signal"),
    title: requireString(input.title, "Signal title", { maxLength: 240 }),
    description: requireString(input.description ?? "", "Signal description", { allowEmpty: true, maxLength: 12000 }),
    source: requireEnum(input.source ?? "manual", SIGNAL_SOURCES, "Signal source"),
    priority: requireEnum(input.priority ?? "normal", PRIORITIES, "Signal priority"),
    status: "new",
    workflowId: null,
    workOrderId: null,
    createdAt: at,
    updatedAt: at,
  };
  next.signals.unshift(signal);
  withAudit(next, { actor: input.actor || "Faza", type: "signal_created", signalId: signal.id, note: `Signal dibuat: ${signal.title}` });
  return { state: next, signal };
}

/** @param {any} state @param {any} input */
function routeSignal(state, input = {}) {
  const { signalId, workflow, organizationAgents, organizationProjects = [], capabilityRegistry = null, identityRegistry = null, actor = "Hermes" } = input;
  const next = copyState(validateOperationsLoop(state));
  const signal = getSignal(next, requireId(signalId, "Signal id"));
  if (signal.status !== "new") throw new Error("Signal ini sudah diproses atau ditutup.");
  requireEligibleWorkflow(workflow, organizationAgents, organizationProjects);
  const capabilityAssessment = capabilityRegistry
    ? assertWorkflowCapabilities(workflow, capabilityRegistry)
    : validateCapabilityAssessment(null);
  const identityAssessment = identityRegistry
    ? assertWorkflowDelegation(workflow, identityRegistry, capabilityRegistry)
    : validateIdentityAssessment(null);
  const at = now();
  const requiresApproval = workflow.executionLevel === "approval";
  const capabilityReviewNote = capabilityAssessment.warnings.length
    ? ` Capability review: ${capabilityAssessment.warnings.join(" ")}`
    : "";
  const identityReviewNote = identityAssessment.warnings.length
    ? ` Identity review: ${identityAssessment.warnings.join(" ")}`
    : "";
  const workOrder = {
    id: createId("work"),
    signalId: signal.id,
    workflowId: requireId(workflow.id, "Workflow id"),
    workflowName: requireString(workflow.name, "Workflow name", { maxLength: 240 }),
    title: signal.title,
    description: signal.description,
    project: requireString(workflow.project ?? "", "Workflow project", { allowEmpty: true, maxLength: 160 }),
    ownerKey: requireString(workflow.ownerKey, "Workflow owner", { maxLength: 160 }),
    allowedAgentKeys: requireStringArray(workflow.allowedAgentKeys, "Workflow agents", { minimum: 1, maxLength: 160 }),
    executionLevel: requireEnum(workflow.executionLevel, new Set(["advisory", "approval", "bounded"]), "Workflow execution level"),
    approvalState: requiresApproval ? "pending" : "not_required",
    approvalGate: requireString(workflow.approvalGate, "Workflow approval gate", { maxLength: 2000 }),
    evidenceRequirements: requireStringArray(workflow.evidence, "Workflow evidence", { minimum: 1, maxLength: 1000 }),
    status: requiresApproval ? "waiting_approval" : "queued",
    statusReason: requiresApproval
      ? `Menunggu persetujuan Faza sesuai approval gate.${capabilityReviewNote}${identityReviewNote}`
      : `Siap dijalankan dalam batas workflow.${capabilityReviewNote}${identityReviewNote}`,
    evidence: [],
    capabilityAssessment,
    identityAssessment,
    outcome: "",
    lessons: "",
    createdAt: at,
    updatedAt: at,
    startedAt: null,
    completedAt: null,
  };
  signal.status = "routed";
  signal.workflowId = workOrder.workflowId;
  signal.workOrderId = workOrder.id;
  signal.updatedAt = at;
  next.workOrders.unshift(workOrder);
  withAudit(next, {
    actor,
    type: "signal_routed",
    signalId: signal.id,
    workOrderId: workOrder.id,
    note: `Dirutekan ke ${workOrder.workflowName}.${capabilityAssessment.warnings.length ? ` Capability review diperlukan: ${capabilityAssessment.warnings.join(" ")}` : ""}${identityAssessment.warnings.length ? ` Identity review diperlukan: ${identityAssessment.warnings.join(" ")}` : ""}`,
  });
  return { state: next, signal, workOrder };
}

/** @param {any} state @param {any} input */
function dismissSignal(state, input = {}) {
  const { signalId, reason = "", actor = "Faza" } = input;
  const next = copyState(validateOperationsLoop(state));
  const signal = getSignal(next, requireId(signalId, "Signal id"));
  if (signal.status !== "new") throw new Error("Hanya signal baru yang dapat ditutup.");
  const at = now();
  signal.status = "dismissed";
  signal.updatedAt = at;
  withAudit(next, { actor, type: "signal_dismissed", signalId: signal.id, note: requireString(reason, "Dismiss reason", { allowEmpty: true, maxLength: 4000 }) || "Signal ditutup." });
  return { state: next, signal };
}

/** @param {any} state @param {any} input */
function approveWorkOrder(state, input = {}) {
  const { workOrderId, actor = "Faza" } = input;
  const next = copyState(validateOperationsLoop(state));
  const workOrder = getWorkOrder(next, requireId(workOrderId, "Work order id"));
  if (workOrder.status !== "waiting_approval" || workOrder.approvalState !== "pending") throw new Error("Work order ini tidak menunggu persetujuan.");
  const at = now();
  workOrder.approvalState = "approved";
  workOrder.status = "queued";
  workOrder.statusReason = "Disetujui Faza dan siap dijalankan.";
  workOrder.updatedAt = at;
  withAudit(next, { actor, type: "approval_granted", signalId: workOrder.signalId, workOrderId: workOrder.id, note: "Persetujuan diberikan." });
  return { state: next, workOrder };
}

/** @param {any} state @param {any} input */
function rejectWorkOrder(state, input = {}) {
  const { workOrderId, reason, actor = "Faza" } = input;
  const next = copyState(validateOperationsLoop(state));
  const workOrder = getWorkOrder(next, requireId(workOrderId, "Work order id"));
  if (workOrder.status !== "waiting_approval" || workOrder.approvalState !== "pending") throw new Error("Work order ini tidak menunggu persetujuan.");
  const note = requireString(reason, "Rejection reason", { maxLength: 4000 });
  const at = now();
  workOrder.approvalState = "rejected";
  workOrder.status = "cancelled";
  workOrder.statusReason = note;
  workOrder.updatedAt = at;
  withAudit(next, { actor, type: "approval_rejected", signalId: workOrder.signalId, workOrderId: workOrder.id, note });
  return { state: next, workOrder };
}

/** @param {any} state @param {any} input */
function startWorkOrder(state, input = {}) {
  const { workOrderId, actor = "Hermes" } = input;
  const next = copyState(validateOperationsLoop(state));
  const workOrder = getWorkOrder(next, requireId(workOrderId, "Work order id"));
  if (workOrder.status !== "queued") throw new Error("Hanya work order yang antre dapat dimulai.");
  const at = now();
  workOrder.status = "in_progress";
  workOrder.statusReason = "Pekerjaan sedang berjalan.";
  workOrder.startedAt = workOrder.startedAt || at;
  workOrder.updatedAt = at;
  withAudit(next, { actor, type: "work_started", signalId: workOrder.signalId, workOrderId: workOrder.id, note: "Pekerjaan dimulai." });
  return { state: next, workOrder };
}

/** @param {any} state @param {any} input */
function requestEvidence(state, input = {}) {
  const { workOrderId, actor = "Hermes" } = input;
  const next = copyState(validateOperationsLoop(state));
  const workOrder = getWorkOrder(next, requireId(workOrderId, "Work order id"));
  if (workOrder.status !== "in_progress") throw new Error("Hanya work order yang sedang berjalan dapat meminta bukti.");
  const at = now();
  workOrder.status = "evidence_required";
  workOrder.statusReason = "Menunggu bukti hasil dan outcome sebelum penutupan.";
  workOrder.updatedAt = at;
  withAudit(next, { actor, type: "evidence_requested", signalId: workOrder.signalId, workOrderId: workOrder.id, note: "Bukti hasil diminta." });
  return { state: next, workOrder };
}

/** @param {any} state @param {any} input */
function addEvidence(state, input = {}) {
  const { workOrderId, description, source = "Hermes Workspace", actor = "Hermes" } = input;
  const next = copyState(validateOperationsLoop(state));
  const workOrder = getWorkOrder(next, requireId(workOrderId, "Work order id"));
  if (!new Set(["in_progress", "evidence_required", "blocked"]).has(workOrder.status)) {
    throw new Error("Bukti hanya dapat ditambahkan pada work order aktif atau terblokir.");
  }
  const at = now();
  const evidence = {
    id: createId("evidence"),
    description: requireString(description, "Evidence description", { maxLength: 12000 }),
    source: requireString(source, "Evidence source", { maxLength: 240 }),
    recordedAt: at,
    recordedBy: requireString(actor, "Evidence actor", { maxLength: 120 }),
  };
  workOrder.evidence.push(evidence);
  workOrder.updatedAt = at;
  withAudit(next, { actor, type: "evidence_added", signalId: workOrder.signalId, workOrderId: workOrder.id, note: `Bukti ditambahkan: ${evidence.source}.` });
  return { state: next, workOrder, evidence };
}

/** @param {any} state @param {any} input */
function blockWorkOrder(state, input = {}) {
  const { workOrderId, reason, actor = "Hermes" } = input;
  const next = copyState(validateOperationsLoop(state));
  const workOrder = getWorkOrder(next, requireId(workOrderId, "Work order id"));
  if (!new Set(["queued", "in_progress", "evidence_required"]).has(workOrder.status)) {
    throw new Error("Work order ini tidak dapat diblokir dari status saat ini.");
  }
  const note = requireString(reason, "Blocker reason", { maxLength: 4000 });
  const at = now();
  workOrder.status = "blocked";
  workOrder.statusReason = note;
  workOrder.updatedAt = at;
  withAudit(next, { actor, type: "work_blocked", signalId: workOrder.signalId, workOrderId: workOrder.id, note });
  return { state: next, workOrder };
}

/** @param {any} state @param {any} input */
function resumeWorkOrder(state, input = {}) {
  const { workOrderId, actor = "Hermes" } = input;
  const next = copyState(validateOperationsLoop(state));
  const workOrder = getWorkOrder(next, requireId(workOrderId, "Work order id"));
  if (workOrder.status !== "blocked") throw new Error("Hanya work order terblokir yang dapat dilanjutkan.");
  const at = now();
  workOrder.status = "queued";
  workOrder.statusReason = "Blocker ditandai selesai; pekerjaan kembali ke antrean.";
  workOrder.updatedAt = at;
  withAudit(next, { actor, type: "work_resumed", signalId: workOrder.signalId, workOrderId: workOrder.id, note: "Pekerjaan dikembalikan ke antrean." });
  return { state: next, workOrder };
}

/** @param {any} state @param {any} input */
function completeWorkOrder(state, input = {}) {
  const { workOrderId, outcome, lessons = "", actor = "Hermes" } = input;
  const next = copyState(validateOperationsLoop(state));
  const workOrder = getWorkOrder(next, requireId(workOrderId, "Work order id"));
  if (!new Set(["in_progress", "evidence_required"]).has(workOrder.status)) {
    throw new Error("Hanya work order aktif yang dapat diselesaikan.");
  }
  if (!workOrder.evidence.length) throw new Error("Work order tidak dapat diselesaikan tanpa bukti hasil.");
  const at = now();
  workOrder.status = "completed";
  workOrder.statusReason = "Selesai dengan bukti dan outcome tercatat.";
  workOrder.outcome = requireString(outcome, "Work order outcome", { maxLength: 12000 });
  workOrder.lessons = requireString(lessons, "Work order lessons", { allowEmpty: true, maxLength: 12000 });
  workOrder.updatedAt = at;
  workOrder.completedAt = at;
  withAudit(next, { actor, type: "work_completed", signalId: workOrder.signalId, workOrderId: workOrder.id, note: "Pekerjaan selesai dengan bukti tercatat." });
  if (workOrder.lessons) {
    withAudit(next, { actor, type: "learning_recorded", signalId: workOrder.signalId, workOrderId: workOrder.id, note: "Pembelajaran dicatat saat penutupan." });
  }
  return { state: next, workOrder };
}

/** @param {any} state @param {any} input */
function recordWorkOrderLearning(state, input = {}) {
  const { workOrderId, lessons, actor = "Hermes" } = input;
  const next = copyState(validateOperationsLoop(state));
  const workOrder = getWorkOrder(next, requireId(workOrderId, "Work order id"));
  const note = requireString(lessons, "Work order lessons", { maxLength: 12000 });
  const at = now();
  workOrder.lessons = note;
  workOrder.updatedAt = at;
  withAudit(next, { actor, type: "learning_recorded", signalId: workOrder.signalId, workOrderId: workOrder.id, note: "Pembelajaran diperbarui." });
  return { state: next, workOrder };
}

module.exports = {
  APPROVAL_STATES,
  AUDIT_TYPES,
  PRIORITIES,
  SIGNAL_SOURCES,
  SIGNAL_STATUSES,
  WORK_ORDER_STATUSES,
  addEvidence,
  approveWorkOrder,
  blockWorkOrder,
  completeWorkOrder,
  createDefaultOperationsLoop,
  createSignal,
  dismissSignal,
  ensureOperationsLoop,
  loadOperationsLoop,
  recordWorkOrderLearning,
  rejectWorkOrder,
  requestEvidence,
  resolveOperationsLoopPath,
  resumeWorkOrder,
  routeSignal,
  saveOperationsLoop,
  startWorkOrder,
  validateOperationsLoop,
};
