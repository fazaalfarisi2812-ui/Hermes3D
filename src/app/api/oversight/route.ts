import type { OversightCapacityState } from "@/features/oversight/types";
import {
  ensureOversightCapacity,
  getOversightSummary,
  recordHandoff,
  recordOversightReview,
  saveOversightCapacity,
} from "../../../../server/hermes-agent/oversight-capacity-state";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const requiredString = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} diperlukan.`);
  return value.trim();
};

export async function GET() {
  try {
    const state = ensureOversightCapacity() as OversightCapacityState;
    return json({ state, summary: getOversightSummary(state) });
  } catch (error) {
    console.error("[oversight] GET failed:", error);
    return json({ error: "Oversight Capacity Registry tidak tersedia." }, 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Payload JSON tidak valid." }, 400);
  }
  if (!isRecord(body)) return json({ error: "Payload oversight diperlukan." }, 400);
  try {
    let state = ensureOversightCapacity() as OversightCapacityState;
    const action = requiredString(body.action, "Action");
    if (action === "record_handoff") {
      if (typeof body.handoff !== "object" || !body.handoff || Array.isArray(body.handoff)) throw new Error("Data handoff diperlukan.");
      state = recordHandoff(state, { ...(body.handoff as Record<string, unknown>), recordedBy: "Faza" }).state as OversightCapacityState;
    } else if (action === "record_review") {
      if (typeof body.review !== "object" || !body.review || Array.isArray(body.review)) throw new Error("Data review diperlukan.");
      state = recordOversightReview(state, { ...(body.review as Record<string, unknown>), recordedBy: "Faza" }).state as OversightCapacityState;
    } else {
      return json({ error: "Action oversight tidak dikenal." }, 400);
    }
    const saved = saveOversightCapacity(state) as OversightCapacityState;
    return json({ state: saved, summary: getOversightSummary(saved) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Oversight capacity tidak dapat diperbarui.";
    return json({ error: message }, 400);
  }
}
