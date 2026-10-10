import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const stateDirectory = path.join(os.homedir(), ".hermes", "hermes3d");
const identityPath = path.join(stateDirectory, "agent-identity-registry.json");
const operationsPath = path.join(stateDirectory, "operations-loop.json");
const originalIdentity = fs.existsSync(identityPath) ? fs.readFileSync(identityPath) : null;
const originalOperations = fs.existsSync(operationsPath) ? fs.readFileSync(operationsPath) : null;
const identityEndpoint = "http://localhost:3001/api/agent-identities";
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
  const currentResponse = await fetch(identityEndpoint, { cache: "no-store" });
  assert.equal(currentResponse.ok, true, "Agent Identity Registry API must be available.");
  const { registry } = await currentResponse.json();
  const personal = registry.identities.find((identity) => identity.agentKey === "personal-assistant");
  assert.ok(personal, "Personal Assistant identity must exist for policy verification.");

  const updateResponse = await fetch(identityEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "set_identity_lifecycle",
      identityId: personal.id,
      lifecycle: "suspended",
      statusNote: "Temporary routing policy verification.",
    }),
  });
  const updateBody = await updateResponse.json();
  assert.equal(updateResponse.ok, true, updateBody.error || "Could not suspend the temporary identity policy.");

  const routeResponse = await fetch(operationsEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "create_signal",
      title: "Temporary identity policy routing test",
      description: "This request must be rejected by the suspended agent identity.",
      source: "manual",
      priority: "normal",
      workflowId: "personal-daily-planning",
    }),
  });
  const routeBody = await routeResponse.json();
  assert.equal(routeResponse.status, 400, "A suspended identity must reject routing.");
  assert.match(routeBody.error || "", /Agent identity and delegation blocked routing/);
  assert.match(routeBody.error || "", /berstatus suspended/);
  console.log("PASS: Operations routing is rejected when the workflow owner identity is suspended.");
} finally {
  restore(identityPath, originalIdentity);
  restore(operationsPath, originalOperations);
}
