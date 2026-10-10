import { ExecutionReadiness } from "@/features/execution/ExecutionReadiness";
import type { ExecutionReadinessSummary, ExecutionRegistryState } from "@/features/execution/types";
import { ensureExecutionRegistry, getExecutionReadinessSummary } from "../../../server/hermes-agent/execution-registry-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function ReadinessPage() {
  const registry = ensureExecutionRegistry() as ExecutionRegistryState;
  const summary = getExecutionReadinessSummary(registry) as ExecutionReadinessSummary;
  return <ExecutionReadiness initialSummary={summary} />;
}
