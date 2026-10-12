"use strict";
// READ-ONLY probe: verify the Hermes gateway /api/ws protocol for the Desktop mirror.
// Logs raw frames, lists + activates live sessions, prints events. Exits after a timeout.
const WebSocket = require("ws");

const fs = require("fs");
const TOKEN_FILE = process.env.MIRROR_TOKEN_FILE ||
  "C:/Users/faza0/AppData/Local/Temp/claude/C--Users-faza0-Hermes3D/c2c94f0f-1f4d-4d60-b32d-d81383550366/scratchpad/.mirror-token";
let TOKEN = "";
try { TOKEN = fs.readFileSync(TOKEN_FILE, "utf8").trim(); } catch { /* none */ }
const BASE = process.env.MIRROR_WS || "ws://127.0.0.1:9119/api/ws";
const URL = TOKEN ? `${BASE}?token=${encodeURIComponent(TOKEN)}` : BASE;
const RUN_MS = Number(process.env.MIRROR_MS || 25000);

let rpcId = 1;
const pending = new Map();
let buffer = "";
const seenTypes = new Map();

// No Origin header (Node ws omits it) so the dashboard host/origin gate trusts it.
const ws = new WebSocket(URL);

function call(method, params) {
  const id = rpcId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params: params || {} }) + "\n");
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout " + method)); } }, 10000);
  });
}

function short(v) {
  try { const s = JSON.stringify(v); return s.length > 400 ? s.slice(0, 400) + "…" : s; } catch { return String(v); }
}

async function onReady() {
  console.log("\n>>> gateway.ready received — calling session.active_list");
  try {
    const res = await call("session.active_list", {});
    console.log(">>> session.active_list RESULT:", short(res));
    const rows = Array.isArray(res) ? res : (res && (res.sessions || res.rows || res.active)) || [];
    console.log(">>> live session count:", rows.length);
    for (const row of rows) {
      const sid = typeof row === "string" ? row : (row.session_id || row.id || row.sid);
      console.log("    row:", short(row));
      if (!sid) continue;
      try { const a = await call("session.activate", { session_id: sid }); console.log(`    activated ${sid} RESULT:`, short(a)); }
      catch (e) { console.log(`    activate ${sid} FAILED: ${e.message}`); }
    }
  } catch (e) { console.log(">>> active_list FAILED:", e.message); }
}

function handleLine(line) {
  const t = line.trim(); if (!t) return;
  let msg; try { msg = JSON.parse(t); } catch { return; }
  if (msg.method === "event") {
    const p = msg.params || {};
    const type = p.type;
    seenTypes.set(type, (seenTypes.get(type) || 0) + 1);
    // Print first occurrence of each type in full, then just count
    if (seenTypes.get(type) <= 2) console.log(`EVENT ${type} sid=${p.session_id || "-"} seq=${p.seq ?? "-"} payload=${short(p.payload)}`);
    if (type === "gateway.ready") onReady();
    return;
  }
  if (msg.id !== undefined && pending.has(msg.id)) {
    const pr = pending.get(msg.id); pending.delete(msg.id);
    if (msg.error) pr.reject(new Error(msg.error.message || "rpc error")); else pr.resolve(msg.result);
    return;
  }
  if (msg.method && msg.id !== undefined) {
    console.log("SERVER->CLIENT REQUEST:", msg.method, short(msg.params));
    try { ws.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { ok: false, observer: true } }) + "\n"); } catch {}
  }
}

let rawLogged = 0;
ws.on("open", () => console.log("WS OPEN:", BASE, TOKEN ? "(token=<redacted>)" : "(no token)"));
ws.on("message", (d) => {
  const s = d.toString("utf8");
  if (rawLogged < 3) { console.log("RAW MSG:", s.length > 300 ? s.slice(0, 300) + "…" : s); rawLogged++; }
  // Each WS message may be one JSON frame or several newline-delimited frames.
  for (const line of s.split("\n")) handleLine(line);
});
ws.on("close", (c, r) => console.log("WS CLOSE", c, r && r.toString()));
ws.on("error", (e) => console.log("WS ERROR:", e.message));

setTimeout(() => {
  console.log("\n=== EVENT TYPE SUMMARY ===");
  for (const [t, n] of [...seenTypes.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${n}`);
  try { ws.close(); } catch {}
  process.exit(0);
}, RUN_MS);
