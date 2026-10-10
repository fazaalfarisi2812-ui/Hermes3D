import { OversightCapacity } from "@/features/oversight/OversightCapacity";
import type { OversightCapacityState, OversightCapacitySummary } from "@/features/oversight/types";
import { ensureOversightCapacity, getOversightSummary } from "../../../server/hermes-agent/oversight-capacity-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function OversightPage() {
  const state = ensureOversightCapacity() as OversightCapacityState;
  return <OversightCapacity initialState={state} initialSummary={getOversightSummary(state) as OversightCapacitySummary} />;
}
