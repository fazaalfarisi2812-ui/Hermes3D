import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const statePath = path.join(os.homedir(), ".hermes", "hermes3d", "agent-identity-registry.json");
const existed = fs.existsSync(statePath);
const original = existed ? fs.readFileSync(statePath) : null;
const endpoint = "http://localhost:3001/api/agent-identities";

const action = async (payload) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(response.ok, true, body.error || `Agent identity action ${payload.action} failed.`);
  return body;
};

try {
  const response = await fetch(endpoint, { cache: "no-store" });
  assert.equal(response.ok, true, "Agent Identity Registry API must be available.");
  const { registry, workflows, capabilities, agents } = await response.json();
  assert.ok(registry?.identities?.length, "Agent Identity Registry must expose identities.");
  assert.ok(registry?.delegations?.length, "Agent Identity Registry must expose workflow mandates.");
  assert.ok(workflows?.length && capabilities?.length && agents?.length, "Registry must receive organization, workflow, and capability context.");
  const personalResearch = registry.identities.find((identity) => identity.agentKey === "personal-research") || registry.identities[0];

  const changed = await action({
    action: "set_identity_lifecycle",
    identityId: personalResearch.id,
    lifecycle: "review",
    statusNote: "Temporary API verification.",
  });
  const identity = changed.registry.identities.find((entry) => entry.id === personalResearch.id);
  assert.equal(identity.lifecycle, "review");
  assert.ok(changed.registry.auditEvents.some((event) => event.type === "identity_lifecycle_changed"));
  console.log("PASS: Agent Identity Registry API loads identities and persists an auditable lifecycle review.");
} finally {
  if (existed && original) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, original);
  } else {
    fs.rmSync(statePath, { force: true });
  }
}
