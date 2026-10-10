import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const statePath = path.join(os.homedir(), ".hermes", "hermes3d", "capability-registry.json");
const existed = fs.existsSync(statePath);
const original = existed ? fs.readFileSync(statePath) : null;
const endpoint = "http://localhost:3001/api/capability-registry";

const action = async (payload) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(response.ok, true, body.error || `Capability action ${payload.action} failed.`);
  return body;
};

try {
  const response = await fetch(endpoint, { cache: "no-store" });
  assert.equal(response.ok, true, "Capability Registry API must be available.");
  const { registry, workflows, agents } = await response.json();
  assert.ok(registry?.capabilities?.length, "Capability Registry must expose the default capabilities.");
  assert.ok(workflows?.length, "Capability Registry must receive workflows for linkage.");
  assert.ok(agents?.length, "Capability Registry must receive the organization roster.");
  assert.ok(registry.capabilities.some((capability) => capability.id === "erpnext-production"), "Production ERP capability must be registered.");

  const changed = await action({
    action: "set_status",
    capabilityId: "erpnext-development",
    status: "degraded",
    statusNote: "Temporary API verification.",
  });
  const capability = changed.registry.capabilities.find((entry) => entry.id === "erpnext-development");
  assert.equal(capability.status, "degraded");
  assert.ok(changed.registry.auditEvents.some((event) => event.type === "capability_status_changed"));
  console.log("PASS: Capability Registry API loads governed assets and persists auditable status changes.");
} finally {
  if (existed && original) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, original);
  } else {
    fs.rmSync(statePath, { force: true });
  }
}
