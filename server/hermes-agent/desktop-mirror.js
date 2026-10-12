"use strict";

/**
 * Desktop Mirror — read-only observer that reflects live Hermes Desktop
 * sessions into the Hermes3D 3D office.
 *
 * It discovers the loopback `/api/ws` gateways of local Hermes backends
 * (the Desktop's `hermes serve`, dashboards, the machine gateway), connects to
 * each that authenticates with the shared session token, co-watches every live
 * session via `session.activate` (additive FanoutTransport — never displaces the
 * Desktop), learns each session's `profile_name` from the `session.info` event,
 * maps the profile to its primary org seat, and translates gateway turn events
 * into the `event:"agent"` runtime-agent frames the Hermes3D frontend consumes.
 *
 * It submits NO prompts and mutates nothing: strictly a mirror.
 */

const WebSocket = require("ws");
const { execFile } = require("child_process");
const {
  buildProfileOrgMapping,
  primarySeatForProfile,
} = require("./profile-org-mapping");

const MAIN_KEY = "main";
const sessionKeyFor = (agentId) => `agent:${agentId}:${MAIN_KEY}`;
const pick = (obj, ...keys) => {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
};

// Loopback Hermes backends: [{ port, profile }]. A gateway process serves one
// profile (its HERMES_HOME), so the profile is read from its command line.
// Windows-only; returns [] on any failure.
function discoverGateways() {
  return new Promise((resolve) => {
    // Single-quote only (nested double quotes break execFile arg passing).
    const ps =
      "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | " +
      "Where-Object { $_.LocalAddress -match '127.0.0.1|::1' } | " +
      "ForEach-Object { $procId = $_.OwningProcess; $p = Get-Process -Id $procId -ErrorAction SilentlyContinue; " +
      "if ($p -and $p.Name -eq 'python') { " +
      "$cl = (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $procId) -ErrorAction SilentlyContinue).CommandLine; " +
      "$prof = 'default'; " +
      "if ($cl -match '-p\\s+([A-Za-z0-9_.-]+)') { $prof = $Matches[1] } " +
      "elseif ($cl -match 'profiles[\\\\/]([A-Za-z0-9_.-]+)') { $prof = $Matches[1] }; " +
      "\"$($_.LocalPort)|$prof\" } } | Sort-Object -Unique";
    execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { timeout: 12000, windowsHide: true },
      (err, stdout) => {
        if (!stdout) { resolve([]); return; }
        const out = [];
        const seen = new Set();
        for (const line of stdout.split(/\r?\n/)) {
          const [portRaw, profRaw] = line.trim().split("|");
          const port = parseInt(portRaw, 10);
          if (!(port > 0) || seen.has(port)) continue;
          seen.add(port);
          out.push({ port, profile: (profRaw || "default").trim() || "default" });
        }
        resolve(out);
      });
  });
}

/**
 * @param {object} opts
 * @param {string} opts.token  shared session token (HERMES_DASHBOARD_SESSION_TOKEN)
 * @param {(frame: object) => void} opts.emit
 * @param {(msg: string) => void} [opts.log]
 * @param {() => object|null} [opts.loadOrg]
 * @param {number} [opts.rediscoverMs] re-scan interval (default 12000)
 */
