export type ExecutionLifecycle = "draft" | "ready" | "paused" | "archived";
export type ExecutionLevel = "advisory" | "approval" | "bounded";
export type ExecutionMode = "copilot" | "governed_agent" | "orchestrated";
export type OversightMode = "human_in_the_loop" | "human_on_the_loop" | "human_in_command";
export type ReadinessCheckKey =
  | "realSystemAccess"
  | "businessLogicMapped"
  | "humanEscalationReady"
  | "auditReady"
  | "rollbackTested";
export type ReadinessStatus = "not_assessed" | "pilot" | "staging_ready" | "production_ready";

export type ProductionReadiness = Record<ReadinessCheckKey, boolean> & {
  lastReviewedAt: string;
  reviewer: string;
};

export type ExecutionControlProfile = {
  confirmationRequiredFor: string[];
  interruptible: boolean;
  pauseAndResume: boolean;
  partialResultsAllowed: boolean;
  promptInjectionReview: boolean;
  recurrenceAllowed: boolean;
};

export type FindingSeverity = "critical" | "high" | "medium" | "low";

export type ExecutionQualityGate = {
  mode: "independent_review" | "human_review";
  requiredReviewRoles: string[];
  failOn: FindingSeverity[];
  iterateOn: FindingSeverity[];
  maxIterations: number;
  selfReviewProhibited: boolean;
};

export type WorkflowReadiness = {
  workflowId: string;
  status: ReadinessStatus;
  completedChecks: number;
  totalChecks: number;
  checklist: ProductionReadiness;
  gaps: string[];
  systemOfRecord: string;
  executionMode: ExecutionMode;
  oversightMode: OversightMode;
  escalationOwner: string;
  controlProfile: ExecutionControlProfile;
  qualityGate: ExecutionQualityGate;
};

export type ExecutionReadinessSummary = {
  totalWorkflows: number;
  productionReady: number;
  stagingReady: number;
  pilots: number;
  notAssessed: number;
  byStatus: Record<ReadinessStatus, number>;
  workflows: WorkflowReadiness[];
};

export type ExecutionWorkflow = {
  id: string;
  name: string;
  domain: string;
  project: string;
  lifecycle: ExecutionLifecycle;
  executionLevel: ExecutionLevel;
  ownerKey: string;
  allowedAgentKeys: string[];
  systems: string[];
  systemOfRecord: string;
  executionMode: ExecutionMode;
  oversightMode: OversightMode;
  escalationOwner: string;
  controlProfile: ExecutionControlProfile;
  qualityGate: ExecutionQualityGate;
  trigger: string;
  action: string;
  approvalGate: string;
  evidence: string[];
  rollback: string;
  kpis: string[];
  productionReadiness: ProductionReadiness;
};

export type ExecutionRegistryState = {
  version: 1;
  updatedAt: string;
  workflows: ExecutionWorkflow[];
};

export type ExecutionAgent = {
  key: string;
  name: string;
  role: string;
  department: string;
  project: string;
  projectStatus: "active" | "inactive";
};

export type ExecutionProject = {
  key: string;
  name: string;
  status: "active" | "inactive";
  focus: string;
};
