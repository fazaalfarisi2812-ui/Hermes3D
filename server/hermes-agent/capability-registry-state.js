"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { resolveStateDir } = require("../studio-settings");

const CAPABILITY_KINDS = new Set([
  "workspace",
  "model",
  "data",
  "erp",
  "communication",
  "marketing",
  "research",
  "observability",
  "security",
]);
const ENVIRONMENTS = new Set(["local", "development", "staging", "production", "external"]);
const CAPABILITY_STATUSES = new Set(["available", "degraded", "unavailable", "unverified", "retired"]);
const ENFORCEMENT_LEVELS = new Set(["block", "review", "observe"]);
const DATA_CLASSIFICATIONS = new Set(["public", "internal", "confidential", "restricted"]);
const ACCESS_MODES = new Set(["read", "write", "controlled"]);
const AUDIT_TYPES = new Set([
  "capability_created",
  "capability_updated",
  "capability_status_changed",
  "capability_archived",
]);
const MAX_AUDIT_EVENTS = 1000;

function resolveCapabilityRegistryPath(env = process.env) {
  return path.join(resolveStateDir(env), "hermes3d", "capability-registry.json");
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

function requireStringArray(value, label, { minimum = 0, maxLength = 160 } = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const normalized = value.map((entry) => requireString(entry, label, { maxLength })).filter(Boolean);
  if (normalized.length < minimum) throw new Error(`${label} requires at least ${minimum} value.`);
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicate values.`);
  return normalized;
}

function requireAgentScope(value) {
  const agents = requireStringArray(value, "Capability allowed agents", { minimum: 1 });
  if (agents.includes("*") && agents.length !== 1) {
    throw new Error("Wildcard capability access cannot be combined with individual agents.");
  }
  return agents;
}

function requireSafeConnectionReference(value) {
  const reference = requireString(value ?? "", "Connection reference", { allowEmpty: true, maxLength: 1000 });
  if (/\b(?:api[_-]?key|authorization|bearer\s+[a-z0-9._-]+|password\s*[=:]|secret\s*[=:]|token\s*[=:])\b/i.test(reference)) {
    throw new Error("Connection reference must not contain credentials or secrets.");
  }
  return reference;
}

function validateCapability(capability) {
  if (!capability || typeof capability !== "object" || Array.isArray(capability)) {
    throw new Error("Capability must be an object.");
  }
  return {
    id: requireId(capability.id, "Capability id"),
    name: requireString(capability.name, "Capability name", { maxLength: 240 }),
    kind: requireEnum(capability.kind, CAPABILITY_KINDS, "Capability kind"),
    provider: requireString(capability.provider, "Capability provider", { maxLength: 240 }),
    environment: requireEnum(capability.environment, ENVIRONMENTS, "Capability environment"),
    status: requireEnum(capability.status, CAPABILITY_STATUSES, "Capability status"),
    enforcement: requireEnum(capability.enforcement, ENFORCEMENT_LEVELS, "Capability enforcement"),
    dataClassification: requireEnum(capability.dataClassification, DATA_CLASSIFICATIONS, "Data classification"),
    accessMode: requireEnum(capability.accessMode, ACCESS_MODES, "Capability access mode"),
    ownerKey: requireString(capability.ownerKey, "Capability owner", { maxLength: 160 }),
    accountableHuman: requireString(capability.accountableHuman ?? "Faza", "Capability accountable human", { maxLength: 160 }),
    canBlockUse: capability.canBlockUse === undefined ? true : Boolean(capability.canBlockUse),
    allowedAgentKeys: requireAgentScope(capability.allowedAgentKeys),
    workflowIds: requireStringArray(capability.workflowIds, "Capability workflow ids"),
    connectionReference: requireSafeConnectionReference(capability.connectionReference),
    usageBoundary: requireString(capability.usageBoundary, "Capability usage boundary", { maxLength: 4000 }),
    evidenceRequirement: requireString(capability.evidenceRequirement, "Capability evidence requirement", { maxLength: 4000 }),
    rollback: requireString(capability.rollback, "Capability rollback", { maxLength: 4000 }),
    statusNote: requireString(capability.statusNote ?? "", "Capability status note", { allowEmpty: true, maxLength: 4000 }),
    lastCheckedAt: capability.lastCheckedAt ? requireString(capability.lastCheckedAt, "Capability lastCheckedAt", { maxLength: 80 }) : null,
    createdAt: requireString(capability.createdAt, "Capability createdAt", { maxLength: 80 }),
    updatedAt: requireString(capability.updatedAt, "Capability updatedAt", { maxLength: 80 }),
  };
}

function validateAuditEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Capability audit event must be an object.");
  return {
    id: requireId(event.id, "Capability audit id"),
    at: requireString(event.at, "Capability audit timestamp", { maxLength: 80 }),
    actor: requireString(event.actor, "Capability audit actor", { maxLength: 160 }),
    type: requireEnum(event.type, AUDIT_TYPES, "Capability audit type"),
    capabilityId: requireId(event.capabilityId, "Capability audit capability id"),
    note: requireString(event.note ?? "", "Capability audit note", { allowEmpty: true, maxLength: 4000 }),
  };
}

function validateCapabilityRegistry(state) {
  if (!state || typeof state !== "object" || Array.isArray(state) || state.version !== 1) {
    throw new Error("Invalid capability registry.");
  }
  if (!Array.isArray(state.capabilities) || !Array.isArray(state.auditEvents)) {
    throw new Error("Capability registry collections are required.");
  }
  const capabilities = state.capabilities.map(validateCapability);
  const auditEvents = state.auditEvents.map(validateAuditEvent);
  const capabilityIds = new Set();
  for (const capability of capabilities) {
    if (capabilityIds.has(capability.id)) throw new Error(`Duplicate capability id: ${capability.id}`);
    capabilityIds.add(capability.id);
  }
  const auditIds = new Set();
  for (const event of auditEvents) {
    if (auditIds.has(event.id)) throw new Error(`Duplicate capability audit id: ${event.id}`);
    if (!capabilityIds.has(event.capabilityId)) throw new Error(`Capability audit references an unknown capability: ${event.id}`);
    auditIds.add(event.id);
  }
  return {
    version: 1,
    updatedAt: requireString(state.updatedAt, "Capability registry updatedAt", { maxLength: 80 }),
    capabilities,
    auditEvents: auditEvents.slice(-MAX_AUDIT_EVENTS),
  };
}

function buildDefaultCapability(input, timestamp) {
  return validateCapability({
    allowedAgentKeys: ["*"],
    connectionReference: "",
    statusNote: "",
    accountableHuman: "Faza",
    canBlockUse: true,
    lastCheckedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input,
  });
}

function createDefaultCapabilityRegistry() {
  const timestamp = now();
  const workflowIds = [
    "personal-daily-planning",
    "personal-cashflow-review",
    "corporate-decision-follow-up",
    "agent-lifecycle-review",
    "risk-audit-gate",
    "gooru-campaign-execution",
    "pabk-erp-change",
    "pabk-demand-generation",
    "fcp-erp-change",
    "fcp-demand-generation",
    "research-experiment-review",
  ];
  return {
    version: 1,
    updatedAt: timestamp,
    capabilities: [
      buildDefaultCapability({
        id: "hermes-control-plane",
        name: "Hermes3D control plane",
        kind: "workspace",
        provider: "Hermes3D",
        environment: "local",
        status: "available",
        enforcement: "block",
        dataClassification: "internal",
        accessMode: "controlled",
        ownerKey: "hermes",
        workflowIds,
        connectionReference: "Hermes3D local control plane",
        usageBoundary: "Hanya workflow terdaftar, agent yang berada di roster aktif, serta aturan approval dan audit Hermes3D.",
        evidenceRequirement: "Audit trail work order dan bukti hasil harus tercatat sebelum penutupan pekerjaan.",
        rollback: "Jeda workflow atau ubah status capability ke unavailable sebelum tindakan lanjutan.",
        statusNote: "State lokal terkelola oleh Hermes3D.",
        lastCheckedAt: timestamp,
      }, timestamp),
      buildDefaultCapability({
        id: "organization-registry",
        name: "Organization and agent registry",
        kind: "workspace",
        provider: "Hermes3D",
        environment: "local",
        status: "available",
        enforcement: "block",
        dataClassification: "internal",
        accessMode: "controlled",
        ownerKey: "agent-recruitment",
        workflowIds: ["corporate-decision-follow-up", "agent-lifecycle-review", "risk-audit-gate"],
        connectionReference: "Hermes3D organization state",
        usageBoundary: "Perubahan roster atau mandat agent harus disetujui Faza; proyek nonaktif tidak boleh menerima pekerjaan baru.",
        evidenceRequirement: "Role brief, capacity review, approval Faza, dan jejak perubahan roster.",
        rollback: "Pulihkan roster dan mandat sebelumnya dari audit trail; jangan menghapus agent tanpa persetujuan.",
        statusNote: "Dipakai untuk memastikan owner dan agent workflow masih sah.",
        lastCheckedAt: timestamp,
      }, timestamp),
      buildDefaultCapability({
        id: "operations-audit-trail",
        name: "Operations audit trail",
        kind: "observability",
        provider: "Hermes3D",
        environment: "local",
        status: "available",
        enforcement: "block",
        dataClassification: "internal",
        accessMode: "write",
        ownerKey: "quality-lead",
        workflowIds: ["corporate-decision-follow-up", "agent-lifecycle-review", "risk-audit-gate", "pabk-erp-change", "fcp-erp-change"],
        connectionReference: "Autonomous Operations audit state",
        usageBoundary: "Keputusan, approval, blocker, bukti, dan outcome material harus dapat ditelusuri.",
        evidenceRequirement: "Work order memuat sumber bukti dan outcome sebelum ditutup.",
        rollback: "Tidak menghapus audit event; catat koreksi sebagai event baru.",
        statusNote: "Jejak audit tersedia di control plane.",
        lastCheckedAt: timestamp,
      }, timestamp),
      buildDefaultCapability({
        id: "local-workspace-files",
        name: "Workspace files and documents",
        kind: "data",
        provider: "Local workspace",
        environment: "local",
        status: "unverified",
        enforcement: "review",
        dataClassification: "confidential",
        accessMode: "controlled",
        ownerKey: "chief-of-staff",
        workflowIds: ["personal-daily-planning", "personal-cashflow-review", "corporate-decision-follow-up", "research-experiment-review"],
        connectionReference: "Workspace paths selected by Faza",
        usageBoundary: "Akses hanya ke file yang relevan terhadap work order; jangan menyalin data sensitif ke prompt atau layanan eksternal.",
        evidenceRequirement: "Cantumkan file atau sumber yang digunakan serta ringkasan perubahan.",
        rollback: "Simpan perubahan sebagai draf atau versi baru; jangan menimpa artefak penting tanpa approval.",
        statusNote: "Perlu verifikasi per work order karena sumber data berbeda-beda.",
      }, timestamp),
      buildDefaultCapability({
        id: "erpnext-development",
        name: "ERPNext development environment",
        kind: "erp",
        provider: "ERPNext",
        environment: "development",
        status: "unverified",
        enforcement: "review",
        dataClassification: "confidential",
        accessMode: "controlled",
        ownerKey: "engineering-lead",
        workflowIds: ["pabk-erp-change", "fcp-erp-change"],
        connectionReference: "ERPNext development connection configured outside this registry",
        usageBoundary: "Gunakan hanya untuk perubahan terisolasi, tanpa secrets di work order, dan ikuti scope proyek yang disetujui.",
        evidenceRequirement: "Requirement map, perubahan kode atau konfigurasi, dan hasil pengujian development.",
        rollback: "Kembalikan commit atau konfigurasi development yang tervalidasi.",
        statusNote: "Status koneksi perlu dikonfirmasi sebelum eksekusi teknis.",
      }, timestamp),
      buildDefaultCapability({
        id: "erpnext-staging",
        name: "ERPNext staging environment",
        kind: "erp",
        provider: "ERPNext",
        environment: "staging",
        status: "unverified",
        enforcement: "review",
        dataClassification: "confidential",
        accessMode: "controlled",
        ownerKey: "quality-lead",
        workflowIds: ["risk-audit-gate", "pabk-erp-change", "fcp-erp-change"],
        connectionReference: "ERPNext staging connection configured outside this registry",
        usageBoundary: "Hanya untuk validasi staging, UAT, dan rollback rehearsal; jangan gunakan data produksi tanpa izin eksplisit.",
        evidenceRequirement: "Test report, UAT evidence, security review, dan catatan rollback.",
        rollback: "Gunakan backup atau migrasi rollback yang telah tervalidasi di staging.",
        statusNote: "Status koneksi perlu dikonfirmasi sebelum eksekusi teknis.",
      }, timestamp),
      buildDefaultCapability({
        id: "erpnext-production",
        name: "ERPNext production environment",
        kind: "erp",
        provider: "ERPNext",
        environment: "production",
        status: "unverified",
        enforcement: "block",
        dataClassification: "restricted",
        accessMode: "controlled",
        ownerKey: "security-lead",
        workflowIds: [],
        connectionReference: "Production access is intentionally not stored in Hermes3D",
        usageBoundary: "Tidak ada deployment, perubahan data, atau perubahan akses tanpa approval Faza, change record, dan capability berstatus available.",
        evidenceRequirement: "Approval Faza, change record, backup, validation result, dan rollback receipt.",
        rollback: "Ikuti runbook produksi yang tervalidasi; hentikan jika rollback tidak siap.",
        statusNote: "Tidak ditautkan ke workflow sampai runbook dan akses produksi diverifikasi.",
      }, timestamp),
      buildDefaultCapability({
        id: "marketing-content-workspace",
        name: "Marketing content workspace",
        kind: "marketing",
        provider: "Content workspace",
        environment: "external",
        status: "unverified",
        enforcement: "review",
        dataClassification: "internal",
        accessMode: "write",
        ownerKey: "digital-marketing-lead",
        workflowIds: ["gooru-campaign-execution", "pabk-demand-generation", "fcp-demand-generation"],
        connectionReference: "Content workspace selected by project owner",
        usageBoundary: "Buat draf dan aset internal; publikasi atau komunikasi eksternal tetap menunggu approval Faza.",
        evidenceRequirement: "Campaign brief, materi, approval publikasi, dan tautan artefak.",
        rollback: "Jeda, revisi, atau tarik draf dan materi yang belum disetujui.",
        statusNote: "Kanal dan akses perlu diverifikasi per proyek.",
      }, timestamp),
      buildDefaultCapability({
        id: "marketing-analytics",
        name: "Marketing analytics",
        kind: "marketing",
        provider: "Analytics dashboard",
        environment: "external",
        status: "unverified",
        enforcement: "review",
        dataClassification: "confidential",
        accessMode: "read",
        ownerKey: "digital-marketing-lead",
        workflowIds: ["gooru-campaign-execution", "pabk-demand-generation", "fcp-demand-generation"],
        connectionReference: "Analytics dashboard selected by project owner",
        usageBoundary: "Gunakan metrik yang relevan; jangan mengubah attribution, budget, atau konfigurasi kampanye tanpa approval.",
        evidenceRequirement: "Sumber metrik, periode, asumsi, dan ringkasan insight.",
        rollback: "Tidak ada perubahan otomatis pada dashboard atau campaign setting.",
        statusNote: "Sumber analytics perlu diverifikasi per proyek.",
      }, timestamp),
      buildDefaultCapability({
        id: "9router-model-routing",
        name: "9Router model routing",
        kind: "model",
        provider: "9Router",
        environment: "local",
        status: "unverified",
        enforcement: "observe",
        dataClassification: "confidential",
        accessMode: "controlled",
        ownerKey: "engineering-lead",
        workflowIds,
        connectionReference: "Local 9Router model routing",
        usageBoundary: "Model routing tidak mengubah approval, data classification, atau workflow boundary; secrets tidak disimpan di registry.",
        evidenceRequirement: "Catat model, fallback, dan error material pada evidence atau audit work order.",
        rollback: "Alihkan ke combo model yang disetujui atau jeda pekerjaan saat routing bermasalah.",
        statusNote: "Dipantau sebagai dependensi runtime, tidak memberi otorisasi tindakan.",
      }, timestamp),
      buildDefaultCapability({
        id: "browser-research",
        name: "Browser and research access",
        kind: "research",
        provider: "Hermes tools",
        environment: "external",
        status: "unverified",
        enforcement: "observe",
        dataClassification: "internal",
        accessMode: "read",
        ownerKey: "data-research",
        workflowIds: ["research-experiment-review"],
        connectionReference: "Browser and research tools available to Hermes",
        usageBoundary: "Gunakan sumber tepercaya; jangan mengirim data pribadi atau rahasia ke situs eksternal.",
        evidenceRequirement: "Tautan sumber, tanggal akses, dan ringkasan analisis.",
        rollback: "Tidak ada perubahan eksternal; keluarkan sumber yang tidak tepercaya dari analisis.",
        statusNote: "Tidak ditautkan ke workflow ready selain riset berbasis permintaan.",
      }, timestamp),
    ],
    auditEvents: [],
  };
}

function loadCapabilityRegistry(filePath = resolveCapabilityRegistryPath()) {
  if (!fs.existsSync(filePath)) return createDefaultCapabilityRegistry();
  return validateCapabilityRegistry(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function saveCapabilityRegistry(state, filePath = resolveCapabilityRegistryPath()) {
  const validated = validateCapabilityRegistry({ ...state, updatedAt: now() });
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

function ensureCapabilityRegistry(filePath = resolveCapabilityRegistryPath()) {
  if (fs.existsSync(filePath)) {
    const loaded = loadCapabilityRegistry(filePath);
    let requiresMigration = false;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      requiresMigration = raw.capabilities?.some((capability) => !capability.accountableHuman || capability.canBlockUse === undefined);
    } catch {
      requiresMigration = false;
    }
    return requiresMigration ? saveCapabilityRegistry(loaded, filePath) : loaded;
  }
  return saveCapabilityRegistry(createDefaultCapabilityRegistry(), filePath);
}

function withAudit(state, { actor = "Faza", type, capabilityId, note = "" }) {
  const at = now();
  state.auditEvents.unshift({
    id: createId("capability-audit"),
    at,
    actor: requireString(actor, "Capability audit actor", { maxLength: 160 }),
    type: requireEnum(type, AUDIT_TYPES, "Capability audit type"),
    capabilityId: requireId(capabilityId, "Capability audit capability id"),
    note: requireString(note, "Capability audit note", { allowEmpty: true, maxLength: 4000 }),
  });
  if (state.auditEvents.length > MAX_AUDIT_EVENTS) state.auditEvents.splice(MAX_AUDIT_EVENTS);
  state.updatedAt = at;
}

function getCapability(state, capabilityId) {
  const id = requireId(capabilityId, "Capability id");
  const capability = state.capabilities.find((entry) => entry.id === id);
  if (!capability) throw new Error("Capability tidak ditemukan.");
  return capability;
}

function createCapability(state, input = {}) {
  const next = copyState(validateCapabilityRegistry(state));
  const timestamp = now();
  const id = input.id ? requireId(input.id, "Capability id") : createId("capability");
  if (next.capabilities.some((entry) => entry.id === id)) throw new Error("Capability id sudah digunakan.");
  const capability = validateCapability({
    ...input,
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastCheckedAt: input.lastCheckedAt || null,
  });
  next.capabilities.push(capability);
  withAudit(next, { actor: input.actor || "Faza", type: "capability_created", capabilityId: capability.id, note: `Capability dibuat: ${capability.name}.` });
  return { state: next, capability };
}

function updateCapability(state, input = {}) {
  const next = copyState(validateCapabilityRegistry(state));
  const existing = getCapability(next, input.capabilityId);
  const timestamp = now();
  const patch = input.patch && typeof input.patch === "object" && !Array.isArray(input.patch) ? input.patch : {};
  if (Object.prototype.hasOwnProperty.call(patch, "id") && patch.id !== existing.id) {
    throw new Error("Capability id tidak dapat diubah.");
  }
  const capability = validateCapability({
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: timestamp,
  });
  const index = next.capabilities.findIndex((entry) => entry.id === capability.id);
  next.capabilities[index] = capability;
  withAudit(next, { actor: input.actor || "Faza", type: "capability_updated", capabilityId: capability.id, note: `Capability diperbarui: ${capability.name}.` });
  return { state: next, capability };
}

function setCapabilityStatus(state, input = {}) {
  const next = copyState(validateCapabilityRegistry(state));
  const capability = getCapability(next, input.capabilityId);
  const timestamp = now();
  capability.status = requireEnum(input.status, CAPABILITY_STATUSES, "Capability status");
  capability.statusNote = requireString(input.statusNote ?? "", "Capability status note", { allowEmpty: true, maxLength: 4000 });
  capability.lastCheckedAt = timestamp;
  capability.updatedAt = timestamp;
  withAudit(next, {
    actor: input.actor || "Faza",
    type: "capability_status_changed",
    capabilityId: capability.id,
    note: `Status ${capability.name}: ${capability.status}${capability.statusNote ? ` - ${capability.statusNote}` : ""}.`,
  });
  return { state: next, capability };
}

function archiveCapability(state, input = {}) {
  const next = copyState(validateCapabilityRegistry(state));
  const capability = getCapability(next, input.capabilityId);
  const timestamp = now();
  capability.status = "retired";
  capability.enforcement = "block";
  capability.statusNote = requireString(input.reason ?? "", "Capability archive reason", { allowEmpty: true, maxLength: 4000 }) || "Capability diarsipkan.";
  capability.lastCheckedAt = timestamp;
  capability.updatedAt = timestamp;
  withAudit(next, { actor: input.actor || "Faza", type: "capability_archived", capabilityId: capability.id, note: capability.statusNote });
  return { state: next, capability };
}

function capabilityAppliesToWorkflow(capability, workflowId) {
  return capability.workflowIds.includes(workflowId);
}

function assessWorkflowCapabilities(workflow, registry) {
  if (!workflow || typeof workflow !== "object") throw new Error("Workflow tidak ditemukan.");
  const state = validateCapabilityRegistry(registry);
  const workflowId = requireId(workflow.id, "Workflow id");
  const ownerKey = requireString(workflow.ownerKey, "Workflow owner", { maxLength: 160 });
  const requiredCapabilities = state.capabilities.filter((capability) => capabilityAppliesToWorkflow(capability, workflowId));
  const blockers = [];
  const warnings = [];
  const decisions = [];

  if (!requiredCapabilities.length) {
    warnings.push("Belum ada capability yang ditautkan ke workflow ini.");
  }

  for (const capability of requiredCapabilities) {
    const ownerIsAllowed = capability.allowedAgentKeys.includes("*") || capability.allowedAgentKeys.includes(ownerKey);
    if (!ownerIsAllowed) {
      const reason = `${capability.name} tidak mengizinkan owner workflow ${ownerKey}.`;
      blockers.push(reason);
      decisions.push({ capabilityId: capability.id, decision: "blocked", reason });
      continue;
    }

    const unavailable = capability.status === "unavailable" || capability.status === "retired";
    const unverified = capability.status === "unverified";
    if (capability.enforcement === "block" && (unavailable || unverified)) {
      const reason = `${capability.name} berstatus ${capability.status}; routing diblokir oleh policy capability.`;
      blockers.push(reason);
      decisions.push({ capabilityId: capability.id, decision: "blocked", reason });
      continue;
    }
    if (capability.enforcement === "review" && (unavailable || unverified || capability.status === "degraded")) {
      const reason = `${capability.name} berstatus ${capability.status}; verifikasi diperlukan sebelum aksi pada sistem ini.`;
      warnings.push(reason);
      decisions.push({ capabilityId: capability.id, decision: "review", reason });
      continue;
    }
    if (capability.status === "degraded") {
      const reason = `${capability.name} sedang degraded; lanjutkan dengan pemantauan dan bukti tambahan.`;
      warnings.push(reason);
      decisions.push({ capabilityId: capability.id, decision: "review", reason });
      continue;
    }
    decisions.push({ capabilityId: capability.id, decision: "allowed", reason: `${capability.name} dapat digunakan dalam batas policy.` });
  }

  return {
    decision: blockers.length ? "blocked" : warnings.length ? "review" : "allowed",
    capabilityIds: requiredCapabilities.map((capability) => capability.id),
    blockers,
    warnings,
    decisions,
    checkedAt: now(),
  };
}

function assertWorkflowCapabilities(workflow, registry) {
  const assessment = assessWorkflowCapabilities(workflow, registry);
  if (assessment.blockers.length) {
    throw new Error(`Capability routing diblokir: ${assessment.blockers.join(" ")}`);
  }
  return assessment;
}

module.exports = {
  ACCESS_MODES,
  AUDIT_TYPES,
  CAPABILITY_KINDS,
  CAPABILITY_STATUSES,
  DATA_CLASSIFICATIONS,
  ENFORCEMENT_LEVELS,
  ENVIRONMENTS,
  archiveCapability,
  assessWorkflowCapabilities,
  assertWorkflowCapabilities,
  createCapability,
  createDefaultCapabilityRegistry,
  ensureCapabilityRegistry,
  loadCapabilityRegistry,
  resolveCapabilityRegistryPath,
  saveCapabilityRegistry,
  setCapabilityStatus,
  updateCapability,
  validateCapabilityRegistry,
};
