"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, CheckCircle2, ClipboardCheck, Database, RefreshCw, Save, ShieldCheck, TriangleAlert, UsersRound, XCircle } from "lucide-react";
import type { ExecutionMode, ExecutionReadinessSummary, OversightMode, ProductionReadiness, ReadinessCheckKey, ReadinessStatus, WorkflowReadiness } from "./types";

const statusMeta: Record<ReadinessStatus, { label: string; className: string }> = {
  not_assessed: { label: "Belum dinilai", className: "border-slate-400/40 text-slate-600 dark:text-slate-300" },
  pilot: { label: "Masih pilot", className: "border-amber-500/40 text-amber-700 dark:text-amber-300" },
  staging_ready: { label: "Siap staging", className: "border-sky-500/40 text-sky-700 dark:text-sky-300" },
  production_ready: { label: "Siap produksi", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" },
};

const modeMeta: Record<ExecutionMode, string> = {
  copilot: "Copilot: bantu analisis dan draf",
  governed_agent: "Governed agent: bekerja dalam workflow dengan gate",
  orchestrated: "Orchestrated: eksekusi terbatas dan terkoordinasi",
};

const oversightMeta: Record<OversightMode, string> = {
  human_in_the_loop: "Human-in-the-loop: persetujuan manusia sebelum tindakan berdampak",
  human_on_the_loop: "Human-on-the-loop: agent berjalan dalam batas, manusia memantau dan dapat menghentikan",
  human_in_command: "Human-in-command: manusia memegang override dan keputusan akhir",
};

const checks: Array<{ key: ReadinessCheckKey; label: string; detail: string }> = [
  { key: "realSystemAccess", label: "Akses system of record", detail: "Connector nyata terdaftar dan aksesnya teruji." },
  { key: "businessLogicMapped", label: "Logika bisnis dipetakan", detail: "Aturan, pengecualian, dan kondisi berhenti terdokumentasi." },
  { key: "humanEscalationReady", label: "Eskalasi manusia siap", detail: "Owner manusia dan jalur eskalasi dapat dihubungi." },
  { key: "auditReady", label: "Audit trail siap", detail: "Bukti, log tindakan, dan sumber hasil dapat ditelusuri." },
  { key: "rollbackTested", label: "Rollback diuji", detail: "Pemulihan pernah diuji di staging atau sandbox." },
];

const dateLabel = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "Belum pernah";
};

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="border border-border bg-card px-4 py-3"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></div>;
}

function StatusPill({ status }: { status: ReadinessStatus }) {
  const meta = statusMeta[status];
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>;
}

