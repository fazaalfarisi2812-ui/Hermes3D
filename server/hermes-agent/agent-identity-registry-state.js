"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { resolveStateDir } = require("../studio-settings");

const AGENT_CLASSES = new Set([
  "personal_agent",
  "workforce_assistant",
  "digital_worker",
  "consumer_assistant",
]);
const IDENTITY_LIFECYCLES = new Set(["active", "review", "suspended", "retired"]);
const SUPERVISION_MODES = new Set(["attended", "mixed", "unattended"]);
const RISK_TIERS = new Set(["low", "moderate", "high", "critical"]);
const DATA_CLASSIFICATIONS = new Set(["public", "internal", "confidential", "restricted"]);
const DELEGATION_STATUSES = new Set(["active", "suspended", "revoked", "expired"]);
const EXECUTION_LEVELS = new Set(["advisory", "bounded", "approval"]);
const AGENCY_ACTIONS = new Set([
  "propose",
  "read",
  "analyze",
  "draft",
  "execute",
  "write",
  "communicate",
  "monitor",
  "approve",
  "pause",
  "override",
]);
const AUDIT_TYPES = new Set([
  "registry_initialized",
  "identity_reconciled",
  "identity_updated",
  "identity_lifecycle_changed",
  "delegation_created",
  "delegation_updated",
  "delegation_status_changed",
  "delegation_revoked",
]);
const MAX_AUDIT_EVENTS = 1200;
const CLASSIFICATION_RANK = { public: 1, internal: 2, confidential: 3, restricted: 4 };
const EXECUTION_RANK = { advisory: 1, bounded: 2, approval: 3 };

