"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { OperationsLoopState } from "@/features/operations/types";
import type {
  AgentEvaluation,
  EvaluationDecision,
  EvaluationLearningState,
  EvaluationStatus,
  ImprovementStatus,
} from "./types";

const decisionLabel: Record<EvaluationDecision, string> = { retain: "Pertahankan", improve: "Perbaiki", escalate: "Eskalasi" };
const statusLabel: Record<EvaluationStatus, string> = { proposed: "Usulan", reviewed: "Ditinjau", accepted: "Diterima", dismissed: "Dihentikan" };
const improvementStatusLabel: Record<ImprovementStatus, string> = { proposed: "Usulan", accepted: "Diterima", in_progress: "Berjalan", completed: "Selesai", dismissed: "Dihentikan" };

const dateLabel = (value: string) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(time) : value;
};

const scoreClass = (score: number) => score >= 85 ? "text-emerald-600 dark:text-emerald-300" : score >= 70 ? "text-amber-600 dark:text-amber-300" : "text-rose-600 dark:text-rose-300";

async function postEvaluation(payload: Record<string, string>) {
  const response = await fetch("/api/evaluations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json() as { error?: string; evaluationLearning?: EvaluationLearningState; operations?: OperationsLoopState };
  if (!response.ok) throw new Error(data.error || "Permintaan evaluasi gagal.");
  return data;
}

function Metric({ label, value, tone = "text-foreground" }: { label: string; value: string | number; tone?: string }) {
  return <div className="border border-border bg-card px-4 py-3"><div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div><div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div></div>;
}

function StatusPill({ children, tone = "border-border text-muted-foreground" }: { children: string; tone?: string }) {
  return <span className={`inline-flex items-center border px-2 py-0.5 text-xs ${tone}`}>{children}</span>;
}

function EvaluationRow({ evaluation, selected, onSelect }: { evaluation: AgentEvaluation; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={`w-full border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 ${selected ? "bg-primary/10" : "hover:bg-muted/40"}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-medium">{evaluation.workflowName}</div><div className="mt-1 text-xs text-muted-foreground">{evaluation.agentKey} · {evaluation.project || "lintas proyek"}</div></div><div className={`shrink-0 text-lg font-semibold ${scoreClass(evaluation.score)}`}>{evaluation.score}</div></div>
    <div className="mt-2 flex flex-wrap gap-2"><StatusPill tone={evaluation.decision === "retain" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : evaluation.decision === "escalate" ? "border-rose-500/40 text-rose-700 dark:text-rose-300" : "border-amber-500/40 text-amber-700 dark:text-amber-300"}>{decisionLabel[evaluation.decision]}</StatusPill><StatusPill>{statusLabel[evaluation.status]}</StatusPill></div>
  </button>;
}

function DimensionGrid({ evaluation }: { evaluation: AgentEvaluation }) {
  return <div className="grid gap-2 sm:grid-cols-5">{Object.entries(evaluation.dimensions).map(([key, dimension]) => <div key={key} className="border border-border px-3 py-2"><div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{key}</div><div className={`mt-1 font-semibold ${scoreClass(dimension.score)}`}>{dimension.score}/100</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{dimension.rationale}</div></div>)}</div>;
}

export function EvaluationLearning({ initialState, initialOperations }: { initialState: EvaluationLearningState; initialOperations: OperationsLoopState }) {
  const [state, setState] = useState(initialState);
  const [operations, setOperations] = useState(initialOperations);
  const [selectedId, setSelectedId] = useState(initialState.evaluations[0]?.id || "");
  const [requestState, setRequestState] = useState<{ kind: "idle" | "loading" | "error" | "success"; message: string }>({ kind: "idle", message: "" });
  const evaluationsByWorkOrder = useMemo(() => new Set(state.evaluations.map((entry) => entry.workOrderId)), [state.evaluations]);
  const selected = state.evaluations.find((entry) => entry.id === selectedId) || state.evaluations[0] || null;
  const selectedImprovement = selected?.improvementId ? state.improvements.find((entry) => entry.id === selected.improvementId) || null : null;
  const completed = operations.workOrders.filter((entry) => entry.status === "completed");
  const pendingEvaluation = completed.filter((entry) => !evaluationsByWorkOrder.has(entry.id));
  const averageScore = state.evaluations.length ? Math.round(state.evaluations.reduce((total, entry) => total + entry.score, 0) / state.evaluations.length) : 0;
  const openImprovements = state.improvements.filter((entry) => !["completed", "dismissed"].includes(entry.status));

  const run = async (payload: Record<string, string>, success: string) => {
    setRequestState({ kind: "loading", message: "Memproses..." });
    try {
      const result = await postEvaluation(payload);
      if (result.evaluationLearning) setState(result.evaluationLearning);
      if (result.operations) setOperations(result.operations);
      if (result.evaluationLearning && result.evaluationLearning.evaluations[0]) setSelectedId(result.evaluationLearning.evaluations[0].id);
      setRequestState({ kind: "success", message: success });
    } catch (error) { setRequestState({ kind: "error", message: error instanceof Error ? error.message : "Permintaan gagal." }); }
  };

  const updateEvaluation = (status: EvaluationStatus) => selected && run({ action: "set_evaluation_status", evaluationId: selected.id, status }, "Status evaluasi diperbarui.");
  const updateImprovement = (status: ImprovementStatus) => selectedImprovement && run({ action: "set_improvement_status", improvementId: selectedImprovement.id, status }, "Status improvement diperbarui.");

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6"><div><div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground"><BrainCircuit size={15} /> Evaluation & Learning</div><h1 className="text-3xl font-semibold tracking-tight">Kualitas kerja dan pembelajaran agent</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Setiap pekerjaan yang selesai dinilai dari outcome, evidence, governance, execution, dan learning. Usulan perubahan tetap melewati approval.</p></div><div className="flex flex-wrap gap-2"><Link href="/operations" className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm hover:bg-muted"><ArrowLeft size={15} /> Operations</Link><Link href="/organization" className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm hover:bg-muted"><ShieldCheck size={15} /> Organization</Link><button type="button" onClick={() => run({ action: "reconcile_completed" }, "Work order selesai sudah disinkronkan.")} className="inline-flex items-center gap-2 bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"><RefreshCw size={15} /> Sinkronkan</button></div></header>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Evaluasi" value={state.evaluations.length} /><Metric label="Rata-rata skor" value={averageScore || "-"} tone={averageScore ? scoreClass(averageScore) : undefined} /><Metric label="Improvement terbuka" value={openImprovements.length} tone={openImprovements.length ? "text-amber-600 dark:text-amber-300" : undefined} /><Metric label="Belum dievaluasi" value={pendingEvaluation.length} tone={pendingEvaluation.length ? "text-rose-600 dark:text-rose-300" : undefined} /></div>
    {requestState.message ? <div role="status" className={`mt-4 border px-3 py-2 text-sm ${requestState.kind === "error" ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>{requestState.message}</div> : null}
    {pendingEvaluation.length ? <section className="mt-6 border border-amber-500/30 bg-amber-500/5 p-4"><div className="flex items-center gap-2 font-medium"><CircleAlert size={17} className="text-amber-500" /> Pekerjaan menunggu evaluasi</div><div className="mt-3 grid gap-2">{pendingEvaluation.map((workOrder) => <div key={workOrder.id} className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-3 py-2"><div><div className="font-medium">{workOrder.title}</div><div className="text-xs text-muted-foreground">{workOrder.ownerKey} · {workOrder.workflowName}</div></div><button type="button" onClick={() => run({ action: "evaluate_work_order", workOrderId: workOrder.id }, "Work order dievaluasi.")} className="inline-flex items-center gap-2 border border-primary/40 px-3 py-1.5 text-xs text-primary hover:bg-primary/10"><ClipboardCheck size={14} /> Evaluasi</button></div>)}</div></section> : null}
    <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.5fr)]"><div className="min-w-0 border border-border"><div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="font-medium">Riwayat evaluasi</div><span className="text-xs text-muted-foreground">{state.evaluations.length} item</span></div>{state.evaluations.length ? state.evaluations.map((evaluation) => <EvaluationRow key={evaluation.id} evaluation={evaluation} selected={selected?.id === evaluation.id} onSelect={() => setSelectedId(evaluation.id)} />) : <div className="px-4 py-10 text-center text-sm text-muted-foreground">Belum ada evaluasi otomatis.</div>}</div>
    <div className="min-w-0 space-y-4">{selected ? <><section className="border border-border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{selected.workflowId}</div><h2 className="mt-1 text-xl font-semibold">{selected.workflowName}</h2><div className="mt-1 text-sm text-muted-foreground">{selected.agentKey} · {selected.project || "lintas proyek"} · {dateLabel(selected.evaluatedAt)}</div></div><div className={`text-4xl font-semibold ${scoreClass(selected.score)}`}>{selected.score}<span className="text-base font-normal text-muted-foreground">/100</span></div></div><div className="mt-5"><DimensionGrid evaluation={selected} /></div><div className="mt-5 grid gap-4 md:grid-cols-2"><div><div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Outcome</div><p className="mt-1 text-sm leading-6">{selected.outcomeSummary || "Belum ada ringkasan outcome."}</p></div><div><div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Pembelajaran</div><p className="mt-1 text-sm leading-6">{selected.learningSummary || "Belum ada learning yang tercatat."}</p></div></div><div className="mt-5 border-t border-border pt-4"><div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Rekomendasi</div><p className="mt-1 text-sm leading-6">{selected.recommendation}</p></div><div className="mt-4 flex flex-wrap gap-2"><select aria-label="Status evaluasi" value={selected.status} onChange={(event) => updateEvaluation(event.target.value as EvaluationStatus)} className="border border-border bg-background px-3 py-2 text-sm"><option value="proposed">Usulan</option><option value="reviewed">Ditinjau</option><option value="accepted">Diterima</option><option value="dismissed">Dihentikan</option></select><Link href={`/operations?workOrder=${selected.workOrderId}`} className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm hover:bg-muted"><Activity size={15} /> Buka work order</Link></div></section>
    {selectedImprovement ? <section className="border border-border p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground"><Sparkles size={14} /> Improvement loop</div><h3 className="mt-1 text-lg font-semibold">{selectedImprovement.title}</h3></div><StatusPill tone={selectedImprovement.priority === "high" || selectedImprovement.priority === "critical" ? "border-rose-500/40 text-rose-700 dark:text-rose-300" : "border-amber-500/40 text-amber-700 dark:text-amber-300"}>{selectedImprovement.priority}</StatusPill></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{selectedImprovement.description}</p><div className="mt-4 flex flex-wrap gap-2"><select aria-label="Status improvement" value={selectedImprovement.status} onChange={(event) => updateImprovement(event.target.value as ImprovementStatus)} className="border border-border bg-background px-3 py-2 text-sm">{Object.entries(improvementStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{selectedImprovement.targetWorkflowId ? <button type="button" disabled={Boolean(selectedImprovement.linkedWorkOrderId) || requestState.kind === "loading"} onClick={() => run({ action: "route_improvement", improvementId: selectedImprovement.id }, "Improvement dirutekan ke approval workflow.")} className="inline-flex items-center gap-2 border border-primary/40 px-3 py-2 text-sm text-primary disabled:cursor-not-allowed disabled:opacity-50"><Route size={15} /> {selectedImprovement.linkedWorkOrderId ? "Sudah dirutekan" : "Kirim ke workflow"}</button> : <span className="inline-flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"><CheckCircle2 size={14} /> Monitoring</span>}</div>{selectedImprovement.linkedWorkOrderId ? <div className="mt-3 text-xs text-muted-foreground">Work order improvement: {selectedImprovement.linkedWorkOrderId}</div> : null}</section> : null}</> : <section className="border border-border p-10 text-center text-sm text-muted-foreground">Pilih evaluasi untuk melihat dimensi, pembelajaran, dan tindakan.</section>}
    </div></section>
    <section className="mt-6 border border-border p-5"><div className="flex items-center gap-2 font-medium"><BrainCircuit size={17} /> Learning memory terbaru</div><div className="mt-3 grid gap-2">{state.memories.slice(0, 8).map((memory) => <div key={memory.id} className="border-l-2 border-primary/50 pl-3 text-sm leading-6"><span className="font-medium">{memory.agentKey}</span><span className="text-muted-foreground"> · {memory.content}</span></div>)}{!state.memories.length ? <div className="text-sm text-muted-foreground">Memory akan terisi setelah work order selesai dievaluasi.</div> : null}</div></section>
  </div></main>;
}
