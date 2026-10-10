import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import WebSocket from "ws";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-organization-integration-"));
  fs.mkdirSync(path.join(temp, ".hermes"));
  fs.writeFileSync(path.join(temp, ".hermes", ".env"), "API_SERVER_KEY=local-integration-api-key\n");
  const captured = [];
  const upstream = http.createServer(async (request, response) => {
    if (request.headers.authorization !== "Bearer local-integration-api-key") {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "API authentication required" } }));
      return;
    }
    if (request.url === "/v1/models") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ data: [{ id: "test" }] }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    captured.push(JSON.parse(Buffer.concat(chunks).toString()));
    response.setHeader("Content-Type", "text/event-stream");
    response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "Checked" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const reserve = net.createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  let child;
  let socket;
  let output = "";
  let nextId = 0;
  const pending = new Map();
  const start = async () => {
    child = spawn(process.execPath, ["server/hermes-gateway-adapter.js"], {
      cwd: path.resolve(testDirectory, "../.."), windowsHide: true,
      env: { ...process.env, HOME: temp, HERMES_STATE_DIR: path.join(temp, ".hermes"),
        HERMES_ADAPTER_PORT: String(port), HERMES3D_ADAPTER_TOKEN: "local-test-token",
        HERMES_API_KEY: "",
        HERMES3D_HERMES_API_URL: `http://127.0.0.1:${upstream.address().port}`, HERMES_MODEL: "test" },
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Adapter startup timed out: ${output}`)), 15000);
      child.stdout.on("data", (chunk) => { output += chunk; if (output.includes(`Listening on ws://localhost:${port}`)) { clearTimeout(timer); resolve(); } });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Adapter exited: ${code} ${output}`)); });
    });
    socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.on("message", (raw) => {
      const frame = JSON.parse(raw);
      const handler = pending.get(frame.id);
      if (handler) { clearTimeout(handler.timer); pending.delete(frame.id); handler.resolve(frame); }
    });
    await once(socket, "open");
    assert.equal((await rpc("connect", { auth: { token: "local-test-token" } })).ok, true);
  };
  const stop = async () => {
    if (socket) { socket.terminate(); socket = null; }
    if (child && child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
    child = null;
    output = "";
  };
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = String(++nextId);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 10000);
    pending.set(id, { resolve, timer });
    socket.send(JSON.stringify({ type: "req", id, method, params }));
  });
  try {
    await start();
    const create = await rpc("agents.create", { name: "Reviewer" });
    assert.equal(create.ok, true);
    const agentId = create.payload.agentId;
    assert.equal((await rpc("agents.update", { agentId, role: "QA", reportsTo: "hermes", department: "Quality", model: "test" })).ok, true);
    assert.equal((await rpc("agents.files.set", { agentId, name: "AGENTS.md", content: "ROLE-INSTRUCTION: verify every claim" })).ok, true);
    assert.equal((await rpc("organization.set", { companyName: "Integration Org", ownerName: "Owner" })).ok, true);
    assert.equal((await rpc("agents.update", { agentId: "hermes", reportsTo: agentId })).ok, false);
    assert.equal((await rpc("agents.delete", { agentId: "hermes" })).ok, true);
    await stop();
    await start();
    const list = (await rpc("agents.list")).payload.agents;
    assert.equal(list.length, 2);
    assert.equal(list.find((agent) => agent.id === agentId).reportsTo, "hermes");
    assert.equal((await rpc("organization.get")).payload.organization.companyName, "Integration Org");
    assert.match((await rpc("agents.files.get", { agentId, name: "AGENTS.md" })).payload.file.content, /ROLE-INSTRUCTION/);
    const finalReply = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Reply timed out")), 10000);
      socket.on("message", (raw) => { const frame = JSON.parse(raw); if (frame.event === "chat" && frame.payload.state === "final") { clearTimeout(timer); resolve(); } });
    });
    await rpc("chat.send", { sessionKey: `agent:${agentId}:main`, message: "Check" });
    await finalReply;
    assert.match(captured[0].messages[0].content, /ROLE-INSTRUCTION: verify every claim/);
    const orchestratorReply = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Orchestrator reply timed out")), 10000);
      socket.on("message", (raw) => { const frame = JSON.parse(raw); if (frame.event === "chat" && frame.payload.state === "final" && frame.payload.sessionKey === "agent:hermes:main") { clearTimeout(timer); resolve(); } });
    });
    await rpc("chat.send", { sessionKey: "agent:hermes:main", message: "Check identity registry access." });
    await orchestratorReply;
    assert.ok(captured.some((request) => request.tools?.some((tool) => tool.function?.name === "list_agent_identities")));
    console.log("PASS: roster and role instructions survive restart; provider receives role instructions and API authentication despite a separate gateway token; reporting cycles rejected.");
  } finally {
    await stop();
    for (const handler of pending.values()) clearTimeout(handler.timer);
    await new Promise((resolve) => upstream.close(resolve));
    const resolvedTemp = path.resolve(temp);
    assert.ok(resolvedTemp.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolvedTemp).startsWith("hermes-organization-integration-"));
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
