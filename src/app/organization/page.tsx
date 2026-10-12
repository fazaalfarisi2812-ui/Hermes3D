import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "@/lib/hermes/paths";
import { OrganizationDirectory } from "@/features/organization/OrganizationDirectory";
import type {
  OrganizationAgent,
  OrganizationAgenticModel,
  OrganizationAgenticLayer,
  OrganizationAgenticRole,
  OrganizationDirectoryData,
  OrganizationOperatingModel,
  OrganizationOperatingModelItem,
  OrganizationProject,
  OrganizationRoom,
} from "@/features/organization/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StoredAgent = Partial<OrganizationAgent>;

const toOperatingModelItems = (value: unknown): OrganizationOperatingModelItem[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const { label, detail } = entry as Record<string, unknown>;
        return typeof label === "string" && typeof detail === "string" && label && detail
          ? [{ label, detail }]
          : [];
      })
    : [];

const readOperatingModel = (value: unknown): OrganizationOperatingModel | null => {
  if (!value || typeof value !== "object") return null;
  const model = value as Record<string, unknown>;
  const title = typeof model.title === "string" ? model.title : "";
  const summary = typeof model.summary === "string" ? model.summary : "";
  const authority = toOperatingModelItems(model.authority);
  const controls = toOperatingModelItems(model.controls);
  const escalationPath = Array.isArray(model.escalationPath)
    ? model.escalationPath.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
  return title && summary && (authority.length > 0 || controls.length > 0 || escalationPath.length > 0)
    ? { title, summary, authority, controls, escalationPath }
    : null;
};

const readProjects = (value: unknown): OrganizationProject[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const project = entry as Record<string, unknown>;
        if (typeof project.key !== "string" || !project.key ||
            typeof project.name !== "string" || !project.name) return [];
        return [{
          key: project.key,
          name: project.name,
          status: project.status === "inactive" ? "inactive" : "active",
          focus: typeof project.focus === "string" ? project.focus : "",
        }];
      })
    : [];

const roomKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shared";

