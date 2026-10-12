"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { resolveStateDir } = require("../studio-settings");

const EXECUTION_LEVELS = new Set(["advisory", "approval", "bounded"]);
const LIFECYCLE_STATES = new Set(["draft", "ready", "paused", "archived"]);
const EXECUTION_MODES = new Set(["copilot", "governed_agent", "orchestrated"]);
const OVERSIGHT_MODES = new Set(["human_in_the_loop", "human_on_the_loop", "human_in_command"]);
const QUALITY_GATE_MODES = new Set(["independent_review", "human_review"]);
const FINDING_SEVERITIES = new Set(["critical", "high", "medium", "low"]);
const READINESS_CHECK_KEYS = [
  "realSystemAccess",
  "businessLogicMapped",
  "humanEscalationReady",
  "auditReady",
  "rollbackTested",
];
const READINESS_STATES = new Set(["not_assessed", "pilot", "staging_ready", "production_ready"]);

function resolveExecutionRegistryPath(env = process.env) {
  return path.join(resolveStateDir(env), "hermes3d", "execution-registry.json");
}

function requireString(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function requireStringArray(value, label, { minimum = 1 } = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const normalized = value.map((entry) => requireString(entry, label)).filter(Boolean);
  if (normalized.length < minimum) throw new Error(`${label} requires at least ${minimum} value.`);
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicate values.`);
  return normalized;
}

function defaultExecutionMode(executionLevel) {
  if (executionLevel === "bounded") return "orchestrated";
  if (executionLevel === "approval") return "governed_agent";
  return "copilot";
}

function defaultOversightMode(executionLevel) {
  return executionLevel === "bounded" ? "human_on_the_loop" : "human_in_the_loop";
}

function defaultControlProfile() {
  return {
    confirmationRequiredFor: ["external", "production", "sensitive", "irreversible"],
    interruptible: true,
    pauseAndResume: true,
    partialResultsAllowed: true,
    promptInjectionReview: true,
    recurrenceAllowed: false,
  };
}

function normalizeControlProfile(value) {
  const defaults = defaultControlProfile();
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const confirmationRequiredFor = source.confirmationRequiredFor === undefined
    ? defaults.confirmationRequiredFor
    : requireStringArray(source.confirmationRequiredFor, "Control confirmationRequiredFor");
  const booleanKeys = [
    "interruptible",
    "pauseAndResume",
    "partialResultsAllowed",
    "promptInjectionReview",
    "recurrenceAllowed",
  ];
  for (const key of booleanKeys) {
    if (source[key] !== undefined && typeof source[key] !== "boolean") {
      throw new Error(`Control ${key} must be a boolean.`);
    }
  }
  return {
    confirmationRequiredFor,
    ...Object.fromEntries(booleanKeys.map((key) => [key, source[key] === undefined ? defaults[key] : source[key]])),
  };
}

function defaultQualityGate(domain = "") {
  const normalizedDomain = domain.toLowerCase();
  const requiredReviewRoles = ["critic"];
  if (/security|risk|audit|legal|compliance|finance|production/.test(normalizedDomain)) requiredReviewRoles.push("guardrail");
  if (/legal|compliance|finance/.test(normalizedDomain)) requiredReviewRoles.push("compliance");
  return {
    mode: "independent_review",
    requiredReviewRoles: [...new Set(requiredReviewRoles)],
    failOn: ["critical"],
    iterateOn: ["high", "medium"],
    maxIterations: 3,
    selfReviewProhibited: true,
  };
}

function normalizeQualityGate(value, domain = "") {
  const defaults = defaultQualityGate(domain);
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const mode = source.mode === undefined ? defaults.mode : requireString(source.mode, "Quality gate mode");
  if (!QUALITY_GATE_MODES.has(mode)) throw new Error(`Invalid quality gate mode: ${mode}`);
  const requiredReviewRoles = source.requiredReviewRoles === undefined
    ? defaults.requiredReviewRoles
    : requireStringArray(source.requiredReviewRoles, "Quality gate review roles");
  const readSeverityList = (key, fallback) => {
    const entries = source[key] === undefined ? fallback : requireStringArray(source[key], `Quality gate ${key}`);
    for (const entry of entries) if (!FINDING_SEVERITIES.has(entry)) throw new Error(`Invalid quality gate severity: ${entry}`);
    return entries;
  };
  const maxIterations = source.maxIterations === undefined ? defaults.maxIterations : source.maxIterations;
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 5) {
    throw new Error("Quality gate maxIterations must be an integer between 1 and 5.");
  }
  if (source.selfReviewProhibited !== undefined && typeof source.selfReviewProhibited !== "boolean") {
    throw new Error("Quality gate selfReviewProhibited must be a boolean.");
  }
  return {
    mode,
    requiredReviewRoles,
    failOn: readSeverityList("failOn", defaults.failOn),
    iterateOn: readSeverityList("iterateOn", defaults.iterateOn),
    maxIterations,
    selfReviewProhibited: source.selfReviewProhibited === undefined ? defaults.selfReviewProhibited : source.selfReviewProhibited,
  };
}

function normalizeProductionReadiness(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const checklist = Object.fromEntries(READINESS_CHECK_KEYS.map((key) => [key, source[key] === true]));
  return {
    ...checklist,
    lastReviewedAt: typeof source.lastReviewedAt === "string" ? source.lastReviewedAt.trim() : "",
    reviewer: typeof source.reviewer === "string" && source.reviewer.trim() ? source.reviewer.trim() : "Faza",
  };
}

function getWorkflowReadiness(workflow) {
  const checklist = normalizeProductionReadiness(workflow.productionReadiness);
  const completedChecks = READINESS_CHECK_KEYS.filter((key) => checklist[key]).length;
  const status = completedChecks === 0
    ? "not_assessed"
    : completedChecks === READINESS_CHECK_KEYS.length
      ? "production_ready"
      : completedChecks >= 4
        ? "staging_ready"
        : "pilot";
  const gaps = READINESS_CHECK_KEYS
    .filter((key) => !checklist[key])
    .map((key) => ({
      realSystemAccess: "Akses ke system of record belum dibuktikan",
      businessLogicMapped: "Logika bisnis dan pengecualian belum dipetakan",
      humanEscalationReady: "Pemilik eskalasi manusia belum siap",
      auditReady: "Audit trail dan bukti hasil belum diverifikasi",
      rollbackTested: "Rollback belum diuji",
    }[key]));
  return {
    workflowId: workflow.id,
    status,
    completedChecks,
    totalChecks: READINESS_CHECK_KEYS.length,
    checklist,
    gaps,
    systemOfRecord: workflow.systemOfRecord,
    executionMode: workflow.executionMode,
    oversightMode: workflow.oversightMode,
    escalationOwner: workflow.escalationOwner,
    controlProfile: normalizeControlProfile(workflow.controlProfile),
    qualityGate: normalizeQualityGate(workflow.qualityGate, workflow.domain),
  };
}

function getExecutionReadinessSummary(registry) {
  const workflows = registry.workflows.map(getWorkflowReadiness);
  const byStatus = Object.fromEntries([...READINESS_STATES].map((status) => [status, workflows.filter((workflow) => workflow.status === status).length]));
  return {
    totalWorkflows: workflows.length,
    productionReady: byStatus.production_ready,
    stagingReady: byStatus.staging_ready,
    pilots: byStatus.pilot,
    notAssessed: byStatus.not_assessed,
    byStatus,
    workflows,
  };
}

function validateWorkflow(workflow) {
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    throw new Error("Execution workflow must be an object.");
  }

  const id = requireString(workflow.id, "Workflow id");
  if (!/^[a-z0-9][a-z0-9-]{1,96}$/.test(id)) {
    throw new Error(`Workflow id is invalid: ${id}`);
  }
  const lifecycle = requireString(workflow.lifecycle, "Workflow lifecycle");
  if (!LIFECYCLE_STATES.has(lifecycle)) throw new Error(`Invalid workflow lifecycle: ${lifecycle}`);
  const executionLevel = requireString(workflow.executionLevel, "Execution level");
  if (!EXECUTION_LEVELS.has(executionLevel)) throw new Error(`Invalid execution level: ${executionLevel}`);

  const ownerKey = requireString(workflow.ownerKey, "Workflow owner");
  const allowedAgentKeys = requireStringArray(workflow.allowedAgentKeys, "Allowed agents");
  if (!allowedAgentKeys.includes(ownerKey)) {
    throw new Error(`Workflow owner must be included in allowed agents: ${id}`);
  }

  const systems = requireStringArray(workflow.systems, "Target systems");
  const executionMode = typeof workflow.executionMode === "string" && EXECUTION_MODES.has(workflow.executionMode)
    ? workflow.executionMode
    : defaultExecutionMode(executionLevel);
  const oversightMode = typeof workflow.oversightMode === "string" && OVERSIGHT_MODES.has(workflow.oversightMode)
    ? workflow.oversightMode
    : defaultOversightMode(executionLevel);

  return {
    id,
    name: requireString(workflow.name, "Workflow name"),
    domain: requireString(workflow.domain, "Workflow domain"),
    project: requireString(workflow.project ?? "", "Workflow project", { allowEmpty: true }),
    lifecycle,
    executionLevel,
    ownerKey,
    allowedAgentKeys,
    systems,
    systemOfRecord: requireString(workflow.systemOfRecord ?? systems[0], "System of record"),
    executionMode,
    oversightMode,
    escalationOwner: requireString(workflow.escalationOwner ?? "Faza", "Escalation owner"),
    controlProfile: normalizeControlProfile(workflow.controlProfile),
    qualityGate: normalizeQualityGate(workflow.qualityGate, workflow.domain),
    trigger: requireString(workflow.trigger, "Workflow trigger"),
    action: requireString(workflow.action, "Allowed action"),
    approvalGate: requireString(workflow.approvalGate, "Approval gate"),
    evidence: requireStringArray(workflow.evidence, "Completion evidence"),
    rollback: requireString(workflow.rollback, "Rollback plan"),
    kpis: requireStringArray(workflow.kpis, "Workflow KPIs"),
    productionReadiness: normalizeProductionReadiness(workflow.productionReadiness),
  };
}

function validateExecutionRegistry(state) {
  if (!state || typeof state !== "object" || Array.isArray(state) || state.version !== 1) {
    throw new Error("Invalid execution registry.");
  }
  if (typeof state.updatedAt !== "string" || !state.updatedAt) {
    throw new Error("Execution registry updatedAt is required.");
  }
  if (!Array.isArray(state.workflows)) throw new Error("Execution registry workflows must be an array.");
  const ids = new Set();
  const workflows = state.workflows.map((workflow) => {
    const validated = validateWorkflow(workflow);
    if (ids.has(validated.id)) throw new Error(`Duplicate workflow id: ${validated.id}`);
    ids.add(validated.id);
    return validated;
  });
  return { version: 1, updatedAt: state.updatedAt, workflows };
}

function createDefaultExecutionRegistry() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    workflows: [
      {
        id: "personal-daily-planning",
        name: "Perencanaan prioritas harian",
        domain: "Pribadi dan rumah tangga",
        project: "",
        lifecycle: "ready",
        executionLevel: "advisory",
        ownerKey: "personal-assistant",
        allowedAgentKeys: ["personal-assistant", "personal-research"],
        systems: ["Hermes Workspace", "Agenda dan daftar tugas yang diberikan Faza"],
        trigger: "Permintaan Faza atau tinjauan harian.",
        action: "Rangkum komitmen, konflik, prioritas, dan tindak lanjut tanpa membuat agenda atau mengirim pesan.",
        approvalGate: "Faza menyetujui perubahan agenda atau komunikasi eksternal.",
        evidence: ["Ringkasan agenda", "Daftar prioritas", "Sumber informasi"],
        rollback: "Tidak ada perubahan otomatis pada kalender atau pesan.",
        kpis: ["Follow-up tepat waktu", "Prioritas terselesaikan"],
      },
      {
        id: "personal-cashflow-review",
        name: "Tinjauan cashflow dan anggaran pribadi",
        domain: "Pribadi dan rumah tangga",
        project: "",
        lifecycle: "ready",
        executionLevel: "advisory",
        ownerKey: "personal-finance",
        allowedAgentKeys: ["personal-finance", "personal-research"],
        systems: ["Spreadsheet atau laporan keuangan yang diberikan Faza"],
        trigger: "Permintaan analisis atau periode peninjauan yang diminta Faza.",
        action: "Analisis cashflow, asumsi, skenario, dan prioritas keuangan tanpa melakukan transaksi.",
        approvalGate: "Faza menyetujui setiap transaksi, komitmen, atau perubahan anggaran.",
        evidence: ["Sumber angka", "Asumsi", "Skenario perbandingan"],
        rollback: "Tidak ada transaksi atau perubahan rekening dilakukan oleh workflow.",
        kpis: ["Akurasi rekonsiliasi", "Kepatuhan terhadap anggaran"],
      },
      {
        id: "corporate-decision-follow-up",
        name: "Decision register dan tindak lanjut perusahaan",
        domain: "Executive office",
        project: "",
        lifecycle: "ready",
        executionLevel: "approval",
        ownerKey: "corporate-secretary",
        allowedAgentKeys: ["corporate-secretary", "chief-of-staff", "governance"],
        systems: ["Hermes Workspace", "Decision register perusahaan"],
        trigger: "Rapat, keputusan Faza, atau permintaan tindak lanjut.",
        action: "Siapkan notulen, owner, tenggat usulan, dan register keputusan untuk ditinjau.",
        approvalGate: "Faza menyetujui keputusan final dan komunikasi di luar organisasi.",
        evidence: ["Notulen", "Decision register", "Daftar owner dan tindak lanjut"],
        rollback: "Batalkan draf yang belum disetujui dan pertahankan jejak revisi.",
        kpis: ["Tindak lanjut memiliki owner", "Keputusan terdokumentasi"],
      },
      {
        id: "agent-lifecycle-review",
        name: "Review kebutuhan dan lifecycle agent",
        domain: "People and agent lifecycle",
        project: "",
        lifecycle: "ready",
        executionLevel: "approval",
        ownerKey: "agent-recruitment",
        allowedAgentKeys: ["agent-recruitment", "people-ops", "quality-lead", "finance-lead"],
        systems: ["Hermes Workspace", "Organization registry"],
        trigger: "Perubahan beban kerja, gap kemampuan, biaya, kualitas, atau error agent.",
        action: "Siapkan role brief, evaluasi kapasitas, rekomendasi pengembangan, reassignment, atau retirement.",
        approvalGate: "Faza menyetujui setiap create, update, reassignment, atau layoff agent.",
        evidence: ["Role brief", "Capacity review", "Biaya dan risiko", "Success criteria"],
        rollback: "Tidak ada perubahan roster dilakukan sebelum persetujuan Faza.",
        kpis: ["Overlap peran berkurang", "Kualitas output agent", "Biaya per hasil"],
      },
      {
        id: "risk-audit-gate",
        name: "Quality, risk, audit, dan security gate",
        domain: "Risk, audit, dan security",
        project: "",
        lifecycle: "ready",
        executionLevel: "approval",
        ownerKey: "quality-lead",
        allowedAgentKeys: ["quality-lead", "risk-manager", "internal-audit", "security-lead", "qa-reviewer"],
        systems: ["Hermes Workspace", "Evidence pack", "Staging environment"],
        trigger: "Perubahan material, rilis, akses sensitif, atau temuan risiko.",
        action: "Kumpulkan bukti, uji kontrol, nilai risiko, dan siapkan rekomendasi go, revise, atau stop.",
        approvalGate: "Faza menyetujui risiko residual tinggi, akses sensitif, dan deployment produksi.",
        evidence: ["Risk register", "Hasil QA", "Audit trail", "Security review"],
        rollback: "Hentikan rilis atau perubahan dan kembali ke kondisi staging yang tervalidasi.",
        kpis: ["Temuan ditutup dengan bukti", "Regresi terdeteksi sebelum rilis"],
      },
      {
        id: "gooru-campaign-execution",
        name: "Perencanaan dan evaluasi kampanye Gooru",
        domain: "Digital marketing",
        project: "Gooru",
        lifecycle: "ready",
        executionLevel: "approval",
        ownerKey: "gooru-lead",
        allowedAgentKeys: ["gooru-lead", "gooru-developer", "gooru-content", "gooru-performance", "digital-marketing-lead"],
        systems: ["Content workspace", "Analytics dashboard", "Kanal pemasaran Gooru"],
        trigger: "Brief kampanye atau siklus optimasi Gooru.",
        action: "Siapkan campaign brief, konten, funnel, eksperimen channel, dan analisis performa.",
        approvalGate: "Faza menyetujui anggaran, publikasi, dan komunikasi eksternal.",
        evidence: ["Campaign brief", "Materi konten", "KPI report", "Biaya dan hasil"],
        rollback: "Hentikan atau tarik materi yang belum atau tidak lagi disetujui.",
        kpis: ["Qualified leads", "Biaya per lead", "Conversion rate"],
      },
      {
        id: "pabk-erp-change",
        name: "Intake perubahan dan validasi ERP PABK",
        domain: "ERP development",
        project: "PABK",
        lifecycle: "ready",
        executionLevel: "approval",
        ownerKey: "pabk-lead",
        allowedAgentKeys: ["pabk-lead", "pabk-analyst", "pabk-developer", "pabk-qa", "architect"],
        systems: ["ERPNext development", "ERPNext staging", "PABK backlog"],
        trigger: "Permintaan perubahan, defect, atau kebutuhan proses PABK.",
        action: "Uraikan requirement, siapkan perubahan di development atau staging, uji acceptance criteria, dan siapkan rekomendasi rilis.",
        approvalGate: "Faza menyetujui scope, perubahan akses, data sensitif, dan deployment produksi.",
        evidence: ["Requirement map", "Perubahan kode atau konfigurasi", "Test report", "UAT evidence"],
        rollback: "Gunakan backup, migrasi rollback, atau konfigurasi staging tervalidasi sebelum produksi.",
        kpis: ["Acceptance criteria lulus", "Defect escape rate", "Lead time perubahan"],
      },
      {
        id: "pabk-demand-generation",
        name: "Perencanaan digital marketing PABK",
        domain: "Digital marketing",
        project: "PABK",
        lifecycle: "ready",
        executionLevel: "approval",
        ownerKey: "pabk-marketing",
        allowedAgentKeys: ["pabk-marketing", "pabk-lead", "digital-marketing-lead", "marketing"],
        systems: ["Content workspace", "Analytics dashboard", "Kanal pemasaran PABK"],
        trigger: "Brief pemasaran atau evaluasi funnel PABK.",
        action: "Siapkan positioning, konten, campaign, dan analisis funnel untuk ditinjau.",
        approvalGate: "Faza menyetujui anggaran, publikasi, dan komunikasi eksternal.",
        evidence: ["Content brief", "Campaign plan", "Funnel report", "Biaya dan hasil"],
        rollback: "Jeda atau tarik konten dan campaign yang belum disetujui.",
        kpis: ["Qualified leads", "Conversion rate", "Biaya per lead"],
      },
      {
        id: "fcp-erp-change",
        name: "Intake perubahan dan validasi ERP FCP",
        domain: "ERP development",
        project: "FCP",
        lifecycle: "ready",
        executionLevel: "approval",
        ownerKey: "fcp-lead",
        allowedAgentKeys: ["fcp-lead", "fcp-analyst", "fcp-developer", "fcp-qa", "architect"],
        systems: ["ERPNext development", "ERPNext staging", "FCP backlog"],
        trigger: "Permintaan perubahan, defect, atau kebutuhan proses FCP.",
        action: "Uraikan requirement, siapkan perubahan di development atau staging, uji acceptance criteria, dan siapkan rekomendasi rilis.",
        approvalGate: "Faza menyetujui scope, perubahan akses, data sensitif, dan deployment produksi.",
        evidence: ["Requirement map", "Perubahan kode atau konfigurasi", "Test report", "UAT evidence"],
        rollback: "Gunakan backup, migrasi rollback, atau konfigurasi staging tervalidasi sebelum produksi.",
        kpis: ["Acceptance criteria lulus", "Defect escape rate", "Lead time perubahan"],
      },
      {
        id: "fcp-demand-generation",
        name: "Perencanaan digital marketing FCP",
        domain: "Digital marketing",
        project: "FCP",
        lifecycle: "ready",
        executionLevel: "approval",
        ownerKey: "fcp-marketing",
        allowedAgentKeys: ["fcp-marketing", "fcp-lead", "digital-marketing-lead", "marketing"],
        systems: ["Content workspace", "Analytics dashboard", "Kanal pemasaran FCP"],
        trigger: "Brief pemasaran atau evaluasi funnel FCP.",
        action: "Siapkan positioning, konten, campaign, dan analisis funnel untuk ditinjau.",
        approvalGate: "Faza menyetujui anggaran, publikasi, dan komunikasi eksternal.",
        evidence: ["Content brief", "Campaign plan", "Funnel report", "Biaya dan hasil"],
        rollback: "Jeda atau tarik konten dan campaign yang belum disetujui.",
        kpis: ["Qualified leads", "Conversion rate", "Biaya per lead"],
      },
      {
        id: "research-experiment-review",
        name: "Riset dan evaluasi eksperimen",
        domain: "Product research and development",
        project: "",
        lifecycle: "draft",
        executionLevel: "advisory",
        ownerKey: "rd-lead",
        allowedAgentKeys: ["rd-lead", "product-researcher", "data-research"],
        systems: ["Hermes Workspace", "R&D backlog"],
        trigger: "Hipotesis baru, peluang produk, atau kebutuhan evaluasi teknologi.",
        action: "Siapkan research brief, eksperimen kecil, evaluasi hasil, dan rekomendasi adopsi.",
        approvalGate: "Faza menyetujui adopsi solusi, anggaran, atau perubahan capability produksi.",
        evidence: ["Hipotesis", "Metode eksperimen", "Hasil evaluasi", "Rekomendasi"],
        rollback: "Eksperimen dibatasi ke sandbox atau staging dan dapat dihentikan tanpa dampak produksi.",
        kpis: ["Hipotesis tervalidasi", "Waktu dari riset ke keputusan"],
      },
    ],
  };
}

function loadExecutionRegistry(filePath = resolveExecutionRegistryPath()) {
  if (!fs.existsSync(filePath)) return validateExecutionRegistry(createDefaultExecutionRegistry());
  return validateExecutionRegistry(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function saveExecutionRegistry(state, filePath = resolveExecutionRegistryPath()) {
  const validated = validateExecutionRegistry({
    ...state,
    updatedAt: new Date().toISOString(),
  });
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

function ensureExecutionRegistry(filePath = resolveExecutionRegistryPath()) {
  if (fs.existsSync(filePath)) return loadExecutionRegistry(filePath);
  return saveExecutionRegistry(createDefaultExecutionRegistry(), filePath);
}

module.exports = {
  EXECUTION_LEVELS,
  EXECUTION_MODES,
  FINDING_SEVERITIES,
  LIFECYCLE_STATES,
  OVERSIGHT_MODES,
  QUALITY_GATE_MODES,
  READINESS_CHECK_KEYS,
  READINESS_STATES,
  createDefaultExecutionRegistry,
  ensureExecutionRegistry,
  getExecutionReadinessSummary,
  getWorkflowReadiness,
  loadExecutionRegistry,
  normalizeControlProfile,
  normalizeQualityGate,
  normalizeProductionReadiness,
  resolveExecutionRegistryPath,
  saveExecutionRegistry,
  validateExecutionRegistry,
};
