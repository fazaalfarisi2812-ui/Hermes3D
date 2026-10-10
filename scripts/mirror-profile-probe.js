"use strict";
// Find where a live session's PROFILE comes from (for mirror character binding).
const WebSocket = require("ws");
const fs = require("fs");
let TOKEN = "";
try { TOKEN = fs.readFileSync("C:/Users/faza0/.hermes/hermes3d/.mirror-token", "utf8").trim(); } catch {}
const BASE = process.env.MIRROR_WS || "ws://127.0.0.1:9119/api/ws";
const ws = new WebSocket(TOKEN ? `${BASE}?token=${encodeURIComponent(TOKEN)}` : BASE);
let rpcId = 1; const pending = new Map();
const call = (m, p) => new Promise((res, rej) => {
  const id = rpcId++; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ jsonrpc: "2.0", id, method: m, params: p || {} }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error("timeout " + m)); } }, 12000);
});
const dump = (label, v) => {
  const s = JSON.stringify(v, null, 1);
  console.log(`\n--- ${label} ---\n` + (s && s.length > 2500 ? s.slice(0, 2500) + "\n…(truncated)" : s));
};
ws.on("message", (d) => {
  for (const line of d.toString("utf8").split("\n")) {
    const t = line.trim(); if (!t) continue;
    let m; try { m = JSON.parse(t); } catch { continue; }
    if (m.method === "event" && m.params && m.params.type === "gateway.ready") { void run(); continue; }
    if (m.id !== undefined && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message || "rpc error")); else p.res(m.result);
    }
  }
});
ws.on("error", (e) => { console.log("WS ERROR:", e.message); process.exit(1); });

async function run() {
  // Which methods expose a profile?
  for (const m of ["config.get", "status", "session.list"]) {
    try { const r = await call(m, m === "session.list" ? { limit: 3 } : {}); dump(m, r); }
    catch (e) { console.log(`${m} FAILED: ${e.message}`); }
  }
  try {
    const act = await call("session.active_list", {});
    const sid = act.sessions && act.sessions[0] && act.sessions[0].id;
    if (sid) { const info = await call("session.activate", { session_id: sid }); dump(`session.activate(${sid})`, info); }
  } catch (e) { console.log("activate probe failed:", e.message); }
  process.exit(0);
}
setTimeout(() => process.exit(0), 40000);
