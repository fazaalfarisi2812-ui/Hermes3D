"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Database,
  ListChecks,
  PauseCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import type {
  ExecutionAgent,
  ExecutionLifecycle,
  ExecutionLevel,
  ExecutionProject,
  ExecutionRegistryState,
  ExecutionWorkflow,
} from "./types";

const lifecycleMeta: Record<ExecutionLifecycle, { label: string; className: string }> = {
  draft: { label: "Draf", className: "border-slate-400/40 text-slate-600 dark:text-slate-300" },
  ready: { label: "Siap", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" },
  paused: { label: "Dijeda", className: "border-amber-500/40 text-amber-700 dark:text-amber-300" },
  archived: { label: "Diarsipkan", className: "border-zinc-500/40 text-zinc-600 dark:text-zinc-300" },
};

const executionLevelMeta: Record<ExecutionLevel, { label: string; detail: string }> = {
  advisory: { label: "Analisis dan draf", detail: "Tidak mengubah sistem atau mengirim komunikasi." },
  approval: { label: "Dengan persetujuan", detail: "Agent menyiapkan pekerjaan; tindakan berdampak menunggu Faza." },
  bounded: { label: "Otonomi terbatas", detail: "Hanya tindakan rendah risiko dalam batas yang tercatat." },
};

const splitList = (value: string) =>
  [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];

const joinList = (items: string[]) => items.join("\n");

const shortDate = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
};

function StatusPill({ lifecycle }: { lifecycle: ExecutionLifecycle }) {
  const meta = lifecycleMeta[lifecycle];
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>;
}

function FieldLabel({ children }: { children: string }) {
  return <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{children}</span>;
}

function TextArea({ value, onChange, rows = 3, label }: { value: string; onChange: (value: string) => void; rows?: number; label: string }) {
  return <textarea aria-label={label} value={value} rows={rows} onChange={(event) => onChange(event.target.value)}
    className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none transition-colors focus:border-primary" />;
}