function startDesktopMirror(opts) {
  const token = opts.token || "";
  const emit = opts.emit;
  const log = opts.log || (() => {});
  const rediscoverMs = opts.rediscoverMs || 12000;
  let mapping = buildProfileOrgMapping(opts.loadOrg ? opts.loadOrg() : undefined);
  let stopped = false;

  const conns = new Map(); // port -> conn
  const sessions = new Map(); // `${port}:${sid}` -> { profile, agentId, runId, running }
  let runSeq = 0;

  const skey = (port, sid) => `${port}:${sid}`;
  // A gateway process serves ONE profile (its HERMES_HOME), so a session binds
  // to its connection's profile unless a session.info says otherwise.
  const ensureSession = (port, sid) => {
    const k = skey(port, sid);
    let s = sessions.get(k);
    if (!s) {
      const conn = conns.get(port);
      const profile = (conn && conn.profile) || "default";
      s = { profile, agentId: primarySeatForProfile(profile, mapping), runId: null, running: false };
      sessions.set(k, s);
      log(`[${port}] ${sid} -> profile=${profile} agent=${s.agentId}`);
    }
    return s;
  };

  function emitAgent(s, stream, data) {
    if (!s.agentId) return;
    emit({ type: "event", event: "agent", payload: { sessionKey: sessionKeyFor(s.agentId), runId: s.runId || undefined, stream, data } });
  }
  function startRun(s) {
    if (!s.agentId || s.running) { if (s.agentId && !s.runId) s.runId = "mirror-" + (++runSeq); return; }
    if (!s.runId) s.runId = "mirror-" + (++runSeq);
    s.running = true;
    emitAgent(s, "lifecycle", { phase: "start" });
  }
  function endRun(s, phase) {
    if (s.agentId && s.running) emitAgent(s, "lifecycle", { phase: phase || "end" });
    s.running = false; s.runId = null;
  }

  // Seed/refresh a session's profile -> org-seat binding. Fed by the
  // `session.info` event AND by the `session.activate` RPC result, so a
  // session that is idle at connect time still binds to its character.
  function applySessionInfo(conn, sid, payload) {
    if (!payload || typeof payload !== "object") return;
    const s = ensureSession(conn.port, sid);
    const profile = pick(payload, "profile_name", "profile");
    if (profile && profile !== s.profile) {
      s.profile = profile;
      s.agentId = primarySeatForProfile(profile, mapping);
      log(`[${conn.port}] ${sid} -> profile=${profile} agent=${s.agentId}`);
    }
    const running = pick(payload, "running");
    if (running === true) startRun(s);
    else if (running === false) endRun(s, "end");
  }

  function onEvent(conn, params) {
    const type = params && params.type;
    const sid = params && params.session_id;
    const payload = (params && params.payload) || {};
    if (!sid) {
      if (type === "gateway.ready") { conn.ready = true; onReady(conn); return; }
      if (type === "sessions.changed" || type === "session.active_list.changed") { scheduleRefresh(conn); return; }
      return;
    }
    const s = ensureSession(conn.port, sid);
    switch (type) {
      case "session.info": applySessionInfo(conn, sid, payload); break;
      case "message.start": startRun(s); break;
      case "thinking.delta":
      case "reasoning.delta": startRun(s); emitAgent(s, "reasoning", { delta: pick(payload, "text", "delta") || "" }); break;
      case "message.delta": startRun(s); emitAgent(s, "assistant", { delta: pick(payload, "text", "delta") || "" }); break;
      case "message.interim": startRun(s); emitAgent(s, "assistant", { delta: pick(payload, "text") || "" }); break;
      case "tool.start":
      case "tool.generating":
        startRun(s);
        emitAgent(s, "tool", { phase: "start", name: pick(payload, "name"), toolCallId: pick(payload, "tool_id", "toolCallId"), arguments: pick(payload, "args", "arguments", "input") });
        break;
      case "tool.complete":
        emitAgent(s, "tool", { phase: "result", name: pick(payload, "name"), toolCallId: pick(payload, "tool_id", "toolCallId"), result: pick(payload, "result", "summary"), isError: Boolean(pick(payload, "is_error", "isError")) });
        break;
      case "message.complete": endRun(s, "end"); break;
      case "error": endRun(s, "error"); break;
      case "session.closed":
      case "session.ended": endRun(s, "end"); sessions.delete(skey(conn.port, sid)); break;
      default: break;
    }
  }

  function call(conn, method, params) {
    return new Promise((resolve, reject) => {
      if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) { reject(new Error("ws not open")); return; }
      const id = conn.rpcId++;
      conn.pending.set(id, { resolve, reject });
      conn.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params: params || {} }));
      setTimeout(() => { if (conn.pending.has(id)) { conn.pending.delete(id); reject(new Error("rpc timeout: " + method)); } }, 15000);
    });
  }

  // `sessions.changed` fires many times during a turn. The backend is busy
  // running the real agent, so coalesce refreshes instead of issuing an RPC
  // per event (which starved the Desktop's own calls).
  const REFRESH_MIN_MS = 20000;
  function scheduleRefresh(conn) {
    if (conn.refreshTimer) return;
    const since = Date.now() - (conn.lastRefresh || 0);
    const wait = since >= REFRESH_MIN_MS ? 250 : REFRESH_MIN_MS - since;
    conn.refreshTimer = setTimeout(() => {
      conn.refreshTimer = null;
      if (conn.ws && conn.ws.readyState === WebSocket.OPEN) refreshActive(conn);
    }, wait);
  }

  async function refreshActive(conn) {
    conn.lastRefresh = Date.now();
    try {
      const res = await call(conn, "session.active_list", {});
      const rows = Array.isArray(res) ? res : (res && (res.sessions || res.rows || res.active)) || [];
      if (rows.length) log(`[${conn.port}] active sessions: ${rows.length}`);
      for (const row of rows) {
        const sid = typeof row === "string" ? row : pick(row, "session_id", "id", "sid");
        if (!sid) continue;
        const s = ensureSession(conn.port, sid);
        // active_list reports "working" | "idle" — seed it so a session that is
        // mid-turn when we attach shows as working instead of waiting for a delta.
        const rowStatus = typeof row === "object" ? pick(row, "status") : undefined;
        if (rowStatus === "working") startRun(s);
        else if (rowStatus === "idle") endRun(s, "end");
        // Activate ONCE per session: the gateway is busy running the real turn,
        // and re-activating on every sessions.changed just causes RPC timeouts.
        if (conn.activated.has(sid)) continue;
        conn.activated.add(sid);
        try {
          const info = await call(conn, "session.activate", { session_id: sid });
          applySessionInfo(conn, sid, (info && (info.session || info.info)) || info);
        } catch (e) {
          conn.activated.delete(sid); // allow a retry on the next change
          log(`[${conn.port}] activate ${sid} failed: ${e.message}`);
        }
      }
    } catch (e) { log(`[${conn.port}] active_list failed: ${e.message}`); }
  }

  function onReady(conn) {
    log(`[${conn.port}] gateway.ready`);
    try { mapping = buildProfileOrgMapping(opts.loadOrg ? opts.loadOrg() : undefined); } catch { /* keep */ }
    refreshActive(conn);
  }

  function handleLine(conn, line) {
    const t = line.trim(); if (!t) return;
    let msg; try { msg = JSON.parse(t); } catch { return; }
    if (msg.method === "event") { onEvent(conn, msg.params || {}); return; }
    if (msg.id !== undefined && conn.pending.has(msg.id)) {
      const p = conn.pending.get(msg.id); conn.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || "rpc error")); else p.resolve(msg.result);
      return;
    }
    // Server->client request (approval / clarify / session.control.read). A mirror
    // NEVER answers these: it does not advertise client.capabilities, and replying
    // could consume a response the real Desktop client is waiting for.
    // Silently ignore.
  }

  function dropConn(port) {
    const conn = conns.get(port);
    if (!conn) return;
    if (conn.refreshTimer) { clearTimeout(conn.refreshTimer); conn.refreshTimer = null; }
    for (const [k, s] of sessions) if (k.startsWith(port + ":")) { if (s.running) endRun(s, "end"); sessions.delete(k); }
    for (const [, p] of conn.pending) { try { p.reject(new Error("closed")); } catch { /* noop */ } }
    conn.pending.clear();
    try { if (conn.ws) conn.ws.close(); } catch { /* noop */ }
    conns.delete(port);
  }

  function connect(port, profile) {
    if (stopped || conns.has(port)) return;
    const conn = { port, profile: profile || "default", ws: null, rpcId: 1, pending: new Map(), ready: false, activated: new Set(), refreshTimer: null, lastRefresh: 0 };
    conns.set(port, conn);
    const base = `ws://127.0.0.1:${port}/api/ws`;
    const url = token ? `${base}?token=${encodeURIComponent(token)}` : base;
    try { conn.ws = new WebSocket(url); } catch (e) { log(`[${port}] connect threw: ${e.message}`); conns.delete(port); return; }
    conn.ws.on("message", (d) => { for (const line of d.toString("utf8").split("\n")) handleLine(conn, line); });
    conn.ws.on("close", () => { if (!conn.ready) log(`[${port}] closed before ready (not a mirror gateway)`); dropConn(port); });
    conn.ws.on("error", () => { /* 403/404/ECONNREFUSED — not a usable gateway; close handler cleans up */ });
  }

  let timer = null;
  async function scan() {
    if (stopped) return;
    const found = await discoverGateways();
    const ports = found.map((g) => g.port);
    for (const g of found) if (!conns.has(g.port)) connect(g.port, g.profile);
    // drop connections whose port vanished
    for (const port of [...conns.keys()]) if (!ports.includes(port)) dropConn(port);
  }

  scan();
  timer = setInterval(scan, rediscoverMs);

  return {
    stop() {
      stopped = true;
      if (timer) { clearInterval(timer); timer = null; }
      for (const port of [...conns.keys()]) dropConn(port);
    },
    status() {
      return {
        connections: [...conns.values()].map((c) => ({ port: c.port, ready: c.ready })),
        sessions: [...sessions.entries()].map(([k, s]) => ({ key: k, profile: s.profile, agentId: s.agentId, running: s.running })),
      };
    },
  };
}

module.exports = { startDesktopMirror, discoverGateways };
