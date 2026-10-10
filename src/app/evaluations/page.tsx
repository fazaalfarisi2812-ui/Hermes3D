import { EvaluationLearning } from "@/features/evaluations/EvaluationLearning";
import type { EvaluationLearningState } from "@/features/evaluations/types";
import type { OperationsLoopState } from "@/features/operations/types";
import { ensureEvaluationLearningState } from "../../../server/hermes-agent/evaluation-learning-state";
import { ensureOperationsLoop } from "../../../server/hermes-agent/operations-loop-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function EvaluationsPage() {
  return (
    <EvaluationLearning
      initialState={ensureEvaluationLearningState() as EvaluationLearningState}
      initialOperations={ensureOperationsLoop() as OperationsLoopState}
    />
  );
}