export function ExecutionRegistry({
  initialRegistry,
  agents,
  projects,
}: {
  initialRegistry: ExecutionRegistryState;
  agents: ExecutionAgent[];
  projects: ExecutionProject[];
}) {
  const [registry, setRegistry] = useState(initialRegistry);
  const [selectedId, setSelectedId] = useState(initialRegistry.workflows[0]?.id || "");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<"" | ExecutionLifecycle>("");
  const [agentToAdd, setAgentToAdd] = useState("");
  const [saveState, setSaveState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message: string }>({ kind: "idle", message: "" });

  const agentByKey = useMemo(() => new Map(agents.map((agent) => [agent.key, agent])), [agents]);
  const projectByName = useMemo(() => new Map(projects.map((project) => [project.name, project])), [projects]);
  const selected = registry.workflows.find((workflow) => workflow.id === selectedId) || null;
  const readyCount = registry.workflows.filter((workflow) => workflow.lifecycle === "ready").length;
  const approvalCount = registry.workflows.filter((workflow) => workflow.executionLevel !== "advisory").length;
  const pausedCount = registry.workflows.filter((workflow) => workflow.lifecycle === "paused").length;
  const inactiveProjects = projects.filter((project) => project.status === "inactive");
  const filtered = registry.workflows.filter((workflow) => {
    const text = [workflow.name, workflow.domain, workflow.project, workflow.ownerKey, workflow.action].join(" ").toLowerCase();
    const matchesProject = !projectFilter || (projectFilter === "__shared" ? !workflow.project : workflow.project === projectFilter);
    return matchesProject &&
      (!lifecycleFilter || workflow.lifecycle === lifecycleFilter) &&
      text.includes(search.trim().toLowerCase());
  });
  const activeAgents = agents.filter((agent) => agent.projectStatus !== "inactive");
  const eligibleAgents = selected
    ? activeAgents.filter((agent) => !selected.project || !agent.project || agent.project === selected.project)
    : activeAgents;

  const agentLabel = (key: string) => {
    const agent = agentByKey.get(key);
    return agent ? `${agent.name} - ${agent.role}` : key;
  };

  const updateSelected = (patch: Partial<ExecutionWorkflow>) => {
    if (!selected) return;
    setRegistry((current) => ({
      ...current,
      workflows: current.workflows.map((workflow) => {
        if (workflow.id !== selected.id) return workflow;
        const next = { ...workflow, ...patch };
        if (patch.ownerKey && !next.allowedAgentKeys.includes(patch.ownerKey)) {
          next.allowedAgentKeys = [...next.allowedAgentKeys, patch.ownerKey];
        }
        return next;
      }),
    }));
    setSaveState({ kind: "idle", message: "" });
  };

  const changeProject = (project: string) => {
    if (!selected) return;
    const eligibleKeys = new Set(activeAgents
      .filter((agent) => !project || !agent.project || agent.project === project)
      .map((agent) => agent.key));
    const available = activeAgents.filter((agent) => eligibleKeys.has(agent.key));
    const ownerKey = eligibleKeys.has(selected.ownerKey) ? selected.ownerKey : (available[0]?.key || selected.ownerKey);
    const allowedAgentKeys = selected.allowedAgentKeys.filter((key) => eligibleKeys.has(key));
    if (!allowedAgentKeys.includes(ownerKey)) allowedAgentKeys.push(ownerKey);
    const projectStatus = projectByName.get(project)?.status;
    updateSelected({
      project,
      ownerKey,
      allowedAgentKeys,
      lifecycle: projectStatus === "inactive" ? "paused" : selected.lifecycle,
    });
  };

  const addWorkflow = () => {
    const ownerKey = activeAgents.find((agent) => agent.key === "chief-of-staff")?.key || activeAgents[0]?.key || "";
    const id = `workflow-${Date.now()}`;
    const workflow: ExecutionWorkflow = {
      id,
      name: "Workflow baru",
      domain: "Lintas fungsi",
      project: "",
      lifecycle: "draft",
      executionLevel: "advisory",
      ownerKey,
      allowedAgentKeys: ownerKey ? [ownerKey] : [],
      systems: ["Hermes Workspace"],
      systemOfRecord: "Hermes Workspace",
      executionMode: "copilot",
      oversightMode: "human_in_the_loop",
      escalationOwner: "Faza",
      controlProfile: {
        confirmationRequiredFor: ["external", "production", "sensitive", "irreversible"],
        interruptible: true,
        pauseAndResume: true,
        partialResultsAllowed: true,
        promptInjectionReview: true,
        recurrenceAllowed: false,
      },
      qualityGate: {
        mode: "independent_review",
        requiredReviewRoles: ["critic"],
        failOn: ["critical"],
        iterateOn: ["high", "medium"],
        maxIterations: 3,
        selfReviewProhibited: true,
      },
      trigger: "",
      action: "",
      approvalGate: "Faza menyetujui tindakan berdampak.",
      evidence: ["Bukti hasil"],
      rollback: "Tidak ada perubahan otomatis sebelum workflow dirancang.",
      kpis: ["KPI belum ditentukan"],
      productionReadiness: {
        realSystemAccess: false,
        businessLogicMapped: false,
        humanEscalationReady: false,
        auditReady: false,
        rollbackTested: false,
        lastReviewedAt: "",
        reviewer: "Faza",
      },
    };
    setRegistry((current) => ({ ...current, workflows: [...current.workflows, workflow] }));
    setSelectedId(id);
    setAgentToAdd("");
    setSaveState({ kind: "idle", message: "" });
  };

  const archiveWorkflow = () => {
    if (!selected || !window.confirm(`Arsipkan workflow "${selected.name}" dari registry?`)) return;
    updateSelected({ lifecycle: "archived" });
    setSaveState({ kind: "idle", message: "" });
  };

  const addAllowedAgent = () => {
    if (!selected || !agentToAdd || selected.allowedAgentKeys.includes(agentToAdd)) return;
    updateSelected({ allowedAgentKeys: [...selected.allowedAgentKeys, agentToAdd] });
    setAgentToAdd("");
  };

  const removeAllowedAgent = (agentKey: string) => {
    if (!selected || agentKey === selected.ownerKey) return;
    updateSelected({ allowedAgentKeys: selected.allowedAgentKeys.filter((key) => key !== agentKey) });
  };

  const loadRegistry = async () => {
    setSaveState({ kind: "saving", message: "Memuat registry..." });
    try {
      const response = await fetch("/api/execution-registry", { cache: "no-store" });
      const body = await response.json() as { registry?: ExecutionRegistryState; error?: string };
      if (!response.ok || !body.registry) throw new Error(body.error || "Registry tidak dapat dimuat.");
      setRegistry(body.registry);
      setSelectedId(body.registry.workflows.find((workflow) => workflow.id === selectedId)?.id || body.registry.workflows[0]?.id || "");
      setSaveState({ kind: "saved", message: "Registry dimuat ulang." });
    } catch (error) {
      setSaveState({ kind: "error", message: error instanceof Error ? error.message : "Registry tidak dapat dimuat." });
    }
  };

  const saveRegistry = async () => {
    setSaveState({ kind: "saving", message: "Menyimpan registry..." });
    try {
      const response = await fetch("/api/execution-registry", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ registry }),
      });
      const body = await response.json() as { registry?: ExecutionRegistryState; error?: string };
      if (!response.ok || !body.registry) throw new Error(body.error || "Registry tidak dapat disimpan.");
      setRegistry(body.registry);
      setSaveState({ kind: "saved", message: "Perubahan tersimpan." });
    } catch (error) {
      setSaveState({ kind: "error", message: error instanceof Error ? error.message : "Registry tidak dapat disimpan." });
    }
  };

  return (
    <div className="min-h-full bg-background text-foreground" style={{ letterSpacing: 0 }}>
      <header className="border-b border-border bg-card px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-medium text-muted-foreground">Hermes3D / Kontrol operasional</p><h1 className="mt-1 text-2xl font-semibold">Execution Registry</h1></div>
          <div className="flex flex-wrap gap-2">
            <Link href="/operations" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><Activity size={16} />Autonomous Operations</Link>
            <Link href="/capabilities" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><Database size={16} />Capabilities</Link>
            <Link href="/readiness" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><ClipboardCheck size={16} />Production Readiness</Link>
            <Link href="/organization" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><UsersRound size={16} />Organisasi</Link>
            <Link href="/office" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><ArrowLeft size={16} />Kantor 3D</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <section aria-label="Ringkasan registry" className="mb-6 flex flex-wrap items-center gap-x-7 gap-y-2 border-b border-border pb-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{registry.workflows.length}</strong> workflow</span>
          <span><strong className="text-foreground">{readyCount}</strong> siap dijalankan</span>
          <span><strong className="text-foreground">{approvalCount}</strong> memakai approval gate</span>
          <span><strong className="text-foreground">{pausedCount}</strong> dijeda</span>
          <span className="ml-auto">Diperbarui: <strong className="text-foreground">{shortDate(registry.updatedAt)}</strong></span>
        </section>

        {inactiveProjects.length ? <section aria-label="Batas proyek nonaktif" className="mb-6 border-l-2 border-amber-500/70 pl-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Batas proyek nonaktif</p><p className="mt-1 text-sm text-muted-foreground">Workflow proyek yang tidak aktif hanya dapat dijeda atau diarsipkan sampai Faza mengaktifkan proyeknya kembali.</p></div><p className="text-sm font-medium text-amber-700 dark:text-amber-300">{inactiveProjects.map((project) => project.name).join(" · ")}</p></div>
        </section> : null}

        <section aria-label="Kontrol registry" className="mb-5 flex flex-wrap gap-3">
          <label className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-md border border-border bg-card px-3 sm:basis-auto"><Search size={16} className="shrink-0 text-muted-foreground" /><input aria-label="Cari workflow" placeholder="Cari workflow, domain, proyek, atau tindakan" value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-10 w-full min-w-0 bg-transparent text-sm outline-none" /></label>
          <select aria-label="Filter proyek workflow" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="min-h-10 rounded-md border border-border bg-card px-3 text-sm"><option value="">Semua proyek</option><option value="__shared">Lintas fungsi</option>{projects.map((project) => <option key={project.key} value={project.name}>{project.name}{project.status === "inactive" ? " (nonaktif)" : ""}</option>)}</select>
          <select aria-label="Filter status workflow" value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value as "" | ExecutionLifecycle)} className="min-h-10 rounded-md border border-border bg-card px-3 text-sm"><option value="">Semua status</option>{Object.entries(lifecycleMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select>
          <button type="button" onClick={addWorkflow} title="Tambah workflow" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Plus size={16} />Tambah workflow</button>
        </section>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.55fr)]">
          <section aria-label="Daftar workflow" className="min-w-0 border-y border-border">
            {!filtered.length ? <p className="py-8 text-sm text-muted-foreground">Tidak ada workflow yang sesuai filter.</p> : filtered.map((workflow) => {
              const selectedRow = selected?.id === workflow.id;
              return <button key={workflow.id} type="button" onClick={() => { setSelectedId(workflow.id); setAgentToAdd(""); }} aria-pressed={selectedRow}
                className={`flex w-full items-start gap-3 border-b border-border px-3 py-4 text-left last:border-b-0 ${selectedRow ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                <span className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded ${workflow.lifecycle === "ready" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : workflow.lifecycle === "paused" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>{workflow.lifecycle === "ready" ? <CheckCircle2 size={17} /> : workflow.lifecycle === "paused" ? <PauseCircle size={17} /> : <ListChecks size={17} />}</span>
                <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{workflow.name}</span><StatusPill lifecycle={workflow.lifecycle} /></span><span className="mt-1 block text-xs text-muted-foreground">{workflow.domain}{workflow.project ? ` · ${workflow.project}` : " · Lintas fungsi"}</span><span className="mt-2 block line-clamp-2 text-xs leading-5 text-muted-foreground">{workflow.action}</span></span>
              </button>;
            })}
          </section>

          <section aria-label="Detail workflow" className="min-w-0 border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pl-7 lg:pt-0">
            {!selected ? <p className="py-8 text-sm text-muted-foreground">Pilih workflow atau buat workflow baru.</p> : <div>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div><p className="text-xs font-medium text-primary">{selected.project || "Lintas fungsi"}</p><h2 className="mt-1 text-xl font-semibold">{selected.name}</h2></div>
                <div className="flex items-center gap-2"><button type="button" onClick={loadRegistry} title="Muat ulang registry" disabled={saveState.kind === "saving"} className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-50"><RefreshCw size={16} className={saveState.kind === "saving" ? "animate-spin" : ""} /></button><button type="button" onClick={archiveWorkflow} title="Arsipkan workflow" className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"><Archive size={16} /></button></div>
              </div>

              {saveState.kind !== "idle" ? <p role="status" className={`mb-4 border-l-2 py-1 pl-3 text-sm ${saveState.kind === "error" ? "border-destructive text-destructive" : saveState.kind === "saved" ? "border-emerald-500 text-emerald-700 dark:text-emerald-300" : "border-primary text-muted-foreground"}`}>{saveState.message}</p> : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <label><FieldLabel>Nama workflow</FieldLabel><input aria-label="Nama workflow" value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                <label><FieldLabel>Domain</FieldLabel><input aria-label="Domain workflow" value={selected.domain} onChange={(event) => updateSelected({ domain: event.target.value })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                <label><FieldLabel>Proyek</FieldLabel><select aria-label="Proyek workflow" value={selected.project} onChange={(event) => changeProject(event.target.value)} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"><option value="">Lintas fungsi</option>{projects.map((project) => <option key={project.key} value={project.name}>{project.name}{project.status === "inactive" ? " (nonaktif)" : ""}</option>)}</select></label>
                <label><FieldLabel>Status lifecycle</FieldLabel><select aria-label="Status lifecycle workflow" value={selected.lifecycle} onChange={(event) => updateSelected({ lifecycle: event.target.value as ExecutionLifecycle })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(lifecycleMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label>
                <label><FieldLabel>Level eksekusi</FieldLabel><select aria-label="Level eksekusi workflow" value={selected.executionLevel} onChange={(event) => updateSelected({ executionLevel: event.target.value as ExecutionLevel })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(executionLevelMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select><span className="mt-1 block text-xs leading-5 text-muted-foreground">{executionLevelMeta[selected.executionLevel].detail}</span></label>
                <label><FieldLabel>Owner workflow</FieldLabel><select aria-label="Owner workflow" value={selected.ownerKey} onChange={(event) => updateSelected({ ownerKey: event.target.value })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{eligibleAgents.map((agent) => <option key={agent.key} value={agent.key}>{agentLabel(agent.key)}</option>)}</select></label>
              </div>

              <div className="mt-5 grid gap-4">
                <label><FieldLabel>Trigger</FieldLabel><TextArea label="Trigger workflow" value={selected.trigger} onChange={(trigger) => updateSelected({ trigger })} /></label>
                <label><FieldLabel>Tindakan yang diizinkan</FieldLabel><TextArea label="Tindakan workflow" value={selected.action} onChange={(action) => updateSelected({ action })} /></label>
                <label><FieldLabel>Approval gate</FieldLabel><TextArea label="Approval gate workflow" value={selected.approvalGate} onChange={(approvalGate) => updateSelected({ approvalGate })} rows={2} /></label>
                <label><FieldLabel>Sistem target, satu per baris</FieldLabel><TextArea label="Sistem target" value={joinList(selected.systems)} onChange={(value) => updateSelected({ systems: splitList(value) })} rows={3} /></label>
                <label><FieldLabel>Bukti selesai, satu per baris</FieldLabel><TextArea label="Bukti selesai" value={joinList(selected.evidence)} onChange={(value) => updateSelected({ evidence: splitList(value) })} rows={3} /></label>
                <label><FieldLabel>Rollback</FieldLabel><TextArea label="Rollback workflow" value={selected.rollback} onChange={(rollback) => updateSelected({ rollback })} rows={2} /></label>
                <label><FieldLabel>KPI, satu per baris</FieldLabel><TextArea label="KPI workflow" value={joinList(selected.kpis)} onChange={(value) => updateSelected({ kpis: splitList(value) })} rows={2} /></label>
              </div>

              <section aria-label="Agent diizinkan" className="mt-6 border-t border-border pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><UsersRound size={16} className="text-primary" /><h3 className="text-sm font-semibold">Agent diizinkan</h3></div><p className="mt-1 text-xs text-muted-foreground">Owner harus selalu tercantum. Agent proyek nonaktif dan agent proyek lain tidak tersedia untuk workflow proyek ini.</p></div><div className="flex gap-2"><select aria-label="Tambah agent diizinkan" value={agentToAdd} onChange={(event) => setAgentToAdd(event.target.value)} className="min-h-9 max-w-64 rounded-md border border-border bg-background px-2 text-sm"><option value="">Pilih agent</option>{eligibleAgents.filter((agent) => !selected.allowedAgentKeys.includes(agent.key)).map((agent) => <option key={agent.key} value={agent.key}>{agent.name}</option>)}</select><button type="button" onClick={addAllowedAgent} title="Tambahkan agent" disabled={!agentToAdd} className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-50"><Plus size={16} /></button></div></div>
                <ul className="mt-3 flex flex-wrap gap-2">{selected.allowedAgentKeys.map((agentKey) => <li key={agentKey} className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"><span>{agentLabel(agentKey)}</span>{agentKey === selected.ownerKey ? <span className="text-primary">Owner</span> : <button type="button" onClick={() => removeAllowedAgent(agentKey)} title={`Hapus ${agentLabel(agentKey)}`} aria-label={`Hapus ${agentLabel(agentKey)}`} className="text-muted-foreground hover:text-destructive"><X size={14} /></button>}</li>)}</ul>
              </section>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={15} /><span>Perubahan tindakan berdampak tetap mengikuti approval gate di atas.</span></div><button type="button" onClick={saveRegistry} disabled={saveState.kind === "saving"} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"><Save size={16} />Simpan perubahan</button></div>
            </div>}
          </section>
        </div>
      </main>
    </div>
  );
}
