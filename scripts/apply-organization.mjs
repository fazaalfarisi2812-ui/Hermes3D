import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import studioSettings from "../server/studio-settings.js";
import organizationState from "../server/hermes-agent/organization-state.js";

const { loadUpstreamGatewaySettings } = studioSettings;
const { resolveOrganizationStatePath } = organizationState;

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error("Usage: node scripts/apply-organization.mjs <organization.json>");
  const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), "utf8"));
  if (!manifest.companyName || !manifest.ownerName || !Array.isArray(manifest.agents)) {
    throw new Error("Company name, owner, and agents are required.");
  }
  const keys = new Set(manifest.agents.map((agent) => agent.key));
  if (keys.size !== manifest.agents.length || !keys.has("hermes")) throw new Error("Unique role keys and hermes are required.");
  for (const agent of manifest.agents) {
    if (!agent.name || !agent.role || !Array.isArray(agent.responsibilities) || !Array.isArray(agent.deliverables)) {
      throw new Error(`Incomplete role: ${agent.key}`);
    }
    const visited = new Set([agent.key]);
    let parent = agent.managerKey;
    while (parent && parent !== "human-owner") {
      if (!keys.has(parent) || visited.has(parent)) throw new Error(`Invalid reporting line: ${agent.key}`);
      visited.add(parent);
      parent = manifest.agents.find((entry) => entry.key === parent)?.managerKey;
    }
  }

  const statePath = resolveOrganizationStatePath();
  if (fs.existsSync(statePath)) {
    const backup = `${statePath}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    fs.copyFileSync(statePath, backup);
  }
  const gateway = loadUpstreamGatewaySettings();
  const socket = new WebSocket(gateway.url);
  const pending = new Map();
  let nextId = 0;
  socket.on("message", (raw) => {
    const frame = JSON.parse(raw.toString());
    const request = pending.get(frame.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(frame.id);
    if (frame.ok) request.resolve(frame.payload);
    else request.reject(new Error(frame.error?.message || "Gateway request failed."));
  });
  socket.on("error", (error) => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = String(++nextId);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out.`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ type: "req", id, method, params }));
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.terminate(); reject(new Error("Gateway connection timed out.")); }, 10000);
      socket.once("open", () => { clearTimeout(timer); resolve(); });
      socket.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
    await request("connect", { auth: { token: gateway.token } });
    const existing = (await request("agents.list")).agents;
    const byKey = new Map();
    for (const role of manifest.agents) {
      const match = existing.find((agent) => role.key === "hermes" ? agent.id === "hermes" :
        agent.organizationKey === role.key || agent.name === role.name);
      const id = match?.id || (await request("agents.create", { name: role.name })).agentId;
      byKey.set(role.key, id);
    }
    await request("organization.set", { companyName: manifest.companyName, ownerName: manifest.ownerName });
    const roster = manifest.agents.map((role) => `${byKey.get(role.key)}: ${role.name} - ${role.role}`).join("\n");
    for (const role of manifest.agents) {
      const agentId = byKey.get(role.key);
      const manager = manifest.agents.find((entry) => entry.key === role.managerKey);
      const instructions = [
        `# ${role.name}`,
        `Perusahaan: ${manifest.companyName}. Pemilik manusia: ${manifest.ownerName}.`,
        `Jabatan: ${role.role}. Departemen: ${role.department}.`,
        `Melapor kepada: ${manager?.name || manifest.ownerName}.`,
        role.project ? `Lingkup proyek: ${role.project}. Jangan mencampur data atau akses dari proyek lain.` : "Fungsi bersama lintas proyek; pisahkan konteks setiap proyek.",
        "",
        "## Tanggung jawab",
        ...role.responsibilities.map((line) => `- ${line}`),
        "",
        "## Hasil kerja",
        ...role.deliverables.map((line) => `- ${line}`),
        "",
        "## Aturan kerja bersama",
        ...(manifest.sharedRules || []).map((line) => `- ${line}`),
        "- Tanggapi dalam bahasa Indonesia. Jelaskan hasil, bukti pemeriksaan, kendala, dan tindakan lanjut secara memadai.",
        "- Jika alat gagal, telusuri penyebab dan berikan langkah pemulihan konkret. Jangan mengaku tugas selesai tanpa bukti.",
        role.key === "hermes" ? [
          "- Gunakan list_team dan read_agent_context sebelum membagi pekerjaan. Gunakan agen yang sudah ada sesuai keahlian dan proyeknya.",
          "- Gunakan delegate_task(agent_id, message) untuk penugasan. Setiap penugasan berisi tujuan, lingkup, input, hasil yang diminta, dan kriteria penerimaan.",
          "- Gunakan configure_agent hanya untuk perubahan yang diminta pengguna. Jangan spawn_agent atau dismiss_agent untuk mengubah struktur tanpa permintaan pengguna.",
          "- Koordinasikan permintaan lintas fungsi melalui pimpinan terkait. Minta QA memeriksa hasil penting sebelum menyimpulkan pekerjaan selesai.",
          "- Delegate_task menghubungi runtime model melalui Hermes. Jangan mengaku punya akses terminal, server, atau deployment jika alat tersebut tidak tersedia.",
          "",
          "## Agen yang tersedia",
          roster,
        ].join("\n") : "- Sampaikan kebutuhan bantuan kepada Hermes melalui hasil penugasan. Hermes yang meneruskan pekerjaan lintas agen; jangan mengaku telah mengirim penugasan sendiri.",
      ].filter(Boolean).join("\n");
      await request("agents.update", {
        agentId, name: role.name, role: role.role, organizationKey: role.key,
        reportsTo: role.managerKey === "human-owner" ? "human-owner" : byKey.get(role.managerKey),
        department: role.department, project: role.project || "", hierarchyRole: role.hierarchyRole,
        responsibilities: role.responsibilities, deliverables: role.deliverables,
        ...(manifest.model ? { model: manifest.model } : {}),
        systemPrompt: `You are ${role.name}, ${role.role}. Follow the role, reporting lines, and operating rules in AGENTS.md. Give complete, evidence-based answers and concrete next steps.`,
      });
      await request("agents.files.set", { agentId, name: "AGENTS.md", content: instructions });
      console.log(`Configured ${role.name}`);
    }
    const agents = (await request("agents.list")).agents;
    for (const role of manifest.agents) {
      const agent = agents.find((entry) => entry.organizationKey === role.key);
      if (!agent || agent.name !== role.name || agent.responsibilities.length !== role.responsibilities.length) {
        throw new Error(`Verification failed: ${role.key}`);
      }
    }
    console.log(JSON.stringify({ company: manifest.companyName, configuredAgents: manifest.agents.length, totalAgents: agents.length }));
  } finally {
    for (const item of pending.values()) clearTimeout(item.timer);
    socket.close();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
