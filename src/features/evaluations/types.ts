export type EvaluationStatus = "proposed" | "reviewed" | "accepted" | "dismissed";
export type EvaluationDecision = "retain" | "improve" | "escalate";
export type ImprovementType = "monitor" | "update_sop" | "develop_agent" | "review_mandate" | "recruit_or_rebalance";
export type ImprovementStatus = "proposed" | "accepted" | "in_progress" | "completed" | "dismissed";
export type ImprovementPriority = "low" | "normal" | "high" | "critical";

export type EvaluationDimension = {
  score: number;
  rationale: string;
};

export type AgentEvaluation = {
  id: string;
  workOrderId: string;
  workflowId: string;
  workflowName: string;
  agentKey: string;
  project: string;
  status: EvaluationStatus;
  decision: EvaluationDecision;
  score: number;
  dimensions: {
    outcome: EvaluationDimension;
    evidence: EvaluationDimension;
    governance: EvaluationDimension;
    execution: EvaluationDimension;
    learning: EvaluationDimension;
  };
  recommendation: string;
  outcomeSummary: string;
  learningSummary: string;
  improvementId: string | null;
  memoryId: string | null;
  evaluatedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ImprovementAction = {
  id: string;
  evaluationId: string;
  agentKey: string;
  workflowId: string;
  type: ImprovementType;
  title: string;
  description: string;
  priority: ImprovementPriority;
  status: ImprovementStatus;
  approvalRequired: boolean;
  targetWorkflowId: string | null;
  linkedWorkOrderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LearningMemory = {
  id: string;
  agentKey: string;
  workflowId: string;
  workOrderId: string;
  content: string;
  source: string;
  createdAt: string;
};

export type EvaluationAuditEvent = {
  id: string;
  at: string;
  actor: string;
  type: string;
  evaluationId: string | null;
  improvementId: string | null;
  memoryId: string | null;
  note: string;
};

export type EvaluationLearningState = {
  version: 1;
  updatedAt: string;
  evaluations: AgentEvaluation[];
  improvements: ImprovementAction[];
  memories: LearningMemory[];
  auditEvents: EvaluationAuditEvent[];
};
