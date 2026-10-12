import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import organizationState from "../server/hermes-agent/organization-state.js";

const { loadOrganizationState, saveOrganizationState } = organizationState;
const stateDir = path.join(os.homedir(), ".hermes", "hermes3d");
const configPath = path.join(stateDir, "company-organization.json");
const startMarker = "<!-- Faza AI HQ Operating Model: START -->";
const endMarker = "<!-- Faza AI HQ Operating Model: END -->";

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const stripPolicyBlock = (value) => {
  const pattern = new RegExp(
    `\\n?${startMarker}[\\s\\S]*?${endMarker}\\n?`,
    "g",
  );
  return value.replace(pattern, "").trimEnd();
};

const buildPolicyBlock = ({ definition, organization }) => {
  const project = (organization.projects || []).find((entry) => entry.name === definition.project);
  const projectRule = definition.project && project?.status === "inactive"
    ? `- Proyek ${definition.project} sedang nonaktif. Jangan menerima atau menjalankan pekerjaan baru; pertahankan konteks hanya untuk arsip, audit, handover, atau reaktivasi setelah Faza mengaktifkannya kembali.`
    : definition.project
    ? `- Data, tools, dan keputusan ${definition.project} tetap berada dalam lingkup proyek itu; jangan memakai konteks proyek lain tanpa mandat eksplisit.`
    : "- Jaga pemisahan konteks pribadi, rumah tangga, perusahaan, dan tiap proyek saat mengolah informasi atau memberi rekomendasi.";
  const lifecycleRule = definition.key === "agent-recruitment"
    ? "- Buat role brief, success criteria, evaluasi kapasitas, dan proposal lifecycle; jangan membuat, menghapus, memindahkan, atau mengubah agent tanpa persetujuan Faza."
    : "- Usulkan kebutuhan agent baru, perubahan peran, atau retirement kepada Agent Recruitment & Lifecycle; jangan mengubah roster sendiri.";
  const inactiveProjects = (organization.projects || []).filter((entry) => entry.status === "inactive").map((entry) => entry.name);
  const orchestrationRule = definition.key === "hermes"
    ? `- Pilih hanya agent yang relevan, tetapkan satu owner, dan satukan hasilnya. Jangan menjalankan semua agent hanya karena mereka tersedia.${inactiveProjects.length ? ` Jangan delegasikan pekerjaan baru ke proyek nonaktif: ${inactiveProjects.join(", ")}.` : ""}`
    : "- Koordinasikan lintas fungsi melalui manager dan Hermes bila pekerjaan melampaui mandat atau memerlukan keputusan pemilik.";

  return [
    startMarker,
    "## Model Operasi Faza AI HQ",
    `- Prinsip: ${organization.operatingModel.summary}`,
    "- Mandiri terbatas: analisis, riset, perencanaan, draf, dan pekerjaan rendah risiko yang dapat diuji serta dibatalkan dalam mandat peran.",
    "- Wajib persetujuan Faza: anggaran atau transaksi, kontrak, akses atau secrets, perubahan roster agent, komunikasi atau publikasi eksternal, keputusan medis atau legal, serta deployment produksi.",
    "- Hentikan dan eskalasikan bila mandat, izin, data sensitif, risiko, atau bukti tidak jelas. Sertakan blocker, dampak, pilihan, dan rekomendasi.",
    "- Hasil penting harus memuat tujuan, owner, lingkup, asumsi, sumber atau bukti, perubahan, validasi, risiko, dan langkah lanjut.",
    projectRule,
    lifecycleRule,
    orchestrationRule,
    endMarker,
  ].join("\n");
};

const config = readJson(configPath);
const state = loadOrganizationState();

if (!state) throw new Error("Organization state has not been created yet.");
if (!config.operatingModel || !Array.isArray(config.agents) || !Array.isArray(config.projects)) {
  throw new Error("The organization configuration is missing its operating model, projects, or agents.");
}

const projects = config.projects.map((project) => {
  if (!project || typeof project.key !== "string" || !project.key ||
      typeof project.name !== "string" || !project.name) {
    throw new Error("Each organization project requires a key and name.");
  }
  return {
    key: project.key,
    name: project.name,
    status: project.status === "inactive" ? "inactive" : "active",
    focus: typeof project.focus === "string" ? project.focus : "",
  };
});
const projectStatusByName = new Map(projects.map((project) => [project.name, project.status]));

const definitionByKey = new Map(config.agents.map((entry) => [entry.key, entry]));
const agentByKey = new Map(state.agents.map((entry) => [entry.organizationKey, entry]));
const missing = config.agents.filter((entry) => !agentByKey.has(entry.key)).map((entry) => entry.key);
if (missing.length) {
  throw new Error(`Cannot synchronize missing organization agents: ${missing.join(", ")}`);
}

for (const agent of state.agents) {
  const definition = definitionByKey.get(agent.organizationKey);
  if (!definition) continue;
  agent.name = definition.name;
  agent.role = definition.role;
  agent.department = definition.department;
  agent.project = definition.project || "";
  if (definition.project && !projectStatusByName.has(definition.project)) {
    throw new Error(`Project is missing from organization configuration: ${definition.project}`);
  }
  agent.projectStatus = definition.project ? projectStatusByName.get(definition.project) : "active";
  agent.hierarchyRole = definition.hierarchyRole;
  agent.responsibilities = definition.responsibilities;
  agent.deliverables = definition.deliverables;
  agent.reportsTo = definition.managerKey === "human-owner"
    ? "human-owner"
    : agentByKey.get(definition.managerKey)?.id || agent.reportsTo;
}

state.organization = {
  ...(state.organization || {}),
  companyName: config.companyName,
  ownerName: config.ownerName,
  operatingModel: config.operatingModel,
  projects,
};

const files = new Map(state.files);
for (const agent of state.agents) {
  const definition = definitionByKey.get(agent.organizationKey);
  if (!definition) continue;
  const fileKey = `${agent.id}/AGENTS.md`;
  const existing = files.get(fileKey) || "";
  files.set(fileKey, `${stripPolicyBlock(existing)}\n\n${buildPolicyBlock({ definition, organization: state.organization })}\n`);
}
state.files = [...files.entries()];
state.updatedAt = new Date().toISOString();

saveOrganizationState(state);
console.log(`Synchronized operating model for ${state.agents.length} agents at ${state.updatedAt}.`);