const buildRooms = (agents: StoredAgent[], projects: OrganizationProject[]): OrganizationRoom[] => {
  const activeAgentIds = agents
    .filter((agent) => agent.id && agent.projectStatus !== "inactive")
    .map((agent) => agent.id as string);
  const rooms: OrganizationRoom[] = [{
    key: "command-center",
    name: "Faza Command Center",
    kind: "command",
    description: "Ruang lintas fungsi untuk tujuan utama, prioritas, inbox, dan eskalasi manusia.",
    status: "active",
    memberAgentIds: activeAgentIds,
  }];

  for (const project of projects) {
    const memberAgentIds = agents
      .filter((agent) => agent.project === project.name)
      .map((agent) => agent.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (!memberAgentIds.length) continue;
    rooms.push({
      key: `project-${roomKey(project.key)}`,
      name: `${project.name} room`,
      kind: "project",
      description: project.focus || `Ruang tim untuk outcome project ${project.name}.`,
      status: project.status,
      memberAgentIds,
    });
  }

  const governanceMembers = agents
    .filter((agent) => /quality|audit|risk|governance|security|legal|compliance|critic|guardrail/i.test(`${agent.role || ""} ${agent.department || ""} ${agent.organizationKey || ""}`))
    .map((agent) => agent.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (governanceMembers.length) {
    rooms.push({
      key: "governance-control",
      name: "Governance & Control room",
      kind: "governance",
      description: "Ruang reviewer independen untuk kualitas, risiko, keamanan, kepatuhan, dan bukti keputusan.",
      status: "active",
      memberAgentIds: governanceMembers,
    });
  }

  const sharedByDepartment = new Map<string, string[]>();
  for (const agent of agents) {
    if (!agent.id || agent.project || agent.projectStatus === "inactive") continue;
    const department = agent.department || "Shared services";
    const members = sharedByDepartment.get(department) || [];
    members.push(agent.id);
    sharedByDepartment.set(department, members);
  }
  for (const [department, memberAgentIds] of sharedByDepartment) {
    rooms.push({
      key: `function-${roomKey(department)}`,
      name: `${department} room`,
      kind: "function",
      description: `Ruang fungsi untuk pekerjaan bersama di ${department}.`,
      status: "active",
      memberAgentIds,
    });
  }
  return rooms;
};

const defaultAgenticModel: OrganizationAgenticModel = {
  title: "Agentic operating model",
  summary: "Tim agent bekerja sebagai jaringan berbasis hasil: agent memiliki mandat, jalur pelaporan, batas keputusan, kontrol kualitas, dan pemilik manusia yang jelas.",
  pillars: [
    { label: "Model bisnis dan hasil", detail: "Setiap project dan workflow dimulai dari outcome yang ingin dicapai, bukan sekadar daftar aktivitas agent." },
    { label: "Model operasi", detail: "Hermes mengorkestrasi; supervisor mengatur kapasitas dan handoff; specialist mengerjakan domain; kontrol independen menantang hasil." },
    { label: "Governance", detail: "Identity, delegation, approval, evidence, audit, rollback, dan oversight menjadi bagian dari alur kerja, bukan pemeriksaan setelah kejadian." },
    { label: "People dan culture", detail: "Faza tetap pemilik keputusan akhir; manusia mengarahkan outcome, menangani pengecualian, dan memperbaiki sistem kerja agent." },
    { label: "Teknologi dan data", detail: "System of record, capability, data boundary, readiness, dan observability menentukan kapan agent boleh bertindak." },
  ],
  teamRoles: [
    { label: "Orchestrator", detail: "Menerjemahkan tujuan lintas fungsi, memilih tim, menyatukan hasil, dan mengeskalasikan keputusan." },
    { label: "Supervisor", detail: "Menjaga prioritas, kapasitas, kualitas handoff, dan akuntabilitas outcome di suatu fungsi atau portfolio." },
    { label: "Specialist", detail: "Mengerjakan analisis atau eksekusi domain sesuai scope project, capability, dan span of agency." },
    { label: "Critic dan guardrail", detail: "Menguji asumsi, kualitas, keamanan, dan kepatuhan sebelum hasil diteruskan atau dipromosikan." },
    { label: "Lifecycle manager", detail: "Menganalisis gap kapasitas dan relevansi untuk mengusulkan recruit, develop, reassign, suspend, atau retire." },
  ],
  humanRoles: [
    { label: "AI Owner / Program Director", detail: "Faza memegang portfolio AI, memilih outcome bernilai tinggi, mengarahkan prioritas lintas fungsi, dan menilai ROI serta kesiapan organisasi." },
    { label: "AI Agent Builder", detail: "Engineering, Solution Architecture, dan Automation menerjemahkan kebutuhan bisnis menjadi agent, prompt, context, tools, workflow, dan pengujian yang dapat diulang." },
    { label: "AI Champion", detail: "Lead project dan lead fungsi menjadi champion di area masing-masing: menemukan use case, mendampingi adopsi, mengumpulkan feedback, dan menjaga literasi penggunaan yang bertanggung jawab." },
  ],
  governanceLayers: [
    { label: "Big G — aturan pusat", detail: "Faza, Quality, Governance, Risk, Audit, Security, Legal, dan Finance menetapkan prinsip non-negotiable: data, akses, risiko, bukti, approval, dan lifecycle." },
    { label: "little g — praktik project", detail: "Setiap project menerapkan aturan pusat ke backlog, routing, prompt, evaluasi, handoff, dan kebiasaan kerja hariannya tanpa menunggu semua keputusan dipusatkan." },
  ],
  workLayers: [
    { label: "Task agent", detail: "Menangani satu aktivitas terukur dalam batas sempit, seperti klasifikasi, pemeriksaan, sinkronisasi, atau draf." },
    { label: "Role agent", detail: "Memegang konteks fungsi yang persisten dan bekerja lintas tools untuk satu jenis tanggung jawab." },
    { label: "Team agent", detail: "Menggabungkan beberapa role agent untuk mengoordinasikan pekerjaan satu project atau tim menuju outcome bersama." },
    { label: "Outcome agent", detail: "Mengorkestrasi outcome lintas fungsi, memantau trade-off, mengalokasikan perhatian, dan mengeskalasikan keputusan." },
  ],
  pilotPlan: [
    "Hari 1–30: audit use case agent, pilih outcome pilot, tetapkan AI Owner interim, dan ukur baseline.",
    "Hari 31–60: jalankan 2–3 workflow bernilai tinggi dengan AI Champion, evidence, dan retrospective mingguan.",
    "Hari 61–90: formalkan role contract, Big G/little g, KPI, dan keputusan scale, revise, atau stop.",
  ],
  lifecycle: [
    "Recruit: buat role brief berdasarkan outcome, gap capability, risiko, dan kapasitas.",
    "Develop: ukur kualitas, error, biaya, dan relevansi agent secara berkala.",
    "Rebalance: ubah scope, owner, reporting line, atau routing bila kebutuhan berubah.",
    "Retire: suspend atau retire agent dengan handoff, bukti, dan persetujuan Faza.",
  ],
};

const readAgenticModel = (value: unknown): OrganizationAgenticModel => {
  if (!value || typeof value !== "object") return defaultAgenticModel;
  const model = value as Record<string, unknown>;
  const readItems = (entry: unknown) => Array.isArray(entry)
    ? entry.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        return typeof record.label === "string" && typeof record.detail === "string" && record.label && record.detail
          ? [{ label: record.label, detail: record.detail }]
          : [];
      })
    : [];
  const readStrings = (entry: unknown) => Array.isArray(entry)
    ? entry.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const title = typeof model.title === "string" ? model.title : "";
  const summary = typeof model.summary === "string" ? model.summary : "";
  const pillars = readItems(model.pillars);
  const teamRoles = readItems(model.teamRoles);
  const lifecycle = readStrings(model.lifecycle);
  const humanRoles = readItems(model.humanRoles);
  const governanceLayers = readItems(model.governanceLayers);
  const workLayers = readItems(model.workLayers);
  const pilotPlan = readStrings(model.pilotPlan);
  return title && summary && pillars.length && teamRoles.length && humanRoles.length && governanceLayers.length && workLayers.length && pilotPlan.length && lifecycle.length
    ? { title, summary, pillars, teamRoles, humanRoles, governanceLayers, workLayers, pilotPlan, lifecycle }
    : defaultAgenticModel;
};

