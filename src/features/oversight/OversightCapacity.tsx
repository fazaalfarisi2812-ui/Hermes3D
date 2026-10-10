"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, Gauge, RefreshCw, ShieldCheck } from "lucide-react";
import type { OversightCapacitySummary, OversightCapacityState, OversightReviewType } from "./types";

const dateLabel = (value: string) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(time) : value;
};

const capacityLabel = { within_limit: "Dalam kapasitas", near_limit: "Mendekati batas", over_capacity: "Melebihi kapasitas" } as const;

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="border border-border bg-card px-4 py-3"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div>{detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}</div>;
}

export function OversightCapacity({ initialState, initialSummary }: { initialState: OversightCapacityState; initialSummary: OversightCapacitySummary }) {
  const [, setState] = useState(initialState);
  const [summary, setSummary] = useState(initialSummary);
  const [requestState, setRequestState] = useState("");
  const [review, setReview] = useState({ workOrderId: "", agentKey: "", qualityScore: "", reviewType: "quality" as OversightReviewType, note: "" });

  const refresh = async () => {
    setRequestState("Memuat kapasitas pengawasan...");
    try {
      const response = await fetch("/api/oversight", { cache: "no-store" });
      const body = await response.json() as { error?: string; state?: OversightCapacityState; summary?: OversightCapacitySummary };
      if (!response.ok || !body.state || !body.summary) throw new Error(body.error || "Registry pengawasan gagal dimuat.");
      setState(body.state); setSummary(body.summary); setRequestState("Kapasitas pengawasan diperbarui.");
    } catch (error) { setRequestState(error instanceof Error ? error.message : "Permintaan gagal."); }
  };

  const submitReview = async () => {
    if (!review.workOrderId || !review.agentKey) return;
    setRequestState("Mencatat review manusia...");
    try {
      const response = await fetch("/api/oversight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "record_review", review: { ...review, qualityScore: review.qualityScore ? Number(review.qualityScore) : null } }) });
      const body = await response.json() as { error?: string; state?: OversightCapacityState; summary?: OversightCapacitySummary };
      if (!response.ok || !body.state || !body.summary) throw new Error(body.error || "Review gagal dicatat.");
      setState(body.state); setSummary(body.summary); setReview({ workOrderId: "", agentKey: "", qualityScore: "", reviewType: "quality", note: "" }); setRequestState("Review manusia tercatat.");
    } catch (error) { setRequestState(error instanceof Error ? error.message : "Review gagal dicatat."); }
  };

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6"><div><Link href="/organization" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> Organization</Link><div className="mt-3 flex items-center gap-3"><Gauge size={24} className="text-primary" /><div><h1 className="text-3xl font-semibold tracking-tight">Oversight Capacity</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Ukur beban manusia yang mengawasi agent: jumlah handoff, review, kualitas, dan titik ketika kapasitas perlu ditambah atau didelegasikan ulang.</p></div></div></div><button type="button" onClick={refresh} className="inline-flex min-h-10 items-center gap-2 border border-border px-3 text-sm hover:bg-muted"><RefreshCw size={15} /> Sinkronkan</button></header>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Status" value={capacityLabel[summary.capacityStatus]} /><Metric label="Handoff 30 hari" value={summary.totals.handoffs} detail={`batas ${summary.thresholds.handoffsPerSupervisor}/supervisor`} /><Metric label="Agent ke agent" value={summary.totals.agentToAgentHandoffs} /><Metric label="Review manusia" value={summary.totals.reviews} detail={`batas ${summary.thresholds.reviewsPerSupervisor}/supervisor`} /><Metric label="Supervisor" value={summary.totals.supervisors} /></div>
    {requestState ? <div role="status" className="mt-4 border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">{requestState}</div> : null}
    <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"><div className="border border-border"><div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2 font-medium"><Activity size={17} /> Beban per supervisor</div><span className="text-xs text-muted-foreground">30 hari</span></div>{summary.supervisors.length ? summary.supervisors.map((metric) => <div key={metric.supervisorKey} className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 last:border-b-0"><div><div className="font-medium">{metric.supervisorKey}</div><div className="mt-1 text-xs text-muted-foreground">{metric.activeAgentCount} agent terlibat · {metric.reviews} review · kualitas rata-rata {metric.averageQuality === null ? "belum ada skor" : `${metric.averageQuality}/100`}</div></div><span className={`border px-2 py-1 text-xs ${metric.capacityStatus === "over_capacity" ? "border-rose-500/40 text-rose-700 dark:text-rose-300" : metric.capacityStatus === "near_limit" ? "border-amber-500/40 text-amber-700 dark:text-amber-300" : "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"}`}>{capacityLabel[metric.capacityStatus]}</span></div>) : <div className="px-4 py-10 text-center text-sm text-muted-foreground">Belum ada handoff atau review pada periode ini.</div>}</div>
    <section className="border border-border p-5"><div className="flex items-center gap-2 font-medium"><ShieldCheck size={17} /> Catat review manusia</div><p className="mt-2 text-sm leading-6 text-muted-foreground">Review ini menjaga agar output agent tidak hanya selesai, tetapi juga dinilai sebelum pola kerja dipertahankan atau diubah.</p><div className="mt-4 grid gap-3"><input aria-label="Work order review" placeholder="ID work order" value={review.workOrderId} onChange={(event) => setReview((current) => ({ ...current, workOrderId: event.target.value }))} className="min-h-10 border border-border bg-background px-3 text-sm" /><input aria-label="Agent review" placeholder="Agent key" value={review.agentKey} onChange={(event) => setReview((current) => ({ ...current, agentKey: event.target.value }))} className="min-h-10 border border-border bg-background px-3 text-sm" /><div className="grid gap-3 sm:grid-cols-2"><input aria-label="Quality score" type="number" min="0" max="100" placeholder="Quality score 0-100" value={review.qualityScore} onChange={(event) => setReview((current) => ({ ...current, qualityScore: event.target.value }))} className="min-h-10 border border-border bg-background px-3 text-sm" /><select aria-label="Review type" value={review.reviewType} onChange={(event) => setReview((current) => ({ ...current, reviewType: event.target.value as OversightReviewType }))} className="min-h-10 border border-border bg-background px-3 text-sm"><option value="quality">Quality</option><option value="exception">Exception</option><option value="override">Override</option><option value="pause">Pause</option></select></div><textarea aria-label="Catatan review" rows={3} placeholder="Catatan review" value={review.note} onChange={(event) => setReview((current) => ({ ...current, note: event.target.value }))} className="border border-border bg-background px-3 py-2 text-sm" /><button type="button" onClick={submitReview} disabled={!review.workOrderId || !review.agentKey} className="inline-flex min-h-10 items-center justify-center gap-2 bg-primary px-3 text-sm text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={15} /> Simpan review</button></div></section></section>
    <section className="mt-6 border border-border"><div className="border-b border-border px-4 py-3 font-medium">Handoff terbaru</div>{summary.recentHandoffs.length ? summary.recentHandoffs.slice(0, 12).map((handoff) => <div key={handoff.id} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0"><div><span className="font-medium">{handoff.fromAgentKey}</span><span className="text-muted-foreground"> → </span><span className="font-medium">{handoff.toAgentKey}</span><div className="mt-1 text-xs text-muted-foreground">{handoff.reason} · supervisor {handoff.supervisorKey}</div></div><time className="text-xs text-muted-foreground">{dateLabel(handoff.at)}</time></div>) : <div className="px-4 py-10 text-center text-sm text-muted-foreground">Belum ada handoff tercatat.</div>}</section>
    <p className="mt-5 text-xs leading-5 text-muted-foreground">Registry menyimpan metadata governance saja. Tidak ada API key, password, atau isi data bisnis yang dicatat di sini.</p>
  </div></main>;
}
