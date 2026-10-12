import {
  getZoneDeskUids,
  type OfficeLayoutPreset,
} from "@/features/retro-office/core/furnitureDefaults";

export type OrgAgentBasic = {
  id: string;
  name?: string | null;
  role?: string | null;
  department?: string | null;
  project?: string | null;
  projectStatus?: string | null;
  subtitle?: string | null;
};

const FALLBACK_ZONE = "division_admin";

// keyword (lowercase) -> room/desk zone; ordered by precedence.
const AGENT_ZONE_RULES: [string, string][] = [
  // Project rooms must win before generic ERP, marketing, or delivery terms.
  ["physiorehab", "project_physiorehab"],
  ["physio rehab", "project_physiorehab"],
  ["gaya makmur", "project_gmm"],
  ["gmm", "project_gmm"],
  ["gooru", "project_gooru"],
  ["pabk", "project_pabk"],
  ["fcp", "project_fcp"],

  // Individual management rooms.
  ["chief executive", "mgmt_ceo"],
  ["owner", "mgmt_ceo"],
  ["founder", "mgmt_ceo"],
  ["ceo", "mgmt_ceo"],
  ["strategy", "mgmt_ceo"],
  ["coo", "mgmt_ops"],
  ["operations director", "mgmt_ops"],
  ["operating cadence", "mgmt_ops"],
  ["operations lead", "mgmt_ops"],
  ["cfo", "mgmt_finance"],
  ["finance director", "mgmt_finance"],
  ["legal counsel", "mgmt_legal"],
  ["contract counsel", "mgmt_legal"],
  ["risk officer", "mgmt_risk"],
  ["audit lead", "mgmt_risk"],
  ["security officer", "mgmt_security"],
  ["governance lead", "mgmt_security"],

  // Internal divisions.
  ["agent ops", "division_agent_ops"],
  ["agent lifecycle", "division_agent_ops"],
  ["recruit", "division_agent_ops"],
  ["talent", "division_people"],
  ["people", "division_people"],
  ["human resources", "division_people"],
  ["hr", "division_people"],
  ["engineering", "division_engineering"],
  ["erp", "division_engineering"],
  ["developer", "division_engineering"],
  ["development", "division_engineering"],
  ["implementation", "division_engineering"],
  ["solution architect", "division_engineering"],
  ["software", "division_engineering"],
  ["data", "division_data"],
  ["research", "division_data"],
  ["r&d", "division_data"],
  ["analytics", "division_data"],
  ["intelligence", "division_data"],
  ["marketing", "division_marketing"],
  ["brand", "division_marketing"],
  ["content", "division_marketing"],
  ["growth", "division_marketing"],
  ["seo", "division_marketing"],
  ["social", "division_marketing"],
  ["digital", "division_marketing"],
  ["finance", "division_finance"],
  ["billing", "division_finance"],
  ["budget", "division_finance"],
  ["cost", "division_finance"],
  ["legal", "mgmt_legal"],
  ["contract", "mgmt_legal"],
  ["compliance", "mgmt_legal"],
  ["security", "mgmt_security"],
  ["access", "mgmt_security"],
  ["guardrail", "mgmt_security"],
  ["risk", "mgmt_risk"],
  ["audit", "mgmt_risk"],
  ["quality", "mgmt_risk"],
  ["qa", "mgmt_risk"],
  ["governance", "mgmt_security"],
  ["assistant", "division_admin"],
  ["secretary", "division_admin"],
  ["admin", "division_admin"],
  ["household", "division_admin"],
  ["personal", "division_admin"],
  ["facility", "division_admin"],
];

const PREFERRED_OVERFLOW_ZONES = [
  "division_admin",
  "division_agent_ops",
  "division_engineering",
  "division_data",
  "division_marketing",
  "division_people",
  "division_finance",
  "mgmt_ops",
  "mgmt_ceo",
  "project_pabk",
  "project_fcp",
  "project_gooru",
  "project_physiorehab",
  "project_gmm",
];

const normalizeText = (value: string | null | undefined) =>
  value?.toLowerCase().replace(/[_-]+/g, " ").trim() ?? "";

const agentSearchText = (agent: OrgAgentBasic) =>
  [
    agent.project,
    agent.department,
    agent.role,
    agent.subtitle,
    agent.name,
    agent.projectStatus,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");

export const inferOfficeZoneForAgent = (agent: OrgAgentBasic): string => {
  const text = agentSearchText(agent);
  const project = normalizeText(agent.project);
  const projectStatus = normalizeText(agent.projectStatus);
  // Retired projects stay out of the visual campus. Their agents remain
  // employable, so place them in shared services until a new assignment exists.
  if (
    (project.includes("physiorehab") ||
      project.includes("physio rehab") ||
      project === "gmm" ||
      project.includes("gaya makmur")) &&
    /(inactive|disabled|paused|retired|archived|non aktif|nonaktif)/.test(
      projectStatus,
    )
  ) {
    return FALLBACK_ZONE;
  }
  for (const [keyword, zone] of AGENT_ZONE_RULES) {
    if (text.includes(keyword)) return zone;
  }
  return FALLBACK_ZONE;
};

const getDeskZoneFromUid = (deskUid: string) => {
  const marker = "_desk_";
  const markerIndex = deskUid.indexOf(marker);
  if (markerIndex < 0) return null;
  const id = deskUid.slice(markerIndex + marker.length);
  const parts = id.split("_");
  if (parts.length < 3) return null;
  return parts.slice(0, -2).join("_");
};

const shiftDesk = (
  zoneAvailable: Map<string, string[]>,
  preferredZone: string,
) => {
  const preferredQueue = zoneAvailable.get(preferredZone);
  if (preferredQueue && preferredQueue.length > 0) {
    return preferredQueue.shift();
  }

  for (const zone of PREFERRED_OVERFLOW_ZONES) {
    const queue = zoneAvailable.get(zone);
    if (queue && queue.length > 0) return queue.shift();
  }

  for (const [, queue] of zoneAvailable) {
    if (queue.length > 0) return queue.shift();
  }

  return undefined;
};

export const autoDeskAssignByDepartment = (
  orgAgents: OrgAgentBasic[],
  currentAssignments: Record<string, string>,
  preset: OfficeLayoutPreset = "office",
): Record<string, string> => {
  const zoneDeskUids = getZoneDeskUids(preset);
  const knownDeskUids = new Set(
    Array.from(zoneDeskUids.values()).flatMap((uids) => uids),
  );
  const agentById = new Map(orgAgents.map((agent) => [agent.id, agent]));
  const result: Record<string, string> = {};
  const assignedAgentIds = new Set<string>();

  for (const [deskUid, agentId] of Object.entries(currentAssignments)) {
    const agent = agentById.get(agentId);
    if (!agent || !knownDeskUids.has(deskUid)) continue;

    const assignedZone = getDeskZoneFromUid(deskUid);
    const preferredZone = inferOfficeZoneForAgent(agent);
    if (assignedZone !== preferredZone) continue;

    result[deskUid] = agentId;
    assignedAgentIds.add(agentId);
  }

  const zoneAvailable = new Map<string, string[]>();
  for (const [zone, uids] of zoneDeskUids) {
    zoneAvailable.set(zone, uids.filter((uid) => !result[uid]));
  }

  for (const agent of orgAgents) {
    if (assignedAgentIds.has(agent.id)) continue;

    const preferredZone = inferOfficeZoneForAgent(agent);
    const deskUid = shiftDesk(zoneAvailable, preferredZone);

    if (deskUid) {
      result[deskUid] = agent.id;
      assignedAgentIds.add(agent.id);
    }
  }

  return result;
};
