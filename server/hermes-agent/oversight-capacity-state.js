"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { resolveStateDir } = require("../studio-settings");

const PERIOD_DAYS = 30;
const HANDOFF_LIMIT = 24;
const REVIEW_LIMIT = 20;
const REVIEW_TYPES = new Set(["quality", "exception", "override", "pause"]);
const MAX_EVENTS = 2000;

function resolveOversightCapacityPath(env = process.env) {
  return path.join(resolveStateDir(env), "hermes3d", "oversight-capacity.json");
}

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

function requireString(value, label, { allowEmpty = false, maxLength = 4000 } = {}) {
  if (typeof value !== "string") throw new Error(`${label} harus berupa teks.`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw new Error(`${label} wajib diisi.`);
  if (normalized.length > maxLength) throw new Error(`${label} terlalu panjang.`);
  return normalized;
}

function requireId(value, label) {
  const id = requireString(value, label, { maxLength: 120 });
  if (!/^[a-z0-9][a-z0-9-]{2,119}$/.test(id)) throw new Error(`${label} tidak valid.`);
  return id;
}

function requireTimestamp(value, label) {
  const timestamp = requireString(value, label, { maxLength: 80 });
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${label} tidak valid.`);
  return timestamp;
}

function requireEnum(value, values, label) {
  const normalized = requireString(value, label, { maxLength: 64 });
  if (!values.has(normalized)) throw new Error(`${label} tidak valid: ${normalized}`);
  return normalized;
}

function validateHandoff(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Handoff harus berupa object.");
  return {
    id: requireId(event.id, "Handoff id"),
    workOrderId: requireId(event.workOrderId, "Handoff work order"),
    fromAgentKey: requireString(event.fromAgentKey, "Handoff agent asal", { maxLength: 160 }),
    toAgentKey: requireString(event.toAgentKey, "Handoff agent tujuan", { maxLength: 160 }),
    supervisorKey: requireString(event.supervisorKey ?? "Faza", "Handoff supervisor", { maxLength: 160 }),
    reason: requireString(event.reason, "Alasan handoff", { maxLength: 4000 }),
    recordedBy: requireString(event.recordedBy ?? "Hermes3D", "Handoff recordedBy", { maxLength: 160 }),
    at: requireTimestamp(event.at, "Handoff timestamp"),
  };
}

function validateReview(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Review pengawasan harus berupa object.");
  const qualityScore = event.qualityScore === null || event.qualityScore === undefined ? null : Number(event.qualityScore);
  if (qualityScore !== null && (!Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 100)) {
    throw new Error("Quality score harus berada di antara 0 dan 100.");
  }
  return {
    id: requireId(event.id, "Review pengawasan id"),
    workOrderId: requireId(event.workOrderId, "Review work order"),
    agentKey: requireString(event.agentKey, "Review agent", { maxLength: 160 }),
    supervisorKey: requireString(event.supervisorKey ?? "Faza", "Review supervisor", { maxLength: 160 }),
    reviewType: requireEnum(event.reviewType ?? "quality", REVIEW_TYPES, "Review type"),
    qualityScore,
    note: requireString(event.note ?? "", "Review note", { allowEmpty: true, maxLength: 4000 }),
    recordedBy: requireString(event.recordedBy ?? "Faza", "Review recordedBy", { maxLength: 160 }),
    at: requireTimestamp(event.at, "Review timestamp"),
  };
}

function validateState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state) || state.version !== 1) {
    throw new Error("Invalid oversight capacity registry.");
  }
  if (!Array.isArray(state.handoffs) || !Array.isArray(state.reviews)) {
    throw new Error("Oversight capacity collections are required.");
  }
  const handoffs = state.handoffs.map(validateHandoff);
  const reviews = state.reviews.map(validateReview);
  const ids = new Set();
  for (const event of [...handoffs, ...reviews]) {
    if (ids.has(event.id)) throw new Error(`Duplicate oversight event id: ${event.id}`);
    ids.add(event.id);
  }
  return {
    version: 1,
    updatedAt: requireTimestamp(state.updatedAt, "Oversight updatedAt"),
    handoffs: handoffs.slice(-MAX_EVENTS),
    reviews: reviews.slice(-MAX_EVENTS),
  };
}

function createDefaultOversightCapacityState() {
  return validateState({ version: 1, updatedAt: now(), handoffs: [], reviews: [] });
}

function loadOversightCapacity(filePath = resolveOversightCapacityPath()) {
  if (!fs.existsSync(filePath)) return createDefaultOversightCapacityState();
  return validateState(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function saveOversightCapacity(state, filePath = resolveOversightCapacityPath()) {
  const validated = validateState({ ...state, updatedAt: now() });
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

function ensureOversightCapacity(filePath = resolveOversightCapacityPath()) {
  if (fs.existsSync(filePath)) return loadOversightCapacity(filePath);
  return saveOversightCapacity(createDefaultOversightCapacityState(), filePath);
}

function recordHandoff(state, input = {}) {
  const next = JSON.parse(JSON.stringify(validateState(state)));
  const event = validateHandoff({
    id: input.id || createId("handoff"),
    workOrderId: input.workOrderId,
    fromAgentKey: input.fromAgentKey,
    toAgentKey: input.toAgentKey,
    supervisorKey: input.supervisorKey || "Faza",
    reason: input.reason,
    recordedBy: input.recordedBy || "Hermes3D",
    at: input.at || now(),
  });
  next.handoffs.push(event);
  next.updatedAt = event.at;
  return { state: next, handoff: event };
}

function recordOversightReview(state, input = {}) {
  const next = JSON.parse(JSON.stringify(validateState(state)));
  const event = validateReview({
    id: input.id || createId("oversight-review"),
    workOrderId: input.workOrderId,
    agentKey: input.agentKey,
    supervisorKey: input.supervisorKey || "Faza",
    reviewType: input.reviewType || "quality",
    qualityScore: input.qualityScore,
    note: input.note || "",
    recordedBy: input.recordedBy || "Faza",
    at: input.at || now(),
  });
  next.reviews.push(event);
  next.updatedAt = event.at;
  return { state: next, review: event };
}

function getOversightSummary(state, { checkedAt = now(), periodDays = PERIOD_DAYS } = {}) {
  const validated = validateState(state);
  const checkedMs = Date.parse(checkedAt);
  const periodMs = periodDays * 24 * 3_600_000;
  const recentHandoffs = validated.handoffs.filter((event) => checkedMs - Date.parse(event.at) <= periodMs);
  const recentReviews = validated.reviews.filter((event) => checkedMs - Date.parse(event.at) <= periodMs);
  const supervisors = new Set([
    ...recentHandoffs.map((event) => event.supervisorKey),
    ...recentReviews.map((event) => event.supervisorKey),
  ]);
  const metrics = [...supervisors].sort().map((supervisorKey) => {
    const handoffs = recentHandoffs.filter((event) => event.supervisorKey === supervisorKey);
    const reviews = recentReviews.filter((event) => event.supervisorKey === supervisorKey);
    const scored = reviews.filter((event) => event.qualityScore !== null);
    const averageQuality = scored.length ? Math.round(scored.reduce((sum, event) => sum + event.qualityScore, 0) / scored.length) : null;
    const handoffRatio = handoffs.length / HANDOFF_LIMIT;
    const reviewRatio = reviews.length / REVIEW_LIMIT;
    const ratio = Math.max(handoffRatio, reviewRatio);
    const capacityStatus = ratio >= 1 ? "over_capacity" : ratio >= 0.75 ? "near_limit" : "within_limit";
    return {
      supervisorKey,
      handoffs: handoffs.length,
      reviews: reviews.length,
      averageQuality,
      capacityStatus,
      activeAgentCount: new Set(handoffs.flatMap((event) => [event.fromAgentKey, event.toAgentKey])).size,
    };
  });
  return {
    periodDays,
    checkedAt,
    thresholds: { handoffsPerSupervisor: HANDOFF_LIMIT, reviewsPerSupervisor: REVIEW_LIMIT },
    totals: {
      handoffs: recentHandoffs.length,
      reviews: recentReviews.length,
      agentToAgentHandoffs: recentHandoffs.filter((event) => event.fromAgentKey !== "Faza" && event.toAgentKey !== "Faza").length,
      supervisors: supervisors.size,
    },
    capacityStatus: metrics.some((metric) => metric.capacityStatus === "over_capacity")
      ? "over_capacity"
      : metrics.some((metric) => metric.capacityStatus === "near_limit") ? "near_limit" : "within_limit",
    supervisors: metrics,
    recentHandoffs: recentHandoffs.slice(-40).reverse(),
    recentReviews: recentReviews.slice(-40).reverse(),
  };
}

module.exports = {
  createDefaultOversightCapacityState,
  getOversightSummary,
  ensureOversightCapacity,
  loadOversightCapacity,
  recordHandoff,
  recordOversightReview,
  resolveOversightCapacityPath,
  saveOversightCapacity,
  validateState,
};
