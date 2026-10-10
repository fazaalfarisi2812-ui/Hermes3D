"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import type {
  AgentIdentity,
  AgentIdentityClass,
  AgentIdentityLifecycle,
  AgentIdentityRegistryState,
  AgentRiskTier,
  AgentSupervision,
  DelegationExecutionLevel,
  DelegationGrant,
  DelegationStatus,
  IdentityCapability,
  IdentityDataClassification,
  IdentityOrganizationAgent,
  IdentityWorkflow,
} from "./types";

const lifecycleMeta: Record<AgentIdentityLifecycle, { label: string; className: string }> = {
  active: { label: "Aktif", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" },
  review: { label: "Perlu review", className: "border-amber-500/40 text-amber-700 dark:text-amber-300" },
  suspended: { label: "Disuspensi", className: "border-rose-500/40 text-rose-700 dark:text-rose-300" },
  retired: { label: "Pensiun", className: "border-zinc-500/40 text-zinc-600 dark:text-zinc-300" },
};

const delegationMeta: Record<DelegationStatus, { label: string; className: string }> = {
  active: { label: "Aktif", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" },
  suspended: { label: "Ditangguhkan", className: "border-amber-500/40 text-amber-700 dark:text-amber-300" },
  revoked: { label: "Dicabut", className: "border-rose-500/40 text-rose-700 dark:text-rose-300" },
  expired: { label: "Kadaluarsa", className: "border-zinc-500/40 text-zinc-600 dark:text-zinc-300" },
};

const classLabels: Record<AgentIdentityClass, string> = {
  personal_agent: "Agent pribadi",
  workforce_assistant: "Asisten workforce",
  digital_worker: "Digital worker",
  consumer_assistant: "Asisten konsumen",
};

const supervisionLabels: Record<AgentSupervision, string> = {
  attended: "Didampingi",
  mixed: "Campuran",
  unattended: "Tanpa pendampingan",
};

const riskLabels: Record<AgentRiskTier, string> = {
  low: "Rendah",
  moderate: "Sedang",
  high: "Tinggi",
  critical: "Kritis",
};

const dataLabels: Record<IdentityDataClassification, string> = {
  public: "Publik",
  internal: "Internal",
  confidential: "Rahasia internal",
  restricted: "Sangat terbatas",
};

const executionLabels: Record<DelegationExecutionLevel, string> = {
  advisory: "Analisis dan draf",
  bounded: "Otonomi terbatas",
  approval: "Wajib approval",
};

const shortDate = (value: string | null) => {
  if (!value) return "Belum ditinjau";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
};

const defaultExpiryInput = () => {
  const value = new Date();
  value.setDate(value.getDate() + 90);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
};

function FieldLabel({ children }: { children: string }) {
  return <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{children}</span>;
}

function TextArea({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return <textarea aria-label={label} value={value} rows={rows} onChange={(event) => onChange(event.target.value)} className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none transition-colors focus:border-primary" />;
}

function LifecyclePill({ lifecycle }: { lifecycle: AgentIdentityLifecycle }) {
  const meta = lifecycleMeta[lifecycle];
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>;
}

function DelegationPill({ status }: { status: DelegationStatus }) {
  const meta = delegationMeta[status];
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>;
}

type ApiResponse = {
  registry?: AgentIdentityRegistryState;
  agents?: unknown[];
  workflows?: IdentityWorkflow[];
  capabilities?: IdentityCapability[];
  error?: string;
};

type GrantDraft = {
  workflowId: string;
  capabilityMode: "linked" | "none" | string;
  executionLevel: DelegationExecutionLevel;
  expiry: string;
  purpose: string;
  evidenceRequirement: string;
};

export function IdentityRegistry({
  initialRegistry,
  agents,
  workflows,
  capabilities,
}: {
  initialRegistry: AgentIdentityRegistryState;
  agents: IdentityOrganizationAgent[];
  workflows: IdentityWorkflow[];
  capabilities: IdentityCapability[];
}) {
  const [registry, setRegistry] = useState(initialRegistry);
  const [selectedId, setSelectedId] = useState(initialRegistry.identities[0]?.id || "");
  const [search, setSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<"" | AgentIdentityLifecycle>("");
  const [requestState, setRequestState] = useState<{ kind: "idle" | "loading" | "success" | "error"; message: string }>({ kind: "idle", message: "" });
  const [grantDraft, setGrantDraft] = useState<GrantDraft>({
    workflowId: "",
    capabilityMode: "linked",
    executionLevel: "advisory",
    expiry: defaultExpiryInput(),
    purpose: "Mandat delegasi terbatas untuk workflow yang dipilih.",
    evidenceRequirement: "Simpan bukti sesuai Execution Registry dan audit trail Hermes3D.",
  });

  const agentByKey = useMemo(() => new Map(agents.map((agent) => [agent.key, agent])), [agents]);
  const selected = registry.identities.find((identity) => identity.id === selectedId) || null;
  const projects = useMemo(() => [...new Set(agents.map((agent) => agent.project).filter(Boolean))].sort(), [agents]);
  const filteredIdentities = registry.identities.filter((identity) => {
    const agent = agentByKey.get(identity.agentKey);
    const haystack = [identity.displayName, identity.agentKey, identity.agentClass, identity.lifecycle, agent?.role, agent?.department, agent?.project]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (!lifecycleFilter || identity.lifecycle === lifecycleFilter) && haystack.includes(search.trim().toLowerCase());
  });
  const selectedDelegations = selected ? registry.delegations.filter((delegation) => delegation.agentKey === selected.agentKey) : [];
  const selectedWorkflow = workflows.find((workflow) => workflow.id === grantDraft.workflowId) || null;
  const linkedCapabilities = selectedWorkflow
    ? capabilities.filter((capability) => capability.workflowIds.includes(selectedWorkflow.id) && capability.status !== "retired")
    : [];
  const counts = useMemo(() => ({
    total: registry.identities.length,
    active: registry.identities.filter((identity) => identity.lifecycle === "active").length,
    review: registry.identities.filter((identity) => identity.lifecycle === "review").length,
    suspended: registry.identities.filter((identity) => identity.lifecycle === "suspended").length,
    activeGrants: registry.delegations.filter((delegation) => delegation.status === "active" && Date.parse(delegation.expiresAt) > Date.now()).length,
  }), [registry]);

  const syncResponse = (body: ApiResponse, successMessage: string) => {
    if (!body.registry) throw new Error(body.error || "Agent Identity Registry tidak dapat diperbarui.");
    setRegistry(body.registry);
    setSelectedId((current) => body.registry?.identities.some((identity) => identity.id === current)
      ? current
      : body.registry?.identities[0]?.id || "");
    setRequestState({ kind: "success", message: successMessage });
  };

  const sendAction = async (action: string, payload: Record<string, unknown>, successMessage: string) => {
    setRequestState({ kind: "loading", message: "Memproses perubahan..." });
    try {
      const response = await fetch("/api/agent-identities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = await response.json() as ApiResponse;
      if (!response.ok) throw new Error(body.error || "Perubahan tidak dapat disimpan.");
      syncResponse(body, successMessage);
    } catch (error) {
      setRequestState({ kind: "error", message: error instanceof Error ? error.message : "Perubahan tidak dapat disimpan." });
    }
  };

  const refresh = async () => {
    setRequestState({ kind: "loading", message: "Memuat Agent Identity Registry..." });
    try {
      const response = await fetch("/api/agent-identities", { cache: "no-store" });
      const body = await response.json() as ApiResponse;
      if (!response.ok) throw new Error(body.error || "Registry tidak dapat dimuat.");
      syncResponse(body, "Agent Identity Registry dimuat ulang.");
    } catch (error) {
      setRequestState({ kind: "error", message: error instanceof Error ? error.message : "Registry tidak dapat dimuat." });
    }
  };

  const updateSelected = (patch: Partial<AgentIdentity>) => {
    if (!selected) return;
    setRegistry((current) => ({
      ...current,
      identities: current.identities.map((identity) => identity.id === selected.id ? { ...identity, ...patch } : identity),
    }));
  };

  const saveIdentity = async () => {
    if (!selected) return;
    await sendAction("update_identity", { identityId: selected.id, patch: {
      displayName: selected.displayName,
      agentClass: selected.agentClass,
      supervision: selected.supervision,
      riskTier: selected.riskTier,
      principal: selected.principal,
      projectScopes: selected.projectScopes,
      maxDataClassification: selected.maxDataClassification,
      purpose: selected.purpose,
      statusNote: selected.statusNote,
    } }, "Detail identitas disimpan.");
  };

  const recordLifecycle = async () => {
    if (!selected) return;
    await sendAction("set_identity_lifecycle", {
      identityId: selected.id,
      lifecycle: selected.lifecycle,
      statusNote: selected.statusNote,
    }, "Lifecycle identitas dicatat dan ditinjau.");
  };

  const setProjectScope = (project: string) => {
    if (!selected) return;
    const existing = selected.projectScopes;
    const next = existing.includes(project)
      ? existing.filter((entry) => entry !== project)
      : [...existing.filter((entry) => entry !== "*"), project];
    updateSelected({ projectScopes: next.length ? next : ["*"] });
  };

  const chooseWorkflow = (workflowId: string) => {
    const workflow = workflows.find((entry) => entry.id === workflowId);
    setGrantDraft((current) => ({
      ...current,
      workflowId,
      executionLevel: workflow?.executionLevel || "advisory",
      capabilityMode: "linked",
    }));
  };

  const createGrant = async () => {
    if (!selected || !selectedWorkflow) {
      setRequestState({ kind: "error", message: "Pilih workflow terlebih dahulu." });
      return;
    }
    const expiresAt = new Date(grantDraft.expiry);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      setRequestState({ kind: "error", message: "Masa berlaku mandat harus berada di masa depan." });
      return;
    }
    const capabilityIds = grantDraft.capabilityMode === "linked"
      ? linkedCapabilities.map((capability) => capability.id)
      : grantDraft.capabilityMode === "none"
        ? []
        : [grantDraft.capabilityMode];
    await sendAction("create_delegation", { delegation: {
      agentKey: selected.agentKey,
      workflowIds: [selectedWorkflow.id],
      capabilityIds,
      purpose: grantDraft.purpose,
      executionLevel: grantDraft.executionLevel,
      maxDataClassification: selected.maxDataClassification,
      delegatedBy: selected.principal,
      approvalRequired: grantDraft.executionLevel === "approval",
      status: "active",
      expiresAt: expiresAt.toISOString(),
      evidenceRequirement: grantDraft.evidenceRequirement,
      statusNote: "Dibuat dari Agent Identity Registry.",
    } }, "Mandat delegasi dibuat.");
  };

  const updateGrantStatus = async (grant: DelegationGrant, status: DelegationStatus) => {
    const message = status === "revoked" ? "Mandat delegasi dicabut." : status === "suspended" ? "Mandat delegasi ditangguhkan." : "Mandat delegasi diaktifkan.";
    await sendAction("set_delegation_status", {
      delegationId: grant.id,
      status,
      statusNote: status === "revoked" ? "Dicabut oleh Faza dari Agent Identity Registry." : grant.statusNote,
    }, message);
  };

  const renewGrant = async (grant: DelegationGrant) => {
    const next = new Date();
    next.setDate(next.getDate() + 90);
    await sendAction("update_delegation", {
      delegationId: grant.id,
      patch: {
        expiresAt: next.toISOString(),
        status: "active",
        statusNote: "Diperpanjang 90 hari oleh Faza dari Agent Identity Registry.",
      },
    }, "Mandat delegasi diperpanjang 90 hari.");
  };

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-6 text-foreground sm:px-7 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <Link href="/organization" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Organization</Link>
            <div className="mt-3 flex items-center gap-3"><ShieldCheck size={24} className="text-primary" /><div><h1 className="text-2xl font-semibold">Agent Identity & Delegation</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Identitas, mandat, lifecycle, dan batas otoritas setiap agent. Registry ini menyimpan referensi dan policy, bukan password, token, atau API key.</p></div></div>
          </div>
          <div className="flex items-center gap-2"><Link href="/capabilities" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"><KeyRound size={16} />Capabilities</Link><button type="button" onClick={refresh} title="Muat ulang Agent Identity Registry" aria-label="Muat ulang Agent Identity Registry" disabled={requestState.kind === "loading"} className="flex h-10 w-10 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-50"><RefreshCw size={16} className={requestState.kind === "loading" ? "animate-spin" : ""} /></button></div>
        </div>

        <section aria-label="Ringkasan Agent Identity Registry" className="mb-6 flex flex-wrap items-center gap-x-7 gap-y-2 border-b border-border pb-4 text-sm text-muted-foreground"><span><strong className="text-foreground">{counts.total}</strong> identitas</span><span><strong className="text-foreground">{counts.active}</strong> aktif</span><span><strong className="text-foreground">{counts.review}</strong> perlu review</span><span><strong className="text-foreground">{counts.suspended}</strong> disuspensi</span><span><strong className="text-foreground">{counts.activeGrants}</strong> mandat aktif</span></section>

        {requestState.kind !== "idle" ? <div role="status" className={`mb-5 border px-3 py-2.5 text-sm ${requestState.kind === "error" ? "border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-300" : requestState.kind === "success" ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300" : "border-primary/40 bg-primary/5 text-primary"}`}>{requestState.message}</div> : null}

        <section aria-label="Kontrol Agent Identity Registry" className="mb-5 flex flex-wrap gap-3"><label className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-md border border-border bg-card px-3 sm:basis-auto"><Search size={16} className="shrink-0 text-muted-foreground" /><input aria-label="Cari identitas agent" placeholder="Cari agent atau peran" value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-10 w-full min-w-0 bg-transparent text-sm outline-none" /></label><select aria-label="Filter lifecycle identitas" value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value as "" | AgentIdentityLifecycle)} className="min-h-10 rounded-md border border-border bg-card px-3 text-sm"><option value="">Semua lifecycle</option>{Object.entries(lifecycleMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select><button type="button" onClick={() => sendAction("reconcile_identities", {}, "Roster dibandingkan dengan Agent Identity Registry.")} disabled={requestState.kind === "loading"} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"><UsersRound size={16} />Sinkronkan roster</button></section>

        <div className="grid gap-7 lg:grid-cols-[minmax(17rem,0.75fr)_minmax(0,1.45fr)]">
          <section aria-label="Daftar identitas agent" className="min-w-0 border-y border-border">
            {!filteredIdentities.length ? <p className="py-8 text-sm text-muted-foreground">Tidak ada identitas yang sesuai filter.</p> : filteredIdentities.map((identity) => {
              const agent = agentByKey.get(identity.agentKey);
              const selectedRow = selected?.id === identity.id;
              return <button key={identity.id} type="button" onClick={() => setSelectedId(identity.id)} aria-pressed={selectedRow} className={`flex w-full items-start gap-3 border-b border-border px-3 py-4 text-left last:border-b-0 ${selectedRow ? "bg-primary/10" : "hover:bg-muted/50"}`}><span className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded ${identity.lifecycle === "active" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : identity.lifecycle === "review" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}>{identity.lifecycle === "active" ? <UserRoundCheck size={17} /> : <UserRoundX size={17} />}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{identity.displayName}</span><LifecyclePill lifecycle={identity.lifecycle} /></span><span className="mt-1 block text-xs text-muted-foreground">{classLabels[identity.agentClass]} · {agent?.department || identity.agentKey}</span><span className="mt-2 block line-clamp-2 text-xs leading-5 text-muted-foreground">{identity.projectScopes.includes("*") ? "Lintas proyek" : identity.projectScopes.join(", ")} · data {dataLabels[identity.maxDataClassification]}</span></span></button>;
            })}
          </section>

          <section aria-label="Detail identitas dan mandat" className="min-w-0 border-t border-border pt-5 lg:border-l lg:pl-7 lg:pt-0">
            {!selected ? <p className="py-8 text-sm text-muted-foreground">Pilih identitas agent untuk melihat mandatnya.</p> : <div>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"><div><p className="text-xs font-medium text-primary">{selected.agentKey}</p><div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{selected.displayName}</h2><LifecyclePill lifecycle={selected.lifecycle} /></div><p className="mt-1 text-sm text-muted-foreground">Principal: {selected.principal} · akuntabilitas: {selected.accountabilityOwner} · terakhir ditinjau {shortDate(selected.lastReviewedAt)}</p></div><button type="button" onClick={refresh} title="Muat ulang registry" aria-label="Muat ulang registry" disabled={requestState.kind === "loading"} className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-50"><RefreshCw size={16} /></button></div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label><FieldLabel>Kelas agent</FieldLabel><select aria-label="Kelas agent" value={selected.agentClass} onChange={(event) => updateSelected({ agentClass: event.target.value as AgentIdentityClass })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(classLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><FieldLabel>Mode supervisi</FieldLabel><select aria-label="Mode supervisi agent" value={selected.supervision} onChange={(event) => updateSelected({ supervision: event.target.value as AgentSupervision })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(supervisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><FieldLabel>Risk tier</FieldLabel><select aria-label="Risk tier agent" value={selected.riskTier} onChange={(event) => updateSelected({ riskTier: event.target.value as AgentRiskTier })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(riskLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><FieldLabel>Batas klasifikasi data</FieldLabel><select aria-label="Batas data agent" value={selected.maxDataClassification} onChange={(event) => updateSelected({ maxDataClassification: event.target.value as IdentityDataClassification })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(dataLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><FieldLabel>Principal manusia</FieldLabel><input aria-label="Principal manusia" value={selected.principal} onChange={(event) => updateSelected({ principal: event.target.value })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                <label><FieldLabel>Penanggung jawab akuntabilitas</FieldLabel><input aria-label="Penanggung jawab akuntabilitas" value={selected.accountabilityOwner} onChange={(event) => updateSelected({ accountabilityOwner: event.target.value })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                <label className="sm:col-span-2"><FieldLabel>Tujuan identitas</FieldLabel><TextArea label="Tujuan identitas" value={selected.purpose} onChange={(purpose) => updateSelected({ purpose })} /></label>
              </div>

              <section aria-label="Scope project dan lifecycle" className="mt-6 border-t border-border pt-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Scope project dan lifecycle</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Identity yang disuspensi atau pensiun tidak dapat merutekan Work Order. Scope membatasi proyek yang boleh dimiliki agent.</p></div><button type="button" onClick={() => updateSelected({ projectScopes: ["*"] })} className="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">Lintas proyek</button></div><div className="mt-3 flex flex-wrap gap-2">{projects.map((project) => <label key={project} className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"><input type="checkbox" checked={selected.projectScopes.includes("*") || selected.projectScopes.includes(project)} onChange={() => setProjectScope(project)} className="h-4 w-4 accent-primary" />{project}</label>)}</div><div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto]"><label><FieldLabel>Lifecycle</FieldLabel><select aria-label="Lifecycle identitas" value={selected.lifecycle} onChange={(event) => updateSelected({ lifecycle: event.target.value as AgentIdentityLifecycle })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(lifecycleMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label><label><FieldLabel>Catatan lifecycle</FieldLabel><input aria-label="Catatan lifecycle identitas" value={selected.statusNote} onChange={(event) => updateSelected({ statusNote: event.target.value })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label><button type="button" onClick={recordLifecycle} disabled={requestState.kind === "loading"} className="mt-[26px] inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"><CheckCircle2 size={16} />Catat lifecycle</button></div></section>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><p className="flex max-w-xl items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck size={15} className="mt-0.5 shrink-0" />Identitas tidak menyimpan kredensial. Policy ini hanya menentukan siapa yang dapat menggunakan capability pada workflow tertentu.</p><button type="button" onClick={saveIdentity} disabled={requestState.kind === "loading"} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"><Save size={16} />Simpan identitas</button></div>

              <section aria-label="Mandat delegasi" className="mt-8 border-t border-border pt-6"><div className="flex items-center gap-2"><Link2 size={18} className="text-primary" /><h2 className="text-base font-semibold">Mandat delegasi</h2></div><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Mandat mengikat agent ke workflow dan capability secara eksplisit, termasuk batas tindakan, approval, bukti, masa berlaku, dan pencabutan akses.</p>
                <div className="mt-5 grid gap-4 rounded-md border border-border bg-muted/20 p-4 sm:grid-cols-2"><label><FieldLabel>Workflow</FieldLabel><select aria-label="Workflow mandat baru" value={grantDraft.workflowId} onChange={(event) => chooseWorkflow(event.target.value)} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"><option value="">Pilih workflow</option>{workflows.filter((workflow) => workflow.ownerKey === selected.agentKey || workflow.allowedAgentKeys.includes(selected.agentKey)).map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></label><label><FieldLabel>Capability</FieldLabel><select aria-label="Capability mandat baru" value={grantDraft.capabilityMode} onChange={(event) => setGrantDraft((current) => ({ ...current, capabilityMode: event.target.value }))} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"><option value="linked">Semua capability workflow ({linkedCapabilities.length})</option><option value="none">Tanpa capability spesifik</option>{linkedCapabilities.map((capability) => <option key={capability.id} value={capability.id}>{capability.name}</option>)}</select></label><label><FieldLabel>Level tindakan</FieldLabel><select aria-label="Level tindakan mandat baru" value={grantDraft.executionLevel} onChange={(event) => setGrantDraft((current) => ({ ...current, executionLevel: event.target.value as DelegationExecutionLevel }))} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(executionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><FieldLabel>Berlaku sampai</FieldLabel><input aria-label="Masa berlaku mandat baru" type="datetime-local" value={grantDraft.expiry} onChange={(event) => setGrantDraft((current) => ({ ...current, expiry: event.target.value }))} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label><label className="sm:col-span-2"><FieldLabel>Tujuan mandat</FieldLabel><TextArea label="Tujuan mandat baru" value={grantDraft.purpose} onChange={(purpose) => setGrantDraft((current) => ({ ...current, purpose }))} rows={2} /></label><label className="sm:col-span-2"><FieldLabel>Bukti yang diperlukan</FieldLabel><TextArea label="Bukti mandat baru" value={grantDraft.evidenceRequirement} onChange={(evidenceRequirement) => setGrantDraft((current) => ({ ...current, evidenceRequirement }))} rows={2} /></label><div className="sm:col-span-2"><button type="button" onClick={createGrant} disabled={requestState.kind === "loading" || !grantDraft.workflowId} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"><Plus size={16} />Buat mandat delegasi</button></div></div>
                <div className="mt-5 divide-y divide-border border-y border-border">{selectedDelegations.length ? selectedDelegations.map((grant) => { const expired = Date.parse(grant.expiresAt) <= Date.now(); const names = grant.workflowIds.map((workflowId) => workflows.find((workflow) => workflow.id === workflowId)?.name || workflowId); return <article key={grant.id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{names.join(", ")}</h3><DelegationPill status={expired && grant.status === "active" ? "expired" : grant.status} /></div><p className="mt-1 text-xs text-muted-foreground">{executionLabels[grant.executionLevel]} · data sampai {dataLabels[grant.maxDataClassification]} · berakhir {shortDate(grant.expiresAt)}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => renewGrant(grant)} className="min-h-8 rounded-md border border-border px-2.5 text-xs hover:bg-muted">Perpanjang</button>{grant.status === "active" ? <button type="button" onClick={() => updateGrantStatus(grant, "suspended")} className="min-h-8 rounded-md border border-border px-2.5 text-xs hover:bg-muted">Tangguhkan</button> : <button type="button" onClick={() => updateGrantStatus(grant, "active")} className="min-h-8 rounded-md border border-border px-2.5 text-xs hover:bg-muted">Aktifkan</button>}<button type="button" onClick={() => updateGrantStatus(grant, "revoked")} className="min-h-8 rounded-md border border-rose-500/40 px-2.5 text-xs text-rose-700 hover:bg-rose-500/10 dark:text-rose-300">Cabut</button></div></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{grant.purpose}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Capability: {grant.capabilityIds.length ? grant.capabilityIds.map((capabilityId) => capabilities.find((capability) => capability.id === capabilityId)?.name || capabilityId).join(", ") : "Tidak ada capability spesifik"} · approval {grant.approvalRequired ? "diperlukan" : "tidak diperlukan"}</p><div className="mt-3 border-l-2 border-primary/40 pl-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Span of Agency:</strong> boleh {grant.spanOfAgency.allowedActions.join(", ")}; approval/pause/override tetap manusia ({grant.spanOfAgency.humanReservedActions.join(", ")}). Boundary owner: {grant.boundaryOwner}; outcome owner: {grant.outcomeOwner}; review tiap {grant.spanOfAgency.reviewIntervalDays} hari.</div></article>; }) : <p className="py-7 text-sm text-muted-foreground">Belum ada mandat delegasi untuk identitas ini.</p>}</div>
              </section>
            </div>}
          </section>
        </div>

        <section aria-labelledby="identity-audit-heading" className="mt-10 border-t border-border pt-6"><div className="flex items-center gap-2"><Activity size={18} className="text-primary" /><h2 id="identity-audit-heading" className="text-base font-semibold">Identity audit trail</h2></div><div className="mt-4 divide-y divide-border border-y border-border">{registry.auditEvents.length ? registry.auditEvents.slice(0, 40).map((event) => <div key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 py-3 text-sm"><p><span className="font-medium">{event.actor}</span><span className="text-muted-foreground"> · {event.type.replaceAll("_", " ")}</span>{event.note ? <span className="text-muted-foreground"> · {event.note}</span> : null}</p><time className="text-xs text-muted-foreground">{shortDate(event.at)}</time></div>) : <p className="py-8 text-sm text-muted-foreground">Belum ada perubahan identitas atau mandat yang tercatat.</p>}</div></section>

        <aside className="mt-8 flex items-start gap-3 border-l-2 border-amber-500/60 py-1 pl-4 text-sm leading-6 text-muted-foreground"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" /><p>Mandat aktif tidak menggantikan approval workflow. Aksi produksi, perubahan akses, transaksi, dan komunikasi eksternal tetap membutuhkan approval Faza sesuai Execution Registry.</p></aside>
      </div>
    </main>
  );
}
