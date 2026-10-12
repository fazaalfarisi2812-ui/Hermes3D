"use strict";

/**
 * Maps Hermes Desktop profiles <-> Hermes3D organization seats.
 *
 * The mirror bridge observes live Desktop sessions (each tagged with a
 * `profile_name` by the gateway) and animates the matching 3D character.
 * Each profile has ONE "primary" seat that animates when a session for that
 * profile is active; the remaining seats it backs are labels only.
 *
 * The seat->profile table is computed LIVE from the current organization
 * state so newly added org agents are mapped automatically by rule.
 */

const { loadOrganizationState } = require("./organization-state");

// The 20 real Hermes Desktop profiles (served_profiles).
const PROFILES = [
  "default", "architect", "backend-engineer", "code-reviewer", "content-creator",
  "contract-monitor", "data-analyst", "debugger", "devops-engineer", "doc-writer",
  "email-ai-assistant", "erp-implementor", "frontend-engineer", "full-stack-dev",
  "incident-responder", "lead-generator", "performance-optimizer", "prompt-engineer",
  "social-media-manager", "test-writer",
];

// Ordered rules: specific -> generic. First match on name+role+dept+orgKey wins.
const RULES = [
  [/orchestrat|chief of staff|^hermes$/, "default"],
  [/architect/, "architect"],
  [/frontend|front-end/, "frontend-engineer"],
  [/\bdebug/, "debugger"],
  [/performance/, "performance-optimizer"],
  [/devops|infrastructure|reliability|automation engineer/, "devops-engineer"],
  [/prompt|agent recruitment|agent lifecycle|agent operations|people & agent/, "prompt-engineer"],
  [/security operations|security & privacy|incident|secops/, "incident-responder"],
  [/reviewer|quality lead/, "code-reviewer"],
  [/qa engineer|\bqa\b|quality|governance/, "test-writer"],
  [/legal|contract|compliance|audit|risk/, "contract-monitor"],
  [/erp|frappe|integration engineer|implementor/, "erp-implementor"],
  [/content/, "content-creator"],
  [/social|digital marketing/, "social-media-manager"],
  [/growth|sales|lead gener|personal branding|marketing/, "lead-generator"],
  [/corporate secretary|doc writer|documentation|technical writer/, "doc-writer"],
  [/personal assistant|household|^email|secretary|personal finance|personal research/, "email-ai-assistant"],
  [/data|research|analyst/, "data-analyst"],
  [/developer/, "full-stack-dev"],
  [/engineer|business analyst/, "backend-engineer"],
  [/lead|manager|operations|delivery|project/, "default"],
];

// Explicit per-name overrides where the heuristic misroutes.
const OVERRIDES = {
  "Risk Manager": "contract-monitor",
  "Internal Audit Lead": "contract-monitor",
  "Finance & Corporate Lead": "data-analyst",
  "Finance Analyst": "data-analyst",
  "Personal Finance Planner": "data-analyst",
};

// Primary seat (by org agent NAME) that animates when a profile's session is live.
const PRIMARY_SEAT_NAMES = {
  "default": "Hermes",
  "architect": "Solution Architect",
  "backend-engineer": "Engineering Lead",
  "frontend-engineer": "Frontend Engineer",
  "devops-engineer": "DevOps Engineer",
  "debugger": "Debugger",
  "performance-optimizer": "Performance Optimizer",
  "code-reviewer": "QA Reviewer",
  "test-writer": "PABK QA Engineer",
  "data-analyst": "Data & Research",
  "erp-implementor": "FCP ERP Engineer",
  "contract-monitor": "Legal & Contract Counsel",
  "content-creator": "Gooru Content Strategist",
  "social-media-manager": "Digital Marketing Lead",
  "lead-generator": "Growth Lead",
  "email-ai-assistant": "Personal Assistant",
  "full-stack-dev": null, // no natural seat in this ERP-centric org -> fallback
  "incident-responder": "Security Operations Analyst",
  "doc-writer": "Corporate Secretary",
  "prompt-engineer": "Prompt Engineer",
};

// Profile used for sessions whose profile has no primary seat.
const FALLBACK_PROFILE = "default";

const profileForAgent = (agent) => {
  if (OVERRIDES[agent.name]) return OVERRIDES[agent.name];
  const text = `${agent.name} ${agent.role || ""} ${agent.department || ""} ${agent.organizationKey || ""}`.toLowerCase();
  for (const [re, prof] of RULES) if (re.test(text)) return prof;
  return "default";
};

/**
 * Build the live mapping from an organization state.
 * @param {object} [orgState] defaults to loadOrganizationState()
 */
function buildProfileOrgMapping(orgState = loadOrganizationState()) {
  const agents = orgState && Array.isArray(orgState.agents) ? orgState.agents : [];
  const seatToProfile = {};       // orgAgentId -> profile
  const profileToSeats = {};      // profile -> [orgAgentId]
  const nameToId = new Map();
  for (const a of agents) nameToId.set(a.name, a.id);
  for (const a of agents) {
    const prof = profileForAgent(a);
    seatToProfile[a.id] = prof;
    (profileToSeats[prof] = profileToSeats[prof] || []).push(a.id);
  }
  const primaryByProfile = {};    // profile -> orgAgentId (or null)
  for (const prof of PROFILES) {
    const name = PRIMARY_SEAT_NAMES[prof];
    primaryByProfile[prof] = name && nameToId.has(name) ? nameToId.get(name) : null;
  }
  return { seatToProfile, profileToSeats, primaryByProfile };
}

/**
 * Resolve the org agent id whose 3D character should animate for a given
 * live Desktop profile. Falls back to the FALLBACK_PROFILE's primary.
 */
function primarySeatForProfile(profileName, mapping) {
  const direct = mapping.primaryByProfile[profileName];
  if (direct) return direct;
  return mapping.primaryByProfile[FALLBACK_PROFILE] || null;
}

module.exports = {
  PROFILES,
  PRIMARY_SEAT_NAMES,
  FALLBACK_PROFILE,
  profileForAgent,
  buildProfileOrgMapping,
  primarySeatForProfile,
};
