"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Database,
  ListChecks,
  Network,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import type {
  Capability,
  CapabilityAccessMode,
  CapabilityAgent,
  CapabilityEnforcement,
  CapabilityEnvironment,
  CapabilityKind,
  CapabilityRegistryState,
  CapabilityStatus,
  CapabilityWorkflow,
  DataClassification,
} from "./types";

const statusMeta: Record<CapabilityStatus, { label: string; className: string }> = {
  available: { label: "Tersedia", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" },
  degraded: { label: "Terganggu", className: "border-amber-500/40 text-amber-700 dark:text-amber-300" },
  unavailable: { label: "Tidak tersedia", className: "border-rose-500/40 text-rose-700 dark:text-rose-300" },
  unverified: { label: "Belum diverifikasi", className: "border-slate-500/40 text-slate-600 dark:text-slate-300" },
  retired: { label: "Diarsipkan", className: "border-zinc-500/40 text-zinc-600 dark:text-zinc-300" },
};

const kindLabels: Record<CapabilityKind, string> = {
  workspace: "Workspace",
  model: "Model runtime",
  data: "Data",
  erp: "ERP",
  communication: "Komunikasi",
  marketing: "Marketing",
  research: "Research",
  observability: "Observability",
  security: "Security",
};

const environmentLabels: Record<CapabilityEnvironment, string> = {
  local: "Local",
  development: "Development",
  staging: "Staging",
  production: "Production",
  external: "External",
};

const enforcementMeta: Record<CapabilityEnforcement, { label: string; detail: string }> = {
  block: { label: "Block", detail: "Routing ditolak bila status tidak tersedia atau belum diverifikasi." },
  review: { label: "Review", detail: "Routing tetap tercatat, tetapi work order membawa peringatan verifikasi." },
  observe: { label: "Observe", detail: "Dipantau sebagai dependensi tanpa mengubah keputusan routing." },
};

const dataLabels: Record<DataClassification, string> = {
  public: "Publik",
  internal: "Internal",
  confidential: "Rahasia internal",
  restricted: "Sangat terbatas",
};

const accessLabels: Record<CapabilityAccessMode, string> = {
  read: "Baca",
  write: "Tulis",
  controlled: "Terkendali",
};

const shortDate = (value: string | null) => {
  if (!value) return "Belum diperiksa";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
};

const defaultCapability = (id: string, ownerKey: string): Capability => {
  const timestamp = new Date().toISOString();
  return {
    id,
    name: "Capability baru",
    kind: "workspace",
    provider: "Belum ditentukan",
    environment: "local",
    status: "unverified",
    enforcement: "review",
    dataClassification: "internal",
    accessMode: "controlled",
    ownerKey,
    accountableHuman: "Faza",
    canBlockUse: true,
    allowedAgentKeys: [ownerKey || "*"],
    workflowIds: [],
    connectionReference: "",
    usageBoundary: "Tentukan batas penggunaan dan data yang boleh diproses.",
    evidenceRequirement: "Tentukan bukti penggunaan atau hasil yang diperlukan.",
    rollback: "Tentukan cara menghentikan atau mengembalikan perubahan.",
    statusNote: "Belum diverifikasi.",
    lastCheckedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

function StatusPill({ status }: { status: CapabilityStatus }) {
  const meta = statusMeta[status];
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>;
}

function FieldLabel({ children }: { children: string }) {
  return <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{children}</span>;
}

function TextArea({ value, onChange, label, rows = 3 }: { value: string; onChange: (value: string) => void; label: string; rows?: number }) {
  return <textarea aria-label={label} value={value} rows={rows} onChange={(event) => onChange(event.target.value)} className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none transition-colors focus:border-primary" />;
}

type ApiResponse = {
  registry?: CapabilityRegistryState;
  workflows?: CapabilityWorkflow[];
  agents?: unknown[];
  error?: string;
};

export function CapabilityRegistry({
  initialRegistry,
  agents,
  workflows,
}: {
  initialRegistry: CapabilityRegistryState;
  agents: CapabilityAgent[];
  workflows: CapabilityWorkflow[];
}) {
  const [registry, setRegistry] = useState(initialRegistry);
  const [selectedId, setSelectedId] = useState(initialRegistry.capabilities[0]?.id || "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | CapabilityStatus>("");
  const [enforcementFilter, setEnforcementFilter] = useState<"" | CapabilityEnforcement>("");
  const [agentToAdd, setAgentToAdd] = useState("");
  const [requestState, setRequestState] = useState<{ kind: "idle" | "loading" | "success" | "error"; message: string }>({ kind: "idle", message: "" });

  const agentByKey = useMemo(() => new Map(agents.map((agent) => [agent.key, agent])), [agents]);
  const selected = registry.capabilities.find((capability) => capability.id === selectedId) || null;
  const activeAgents = agents.filter((agent) => agent.projectStatus !== "inactive");
  const filteredCapabilities = registry.capabilities.filter((capability) => {
    const text = [capability.name, capability.provider, capability.kind, capability.environment, capability.ownerKey, capability.connectionReference]
      .join(" ")
      .toLowerCase();
    return (!statusFilter || capability.status === statusFilter) &&
      (!enforcementFilter || capability.enforcement === enforcementFilter) &&
      text.includes(search.trim().toLowerCase());
  });
  const counts = useMemo(() => ({
    total: registry.capabilities.length,
    available: registry.capabilities.filter((capability) => capability.status === "available").length,
    attention: registry.capabilities.filter((capability) => ["degraded", "unavailable", "unverified"].includes(capability.status)).length,
    blocking: registry.capabilities.filter((capability) => capability.enforcement === "block").length,
  }), [registry.capabilities]);

  const agentLabel = (key: string) => {
    const agent = agentByKey.get(key);
    return agent ? `${agent.name} - ${agent.role}` : key;
  };

  const applyResponse = (body: ApiResponse, successMessage: string) => {
    if (!body.registry) throw new Error(body.error || "Capability Registry tidak dapat diperbarui.");
    setRegistry(body.registry);
    setSelectedId((current) => body.registry?.capabilities.some((capability) => capability.id === current)
      ? current
      : body.registry?.capabilities[0]?.id || "");
    setRequestState({ kind: "success", message: successMessage });
    return body.registry;
  };

  const sendAction = async (action: string, payload: Record<string, unknown>, successMessage: string) => {
    setRequestState({ kind: "loading", message: "Memproses perubahan..." });
    try {
      const response = await fetch("/api/capability-registry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = await response.json() as ApiResponse;
      if (!response.ok) throw new Error(body.error || "Capability Registry tidak dapat diperbarui.");
      return applyResponse(body, successMessage);
    } catch (error) {
      setRequestState({ kind: "error", message: error instanceof Error ? error.message : "Capability Registry tidak dapat diperbarui." });
      return null;
    }
  };

  const refresh = async () => {
    setRequestState({ kind: "loading", message: "Memuat ulang registry..." });
    try {
      const response = await fetch("/api/capability-registry", { cache: "no-store" });
      const body = await response.json() as ApiResponse;
      if (!response.ok || !body.registry) throw new Error(body.error || "Capability Registry tidak dapat dimuat.");
      applyResponse(body, "Capability Registry dimuat ulang.");
    } catch (error) {
      setRequestState({ kind: "error", message: error instanceof Error ? error.message : "Capability Registry tidak dapat dimuat." });
    }
  };

  const updateSelected = (patch: Partial<Capability>) => {
    if (!selected) return;
    setRegistry((current) => ({
      ...current,
      capabilities: current.capabilities.map((capability) => capability.id === selected.id ? { ...capability, ...patch } : capability),
    }));
    setRequestState({ kind: "idle", message: "" });
  };

  const addCapability = async () => {
    const ownerKey = activeAgents.find((agent) => agent.key === "hermes")?.key || activeAgents[0]?.key || "hermes";
    const id = `capability-${Date.now()}`;
    const next = await sendAction("create_capability", { capability: defaultCapability(id, ownerKey) }, "Capability baru dibuat.");
    if (next) setSelectedId(id);
  };

  const saveSelected = async () => {
    if (!selected) return;
    await sendAction("update_capability", { capabilityId: selected.id, patch: selected }, "Detail capability tersimpan.");
  };

  const recordStatus = async () => {
    if (!selected) return;
    await sendAction("set_status", {
      capabilityId: selected.id,
      status: selected.status,
      statusNote: selected.statusNote,
    }, "Status capability diperbarui dan dicatat di audit trail.");
  };

  const archiveSelected = async () => {
    if (!selected || !window.confirm(`Arsipkan capability "${selected.name}"? Workflow terkait akan diblokir bila capability ini masih diwajibkan.`)) return;
    await sendAction("archive_capability", { capabilityId: selected.id, reason: "Diarsipkan oleh Faza dari Capability Registry." }, "Capability diarsipkan.");
  };

  const addAllowedAgent = () => {
    if (!selected || !agentToAdd) return;
    const current = selected.allowedAgentKeys.includes("*") ? [] : selected.allowedAgentKeys;
    if (current.includes(agentToAdd)) return;
    updateSelected({ allowedAgentKeys: [...current, agentToAdd] });
    setAgentToAdd("");
  };

  const removeAllowedAgent = (agentKey: string) => {
    if (!selected || selected.allowedAgentKeys.includes("*")) return;
    const next = selected.allowedAgentKeys.filter((key) => key !== agentKey);
    if (!next.length) return;
    updateSelected({ allowedAgentKeys: next });
  };

  const toggleWorkflow = (workflowId: string) => {
    if (!selected) return;
    const workflowIds = selected.workflowIds.includes(workflowId)
      ? selected.workflowIds.filter((id) => id !== workflowId)
      : [...selected.workflowIds, workflowId];
    updateSelected({ workflowIds });
  };

  return (
    <div className="min-h-full bg-background text-foreground" style={{ letterSpacing: 0 }}>
      <header className="border-b border-border bg-card px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-medium text-muted-foreground">Hermes3D / Control plane</p><h1 className="mt-1 text-2xl font-semibold">Capabilities & Connectors</h1></div>
          <div className="flex flex-wrap gap-2">
            <Link href="/operations" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><Activity size={16} />Operations</Link>
            <Link href="/execution" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><ListChecks size={16} />Execution</Link>
            <Link href="/organization" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><UsersRound size={16} />Organisasi</Link>
            <Link href="/office" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><ArrowLeft size={16} />Kantor 3D</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <section aria-label="Ringkasan capability" className="mb-6 flex flex-wrap items-center gap-x-7 gap-y-2 border-b border-border pb-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{counts.total}</strong> capability</span>
          <span><strong className="text-foreground">{counts.available}</strong> tersedia</span>
          <span><strong className={counts.attention ? "text-amber-700 dark:text-amber-300" : "text-foreground"}>{counts.attention}</strong> perlu perhatian</span>
          <span><strong className="text-foreground">{counts.blocking}</strong> policy block</span>
          <span className="ml-auto">Diperbarui: <strong className="text-foreground">{shortDate(registry.updatedAt)}</strong></span>
        </section>

        <section aria-label="Prinsip registry" className="mb-6 border-l-2 border-primary/70 pl-4">
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-primary" size={18} /><div><p className="text-sm font-semibold">Konektor disimpan sebagai control-plane asset</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Registry tidak menyimpan password, token, atau secret. Ia mencatat mandat, pemilik, batas data, agent yang diizinkan, workflow terkait, dan kesiapan operasional sebelum pekerjaan dirutekan.</p></div></div>
        </section>

        <section aria-label="Kontrol capability" className="mb-5 flex flex-wrap gap-3">
          <label className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-md border border-border bg-card px-3 sm:basis-auto"><Search size={16} className="shrink-0 text-muted-foreground" /><input aria-label="Cari capability" placeholder="Cari capability atau provider" value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-10 w-full min-w-0 bg-transparent text-sm outline-none" /></label>
          <select aria-label="Filter status capability" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | CapabilityStatus)} className="min-h-10 rounded-md border border-border bg-card px-3 text-sm"><option value="">Semua status</option>{Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select>
          <select aria-label="Filter policy capability" value={enforcementFilter} onChange={(event) => setEnforcementFilter(event.target.value as "" | CapabilityEnforcement)} className="min-h-10 rounded-md border border-border bg-card px-3 text-sm"><option value="">Semua policy</option>{Object.entries(enforcementMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select>
          <button type="button" onClick={addCapability} disabled={requestState.kind === "loading"} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Plus size={16} />Tambah capability</button>
        </section>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(290px,0.85fr)_minmax(0,1.55fr)]">
          <section aria-label="Daftar capability" className="min-w-0 border-y border-border">
            {!filteredCapabilities.length ? <p className="py-8 text-sm text-muted-foreground">Tidak ada capability yang sesuai filter.</p> : filteredCapabilities.map((capability) => {
              const selectedRow = selected?.id === capability.id;
              return <button key={capability.id} type="button" onClick={() => { setSelectedId(capability.id); setAgentToAdd(""); }} aria-pressed={selectedRow} className={`flex w-full items-start gap-3 border-b border-border px-3 py-4 text-left last:border-b-0 ${selectedRow ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                <span className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded ${capability.status === "available" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : capability.status === "unavailable" || capability.status === "retired" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>{capability.kind === "erp" || capability.kind === "data" ? <Database size={17} /> : capability.kind === "security" ? <ShieldCheck size={17} /> : <Network size={17} />}</span>
                <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{capability.name}</span><StatusPill status={capability.status} /></span><span className="mt-1 block text-xs text-muted-foreground">{kindLabels[capability.kind]} · {environmentLabels[capability.environment]} · {capability.provider}</span><span className="mt-2 block line-clamp-2 text-xs leading-5 text-muted-foreground">{capability.usageBoundary}</span></span>
              </button>;
            })}
          </section>

          <section aria-label="Detail capability" className="min-w-0 border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pl-7 lg:pt-0">
            {!selected ? <p className="py-8 text-sm text-muted-foreground">Pilih capability atau tambahkan capability baru.</p> : <div>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"><div><p className="text-xs font-medium text-primary">{kindLabels[selected.kind]} · {environmentLabels[selected.environment]}</p><h2 className="mt-1 text-xl font-semibold">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">Owner: {agentLabel(selected.ownerKey)}</p></div><div className="flex items-center gap-2"><button type="button" onClick={refresh} title="Muat ulang Capability Registry" aria-label="Muat ulang Capability Registry" disabled={requestState.kind === "loading"} className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-50"><RefreshCw size={16} className={requestState.kind === "loading" ? "animate-spin" : ""} /></button><button type="button" onClick={archiveSelected} title="Arsipkan capability" aria-label="Arsipkan capability" disabled={selected.status === "retired"} className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-amber-700 hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-300"><Archive size={16} /></button></div></div>

              {requestState.kind !== "idle" ? <p role="status" className={`mb-4 border-l-2 py-1 pl-3 text-sm ${requestState.kind === "error" ? "border-destructive text-destructive" : requestState.kind === "success" ? "border-emerald-500 text-emerald-700 dark:text-emerald-300" : "border-primary text-muted-foreground"}`}>{requestState.message}</p> : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <label><FieldLabel>Nama capability</FieldLabel><input aria-label="Nama capability" value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                <label><FieldLabel>Provider</FieldLabel><input aria-label="Provider capability" value={selected.provider} onChange={(event) => updateSelected({ provider: event.target.value })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                <label><FieldLabel>Jenis</FieldLabel><select aria-label="Jenis capability" value={selected.kind} onChange={(event) => updateSelected({ kind: event.target.value as CapabilityKind })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><FieldLabel>Environment</FieldLabel><select aria-label="Environment capability" value={selected.environment} onChange={(event) => updateSelected({ environment: event.target.value as CapabilityEnvironment })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(environmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><FieldLabel>Owner capability</FieldLabel><select aria-label="Owner capability" value={selected.ownerKey} onChange={(event) => updateSelected({ ownerKey: event.target.value })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{activeAgents.map((agent) => <option key={agent.key} value={agent.key}>{agentLabel(agent.key)}</option>)}</select></label>
                <label><FieldLabel>Penanggung jawab manusia</FieldLabel><input aria-label="Penanggung jawab manusia capability" value={selected.accountableHuman} onChange={(event) => updateSelected({ accountableHuman: event.target.value })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={selected.canBlockUse} onChange={(event) => updateSelected({ canBlockUse: event.target.checked })} className="h-4 w-4 accent-primary" />Pemilik boleh memblokir penggunaan</label>
                <label><FieldLabel>Klasifikasi data</FieldLabel><select aria-label="Klasifikasi data capability" value={selected.dataClassification} onChange={(event) => updateSelected({ dataClassification: event.target.value as DataClassification })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(dataLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><FieldLabel>Mode akses</FieldLabel><select aria-label="Mode akses capability" value={selected.accessMode} onChange={(event) => updateSelected({ accessMode: event.target.value as CapabilityAccessMode })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(accessLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><FieldLabel>Policy routing</FieldLabel><select aria-label="Policy routing capability" value={selected.enforcement} onChange={(event) => updateSelected({ enforcement: event.target.value as CapabilityEnforcement })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(enforcementMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select><span className="mt-1 block text-xs leading-5 text-muted-foreground">{enforcementMeta[selected.enforcement].detail}</span></label>
              </div>

              <div className="mt-5 grid gap-4">
                <label><FieldLabel>Referensi koneksi, tanpa secret</FieldLabel><input aria-label="Referensi koneksi capability" value={selected.connectionReference} onChange={(event) => updateSelected({ connectionReference: event.target.value })} placeholder="Contoh: koneksi staging dikelola di secret store" className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /><span className="mt-1 block text-xs leading-5 text-muted-foreground">Jangan masukkan URL bertoken, password, API key, atau secret ke registry ini.</span></label>
                <label><FieldLabel>Batas penggunaan</FieldLabel><TextArea label="Batas penggunaan capability" value={selected.usageBoundary} onChange={(usageBoundary) => updateSelected({ usageBoundary })} /></label>
                <label><FieldLabel>Bukti yang diperlukan</FieldLabel><TextArea label="Bukti capability" value={selected.evidenceRequirement} onChange={(evidenceRequirement) => updateSelected({ evidenceRequirement })} rows={2} /></label>
                <label><FieldLabel>Rollback atau penghentian</FieldLabel><TextArea label="Rollback capability" value={selected.rollback} onChange={(rollback) => updateSelected({ rollback })} rows={2} /></label>
              </div>

              <section aria-label="Status dan verifikasi capability" className="mt-6 border-t border-border pt-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><AlertTriangle size={16} className="text-primary" /><h3 className="text-sm font-semibold">Status dan verifikasi</h3></div><p className="mt-1 text-xs leading-5 text-muted-foreground">Terakhir diperiksa: {shortDate(selected.lastCheckedAt)}. Catat status setelah Anda memverifikasi konektor atau menerima sinyal gangguan.</p></div><StatusPill status={selected.status} /></div><div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)_auto]"><label><FieldLabel>Status</FieldLabel><select aria-label="Status capability" value={selected.status} onChange={(event) => updateSelected({ status: event.target.value as CapabilityStatus })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label><label><FieldLabel>Catatan status</FieldLabel><input aria-label="Catatan status capability" value={selected.statusNote} onChange={(event) => updateSelected({ statusNote: event.target.value })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label><button type="button" onClick={recordStatus} disabled={requestState.kind === "loading"} className="mt-[26px] inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"><CheckCircle2 size={16} />Catat status</button></div></section>

              <section aria-label="Cakupan agent capability" className="mt-6 border-t border-border pt-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><UsersRound size={16} className="text-primary" /><h3 className="text-sm font-semibold">Agent yang boleh memakai</h3></div><p className="mt-1 text-xs leading-5 text-muted-foreground">Scope ini diperiksa terhadap owner workflow saat routing. Scope wildcard mengikuti agent yang memang diizinkan pada workflow.</p></div>{selected.allowedAgentKeys.includes("*") ? <button type="button" onClick={() => updateSelected({ allowedAgentKeys: [selected.ownerKey] })} className="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">Batasi akses</button> : <button type="button" onClick={() => updateSelected({ allowedAgentKeys: ["*"] })} className="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">Izinkan sesuai workflow</button>}</div>{selected.allowedAgentKeys.includes("*") ? <p className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Semua agent yang telah diizinkan pada workflow terkait dapat memakai capability ini dalam batas workflow.</p> : <><div className="mt-3 flex flex-wrap gap-2"><select aria-label="Tambah agent capability" value={agentToAdd} onChange={(event) => setAgentToAdd(event.target.value)} className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"><option value="">Pilih agent</option>{activeAgents.filter((agent) => !selected.allowedAgentKeys.includes(agent.key)).map((agent) => <option key={agent.key} value={agent.key}>{agentLabel(agent.key)}</option>)}</select><button type="button" onClick={addAllowedAgent} title="Tambahkan agent" aria-label="Tambahkan agent" disabled={!agentToAdd} className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-50"><Plus size={16} /></button></div><ul className="mt-3 flex flex-wrap gap-2">{selected.allowedAgentKeys.map((agentKey) => <li key={agentKey} className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"><span>{agentLabel(agentKey)}</span>{selected.allowedAgentKeys.length > 1 ? <button type="button" onClick={() => removeAllowedAgent(agentKey)} aria-label={`Hapus ${agentLabel(agentKey)}`} title={`Hapus ${agentLabel(agentKey)}`} className="text-muted-foreground hover:text-destructive"><X size={14} /></button> : null}</li>)}</ul></>}</section>

              <section aria-label="Workflow terkait capability" className="mt-6 border-t border-border pt-5"><div className="flex items-center gap-2"><ListChecks size={16} className="text-primary" /><h3 className="text-sm font-semibold">Workflow terkait</h3></div><p className="mt-1 text-xs leading-5 text-muted-foreground">Capability hanya memengaruhi routing workflow yang ditautkan di bawah. Workflow siap dengan policy block akan ditolak bila capability tidak tersedia atau belum diverifikasi.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{workflows.map((workflow) => <label key={workflow.id} className="flex min-w-0 items-start gap-2 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted/50"><input type="checkbox" checked={selected.workflowIds.includes(workflow.id)} onChange={() => toggleWorkflow(workflow.id)} className="mt-1 h-4 w-4 shrink-0 accent-primary" /><span className="min-w-0"><span className="block font-medium">{workflow.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{workflow.project || "Lintas fungsi"} · {workflow.lifecycle}</span></span></label>)}</div></section>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><div className="flex max-w-xl items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck size={15} className="mt-0.5 shrink-0" /><span>Perubahan capability mengatur kelayakan routing, bukan memberikan izin untuk tindakan eksternal, akses sensitif, atau produksi. Approval workflow tetap berlaku.</span></div><button type="button" onClick={saveSelected} disabled={requestState.kind === "loading"} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"><Save size={16} />Simpan detail</button></div>
            </div>}
          </section>
        </div>

        <section aria-labelledby="capability-audit-heading" className="mt-10 border-t border-border pt-6"><div className="flex items-center gap-2"><Activity size={18} className="text-primary" /><h2 id="capability-audit-heading" className="text-base font-semibold">Capability audit trail</h2></div><div className="mt-4 divide-y divide-border border-y border-border">{registry.auditEvents.length ? registry.auditEvents.slice(0, 40).map((event) => <div key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 py-3 text-sm"><p><span className="font-medium">{event.actor}</span><span className="text-muted-foreground"> · {event.type.replaceAll("_", " ")}</span>{event.note ? <span className="text-muted-foreground"> · {event.note}</span> : null}</p><time className="text-xs text-muted-foreground">{shortDate(event.at)}</time></div>) : <p className="py-8 text-sm text-muted-foreground">Belum ada perubahan capability. Perubahan status, akses, dan lifecycle akan tercatat di sini.</p>}</div></section>
      </main>
    </div>
  );
}
