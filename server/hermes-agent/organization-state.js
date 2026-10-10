"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { resolveStateDir } = require("../studio-settings");

function resolveOrganizationStatePath(env = process.env) {
  return path.join(resolveStateDir(env), "hermes3d", "organization-state.json");
}

function validateOrganizationState(state) {
  if (state?.version !== 1 || !Array.isArray(state.agents) || !Array.isArray(state.files)) {
    throw new Error("Invalid Hermes3D organization state.");
  }
  const ids = new Set();
  for (const agent of state.agents) {
    if (!agent || typeof agent.id !== "string" || !agent.id || ids.has(agent.id) ||
        typeof agent.name !== "string" || !agent.settings || typeof agent.settings.model !== "string") {
      throw new Error("Invalid or duplicate organization agent.");
    }
    ids.add(agent.id);
  }
  if (!ids.has("hermes")) throw new Error("The Hermes orchestrator is required.");
  for (const agent of state.agents) {
    const visited = new Set([agent.id]);
    let parentId = agent.reportsTo;
    while (parentId && parentId !== "human-owner") {
      if (!ids.has(parentId)) throw new Error(`Reporting manager not found: ${parentId}`);
      if (visited.has(parentId)) throw new Error("Organization reporting lines contain a cycle.");
      visited.add(parentId);
      parentId = state.agents.find((entry) => entry.id === parentId)?.reportsTo;
    }
  }
  for (const entry of state.files) {
    if (!Array.isArray(entry) || entry.length !== 2 || entry.some((value) => typeof value !== "string")) {
      throw new Error("Invalid organization agent file.");
    }
  }
  return state;
}

function loadOrganizationState(filePath = resolveOrganizationStatePath()) {
  if (!fs.existsSync(filePath)) return null;
  return validateOrganizationState(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function saveOrganizationState(state, filePath = resolveOrganizationStatePath()) {
  validateOrganizationState(state);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

module.exports = { resolveOrganizationStatePath, validateOrganizationState, loadOrganizationState, saveOrganizationState };