export function ExecutionReadiness({ initialSummary }: { initialSummary: ExecutionReadinessSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [selectedId, setSelectedId] = useState(initialSummary.workflows[0]?.workflowId || "");
  const [draft, setDraft] = useState<WorkflowReadiness | null>(initialSummary.workflows[0] || null);
  const [requestState, setRequestState] = useState("");

  const selected = useMemo(() => summary.workflows.find((workflow) => workflow.workflowId === selectedId) || summary.workflows[0] || null, [selectedId, summary.workflows]);

  const selectWorkflow = (workflow: WorkflowReadiness) => {
    setSelectedId(workflow.workflowId);
    setDraft(workflow);
    setRequestState("");
  };

  const refresh = async () => {
    setRequestState("Memuat status kesiapan...");
    try {
      const response = await fetch("/api/execution-readiness", { cache: "no-store" });
      const body = await response.json() as { error?: string; summary?: ExecutionReadinessSummary };
      if (!response.ok || !body.summary) throw new Error(body.error || "Status kesiapan gagal dimuat.");
      setSummary(body.summary);
      const next = body.summary.workflows.find((workflow) => workflow.workflowId === selectedId) || body.summary.workflows[0] || null;
      setSelectedId(next?.workflowId || "");
      setDraft(next);
      setRequestState("Status kesiapan diperbarui.");
    } catch (error) { setRequestState(error instanceof Error ? error.message : "Permintaan gagal."); }
  };

  const updateDraft = (patch: Partial<WorkflowReadiness>) => setDraft((current) => current ? { ...current, ...patch } : current);
  const updateChecklist = (key: ReadinessCheckKey, value: boolean) => setDraft((current) => current ? { ...current, checklist: { ...current.checklist, [key]: value } } : current);

  const save = async () => {
    if (!draft) return;
    setRequestState("Menyimpan pemeriksaan kesiapan...");
    try {
      const response = await fetch("/api/execution-readiness", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflowId: draft.workflowId,
          systemOfRecord: draft.systemOfRecord,
          executionMode: draft.executionMode,
          oversightMode: draft.oversightMode,
          escalationOwner: draft.escalationOwner,
          checklist: draft.checklist,
        }),
      });
      const body = await response.json() as { error?: string; summary?: ExecutionReadinessSummary };
      if (!response.ok || !body.summary) throw new Error(body.error || "Pemeriksaan kesiapan gagal disimpan.");
      setSummary(body.summary);
      const next = body.summary.workflows.find((workflow) => workflow.workflowId === draft.workflowId) || null;
      setDraft(next);
      setRequestState("Pemeriksaan kesiapan tersimpan.");
    } catch (error) { setRequestState(error instanceof Error ? error.message : "Penyimpanan gagal."); }
  };

  const current = draft || selected;
  const readinessFromChecklist = (value: ProductionReadiness) => checks.filter((check) => value[check.key]).length;

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6"><div><Link href="/execution" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> Execution Registry</Link><div className="mt-3 flex items-center gap-3"><ClipboardCheck size={24} className="text-primary" /><div><h1 className="text-3xl font-semibold tracking-tight">Production Readiness</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Tutup execution gap sebelum agent dipromosikan dari pilot menjadi eksekusi produksi yang terukur dan dapat diaudit.</p></div></div></div><div className="flex flex-wrap gap-2"><Link href="/operations" className="inline-flex min-h-10 items-center gap-2 border border-border px-3 text-sm hover:bg-muted"><Activity size={15} /> Operations</Link><Link href="/organization" className="inline-flex min-h-10 items-center gap-2 border border-border px-3 text-sm hover:bg-muted"><UsersRound size={15} /> Organisasi</Link><button type="button" onClick={refresh} className="inline-flex min-h-10 items-center gap-2 border border-border px-3 text-sm hover:bg-muted"><RefreshCw size={15} /> Sinkronkan</button></div></header>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Workflow" value={summary.totalWorkflows} detail="terdaftar" /><Metric label="Produksi" value={summary.productionReady} detail="siap dipromosikan" /><Metric label="Staging" value={summary.stagingReady} detail="siap validasi akhir" /><Metric label="Pilot" value={summary.pilots} detail="masih punya gap" /><Metric label="Belum dinilai" value={summary.notAssessed} detail="wajib ditinjau" /></div>
    {requestState ? <div role="status" className="mt-4 border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">{requestState}</div> : null}
    <section className="mt-6 grid items-start gap-7 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.45fr)]"><div className="border-y border-border">{summary.workflows.map((workflow) => <button key={workflow.workflowId} type="button" onClick={() => selectWorkflow(workflow)} className={`flex w-full items-start gap-3 border-b border-border px-3 py-4 text-left last:border-b-0 ${current?.workflowId === workflow.workflowId ? "bg-primary/10" : "hover:bg-muted/50"}`}><span className="mt-0.5 shrink-0">{workflow.status === "production_ready" ? <CheckCircle2 size={18} className="text-emerald-600" /> : workflow.status === "not_assessed" ? <XCircle size={18} className="text-muted-foreground" /> : <TriangleAlert size={18} className="text-amber-600" />}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{workflow.workflowId}</span><StatusPill status={workflow.status} /></span><span className="mt-1 block text-xs text-muted-foreground">{workflow.systemOfRecord} · {workflow.completedChecks}/{workflow.totalChecks} pemeriksaan</span></span></button>)}</div>
      {!current ? <p className="py-8 text-sm text-muted-foreground">Belum ada workflow untuk dinilai.</p> : <div className="min-w-0"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"><div><p className="text-xs font-medium text-primary">{modeMeta[current.executionMode]}</p><h2 className="mt-1 text-xl font-semibold">{current.workflowId}</h2><p className="mt-1 text-sm text-muted-foreground">{current.completedChecks}/{current.totalChecks} pemeriksaan selesai · <StatusPill status={current.status} /></p></div><button type="button" onClick={save} className="inline-flex min-h-10 items-center gap-2 bg-primary px-3 text-sm text-primary-foreground hover:opacity-90"><Save size={15} /> Simpan</button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-medium text-muted-foreground">System of record</span><input aria-label="System of record" value={current.systemOfRecord} onChange={(event) => updateDraft({ systemOfRecord: event.target.value })} className="min-h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label><label><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Pemilik eskalasi manusia</span><input aria-label="Pemilik eskalasi manusia" value={current.escalationOwner} onChange={(event) => updateDraft({ escalationOwner: event.target.value })} className="min-h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label><label><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Mode eksekusi</span><select aria-label="Mode eksekusi" value={current.executionMode} onChange={(event) => updateDraft({ executionMode: event.target.value as ExecutionMode })} className="min-h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(modeMeta).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Mode oversight</span><select aria-label="Mode oversight" value={current.oversightMode} onChange={(event) => updateDraft({ oversightMode: event.target.value as OversightMode })} className="min-h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary">{Object.entries(oversightMeta).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <section className="mt-6 border-t border-border pt-5"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-primary" /><h3 className="text-sm font-semibold">Checklist promosi</h3><span className="ml-auto text-xs text-muted-foreground">{readinessFromChecklist(current.checklist)}/5</span></div><p className="mt-1 text-sm leading-6 text-muted-foreground">Agent baru boleh dipromosikan ke produksi setelah seluruh kontrol ini benar-benar dibuktikan.</p><div className="mt-4 divide-y divide-border border-y border-border">{checks.map((check) => <label key={check.key} className="flex cursor-pointer items-start gap-3 py-3"><input type="checkbox" checked={current.checklist[check.key]} onChange={(event) => updateChecklist(check.key, event.target.checked)} className="mt-1 h-4 w-4 accent-primary" /><span><span className="block text-sm font-medium">{check.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{check.detail}</span></span></label>)}</div></section>
        <section className="mt-6 border-t border-border pt-5"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-primary" /><h3 className="text-sm font-semibold">Kontrol aksi agent</h3></div><p className="mt-1 text-sm leading-6 text-muted-foreground">Guardrail standar untuk pekerjaan multi-langkah, tool, connector, dan hasil parsial.</p><dl className="mt-4 divide-y divide-border border-y border-border">{[
          ["Checkpoint persetujuan", `Wajib sebelum: ${current.controlProfile.confirmationRequiredFor.join(", ")}`],
          ["Interupsi aman", current.controlProfile.interruptible ? "Dapat dihentikan kapan saja" : "Tidak aktif"],
          ["Pause / resume", current.controlProfile.pauseAndResume ? "Konteks dilanjutkan tanpa mengulang tindakan" : "Tidak aktif"],
          ["Hasil parsial", current.controlProfile.partialResultsAllowed ? "Disimpan untuk review atau kelanjutan" : "Tidak disimpan"],
          ["Prompt injection review", current.controlProfile.promptInjectionReview ? "Wajib untuk konten eksternal dan tool output" : "Tidak aktif"],
          ["Tugas berulang", current.controlProfile.recurrenceAllowed ? "Diizinkan setelah konfigurasi" : "Harus diatur dan disetujui eksplisit"],
        ].map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]"><dt className="text-sm font-medium">{label}</dt><dd className="text-sm text-muted-foreground">{value}</dd></div>)}</dl></section>
        <section className="mt-6 border-t border-border pt-5"><div className="flex items-center gap-2"><ClipboardCheck size={17} className="text-primary" /><h3 className="text-sm font-semibold">Zero-trust quality gate</h3></div><p className="mt-1 text-sm leading-6 text-muted-foreground">Agent pelaksana tidak boleh menjadi penilai final. Hasil harus melewati reviewer independen dan aturan verdict workflow.</p><dl className="mt-4 divide-y divide-border border-y border-border">{[
          ["Mode review", current.qualityGate.mode === "independent_review" ? "Review independen" : "Review manusia"],
          ["Reviewer wajib", current.qualityGate.requiredReviewRoles.join(", ")],
          ["FAIL", current.qualityGate.failOn.join(", ")],
          ["ITERATE", current.qualityGate.iterateOn.join(", ")],
          ["Batas iterasi", `${current.qualityGate.maxIterations} kali`],
          ["Self-review", current.qualityGate.selfReviewProhibited ? "Dilarang" : "Diizinkan"],
        ].map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]"><dt className="text-sm font-medium">{label}</dt><dd className="text-sm text-muted-foreground">{value}</dd></div>)}</dl></section>
        <section className="mt-6 border-t border-border pt-5"><div className="flex items-center gap-2"><Database size={17} className="text-primary" /><h3 className="text-sm font-semibold">Gap yang masih terbuka</h3></div>{current.gaps.length ? <ul className="mt-3 space-y-2 text-sm text-amber-700 dark:text-amber-300">{current.gaps.map((gap) => <li key={gap} className="flex items-start gap-2"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{gap}</li>)}</ul> : <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">Semua pemeriksaan selesai. Workflow dapat masuk review promosi produksi.</p>}<p className="mt-4 text-xs text-muted-foreground">Review terakhir: {dateLabel(current.checklist.lastReviewedAt)} · oleh {current.checklist.reviewer}</p></section>
      </div>}
    </section>
    <p className="mt-6 text-xs leading-5 text-muted-foreground">Status ini adalah control plane, bukan izin otomatis untuk melewati approval gate. Aksi finansial, legal, HR, keamanan, publikasi, dan deployment tetap memerlukan persetujuan manusia sesuai workflow.</p>
  </div></main>;
}
