import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const stateDirectory = path.join(os.homedir(), ".hermes", "hermes3d");
const capabilityPath = path.join(stateDirectory, "capability-registry.json");
const operationsPath = path.join(stateDirectory, "operations-loop.json");
const originalCapability = fs.existsSync(capabilityPath) ? fs.readFileSync(capabilityPath) : null;
const originalOperations = fs.existsSync(operationsPath) ? fs.readFileSync(operationsPath) : null;

const capabilityEndpoint = "http://localhost:3001/api/capability-registry";
const operationsEndpoint = "http://localhost:3001/api/operations-loop";

const restore = (filePath, original) => {
  if (original) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, original);
  } else {
    fs.rmSync(filePath, { force: true });
  }
};

try {
  const currentResponse = await fetch(capabilityEndpoint, { cache: "no-store" });
  assert.equal(currentResponse.ok, true, "Capability Registry API must be available.");
  const { registry } = await currentResponse.json();
  const production = registry.capabilities.find((capability) => capability.id === "erpnext-production");
  assert.ok(production, "Production ERP capability must exist for the policy check.");

  const updateResponse = await fetch(capabilityEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "update_capability",
      capabilityId: production.id,
      patch: {
        ...production,
        workflowIds: ["personal-daily-planning"],
        ownerKey: "personal-assistant",
        allowedAgentKeys: ["personal-assistant"],
        status: "unverified",
        enforcement: "block",
        statusNote: "Temporary policy integration verification.",
      },
    }),
  });
  const updateBody = await updateResponse.json();
  assert.equal(updateResponse.ok, true, updateBody.error || "Could not configure temporary blocking policy.");

  const routeResponse = await fetch(operationsEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "create_signal",
      title: "Temporary policy routing test",
      description: "This request must be rejected by the blocked capability policy.",
      source: "manual",
      priority: "normal",
      workflowId: "personal-daily-planning",
    }),
  });
  const routeBody = await routeResponse.json();
  assert.equal(routeResponse.status, 400, "A blocking capability must reject routing.");
  assert.match(routeBody.error || "", /Capability routing diblokir/);
  console.log("PASS: Operations routing is rejected when a required blocking capability is not verified.");
} finally {
  restore(capabilityPath, originalCapability);
  restore(operationsPath, originalOperations);
}