function resolveAgentIdentityRegistryPath(env = process.env) {
  return path.join(resolveStateDir(env), "hermes3d", "agent-identity-registry.json");
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

function requireString(value, label, { allowEmpty = false, maxLength = 12000 } = {}) {
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

function requireId(value, label) {
  const id = requireString(value, label, { maxLength: 120 });
  if (!/^[a-z0-9][a-z0-9-]{2,119}$/.test(id)) throw new Error(`${label} is invalid.`);
  return id;
}

function requireEnum(value, values, label) {
  const normalized = requireString(value, label, { maxLength: 64 });
  if (!values.has(normalized)) throw new Error(`Invalid ${label}: ${normalized}`);
  return normalized;
}

function requireStringArray(value, label, { minimum = 0, maxLength = 240 } = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const normalized = value.map((entry) => requireString(entry, label, { maxLength })).filter(Boolean);
  if (normalized.length < minimum) throw new Error(`${label} requires at least ${minimum} value.`);
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicate values.`);
  return normalized;
}

function defaultSpanOfAgency(executionLevel, owner = "Faza", issuedAt = now()) {
  const allowedActions = executionLevel === "advisory"
    ? ["propose", "read", "analyze", "draft", "monitor"]
    : ["propose", "read", "analyze", "draft", "execute", "write", "communicate", "monitor"];
  const requiresHumanApprovalFor = executionLevel === "approval"
    ? ["execute", "write", "communicate"]
    : [];
  return {
    allowedActions,
    requiresHumanApprovalFor,
    humanReservedActions: ["approve", "pause", "override"],
    boundaryOwner: owner,
    outcomeOwner: owner,
    reviewIntervalDays: 30,
    approvedBy: owner,
    rationale: "Batas awal mengikuti level eksekusi workflow; manusia tetap memegang approval, pause, dan override.",
    approvedAt: issuedAt,
    lastReviewedAt: issuedAt,
  };
}

function validateSpanOfAgency(span, { executionLevel, owner, issuedAt }) {
  const defaults = defaultSpanOfAgency(executionLevel, owner, issuedAt);
  const value = span && typeof span === "object" && !Array.isArray(span) ? span : defaults;
  const reviewIntervalDays = Number(value.reviewIntervalDays ?? defaults.reviewIntervalDays);
  if (!Number.isInteger(reviewIntervalDays) || reviewIntervalDays < 1 || reviewIntervalDays > 365) {
    throw new Error("Span of Agency review interval must be between 1 and 365 days.");
  }
  const validateActions = (actions, label, fallback) => requireStringArray(actions ?? fallback, label, { minimum: 1 })
    .map((action) => requireEnum(action, AGENCY_ACTIONS, label));
  return {
    allowedActions: validateActions(value.allowedActions, "Span of Agency allowed actions", defaults.allowedActions),
    requiresHumanApprovalFor: (value.requiresHumanApprovalFor ?? defaults.requiresHumanApprovalFor)
      .map((action) => requireEnum(action, AGENCY_ACTIONS, "Span of Agency approval actions")),
    humanReservedActions: validateActions(value.humanReservedActions, "Span of Agency human reserved actions", defaults.humanReservedActions),
    boundaryOwner: requireString(value.boundaryOwner ?? owner, "Span of Agency boundary owner", { maxLength: 160 }),
    outcomeOwner: requireString(value.outcomeOwner ?? owner, "Span of Agency outcome owner", { maxLength: 160 }),
    reviewIntervalDays,
    approvedBy: requireString(value.approvedBy ?? owner, "Span of Agency approved by", { maxLength: 160 }),
    rationale: requireSafeText(value.rationale ?? defaults.rationale, "Span of Agency rationale", { maxLength: 4000 }),
    approvedAt: requireIsoTimestamp(value.approvedAt ?? issuedAt, "Span of Agency approvedAt"),
    lastReviewedAt: requireIsoTimestamp(value.lastReviewedAt ?? issuedAt, "Span of Agency lastReviewedAt"),
  };
}

function requireProjectScopes(value) {
  const scopes = requireStringArray(value, "Identity project scopes", { minimum: 1 });
  if (scopes.includes("*") && scopes.length !== 1) {
    throw new Error("Wildcard project scope cannot be combined with individual projects.");
  }
  return scopes;
}

function requireIsoTimestamp(value, label) {
  const timestamp = requireString(value, label, { maxLength: 80 });
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${label} is invalid.`);
  return timestamp;
}

function validateIdentity(identity) {
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    throw new Error("Agent identity must be an object.");
  }
  return {
    id: requireId(identity.id, "Identity id"),
    agentKey: requireString(identity.agentKey, "Identity agent key", { maxLength: 160 }),
    displayName: requireString(identity.displayName, "Identity display name", { maxLength: 240 }),
    agentClass: requireEnum(identity.agentClass, AGENT_CLASSES, "Agent class"),
    lifecycle: requireEnum(identity.lifecycle, IDENTITY_LIFECYCLES, "Identity lifecycle"),
    supervision: requireEnum(identity.supervision, SUPERVISION_MODES, "Identity supervision"),
    riskTier: requireEnum(identity.riskTier, RISK_TIERS, "Identity risk tier"),
    principal: requireString(identity.principal, "Human principal", { maxLength: 160 }),
    accountabilityOwner: requireString(identity.accountabilityOwner ?? identity.principal, "Identity accountability owner", { maxLength: 160 }),
    projectScopes: requireProjectScopes(identity.projectScopes),
    maxDataClassification: requireEnum(identity.maxDataClassification, DATA_CLASSIFICATIONS, "Identity data classification"),
    purpose: requireSafeText(identity.purpose, "Identity purpose", { maxLength: 4000 }),
    statusNote: requireSafeText(identity.statusNote ?? "", "Identity status note", { allowEmpty: true, maxLength: 4000 }),
    lastReviewedAt: identity.lastReviewedAt ? requireIsoTimestamp(identity.lastReviewedAt, "Identity lastReviewedAt") : null,
    createdAt: requireIsoTimestamp(identity.createdAt, "Identity createdAt"),
    updatedAt: requireIsoTimestamp(identity.updatedAt, "Identity updatedAt"),
  };
}

function validateDelegation(grant) {
  if (!grant || typeof grant !== "object" || Array.isArray(grant)) {
    throw new Error("Delegation grant must be an object.");
  }
  const issuedAt = requireIsoTimestamp(grant.issuedAt, "Delegation issuedAt");
  const expiresAt = requireIsoTimestamp(grant.expiresAt, "Delegation expiresAt");
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new Error("Delegation expiresAt must be later than issuedAt.");
  }
  const executionLevel = requireEnum(grant.executionLevel, EXECUTION_LEVELS, "Delegation execution level");
  const delegatedBy = requireString(grant.delegatedBy, "Delegated by", { maxLength: 160 });
  const boundaryOwner = requireString(grant.boundaryOwner ?? delegatedBy, "Delegation boundary owner", { maxLength: 160 });
  const outcomeOwner = requireString(grant.outcomeOwner ?? boundaryOwner, "Delegation outcome owner", { maxLength: 160 });
  return {
    id: requireId(grant.id, "Delegation id"),
    agentKey: requireString(grant.agentKey, "Delegation agent key", { maxLength: 160 }),
    workflowIds: requireStringArray(grant.workflowIds, "Delegation workflow ids", { minimum: 1 }),
    capabilityIds: requireStringArray(grant.capabilityIds ?? [], "Delegation capability ids"),
    purpose: requireSafeText(grant.purpose, "Delegation purpose", { maxLength: 4000 }),
    executionLevel,
    maxDataClassification: requireEnum(grant.maxDataClassification, DATA_CLASSIFICATIONS, "Delegation data classification"),
    delegatedBy,
    boundaryOwner,
    outcomeOwner,
    spanOfAgency: validateSpanOfAgency(grant.spanOfAgency, { executionLevel, owner: outcomeOwner, issuedAt }),
    approvalRequired: grant.approvalRequired === undefined ? executionLevel === "approval" : Boolean(grant.approvalRequired),
    status: requireEnum(grant.status, DELEGATION_STATUSES, "Delegation status"),
    issuedAt,
    expiresAt,
    evidenceRequirement: requireSafeText(grant.evidenceRequirement, "Delegation evidence requirement", { maxLength: 4000 }),
    statusNote: requireSafeText(grant.statusNote ?? "", "Delegation status note", { allowEmpty: true, maxLength: 4000 }),
    createdAt: requireIsoTimestamp(grant.createdAt, "Delegation createdAt"),
    updatedAt: requireIsoTimestamp(grant.updatedAt, "Delegation updatedAt"),
  };
}

function validateAuditEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Identity audit event must be an object.");
  return {
    id: requireId(event.id, "Identity audit id"),
    at: requireIsoTimestamp(event.at, "Identity audit timestamp"),
    actor: requireString(event.actor, "Identity audit actor", { maxLength: 160 }),
    type: requireEnum(event.type, AUDIT_TYPES, "Identity audit type"),
    identityId: event.identityId ? requireId(event.identityId, "Identity audit identity id") : null,
    delegationId: event.delegationId ? requireId(event.delegationId, "Identity audit delegation id") : null,
    note: requireSafeText(event.note ?? "", "Identity audit note", { allowEmpty: true, maxLength: 4000 }),
  };
}

function validateAgentIdentityRegistry(state) {
  if (!state || typeof state !== "object" || Array.isArray(state) || state.version !== 1) {
    throw new Error("Invalid agent identity registry.");
  }
  if (!Array.isArray(state.identities) || !Array.isArray(state.delegations) || !Array.isArray(state.auditEvents)) {
    throw new Error("Agent identity registry collections are required.");
  }

  const identities = state.identities.map(validateIdentity);
  const delegations = state.delegations.map(validateDelegation);
  const auditEvents = state.auditEvents.map(validateAuditEvent);
  const identityIds = new Set();
  const agentKeys = new Set();
  for (const identity of identities) {
    if (identityIds.has(identity.id)) throw new Error(`Duplicate identity id: ${identity.id}`);
    if (agentKeys.has(identity.agentKey)) throw new Error(`Duplicate identity agent: ${identity.agentKey}`);
    identityIds.add(identity.id);
    agentKeys.add(identity.agentKey);
  }
  const delegationIds = new Set();
  for (const grant of delegations) {
    if (!agentKeys.has(grant.agentKey)) throw new Error(`Delegation agent is missing an identity: ${grant.agentKey}`);
    if (delegationIds.has(grant.id)) throw new Error(`Duplicate delegation id: ${grant.id}`);
    delegationIds.add(grant.id);
  }
  const auditIds = new Set();
  for (const event of auditEvents) {
    if (auditIds.has(event.id)) throw new Error(`Duplicate identity audit id: ${event.id}`);
    if (event.identityId && !identityIds.has(event.identityId)) throw new Error(`Identity audit references unknown identity: ${event.id}`);
    if (event.delegationId && !delegationIds.has(event.delegationId)) throw new Error(`Identity audit references unknown delegation: ${event.id}`);
    auditIds.add(event.id);
  }
  return {
    version: 1,
    updatedAt: requireIsoTimestamp(state.updatedAt, "Identity registry updatedAt"),
    identities,
    delegations,
    auditEvents: auditEvents.slice(-MAX_AUDIT_EVENTS),
  };
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function agentKeyOf(agent) {
  return isRecord(agent) && typeof agent.organizationKey === "string" ? agent.organizationKey.trim() : "";
}

function agentDisplayName(agent, fallback) {
  return isRecord(agent) && typeof agent.name === "string" && agent.name.trim() ? agent.name.trim() : fallback;
}

function agentProject(agent) {
  return isRecord(agent) && typeof agent.project === "string" ? agent.project.trim() : "";
}

function agentProjectStatus(agent) {
  return isRecord(agent) && agent.projectStatus === "inactive" ? "inactive" : "active";
}

function inferAgentClass(agentKey) {
  if (agentKey.startsWith("personal-")) return "personal_agent";
  if (["automation", "devops", "security-analyst", "gooru-performance"].includes(agentKey)) return "digital_worker";
  return "workforce_assistant";
}

function inferSupervision(agentClass) {
  if (agentClass === "personal_agent") return "attended";
  if (agentClass === "digital_worker") return "unattended";
  return "mixed";
}

function inferRiskTier(agentKey) {
  if (/security|legal|finance|risk|audit/.test(agentKey)) return "high";
  if (/lead|hermes|chief|architect|devops/.test(agentKey)) return "moderate";
  return "low";
}

function inferDataClassification(agentKey, agent) {
  if (/security|legal|finance|risk|audit/.test(agentKey)) return "restricted";
  if (agentProject(agent) || /engineering|architect|devops|quality/.test(agentKey)) return "confidential";
  return "internal";
}

function addDays(timestamp, days) {
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function buildIdentity(agent, timestamp, lifecycleOverride) {
  const agentKey = agentKeyOf(agent);
  const agentClass = inferAgentClass(agentKey);
  const project = agentProject(agent);
  const isInactiveProject = agentProjectStatus(agent) === "inactive";
  return validateIdentity({
    id: `identity-${agentKey}`,
    agentKey,
    displayName: agentDisplayName(agent, agentKey),
    agentClass,
    lifecycle: lifecycleOverride || (isInactiveProject ? "suspended" : "active"),
    supervision: inferSupervision(agentClass),
    riskTier: inferRiskTier(agentKey),
    principal: "Faza",
    accountabilityOwner: "Faza",
    projectScopes: project ? [project] : ["*"],
    maxDataClassification: inferDataClassification(agentKey, agent),
    purpose: `Identitas kerja terkelola untuk ${agentDisplayName(agent, agentKey)}. Berlaku hanya dalam workflow, capability, dan approval Hermes3D yang terdaftar.`,
    statusNote: isInactiveProject ? "Project agent tidak aktif; identitas disuspensi sampai Faza mengaktifkannya kembali." : "Mandat awal dibuat dari roster Hermes3D yang sudah disetujui.",
    lastReviewedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function capabilityIdsForWorkflow(capabilities, workflowId) {
  if (!Array.isArray(capabilities)) return [];
  return capabilities
    .filter((capability) => isRecord(capability) && Array.isArray(capability.workflowIds) && capability.workflowIds.includes(workflowId) && capability.status !== "retired")
    .map((capability) => capability.id)
    .filter((value) => typeof value === "string" && value);
}

function elevateIdentityDataBoundary(identity, workflows, capabilities) {
  let highest = CLASSIFICATION_RANK[identity.maxDataClassification];
  for (const workflow of workflows) {
    if (!isRecord(workflow) || workflow.ownerKey !== identity.agentKey || typeof workflow.id !== "string") continue;
    for (const capability of capabilities) {
      if (!isRecord(capability) || capability.status === "retired" || capability.enforcement === "observe" || !Array.isArray(capability.workflowIds) || !capability.workflowIds.includes(workflow.id)) continue;
      const rank = CLASSIFICATION_RANK[capability.dataClassification];
      if (rank && rank > highest) highest = rank;
    }
  }
  const maxDataClassification = Object.entries(CLASSIFICATION_RANK).find(([, rank]) => rank === highest)?.[0] || identity.maxDataClassification;
  return validateIdentity({ ...identity, maxDataClassification });
}

function createDefaultAgentIdentityRegistry(context = {}) {
  const timestamp = now();
  const agents = Array.isArray(context.agents) ? context.agents.filter((agent) => agentKeyOf(agent)) : [];
  const workflows = Array.isArray(context.workflows) ? context.workflows : [];
  const capabilities = Array.isArray(context.capabilities) ? context.capabilities : [];
  const identities = agents
    .map((agent) => buildIdentity(agent, timestamp))
    .map((identity) => elevateIdentityDataBoundary(identity, workflows, capabilities));
  const identityByAgentKey = new Map(identities.map((identity) => [identity.agentKey, identity]));
  const delegations = workflows
    .filter((workflow) => isRecord(workflow) && typeof workflow.id === "string" && workflow.id && typeof workflow.ownerKey === "string" && workflow.ownerKey)
    .filter((workflow) => identityByAgentKey.get(workflow.ownerKey)?.lifecycle === "active")
    .map((workflow) => {
      const executionLevel = EXECUTION_LEVELS.has(workflow.executionLevel) ? workflow.executionLevel : "advisory";
      const owner = identityByAgentKey.get(workflow.ownerKey);
      const capabilityIds = capabilityIdsForWorkflow(capabilities, workflow.id);
      return validateDelegation({
        id: `delegation-${workflow.id}-${workflow.ownerKey}`.slice(0, 120),
        agentKey: workflow.ownerKey,
        workflowIds: [workflow.id],
        capabilityIds,
        purpose: `Mandat awal untuk owner workflow ${workflow.name || workflow.id}.`,
        executionLevel,
        maxDataClassification: owner.maxDataClassification,
        delegatedBy: "Faza",
        boundaryOwner: "Faza",
        outcomeOwner: "Faza",
        spanOfAgency: defaultSpanOfAgency(executionLevel, "Faza", timestamp),
        approvalRequired: executionLevel === "approval",
        status: "active",
        issuedAt: timestamp,
        expiresAt: addDays(timestamp, 180),
        evidenceRequirement: "Ikuti bukti, approval gate, dan rollback pada Execution Registry.",
        statusNote: "Mandat awal dari workflow yang sudah terdaftar; tinjau sebelum masa berlaku berakhir.",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });

  return validateAgentIdentityRegistry({
    version: 1,
    updatedAt: timestamp,
    identities,
    delegations,
    auditEvents: [{
      id: createId("identity-audit"),
      at: timestamp,
      actor: "Hermes3D",
      type: "registry_initialized",
      identityId: null,
      delegationId: null,
      note: `Registry identitas diinisialisasi untuk ${identities.length} agent dan ${delegations.length} mandat workflow yang sudah ada.`,
    }],
  });
}

function withAudit(state, { actor = "Faza", type, identityId = null, delegationId = null, note = "" }) {
  state.auditEvents.push(validateAuditEvent({
    id: createId("identity-audit"),
    at: now(),
    actor,
    type,
    identityId,
    delegationId,
    note,
  }));
  if (state.auditEvents.length > MAX_AUDIT_EVENTS) state.auditEvents = state.auditEvents.slice(-MAX_AUDIT_EVENTS);
}

function getIdentity(state, identityId) {
  const identity = state.identities.find((entry) => entry.id === requireId(identityId, "Identity id"));
  if (!identity) throw new Error("Agent identity tidak ditemukan.");
  return identity;
}

function getDelegation(state, delegationId) {
  const delegation = state.delegations.find((entry) => entry.id === requireId(delegationId, "Delegation id"));
  if (!delegation) throw new Error("Mandat delegasi tidak ditemukan.");
  return delegation;
}

function updateIdentity(state, input = {}) {
  const next = copyState(validateAgentIdentityRegistry(state));
  const existing = getIdentity(next, input.identityId);
  const patch = input.patch && typeof input.patch === "object" && !Array.isArray(input.patch) ? input.patch : {};
  const updated = validateIdentity({
    ...existing,
    ...patch,
    id: existing.id,
    agentKey: existing.agentKey,
    lifecycle: existing.lifecycle,
    lastReviewedAt: existing.lastReviewedAt,
    createdAt: existing.createdAt,
    updatedAt: now(),
  });
  const index = next.identities.findIndex((entry) => entry.id === existing.id);
  next.identities[index] = updated;
  withAudit(next, { actor: input.actor || "Faza", type: "identity_updated", identityId: updated.id, note: `Identitas ${updated.displayName} diperbarui.` });
  return { state: next, identity: updated };
}

function setIdentityLifecycle(state, input = {}) {
  const next = copyState(validateAgentIdentityRegistry(state));
  const existing = getIdentity(next, input.identityId);
  const lifecycle = requireEnum(input.lifecycle, IDENTITY_LIFECYCLES, "Identity lifecycle");
  const timestamp = now();
  const updated = validateIdentity({
    ...existing,
    lifecycle,
    statusNote: requireSafeText(input.statusNote ?? existing.statusNote ?? "", "Identity status note", { allowEmpty: true, maxLength: 4000 }),
    lastReviewedAt: timestamp,
    updatedAt: timestamp,
  });
  const index = next.identities.findIndex((entry) => entry.id === existing.id);
  next.identities[index] = updated;
  withAudit(next, { actor: input.actor || "Faza", type: "identity_lifecycle_changed", identityId: updated.id, note: `Lifecycle ${updated.displayName} diubah menjadi ${lifecycle}.` });
  return { state: next, identity: updated };
}

function createDelegation(state, input = {}) {
  const next = copyState(validateAgentIdentityRegistry(state));
  const timestamp = now();
  const identity = next.identities.find((entry) => entry.agentKey === requireString(input.agentKey, "Delegation agent key", { maxLength: 160 }));
  if (!identity) throw new Error("Agent untuk mandat delegasi tidak memiliki identitas.");
  const grant = validateDelegation({
    id: input.id || createId("delegation"),
    agentKey: identity.agentKey,
    workflowIds: input.workflowIds,
    capabilityIds: input.capabilityIds ?? [],
    purpose: input.purpose,
    executionLevel: input.executionLevel,
    maxDataClassification: input.maxDataClassification,
    delegatedBy: input.delegatedBy || "Faza",
    approvalRequired: input.approvalRequired,
    status: input.status || "active",
    issuedAt: input.issuedAt || timestamp,
    expiresAt: input.expiresAt,
    evidenceRequirement: input.evidenceRequirement,
    boundaryOwner: input.boundaryOwner || "Faza",
    outcomeOwner: input.outcomeOwner || "Faza",
    spanOfAgency: input.spanOfAgency,
    statusNote: input.statusNote ?? "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (next.delegations.some((entry) => entry.id === grant.id)) throw new Error(`Duplicate delegation id: ${grant.id}`);
  next.delegations.push(grant);
  withAudit(next, { actor: input.actor || "Faza", type: "delegation_created", identityId: identity.id, delegationId: grant.id, note: `Mandat ${grant.id} dibuat untuk ${identity.displayName}.` });
  return { state: next, delegation: grant };
}

function updateDelegation(state, input = {}) {
  const next = copyState(validateAgentIdentityRegistry(state));
  const existing = getDelegation(next, input.delegationId);
  const patch = input.patch && typeof input.patch === "object" && !Array.isArray(input.patch) ? input.patch : {};
  const updated = validateDelegation({
    ...existing,
    ...patch,
    id: existing.id,
    agentKey: existing.agentKey,
    createdAt: existing.createdAt,
    updatedAt: now(),
  });
  const index = next.delegations.findIndex((entry) => entry.id === existing.id);
  next.delegations[index] = updated;
  const identity = next.identities.find((entry) => entry.agentKey === updated.agentKey);
  withAudit(next, { actor: input.actor || "Faza", type: "delegation_updated", identityId: identity?.id || null, delegationId: updated.id, note: `Mandat ${updated.id} diperbarui.` });
  return { state: next, delegation: updated };
}

function setDelegationStatus(state, input = {}) {
  const next = copyState(validateAgentIdentityRegistry(state));
  const existing = getDelegation(next, input.delegationId);
  const status = requireEnum(input.status, DELEGATION_STATUSES, "Delegation status");
  const updated = validateDelegation({
    ...existing,
    status,
    statusNote: requireSafeText(input.statusNote ?? existing.statusNote ?? "", "Delegation status note", { allowEmpty: true, maxLength: 4000 }),
    updatedAt: now(),
  });
  const index = next.delegations.findIndex((entry) => entry.id === existing.id);
  next.delegations[index] = updated;
  const identity = next.identities.find((entry) => entry.agentKey === updated.agentKey);
  withAudit(next, { actor: input.actor || "Faza", type: status === "revoked" ? "delegation_revoked" : "delegation_status_changed", identityId: identity?.id || null, delegationId: updated.id, note: `Status mandat ${updated.id} diubah menjadi ${status}.` });
  return { state: next, delegation: updated };
}

function reconcileAgentIdentityRegistry(state, context = {}, actor = "Hermes3D") {
  const next = copyState(validateAgentIdentityRegistry(state));
  const agents = Array.isArray(context.agents) ? context.agents.filter((agent) => agentKeyOf(agent)) : [];
  const byKey = new Map(agents.map((agent) => [agentKeyOf(agent), agent]));
  let changed = false;

  for (const agent of agents) {
    const agentKey = agentKeyOf(agent);
    if (next.identities.some((identity) => identity.agentKey === agentKey)) continue;
    const identity = buildIdentity(agent, now(), agentProjectStatus(agent) === "inactive" ? "suspended" : "review");
    next.identities.push(identity);
    withAudit(next, { actor, type: "identity_reconciled", identityId: identity.id, note: `Identitas baru direkonsiliasi untuk ${identity.displayName}; lifecycle ${identity.lifecycle}.` });
    changed = true;
  }

  for (const identity of next.identities) {
    if (byKey.has(identity.agentKey) || identity.lifecycle === "retired") continue;
    identity.lifecycle = "suspended";
    identity.statusNote = "Agent tidak lagi ditemukan di roster organisasi; akses ditangguhkan.";
    identity.lastReviewedAt = now();
    identity.updatedAt = identity.lastReviewedAt;
    withAudit(next, { actor, type: "identity_reconciled", identityId: identity.id, note: `Identitas ${identity.displayName} ditangguhkan karena agent tidak lagi ada di roster.` });
    changed = true;
  }

  return { state: next, changed };
}

function saveAgentIdentityRegistry(state, filePath = resolveAgentIdentityRegistryPath()) {
  const validated = validateAgentIdentityRegistry({ ...state, updatedAt: now() });
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

function loadAgentIdentityRegistry(filePath = resolveAgentIdentityRegistryPath()) {
  if (!fs.existsSync(filePath)) return null;
  return validateAgentIdentityRegistry(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function ensureAgentIdentityRegistry(context = {}, filePath = resolveAgentIdentityRegistryPath()) {
  if (!fs.existsSync(filePath)) return saveAgentIdentityRegistry(createDefaultAgentIdentityRegistry(context), filePath);
  const loaded = loadAgentIdentityRegistry(filePath);
  const reconciled = reconcileAgentIdentityRegistry(loaded, context);
  let requiresMigration = false;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    requiresMigration = raw.identities?.some((identity) => !identity.accountabilityOwner)
      || raw.delegations?.some((grant) => !grant.boundaryOwner || !grant.outcomeOwner || !grant.spanOfAgency);
  } catch {
    requiresMigration = false;
  }
  return reconciled.changed || requiresMigration ? saveAgentIdentityRegistry(reconciled.state, filePath) : loaded;
}

function activeDelegationsFor(state, agentKey, workflowId, checkedAt = now()) {
  const nowMs = Date.parse(checkedAt);
  return state.delegations.filter((grant) => grant.agentKey === agentKey && grant.status === "active" && grant.workflowIds.includes(workflowId) && Date.parse(grant.expiresAt) > nowMs);
}

/**
 * @param {any} workflow
 * @param {any} registry
 * @param {{ capabilities?: Array<any> } | null} [capabilityRegistry]
 * @param {{ checkedAt?: string }} [options]
 */
function assessWorkflowDelegation(workflow, registry, capabilityRegistry = null, { checkedAt = now() } = {}) {
  const state = validateAgentIdentityRegistry(registry);
  const blockers = [];
  const warnings = [];
  const identity = state.identities.find((entry) => entry.agentKey === workflow.ownerKey) || null;
  const requiredCapabilities = capabilityRegistry && Array.isArray(capabilityRegistry.capabilities)
    ? capabilityRegistry.capabilities.filter((capability) => capability.status !== "retired" && capability.enforcement !== "observe" && Array.isArray(capability.workflowIds) && capability.workflowIds.includes(workflow.id))
    : [];

  if (!identity) {
    blockers.push(`Workflow owner ${workflow.ownerKey} belum memiliki identitas digital.`);
  } else {
    if (!identity.accountabilityOwner) blockers.push(`Identitas ${identity.displayName} belum memiliki pemilik akuntabilitas manusia.`);
    if (identity.lifecycle !== "active") blockers.push(`Identitas ${identity.displayName} berstatus ${identity.lifecycle}.`);
    if (workflow.project && !identity.projectScopes.includes("*") && !identity.projectScopes.includes(workflow.project)) {
      blockers.push(`Identitas ${identity.displayName} tidak memiliki scope project ${workflow.project}.`);
    }
    for (const capability of requiredCapabilities) {
      if (CLASSIFICATION_RANK[identity.maxDataClassification] < CLASSIFICATION_RANK[capability.dataClassification]) {
        blockers.push(`Identitas ${identity.displayName} tidak memiliki batas data untuk capability ${capability.name}.`);
      }
    }
  }

  const activeGrants = activeDelegationsFor(state, workflow.ownerKey, workflow.id, checkedAt);
  if (!activeGrants.length) {
    blockers.push(`Tidak ada mandat delegasi aktif untuk workflow ${workflow.name}.`);
  }

  const eligibleGrants = activeGrants.filter((grant) => {
    if (EXECUTION_RANK[grant.executionLevel] < EXECUTION_RANK[workflow.executionLevel]) return false;
    if (workflow.executionLevel === "approval" && !grant.approvalRequired) return false;
    return true;
  });
  if (activeGrants.length && !eligibleGrants.length) {
    blockers.push(`Mandat aktif tidak mencakup level eksekusi ${workflow.executionLevel} atau approval yang diperlukan.`);
  }

  const matchingGrantIds = new Set();
  const matchingSpans = [];
  if (!requiredCapabilities.length && eligibleGrants.length) {
    eligibleGrants.forEach((grant) => {
      matchingGrantIds.add(grant.id);
      matchingSpans.push(grant);
    });
  }
  for (const capability of requiredCapabilities) {
    const matchingGrant = eligibleGrants.find((grant) =>
      grant.capabilityIds.includes(capability.id) &&
      CLASSIFICATION_RANK[grant.maxDataClassification] >= CLASSIFICATION_RANK[capability.dataClassification],
    );
    if (!matchingGrant) {
      blockers.push(`Tidak ada mandat aktif untuk capability ${capability.name} pada workflow ini.`);
    } else {
      matchingGrantIds.add(matchingGrant.id);
      matchingSpans.push(matchingGrant);
      const requiredAction = workflow.executionLevel === "advisory"
        ? "draft"
        : capability.accessMode === "read" ? "read" : capability.accessMode === "write" ? "write" : "execute";
      if (!matchingGrant.spanOfAgency.allowedActions.includes(requiredAction)) {
        blockers.push(`Span of Agency mandat ${matchingGrant.id} tidak mengizinkan aksi ${requiredAction} untuk capability ${capability.name}.`);
      }
    }
  }

  for (const grant of matchingSpans) {
    if (workflow.executionLevel === "approval") {
      if (!grant.spanOfAgency.requiresHumanApprovalFor.includes("execute")) {
        blockers.push(`Mandat ${grant.id} belum mensyaratkan approval manusia sebelum execute.`);
      }
      if (!grant.spanOfAgency.humanReservedActions.includes("approve")) {
        blockers.push(`Mandat ${grant.id} belum mencadangkan aksi approve untuk manusia.`);
      }
    }
    if (grant.spanOfAgency.boundaryOwner !== grant.outcomeOwner) {
      warnings.push(`Boundary owner dan outcome owner mandat ${grant.id} berbeda; pastikan keduanya punya wewenang yang jelas.`);
    }
  }

  const checkedMs = Date.parse(checkedAt);
  for (const grant of eligibleGrants) {
    const hoursToExpiry = (Date.parse(grant.expiresAt) - checkedMs) / 3_600_000;
    if (hoursToExpiry > 0 && hoursToExpiry <= 14 * 24) {
      warnings.push(`Mandat ${grant.id} akan berakhir dalam ${Math.ceil(hoursToExpiry / 24)} hari.`);
    }
  }
  if (identity && identity.lastReviewedAt && (checkedMs - Date.parse(identity.lastReviewedAt)) > 120 * 24 * 3_600_000) {
    warnings.push(`Identitas ${identity.displayName} belum ditinjau selama lebih dari 120 hari.`);
  }

  return {
    decision: blockers.length ? "blocked" : warnings.length ? "review" : "allowed",
    identityId: identity?.id || null,
    delegationIds: [...matchingGrantIds],
    accountabilityOwner: identity?.accountabilityOwner || null,
    boundaryOwner: matchingSpans[0]?.boundaryOwner || null,
    outcomeOwner: matchingSpans[0]?.outcomeOwner || null,
    spanOfAgency: matchingSpans[0]?.spanOfAgency || null,
    blockers,
    warnings,
    checkedAt,
  };
}

/**
 * @param {any} workflow
 * @param {any} registry
 * @param {{ capabilities?: Array<any> } | null} [capabilityRegistry]
 * @param {{ checkedAt?: string }} [options]
 */
function assertWorkflowDelegation(workflow, registry, capabilityRegistry = null, options = {}) {
  const assessment = assessWorkflowDelegation(workflow, registry, capabilityRegistry, options);
  if (assessment.blockers.length) {
    throw new Error(`Agent identity and delegation blocked routing for ${workflow.name}: ${assessment.blockers.join(" ")}`);
  }
  return assessment;
}

module.exports = {
  AGENT_CLASSES,
  AGENCY_ACTIONS,
  DATA_CLASSIFICATIONS,
  DELEGATION_STATUSES,
  EXECUTION_LEVELS,
  IDENTITY_LIFECYCLES,
  RISK_TIERS,
  SUPERVISION_MODES,
  assessWorkflowDelegation,
  assertWorkflowDelegation,
  createDefaultAgentIdentityRegistry,
  createDelegation,
  ensureAgentIdentityRegistry,
  loadAgentIdentityRegistry,
  reconcileAgentIdentityRegistry,
  resolveAgentIdentityRegistryPath,
  saveAgentIdentityRegistry,
  setDelegationStatus,
  setIdentityLifecycle,
  updateDelegation,
  updateIdentity,
  validateAgentIdentityRegistry,
  validateSpanOfAgency,
};