const inferAgenticRole = (agent: StoredAgent): OrganizationAgenticRole => {
  const key = `${agent.organizationKey || ""} ${agent.role || ""}`.toLowerCase();
  const department = (agent.department || "").toLowerCase();
  if (agent.organizationKey === "hermes") return "orchestrator";
  if (/recruit|lifecycle|people-ops/.test(key)) return "lifecycle_manager";
  if (/compliance|legal/.test(key) || /compliance|legal/.test(department)) return "compliance";
  if (/security|guardrail/.test(key) || /security/.test(department)) return "guardrail";
  if (/quality|qa|critic|audit|risk|governance/.test(key) || /quality|audit|risk|governance/.test(department)) return "critic";
  if (agent.organizationKey === "chief-of-staff" || agent.hierarchyRole === "manager") return "supervisor";
  return "specialist";
};

const inferAgenticLayer = (agent: StoredAgent): OrganizationAgenticLayer => {
  const key = `${agent.organizationKey || ""} ${agent.role || ""}`.toLowerCase();
  if (agent.organizationKey === "hermes" || /orchestrator|outcome|portfolio/.test(key)) return "outcome";
  if (agent.hierarchyRole === "executive" || agent.hierarchyRole === "manager" || agent.hierarchyRole === "lead" || /chief|head|lead|manager|supervisor/.test(key)) return "team";
  if (agent.project || (agent.responsibilities || []).length > 1 || inferAgenticRole(agent) !== "specialist") return "role";
  return "task";
};

export default function OrganizationPage() {
  const statePath = path.join(resolveStateDir(), "hermes3d", "organization-state.json");
  let data: OrganizationDirectoryData = {
    companyName: "Hermes3D", ownerName: "Pemilik", updatedAt: null, agents: [], projects: [], rooms: [], operatingModel: null, agenticModel: defaultAgenticModel,
  };
  if (fs.existsSync(statePath)) {
    const stored = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      organization?: { companyName?: string; ownerName?: string; operatingModel?: unknown; agenticModel?: unknown; projects?: unknown };
      updatedAt?: string;
      agents?: StoredAgent[];
    };
    const agents = (stored.agents || []).map((agent) => ({
      id: agent.id || "", name: agent.name || "Agent", role: agent.role || "",
      organizationKey: agent.organizationKey || "",
      reportsTo: agent.reportsTo || null, department: agent.department || "Lainnya",
      project: agent.project || "", projectStatus: agent.projectStatus === "inactive" ? "inactive" as const : "active" as const, hierarchyRole: agent.hierarchyRole || "member",
      agenticRole: inferAgenticRole(agent),
      agenticLayer: inferAgenticLayer(agent),
      responsibilities: agent.responsibilities || [], deliverables: agent.deliverables || [],
    }));
    const projects = readProjects(stored.organization?.projects);
    data = {
      companyName: stored.organization?.companyName || "Hermes3D",
      ownerName: stored.organization?.ownerName || "Pemilik",
      updatedAt: stored.updatedAt || null,
      operatingModel: readOperatingModel(stored.organization?.operatingModel),
      agenticModel: readAgenticModel(stored.organization?.agenticModel),
      projects,
      rooms: buildRooms(agents, projects),
      agents,
    };
  }
  return <OrganizationDirectory data={data} />;
}
