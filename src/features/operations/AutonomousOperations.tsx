"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Brain,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Database,
  FileCheck2,
  ListChecks,
  Play,
  Plus,
  RefreshCw,
  Route,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { ExecutionRegistryState } from "@/features/execution/types";
import type {
  OperationsAgent,
  OperationsLoopState,
  OperationSignal,
  SignalPriority,
  SignalSource,
  WorkOrder,
  WorkOrderStatus,
} from "./types";

const workOrderMeta: Record<WorkOrderStatus, { label: string; className: string }> = {
  waiting_approval: { label: "Menunggu persetujuan", className: "border-amber-500/40 text-amber-700 dark:text-amber-300" },
  queued: { label: "Antrean", className: "border-sky-500/40 text-sky-700 dark:text-sky-300" },
  in_progress: { label: "Berjalan", className: "border-indigo-500/40 text-indigo-700 dark:text-indigo-300" },
  evidence_required: { label: "Butuh bukti", className: "border-violet-500/40 text-violet-700 dark:text-violet-300" },
  blocked: { label: "Terblokir", className: "border-rose-500/40 text-rose-700 dark:text-rose-300" },
  completed: { label: "Selesai", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" },
  cancelled: { label: "Dibatalkan", className: "border-zinc-500/40 text-zinc-600 dark:text-zinc-300" },
};

const priorityMeta: Record<SignalPriority, { label: string; className: string }> = {
  low: { label: "Rendah", className: "text-slate-600 dark:text-slate-300" },
  normal: { label: "Normal", className: "text-sky-700 dark:text-sky-300" },
  high: { label: "Tinggi", className: "text-rose-700 dark:text-rose-300" },
};

const sourceLabels: Record<SignalSource, string> = {
  manual: "Manual",
  chat: "Hermes chat",
  monitor: "Monitor",
  erp: "ERP",
  schedule: "Jadwal",
};

const shortDate = (value: string | null) => {
  if (!value) return "-";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
};

function StatusPill({ status }: { status: WorkOrderStatus }) {
  const meta = workOrderMeta[status];
  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>;
}

function FieldLabel({ children }: { children: string }) {
  return <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{children}</label>;
}

function PrimaryButton({ children, onClick, disabled = false, className = "" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>{children}</button>;
}

function SecondaryButton({ children, onClick, disabled = false, className = "" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>{children}</button>;
}

export function AutonomousOperations({
  initialOperations,
  initialRegistry,
  agents,
}: {
  initialOperations: OperationsLoopState;
  initialRegistry: ExecutionRegistryState;
  agents: OperationsAgent[];
}) {
  const [operations, setOperations] = useState(initialOperations);
  const [registry, setRegistry] = useState(initialRegistry);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState(initialOperations.workOrders[0]?.id || "");
  const [routeWorkflowBySignal, setRouteWorkflowBySignal] = useState<Record<string, string>>({});
  const [signalTitle, setSignalTitle] = useState("");
  const [signalDescription, setSignalDescription] = useState("");
  const [signalSource, setSignalSource] = useState<SignalSource>("manual");
  const [signalPriority, setSignalPriority] = useState<SignalPriority>("normal");
  const [signalWorkflowId, setSignalWorkflowId] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [evidenceSource, setEvidenceSource] = useState("Hermes Workspace");
  const [actionNote, setActionNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [lessons, setLessons] = useState("");
  const [filter, setFilter] = useState<"all" | WorkOrderStatus>("all");
  const [requestState, setRequestState] = useState<{ kind: "idle" | "loading" | "success" | "error"; message: string }>({ kind: "idle", message: "" });

  const readyWorkflows = useMemo(() => registry.workflows.filter((workflow) => workflow.lifecycle === "ready"), [registry]);
  const agentByKey = useMemo(() => new Map(agents.map((agent) => [agent.key, agent])), [agents]);
  const selectedWorkOrder = operations.workOrders.find((entry) => entry.id === selectedWorkOrderId) || null;
  const openSignals = operations.signals.filter((signal) => signal.status === "new");
  const filteredWorkOrders = operations.workOrders.filter((workOrder) => filter === "all" || workOrder.status === filter);
  const counts = useMemo(() => ({
    signals: openSignals.length,
    approvals: operations.workOrders.filter((workOrder) => workOrder.status === "waiting_approval").length,
    active: operations.workOrders.filter((workOrder) => workOrder.status === "in_progress").length,
    evidence: operations.workOrders.filter((workOrder) => workOrder.status === "evidence_required").length,
    completed: operations.workOrders.filter((workOrder) => workOrder.status === "completed").length,
  }), [openSignals.length, operations.workOrders]);

  const agentLabel = (key: string) => {
    const agent = agentByKey.get(key);
    return agent ? `${agent.name}${agent.role ? ` - ${agent.role}` : ""}` : key;
  };

  const selectWorkOrder = (workOrder: WorkOrder) => {
    setSelectedWorkOrderId(workOrder.id);
    setOutcome(workOrder.outcome);
    setLessons(workOrder.lessons);
    setEvidenceDescription("");
    setActionNote("");
  };

  const applyResponse = (body: { operations?: OperationsLoopState; registry?: ExecutionRegistryState; error?: string }, successMessage: string) => {
    if (!body.operations) throw new Error(body.error || "Autonomous Operations tidak dapat diperbarui.");
    setOperations(body.operations);
    if (body.registry) setRegistry(body.registry);
    setRequestState({ kind: "success", message: successMessage });
  };

  const sendAction = async (action: string, payload: Record<string, unknown>, successMessage: string) => {
    setRequestState({ kind: "loading", message: "Memproses perubahan..." });
    try {
      const response = await fetch("/api/operations-loop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = await response.json() as { operations?: OperationsLoopState; registry?: ExecutionRegistryState; error?: string };
      if (!response.ok) throw new Error(body.error || "Autonomous Operations tidak dapat diperbarui.");
      applyResponse(body, successMessage);
      return body.operations || null;
    } catch (error) {
      setRequestState({ kind: "error", message: error instanceof Error ? error.message : "Autonomous Operations tidak dapat diperbarui." });
      return null;
    }
  };

  const refresh = async () => {
    setRequestState({ kind: "loading", message: "Memuat ulang data..." });
    try {
      const response = await fetch("/api/operations-loop", { cache: "no-store" });
      const body = await response.json() as { operations?: OperationsLoopState; registry?: ExecutionRegistryState; error?: string };
      if (!response.ok || !body.operations || !body.registry) throw new Error(body.error || "Data operasi tidak dapat dimuat.");
      setOperations(body.operations);
      setRegistry(body.registry);
      setRequestState({ kind: "success", message: "Data operasi dimuat ulang." });
    } catch (error) {
      setRequestState({ kind: "error", message: error instanceof Error ? error.message : "Data operasi tidak dapat dimuat." });
    }
  };

  const createSignal = async () => {
    if (!signalTitle.trim()) {
      setRequestState({ kind: "error", message: "Judul signal diperlukan." });
      return;
    }
    const next = await sendAction("create_signal", {
      title: signalTitle,
      description: signalDescription,
      source: signalSource,
      priority: signalPriority,
      workflowId: signalWorkflowId,
    }, signalWorkflowId ? "Signal dibuat dan dirutekan ke workflow." : "Signal dibuat di inbox operasi.");
    if (!next) return;
    setSignalTitle("");
    setSignalDescription("");
    setSignalWorkflowId("");
    if (next.workOrders[0]) selectWorkOrder(next.workOrders[0]);
  };

  const routeSignal = async (signal: OperationSignal) => {
    const workflowId = routeWorkflowBySignal[signal.id];
    if (!workflowId) {
      setRequestState({ kind: "error", message: "Pilih workflow siap sebelum merutekan signal." });
      return;
    }
    const next = await sendAction("route_signal", { signalId: signal.id, workflowId }, "Signal dirutekan menjadi work order.");
    if (!next) return;
    const workOrder = next.workOrders.find((entry) => entry.signalId === signal.id);
    if (workOrder) selectWorkOrder(workOrder);
  };

  const runSelectedAction = async (action: string, payload: Record<string, unknown>, successMessage: string) => {
    if (!selectedWorkOrder) return;
    const next = await sendAction(action, { workOrderId: selectedWorkOrder.id, ...payload }, successMessage);
    if (!next) return;
    const workOrder = next.workOrders.find((entry) => entry.id === selectedWorkOrder.id);
    if (workOrder) selectWorkOrder(workOrder);
  };

  const performance = readyWorkflows.map((workflow) => {
    const workOrders = operations.workOrders.filter((entry) => entry.workflowId === workflow.id);
    const completed = workOrders.filter((entry) => entry.status === "completed");
    const withEvidence = workOrders.filter((entry) => entry.evidence.length > 0);
    return { workflow, total: workOrders.length, completed: completed.length, evidence: withEvidence.length };
  });

  return (
    <div className="min-h-full bg-background text-foreground" style={{ letterSpacing: 0 }}>
      <header className="border-b border-border bg-card px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Hermes3D / Control plane</p>
            <h1 className="mt-1 text-2xl font-semibold">Autonomous Operations</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/organization" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><ShieldCheck size={16} />Organisasi</Link>
            <Link href="/execution" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><ListChecks size={16} />Execution Registry</Link>
            <Link href="/capabilities" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><Database size={16} />Capabilities</Link>
            <Link href="/office" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><ArrowLeft size={16} />Kantor 3D</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <section aria-label="Ringkasan operasi" className="flex flex-wrap items-center gap-x-7 gap-y-3 border-b border-border pb-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{counts.signals}</strong> signal baru</span>
          <span><strong className="text-foreground">{counts.approvals}</strong> menunggu persetujuan</span>
          <span><strong className="text-foreground">{counts.active}</strong> sedang berjalan</span>
          <span><strong className="text-foreground">{counts.evidence}</strong> butuh bukti</span>
          <span><strong className="text-foreground">{counts.completed}</strong> selesai</span>
          <button type="button" onClick={refresh} title="Muat ulang Autonomous Operations" className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"><RefreshCw size={15} />Muat ulang</button>
        </section>

        {requestState.kind !== "idle" ? <p role="status" className={`mt-4 border-l-2 pl-3 text-sm ${requestState.kind === "error" ? "border-rose-500 text-rose-700 dark:text-rose-300" : requestState.kind === "loading" ? "border-sky-500 text-muted-foreground" : "border-emerald-500 text-emerald-700 dark:text-emerald-300"}`}>{requestState.message}</p> : null}

        <section aria-labelledby="new-signal-heading" className="mt-7 border-y border-border py-5">
          <div className="flex items-center gap-2"><Activity size={18} className="text-primary" /><h2 id="new-signal-heading" className="text-base font-semibold">Signal masuk</h2></div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.35fr)_minmax(180px,0.26fr)_auto]">
            <div>
              <FieldLabel>Judul kebutuhan atau kejadian</FieldLabel>
              <input aria-label="Judul signal" value={signalTitle} onChange={(event) => setSignalTitle(event.target.value)} placeholder="Contoh: Validasi kebutuhan perubahan ERP PABK" className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <FieldLabel>Workflow tujuan</FieldLabel>
              <select aria-label="Workflow tujuan" value={signalWorkflowId} onChange={(event) => setSignalWorkflowId(event.target.value)} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
                <option value="">Simpan di inbox dulu</option>
                {readyWorkflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><FieldLabel>Sumber</FieldLabel><select aria-label="Sumber signal" value={signalSource} onChange={(event) => setSignalSource(event.target.value as SignalSource)} className="min-h-10 w-full rounded-md border border-border bg-background px-2 text-sm">{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div><FieldLabel>Prioritas</FieldLabel><select aria-label="Prioritas signal" value={signalPriority} onChange={(event) => setSignalPriority(event.target.value as SignalPriority)} className="min-h-10 w-full rounded-md border border-border bg-background px-2 text-sm">{Object.entries(priorityMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></div>
            </div>
            <div className="flex items-end"><PrimaryButton onClick={createSignal} disabled={requestState.kind === "loading"} className="w-full"><Plus size={16} />Buat signal</PrimaryButton></div>
          </div>
          <div className="mt-4">
            <FieldLabel>Detail dan konteks</FieldLabel>
            <textarea aria-label="Detail signal" value={signalDescription} onChange={(event) => setSignalDescription(event.target.value)} rows={3} placeholder="Sertakan konteks, batasan, sumber data, atau outcome yang diharapkan." className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" />
          </div>
        </section>

        <div className="mt-7 grid items-start gap-8 xl:grid-cols-[minmax(310px,0.8fr)_minmax(0,1.2fr)]">
          <section aria-labelledby="signal-inbox-heading" className="min-w-0 border-t border-border pt-5 xl:border-t-0 xl:border-r xl:pr-7 xl:pt-0">
            <div className="flex items-center justify-between gap-3"><div><h2 id="signal-inbox-heading" className="text-base font-semibold">Inbox signal</h2><p className="mt-1 text-sm text-muted-foreground">Signal baru baru menjadi work order setelah dirutekan ke workflow siap.</p></div><span className="text-sm font-medium text-muted-foreground">{openSignals.length}</span></div>
            <div className="mt-4 divide-y divide-border border-y border-border">
              {!openSignals.length ? <p className="py-8 text-sm text-muted-foreground">Tidak ada signal baru.</p> : openSignals.map((signal) => <article key={signal.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-sm font-semibold">{signal.title}</h3><p className="mt-1 text-xs text-muted-foreground">{sourceLabels[signal.source]} · {shortDate(signal.createdAt)}</p></div><span className={`text-xs font-medium ${priorityMeta[signal.priority].className}`}>{priorityMeta[signal.priority].label}</span></div>
                {signal.description ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{signal.description}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2"><select aria-label={`Workflow untuk ${signal.title}`} value={routeWorkflowBySignal[signal.id] || ""} onChange={(event) => setRouteWorkflowBySignal((current) => ({ ...current, [signal.id]: event.target.value }))} className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"><option value="">Pilih workflow siap</option>{readyWorkflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select><SecondaryButton onClick={() => routeSignal(signal)} disabled={requestState.kind === "loading"}><Route size={16} />Rutekan</SecondaryButton><button type="button" onClick={() => sendAction("dismiss_signal", { signalId: signal.id }, "Signal ditutup.")} title="Tutup signal" className="inline-flex min-h-10 items-center justify-center rounded-md border border-rose-500/30 px-3 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"><XCircle size={16} /></button></div>
              </article>)}</div>
          </section>

          <section aria-labelledby="work-orders-heading" className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="work-orders-heading" className="text-base font-semibold">Work orders</h2><p className="mt-1 text-sm text-muted-foreground">Owner, approval, bukti, outcome, dan pembelajaran tersimpan sebagai satu jejak eksekusi.</p></div><select aria-label="Filter status work order" value={filter} onChange={(event) => setFilter(event.target.value as "all" | WorkOrderStatus)} className="min-h-10 rounded-md border border-border bg-background px-3 text-sm"><option value="all">Semua status</option>{Object.entries(workOrderMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></div>
            <div className="mt-4 grid items-start gap-7 lg:grid-cols-[minmax(245px,0.75fr)_minmax(0,1.25fr)]">
              <div className="max-h-[680px] overflow-y-auto border-y border-border">
                {!filteredWorkOrders.length ? <p className="py-8 text-sm text-muted-foreground">Belum ada work order pada filter ini.</p> : filteredWorkOrders.map((workOrder) => {
                  const isSelected = workOrder.id === selectedWorkOrder?.id;
                  return <button key={workOrder.id} type="button" onClick={() => selectWorkOrder(workOrder)} aria-pressed={isSelected} className={`w-full border-b border-border px-3 py-4 text-left last:border-b-0 ${isSelected ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                    <span className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 text-sm font-semibold">{workOrder.title}</span><StatusPill status={workOrder.status} /></span>
                    <span className="mt-1 block text-xs text-muted-foreground">{workOrder.workflowName}{workOrder.project ? ` · ${workOrder.project}` : ""}</span>
                    <span className="mt-2 block truncate text-xs text-muted-foreground">Owner: {agentLabel(workOrder.ownerKey)}</span>
                  </button>;
                })}</div>

              <div className="min-w-0 border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pl-7 lg:pt-0">
                {!selectedWorkOrder ? <p className="py-8 text-sm text-muted-foreground">Pilih work order untuk melihat detail dan melanjutkan kontrol eksekusinya.</p> : <div>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{selectedWorkOrder.title}</h3><StatusPill status={selectedWorkOrder.status} /></div><p className="mt-1 text-sm text-muted-foreground">{selectedWorkOrder.workflowName}{selectedWorkOrder.project ? ` · ${selectedWorkOrder.project}` : " · Lintas fungsi"}</p></div><span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">{selectedWorkOrder.executionLevel === "approval" ? "Approval gate" : selectedWorkOrder.executionLevel === "bounded" ? "Otonomi terbatas" : "Analisis dan draf"}</span></div>

                  <dl className="mt-5 grid gap-x-6 gap-y-4 border-y border-border py-4 text-sm sm:grid-cols-2"><div><dt className="text-xs font-medium text-muted-foreground">Owner</dt><dd className="mt-1">{agentLabel(selectedWorkOrder.ownerKey)}</dd></div><div><dt className="text-xs font-medium text-muted-foreground">Persetujuan</dt><dd className="mt-1">{selectedWorkOrder.approvalState === "pending" ? "Menunggu Faza" : selectedWorkOrder.approvalState === "approved" ? "Disetujui" : selectedWorkOrder.approvalState === "rejected" ? "Ditolak" : "Tidak diperlukan"}</dd></div><div><dt className="text-xs font-medium text-muted-foreground">Dibuat</dt><dd className="mt-1">{shortDate(selectedWorkOrder.createdAt)}</dd></div><div><dt className="text-xs font-medium text-muted-foreground">Status</dt><dd className="mt-1">{selectedWorkOrder.statusReason || "-"}</dd></div></dl>

                  <section className="mt-5 border-l-2 border-primary/60 pl-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-semibold">Pemeriksaan capability</h4><p className="mt-1 text-sm leading-6 text-muted-foreground">{selectedWorkOrder.capabilityAssessment.decision === "allowed" ? "Capability yang tertaut memenuhi policy routing." : selectedWorkOrder.capabilityAssessment.decision === "review" ? "Routing dicatat dengan kebutuhan verifikasi capability sebelum aksi pada sistem terkait." : "Capability menolak routing ini."}</p></div><Link href="/capabilities" className="text-sm font-medium text-primary hover:underline">Buka registry</Link></div>{selectedWorkOrder.capabilityAssessment.capabilityIds.length ? <p className="mt-2 text-xs text-muted-foreground">{selectedWorkOrder.capabilityAssessment.capabilityIds.length} capability diperiksa · {selectedWorkOrder.capabilityAssessment.checkedAt ? shortDate(selectedWorkOrder.capabilityAssessment.checkedAt) : "riwayat lama"}</p> : <p className="mt-2 text-xs text-muted-foreground">Belum ada capability tertaut pada workflow ini.</p>}{selectedWorkOrder.capabilityAssessment.warnings.length ? <ul className="mt-3 space-y-1 text-sm text-amber-700 dark:text-amber-300">{selectedWorkOrder.capabilityAssessment.warnings.map((warning) => <li key={warning}>- {warning}</li>)}</ul> : null}</section>

                  <section className="mt-5 border-l-2 border-emerald-500/60 pl-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-semibold">Pemeriksaan identitas dan mandat</h4><p className="mt-1 text-sm leading-6 text-muted-foreground">{selectedWorkOrder.identityAssessment.decision === "allowed" ? "Identitas owner dan mandat delegasi memenuhi policy routing." : selectedWorkOrder.identityAssessment.decision === "review" ? "Routing dilakukan dengan pengingat review identitas atau masa berlaku mandat." : "Identitas atau mandat delegasi menolak routing ini."}</p></div><Link href="/identities" className="text-sm font-medium text-primary hover:underline">Buka registry</Link></div>{selectedWorkOrder.identityAssessment.identityId ? <p className="mt-2 text-xs text-muted-foreground">{selectedWorkOrder.identityAssessment.delegationIds.length} mandat diperiksa · {selectedWorkOrder.identityAssessment.checkedAt ? shortDate(selectedWorkOrder.identityAssessment.checkedAt) : "riwayat lama"}</p> : <p className="mt-2 text-xs text-muted-foreground">Riwayat lama belum memuat pemeriksaan identitas.</p>}{selectedWorkOrder.identityAssessment.warnings.length ? <ul className="mt-3 space-y-1 text-sm text-amber-700 dark:text-amber-300">{selectedWorkOrder.identityAssessment.warnings.map((warning) => <li key={warning}>- {warning}</li>)}</ul> : null}</section>

                  {selectedWorkOrder.description ? <section className="mt-5"><h4 className="text-sm font-semibold">Konteks</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{selectedWorkOrder.description}</p></section> : null}
                  <section className="mt-5"><h4 className="text-sm font-semibold">Bukti yang diwajibkan</h4><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{selectedWorkOrder.evidenceRequirements.map((item) => <li key={item}>- {item}</li>)}</ul></section>

                  {selectedWorkOrder.status === "waiting_approval" ? <section className="mt-5 border-t border-border pt-5"><h4 className="text-sm font-semibold">Keputusan persetujuan</h4><p className="mt-1 text-sm leading-6 text-muted-foreground">{selectedWorkOrder.approvalGate}</p><div className="mt-4"><FieldLabel>Alasan penolakan bila diperlukan</FieldLabel><textarea aria-label="Alasan penolakan" value={actionNote} onChange={(event) => setActionNote(event.target.value)} rows={2} className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></div><div className="mt-3 flex flex-wrap gap-2"><PrimaryButton onClick={() => runSelectedAction("approve_work_order", {}, "Work order disetujui dan masuk antrean.")} disabled={requestState.kind === "loading"}><CheckCircle2 size={16} />Setujui</PrimaryButton><SecondaryButton onClick={() => runSelectedAction("reject_work_order", { reason: actionNote }, "Work order ditolak dan dibatalkan.")} disabled={requestState.kind === "loading" || !actionNote.trim()} className="border-rose-500/40 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"><XCircle size={16} />Tolak</SecondaryButton></div></section> : null}

                  {selectedWorkOrder.status === "queued" ? <section className="mt-5 border-t border-border pt-5"><div className="flex flex-wrap gap-2"><PrimaryButton onClick={() => runSelectedAction("start_work_order", {}, "Work order dimulai.")} disabled={requestState.kind === "loading"}><Play size={16} />Mulai</PrimaryButton></div></section> : null}

                  {new Set(["queued", "in_progress", "evidence_required"]).has(selectedWorkOrder.status) ? <section className="mt-5 border-t border-border pt-5"><FieldLabel>Blocker atau risiko yang perlu dieskalasi</FieldLabel><textarea aria-label="Blocker atau risiko" value={actionNote} onChange={(event) => setActionNote(event.target.value)} rows={2} placeholder="Isi hanya jika pekerjaan perlu diblokir." className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" /><div className="mt-3"><SecondaryButton onClick={() => runSelectedAction("block_work_order", { reason: actionNote }, "Work order diblokir dan dicatat.")} disabled={requestState.kind === "loading" || !actionNote.trim()} className="border-rose-500/40 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"><CircleAlert size={16} />Blokir dan eskalasi</SecondaryButton></div></section> : null}

                  {selectedWorkOrder.status === "in_progress" ? <section className="mt-5"><PrimaryButton onClick={() => runSelectedAction("request_evidence", {}, "Work order sekarang menunggu bukti hasil.")} disabled={requestState.kind === "loading"}><ClipboardCheck size={16} />Minta bukti hasil</PrimaryButton></section> : null}

                  {new Set(["in_progress", "evidence_required", "blocked"]).has(selectedWorkOrder.status) ? <section className="mt-5 border-t border-border pt-5"><h4 className="text-sm font-semibold">Bukti hasil</h4><div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]"><textarea aria-label="Deskripsi bukti" value={evidenceDescription} onChange={(event) => setEvidenceDescription(event.target.value)} rows={3} placeholder="Tautan, ringkasan hasil uji, dokumen, atau bukti lain." className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" /><div><FieldLabel>Sumber bukti</FieldLabel><input aria-label="Sumber bukti" value={evidenceSource} onChange={(event) => setEvidenceSource(event.target.value)} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /><SecondaryButton onClick={async () => { await runSelectedAction("add_evidence", { description: evidenceDescription, source: evidenceSource }, "Bukti hasil ditambahkan."); setEvidenceDescription(""); }} disabled={requestState.kind === "loading" || !evidenceDescription.trim()} className="mt-3 w-full"><FileCheck2 size={16} />Tambah bukti</SecondaryButton></div></div>
                    {selectedWorkOrder.evidence.length ? <ul className="mt-4 divide-y divide-border border-y border-border">{selectedWorkOrder.evidence.map((evidence) => <li key={evidence.id} className="py-3 text-sm"><p>{evidence.description}</p><p className="mt-1 text-xs text-muted-foreground">{evidence.source} · {evidence.recordedBy} · {shortDate(evidence.recordedAt)}</p></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Belum ada bukti tercatat.</p>}</section> : null}

                  {new Set(["in_progress", "evidence_required"]).has(selectedWorkOrder.status) ? <section className="mt-5 border-t border-border pt-5"><h4 className="text-sm font-semibold">Tutup dan pelajari</h4><div className="mt-3"><FieldLabel>Outcome</FieldLabel><textarea aria-label="Outcome work order" value={outcome} onChange={(event) => setOutcome(event.target.value)} rows={3} placeholder="Hasil akhir dan dampaknya." className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" /></div><div className="mt-3"><FieldLabel>Pembelajaran</FieldLabel><textarea aria-label="Pembelajaran work order" value={lessons} onChange={(event) => setLessons(event.target.value)} rows={3} placeholder="Apa yang perlu dipertahankan atau diperbaiki pada eksekusi berikutnya?" className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" /></div><PrimaryButton onClick={() => runSelectedAction("complete_work_order", { outcome, lessons }, "Work order selesai dengan bukti dan outcome tersimpan.")} disabled={requestState.kind === "loading" || !outcome.trim() || selectedWorkOrder.evidence.length === 0} className="mt-3"><CheckCircle2 size={16} />Selesaikan work order</PrimaryButton></section> : null}

                  {selectedWorkOrder.status === "blocked" ? <section className="mt-5 border-t border-border pt-5"><p className="text-sm leading-6 text-rose-700 dark:text-rose-300">{selectedWorkOrder.statusReason}</p><PrimaryButton onClick={() => runSelectedAction("resume_work_order", {}, "Work order dikembalikan ke antrean.")} disabled={requestState.kind === "loading"} className="mt-3"><Play size={16} />Lanjutkan</PrimaryButton></section> : null}

                  {selectedWorkOrder.status === "completed" ? <section className="mt-5 border-t border-border pt-5"><div className="flex items-center gap-2"><Brain size={17} className="text-primary" /><h4 className="text-sm font-semibold">Outcome dan pembelajaran</h4></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{selectedWorkOrder.outcome}</p><div className="mt-4"><FieldLabel>Pembelajaran</FieldLabel><textarea aria-label="Perbarui pembelajaran" value={lessons} onChange={(event) => setLessons(event.target.value)} rows={3} className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary" /><SecondaryButton onClick={() => runSelectedAction("record_learning", { lessons }, "Pembelajaran work order diperbarui.")} disabled={requestState.kind === "loading" || !lessons.trim()} className="mt-3"><Brain size={16} />Simpan pembelajaran</SecondaryButton></div></section> : null}
                </div>}
              </div>
            </div>
          </section>
        </div>

        <section aria-labelledby="performance-heading" className="mt-10 border-t border-border pt-6"><div className="flex items-center gap-2"><Activity size={18} className="text-primary" /><h2 id="performance-heading" className="text-base font-semibold">Pembelajaran dan performa workflow</h2></div><div className="mt-4 overflow-x-auto border-y border-border"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-medium">Workflow</th><th className="px-3 py-3 font-medium">Owner</th><th className="px-3 py-3 font-medium">Work order</th><th className="px-3 py-3 font-medium">Selesai</th><th className="px-3 py-3 font-medium">Ada bukti</th><th className="px-3 py-3 font-medium">KPI</th></tr></thead><tbody>{performance.map(({ workflow, total, completed, evidence }) => <tr key={workflow.id} className="border-b border-border last:border-b-0"><td className="px-3 py-3 font-medium">{workflow.name}<span className="mt-1 block text-xs font-normal text-muted-foreground">{workflow.project || "Lintas fungsi"}</span></td><td className="px-3 py-3 text-muted-foreground">{agentLabel(workflow.ownerKey)}</td><td className="px-3 py-3">{total}</td><td className="px-3 py-3">{completed}</td><td className="px-3 py-3">{evidence}</td><td className="px-3 py-3 text-muted-foreground">{workflow.kpis.join(" · ")}</td></tr>)}</tbody></table></div></section>

        <section aria-labelledby="audit-heading" className="mt-10 border-t border-border pt-6"><h2 id="audit-heading" className="text-base font-semibold">Audit trail</h2><div className="mt-4 divide-y divide-border border-y border-border">{operations.auditEvents.length ? operations.auditEvents.slice(0, 40).map((event) => <div key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 py-3 text-sm"><p><span className="font-medium">{event.actor}</span><span className="text-muted-foreground"> · {event.type.replaceAll("_", " ")}</span>{event.note ? <span className="text-muted-foreground"> · {event.note}</span> : null}</p><time className="text-xs text-muted-foreground">{shortDate(event.at)}</time></div>) : <p className="py-8 text-sm text-muted-foreground">Belum ada audit event. Setiap signal dan perubahan status akan tercatat di sini.</p>}</div></section>
      </main>
    </div>
  );
}
