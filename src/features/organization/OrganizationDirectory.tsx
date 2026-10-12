"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, ArrowUp, BriefcaseBusiness, ChevronDown, ChevronRight, ClipboardCheck, Database, FileCheck2, List, ListChecks, Network, Search, ShieldCheck, UserRound, Users } from "lucide-react";
import type { OrganizationAgent, OrganizationAgenticLayer, OrganizationAgenticRole, OrganizationDirectoryData, OrganizationRoom } from "./types";

const levelLabels: Record<string, string> = {
  executive: "Koordinator utama", manager: "Pimpinan fungsi", lead: "Pimpinan tim", member: "Spesialis",
};

const agenticRoleLabels: Record<OrganizationAgenticRole, string> = {
  orchestrator: "Orchestrator",
  supervisor: "Supervisor",
  specialist: "Specialist",
  critic: "Critic / quality gate",
  guardrail: "Guardrail / security gate",
  compliance: "Compliance gate",
  lifecycle_manager: "Lifecycle manager",
};

const agenticRoleStyles: Record<OrganizationAgenticRole, string> = {
  orchestrator: "border-primary/40 bg-primary/10 text-primary",
  supervisor: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  specialist: "border-border bg-muted/40 text-muted-foreground",
  critic: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  guardrail: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  compliance: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  lifecycle_manager: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const agenticLayerLabels: Record<OrganizationAgenticLayer, string> = {
  task: "Task agent",
  role: "Role agent",
  team: "Team agent",
  outcome: "Outcome agent",
};

const agenticLayerStyles: Record<OrganizationAgenticLayer, string> = {
  task: "border-border bg-background text-muted-foreground",
  role: "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  team: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  outcome: "border-primary/40 bg-primary/10 text-primary",
};

const roomKindLabels: Record<OrganizationRoom["kind"], string> = {
  command: "Command",
  project: "Project",
  function: "Function",
  governance: "Governance",
};

const roomKindStyles: Record<OrganizationRoom["kind"], string> = {
  command: "border-primary/40 bg-primary/10 text-primary",
  project: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  function: "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  governance: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

function AgenticRolePill({ role }: { role: OrganizationAgenticRole }) {
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${agenticRoleStyles[role]}`}>{agenticRoleLabels[role]}</span>;
}

function AgenticLayerPill({ layer }: { layer: OrganizationAgenticLayer }) {
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${agenticLayerStyles[layer]}`}>{agenticLayerLabels[layer]}</span>;
}

export function OrganizationDirectory({ data }: { data: OrganizationDirectoryData }) {
  const [view, setView] = useState<"tree" | "directory">("tree");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [selectedId, setSelectedId] = useState(data.agents[0]?.id || "");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const detailsRef = useRef<HTMLElement>(null);
  const directoryRef = useRef<HTMLElement>(null);
  const departments = [...new Set(data.agents.map((agent) => agent.department))];
  const projects = data.projects.length
    ? data.projects
    : [...new Set(data.agents.map((agent) => agent.project).filter(Boolean))].map((name) => ({
      key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      status: data.agents.some((agent) => agent.project === name && agent.projectStatus === "inactive") ? "inactive" as const : "active" as const,
      focus: "",
    }));
  const inactiveProjects = projects.filter((project) => project.status === "inactive");
  const activeProjects = projects.filter((project) => project.status === "active");
  const agentNames = new Map(data.agents.map((agent) => [agent.id, agent.name]));
  const selected = data.agents.find((agent) => agent.id === selectedId);
  const parent = data.agents.find((agent) => agent.id === selected?.reportsTo);
  const directReports = data.agents.filter((agent) => agent.reportsTo === selectedId);
  const matching = useMemo(() => data.agents.filter((agent) => {
    const text = [agent.name, agent.role, agent.department, agent.project].join(" ").toLowerCase();
    return (!department || agent.department === department) && text.includes(search.trim().toLowerCase());
  }), [data.agents, department, search]);
  const visibleIds = useMemo(() => {
    const visible = new Set(matching.map((agent) => agent.id));
    for (const agent of matching) {
      let manager = data.agents.find((entry) => entry.id === agent.reportsTo);
      const visited = new Set<string>();
      while (manager && !visited.has(manager.id)) {
        visited.add(manager.id);
        visible.add(manager.id);
        manager = data.agents.find((entry) => entry.id === manager?.reportsTo);
      }
    }
    return visible;
  }, [data.agents, matching]);
  const filtering = Boolean(search || department);
  const selectAgent = (agentId: string) => {
    setSelectedId(agentId);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const renderBranch = (agent: OrganizationAgent, ancestors = new Set<string>()): ReactNode => {
    if (!visibleIds.has(agent.id) || ancestors.has(agent.id)) return null;
    const children = data.agents.filter((entry) => entry.reportsTo === agent.id && visibleIds.has(entry.id));
    const isCollapsed = !filtering && collapsed.has(agent.id);
    const isInactive = agent.projectStatus === "inactive";
    const nextAncestors = new Set(ancestors).add(agent.id);
    return (
      <li key={agent.id} className="min-w-0">
        <div className={`flex min-h-14 items-center gap-1 rounded-md border ${selectedId === agent.id ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-muted/50"}`}>
          <button type="button" className="flex h-9 w-8 shrink-0 items-center justify-center rounded hover:bg-muted disabled:invisible"
            aria-label={`${isCollapsed ? "Perluas" : "Tutup"} tim ${agent.name}`} aria-expanded={!isCollapsed} disabled={!children.length || filtering}
            onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(agent.id)) next.delete(agent.id); else next.add(agent.id); return next; })}>
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
          <button type="button" onClick={() => selectAgent(agent.id)} aria-pressed={selectedId === agent.id}
            className={`flex min-w-0 flex-1 items-center gap-3 py-2 pr-3 text-left ${isInactive ? "opacity-70" : ""}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${agent.project ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-primary/10 text-primary"}`}>
              {agent.project ? <BriefcaseBusiness size={17} /> : <Users size={17} />}
            </span>
            <span className="min-w-0 flex-1 break-words"><span className="block text-sm font-semibold">{agent.name}</span><span className="block text-xs text-muted-foreground">{agent.role}</span><span className="mt-1 flex flex-wrap gap-1"><AgenticRolePill role={agent.agenticRole} /><AgenticLayerPill layer={agent.agenticLayer} /></span>{isInactive ? <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-300">Proyek nonaktif</span> : null}</span>
            {children.length ? <span className="shrink-0 text-xs text-muted-foreground">{children.length}</span> : null}
          </button>
        </div>
        {children.length && !isCollapsed ? <ul className="ml-4 border-l border-border pl-2 sm:ml-8 sm:pl-3">{children.map((child) => renderBranch(child, nextAncestors))}</ul> : null}
      </li>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground" style={{ letterSpacing: 0 }}>
      <header className="border-b border-border bg-card px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-medium text-muted-foreground">Hermes3D / Organisasi</p><h1 className="mt-1 text-2xl font-semibold">{data.companyName}</h1></div>
          <div className="flex flex-wrap gap-2">
            <Link href="/operations" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><Activity size={16} />Autonomous Operations</Link>
            <Link href="/execution" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><ListChecks size={16} />Execution registry</Link>
            <Link href="/readiness" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><ClipboardCheck size={16} />Readiness</Link>
            <Link href="/capabilities" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><Database size={16} />Capabilities</Link>
            <Link href="/office" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><ArrowLeft size={16} />Kantor 3D</Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pb-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{data.agents.length}</strong> agen terdaftar</span>
          <span><strong className="text-foreground">{departments.length}</strong> fungsi</span>
          <span><strong className="text-foreground">{activeProjects.length}</strong> proyek aktif</span>
          {inactiveProjects.length ? <span><strong className="text-foreground">{inactiveProjects.length}</strong> proyek nonaktif</span> : null}
          <span>Pemilik: <strong className="text-foreground">{data.ownerName}</strong></span>
        </div>
        {data.operatingModel ? <section aria-label="Model operasi organisasi" className="mb-6 border-y border-border py-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
            <div>
              <div className="flex items-center gap-2 text-primary"><ShieldCheck size={18} /><p className="text-xs font-medium uppercase">Model operasi</p></div>
              <h2 className="mt-2 text-lg font-semibold">{data.operatingModel.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{data.operatingModel.summary}</p>
              {data.operatingModel.escalationPath.length ? <p className="mt-4 text-sm text-muted-foreground"><span className="font-medium text-foreground">Jalur eskalasi:</span> {data.operatingModel.escalationPath.join(" -> ")}</p> : null}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="border-l-2 border-primary/50 pl-4">
                <p className="text-xs font-medium text-muted-foreground">Kewenangan</p>
                <div className="mt-3 space-y-3">{data.operatingModel.authority.map((item) => <div key={item.label}><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</p></div>)}</div>
              </div>
              <div className="border-l-2 border-emerald-500/60 pl-4">
                <div className="flex items-center gap-2"><FileCheck2 size={16} className="text-emerald-600 dark:text-emerald-300" /><p className="text-xs font-medium text-muted-foreground">Kontrol kerja</p></div>
                <div className="mt-3 space-y-3">{data.operatingModel.controls.map((item) => <div key={item.label}><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</p></div>)}</div>
              </div>
            </div>
          </div>
        </section> : null}
        {data.rooms.length ? <section aria-label="Ruang kolaborasi agent" className="mb-6 border-b border-border pb-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><div className="flex items-center gap-2 text-primary"><Users size={18} /><p className="text-xs font-medium uppercase">Shared rooms</p></div><h2 className="mt-2 text-lg font-semibold">Ruang kerja bersama</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Pola Alook yang diterapkan ke Hermes3D: manusia dan agent berbagi ruang kerja berdasarkan tujuan, project, fungsi, atau kontrol. Identitas agent tetap terhubung ke struktur organisasi dan inbox lokal.</p></div>
            <span className="text-sm text-muted-foreground"><strong className="text-foreground">{data.rooms.length}</strong> ruang</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.rooms.map((room) => {
              const names = room.memberAgentIds.map((id) => agentNames.get(id)).filter((name): name is string => Boolean(name));
              return <article key={room.key} className={`min-w-0 rounded-md border p-4 ${room.status === "inactive" ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-2"><div><h3 className="break-words text-sm font-semibold">{room.name}</h3><span className={`mt-2 inline-flex rounded border px-2 py-0.5 text-[10px] font-medium uppercase ${roomKindStyles[room.kind]}`}>{roomKindLabels[room.kind]}</span></div><span className="shrink-0 text-xs text-muted-foreground">{names.length} agent</span></div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{room.description}</p>
                <p className="mt-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">Anggota:</span> {names.slice(0, 3).join(", ") || "Belum ada"}{names.length > 3 ? ` +${names.length - 3}` : ""}</p>
                {room.status === "inactive" ? <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Project nonaktif</p> : null}
              </article>;
            })}
          </div>
        </section> : null}
        <section aria-label="Agentic operating model" className="mb-6 border-y border-border py-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <div className="flex items-center gap-2 text-primary"><Network size={18} /><p className="text-xs font-medium uppercase">Agentic organization</p></div>
              <h2 className="mt-2 text-lg font-semibold">{data.agenticModel.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{data.agenticModel.summary}</p>
              <div className="mt-4 border-l-2 border-emerald-500/60 pl-4"><p className="text-xs font-medium text-muted-foreground">Siklus pengelolaan agent</p><ol className="mt-3 space-y-2 text-sm text-muted-foreground">{data.agenticModel.lifecycle.map((step) => <li key={step}>{step}</li>)}</ol></div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="border-l-2 border-primary/50 pl-4"><p className="text-xs font-medium text-muted-foreground">Lima pilar desain</p><div className="mt-3 space-y-3">{data.agenticModel.pillars.map((item) => <div key={item.label}><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</p></div>)}</div></div>
              <div className="border-l-2 border-amber-500/60 pl-4"><p className="text-xs font-medium text-muted-foreground">Kontrak peran tim</p><div className="mt-3 space-y-3">{data.agenticModel.teamRoles.map((item) => <div key={item.label}><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</p></div>)}</div></div>
            </div>
          </div>
          <div className="mt-6 border-t border-border pt-5"><p className="text-xs font-medium text-muted-foreground">Empat lapisan kerja agentic</p><div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.agenticModel.workLayers.map((item) => <div key={item.label} className="border-l-2 border-cyan-500/50 pl-3"><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</p></div>)}</div></div>
        </section>
        <section aria-label="Peran manusia dan pilot AI" className="mb-6 border-b border-border pb-5">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="border-l-2 border-primary/50 pl-4"><p className="text-xs font-medium text-muted-foreground">Peran manusia</p><div className="mt-3 space-y-3">{data.agenticModel.humanRoles.map((item) => <div key={item.label}><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</p></div>)}</div></div>
            <div className="border-l-2 border-rose-500/60 pl-4"><p className="text-xs font-medium text-muted-foreground">Big G / little g</p><div className="mt-3 space-y-3">{data.agenticModel.governanceLayers.map((item) => <div key={item.label}><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</p></div>)}</div></div>
            <div className="border-l-2 border-sky-500/60 pl-4"><p className="text-xs font-medium text-muted-foreground">Pilot 90 hari</p><ol className="mt-3 space-y-3 text-sm leading-5 text-muted-foreground">{data.agenticModel.pilotPlan.map((step) => <li key={step}>{step}</li>)}</ol></div>
          </div>
        </section>
        {inactiveProjects.length ? <section aria-label="Proyek nonaktif" className="mb-6 border-b border-border pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-medium uppercase text-muted-foreground">Proyek nonaktif</p><p className="mt-1 text-sm text-muted-foreground">Tidak menerima pekerjaan baru atau delegasi otomatis sampai Faza mengaktifkannya kembali.</p></div>
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">{inactiveProjects.map((project) => <li key={project.key} className="font-medium text-amber-700 dark:text-amber-300">{project.name}</li>)}</ul>
          </div>
        </section> : null}
        <div className="mb-5 flex flex-wrap gap-3">
          <div role="tablist" aria-label="Tampilan organisasi" className="flex rounded-md border border-border p-1">
            {(["tree", "directory"] as const).map((mode) => <button key={mode} type="button" role="tab" aria-selected={view === mode}
              onClick={() => setView(mode)} className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm ${view === mode ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {mode === "tree" ? <Network size={16} /> : <List size={16} />}{mode === "tree" ? "Bagan" : "Direktori"}
            </button>)}
          </div>
          <label className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-md border border-border bg-card px-3 sm:basis-auto">
            <Search size={16} className="shrink-0 text-muted-foreground" /><input aria-label="Cari agen atau proyek" placeholder="Cari agen atau proyek" value={search}
              onChange={(event) => setSearch(event.target.value)} className="min-h-10 w-full min-w-0 bg-transparent text-sm outline-none" />
          </label>
          <select aria-label="Filter fungsi" value={department} onChange={(event) => setDepartment(event.target.value)} className="min-h-10 w-full rounded-md border border-border bg-card px-3 text-sm sm:w-64">
            <option value="">Semua fungsi</option>{departments.map((value) => <option key={value}>{value}</option>)}
          </select>
        </div>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section ref={directoryRef} className="min-w-0" aria-label={view === "tree" ? "Bagan organisasi" : "Direktori agen"}>
            {!data.agents.length ? <p className="py-8 text-sm text-muted-foreground">Belum ada struktur organisasi tersimpan.</p> : !matching.length ? <p className="py-8 text-sm text-muted-foreground">Tidak ada agen yang sesuai.</p> : view === "tree" ? <>
              <div className="mb-3 flex items-center gap-3 border-b border-border pb-4"><UserRound size={22} className="text-primary" /><div><p className="font-semibold">{data.ownerName}</p><p className="text-xs text-muted-foreground">Pemilik / Persetujuan akhir</p></div></div>
              <ul>{data.agents.filter((agent) => !agent.reportsTo || agent.reportsTo === "human-owner" || !data.agents.some((entry) => entry.id === agent.reportsTo)).map((agent) => renderBranch(agent))}</ul>
            </> : <div className="divide-y divide-border">{matching.map((agent) => <button key={agent.id} type="button" onClick={() => selectAgent(agent.id)}
              className={`flex w-full flex-wrap items-start gap-2 px-3 py-4 text-left ${selectedId === agent.id ? "bg-primary/10" : "hover:bg-muted/50"}`}>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{agent.name}</span><span className="block text-xs text-muted-foreground">{agent.role}</span><span className="mt-1 flex flex-wrap gap-1"><AgenticRolePill role={agent.agenticRole} /><AgenticLayerPill layer={agent.agenticLayer} /></span></span>
              <span className={`text-xs ${agent.projectStatus === "inactive" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{agent.project ? `${agent.project}${agent.projectStatus === "inactive" ? " · Nonaktif" : ""}` : agent.department}</span>
            </button>)}</div>}
          </section>
          {selected ? <aside ref={detailsRef} className="min-w-0 scroll-mt-5 border-t border-border pt-5 lg:sticky lg:top-5 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0" aria-label="Detail agen">
            <button type="button" title="Kembali ke daftar agen" aria-label="Kembali ke daftar agen" onClick={() => directoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="mb-4 flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted lg:hidden"><ArrowUp size={16} /></button>
            <p className="text-xs font-medium text-primary">{levelLabels[selected.hierarchyRole] || selected.hierarchyRole}</p>
            <h2 className="mt-2 break-words text-xl font-semibold">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">{selected.role}</p><div className="mt-3 flex flex-wrap gap-1"><AgenticRolePill role={selected.agenticRole} /><AgenticLayerPill layer={selected.agenticLayer} /></div>
            <dl className="my-5 space-y-3 border-y border-border py-4 text-sm">
              <div><dt className="text-xs text-muted-foreground">Melapor kepada</dt><dd className="mt-1">{parent?.name || data.ownerName}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Fungsi</dt><dd className="mt-1">{selected.department}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Proyek</dt><dd className="mt-1">{selected.project || "Lintas proyek"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Lapisan kerja</dt><dd className="mt-1">{agenticLayerLabels[selected.agenticLayer]}</dd></div>
              {selected.project ? <div><dt className="text-xs text-muted-foreground">Status proyek</dt><dd className={`mt-1 ${selected.projectStatus === "inactive" ? "text-amber-700 dark:text-amber-300" : ""}`}>{selected.projectStatus === "inactive" ? "Nonaktif — tidak menerima pekerjaan baru" : "Aktif"}</dd></div> : null}
            </dl>
            <h3 className="mb-2 text-sm font-semibold">Tanggung jawab</h3><ul className="space-y-2 text-sm text-muted-foreground">{selected.responsibilities.map((text) => <li key={text} className="flex gap-2"><span className="text-primary">&bull;</span><span>{text}</span></li>)}</ul>
            <h3 className="mb-2 mt-5 text-sm font-semibold">Hasil kerja</h3><ul className="space-y-2 text-sm text-muted-foreground">{selected.deliverables.map((text) => <li key={text} className="flex gap-2"><span className="text-emerald-500">&bull;</span><span>{text}</span></li>)}</ul>
            {directReports.length ? <><h3 className="mb-2 mt-5 text-sm font-semibold">Tim langsung ({directReports.length})</h3><div className="space-y-1">{directReports.map((agent) => <button key={agent.id} type="button" onClick={() => selectAgent(agent.id)} className="block text-left text-sm text-primary hover:underline">{agent.name}</button>)}</div></> : null}
          </aside> : null}
        </div>
      </div>
    </div>
  );
}
