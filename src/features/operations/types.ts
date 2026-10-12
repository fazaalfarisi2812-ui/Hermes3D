import type { ExecutionLevel } from "@/features/execution/types";

export type SignalSource = "manual" | "chat" | "monitor" | "erp" | "schedule";
export type SignalPriority = "low" | "normal" | "high";
export type SignalStatus = "new" | "routed" | "dismissed";
export type WorkOrderStatus =
  | "waiting_approval"
  | "queued"
  | "in_progress"
  | "evidence_required"
  | "blocked"
  | "completed"
  | "cancelled";
export type ApprovalState = "not_required" | "pending" | "approved" | "rejected";
export type AuditEventType =
  | "signal_created"
  | "signal_routed"
  | "signal_dismissed"
  | "approval_granted"
  | "approval_rejected"
  | "work_started"
  | "evidence_requested"
  | "evidence_added"
  | "work_blocked"
  | "work_resumed"
  | "work_completed"
  | "learning_recorded";

export type OperationSignal = {
  id: string;
  title: string;
  description: string;
  source: SignalSource;
  priority: SignalPriority;
  status: SignalStatus;
  workflowId: string | null;
  workOrderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkOrderEvidence = {
  id: string;
  description: string;
  source: string;
  recordedAt: string;
  recordedBy: string;
};

export type CapabilityDecision = "allowed" | "review" | "blocked";

export type WorkOrderCapabilityAssessment = {
  decision: CapabilityDecision;
  capabilityIds: string[];
  blockers: string[];
  warnings: string[];
  decisions: Array<{
    capabilityId: string;
    decision: CapabilityDecision;
    reason: string;
  }>;
  checkedAt: string | null;
};

export type WorkOrderIdentityAssessment = {
  decision: CapabilityDecision;
  identityId: string | null;
  delegationIds: string[];
  blockers: string[];
  warnings: string[];
  checkedAt: string | null;
};

export type WorkOrder = {
  id: string;
  signalId: string;
  workflowId: string;
  workflowName: string;
  title: string;
  description: string;
  project: string;
  ownerKey: string;
  allowedAgentKeys: string[];
  executionLevel: ExecutionLevel;
  approvalState: ApprovalState;
  approvalGate: string;
  evidenceRequirements: string[];
  status: WorkOrderStatus;
  statusReason: string;
  evidence: WorkOrderEvidence[];
  capabilityAssessment: WorkOrderCapabilityAssessment;
  identityAssessment: WorkOrderIdentityAssessment;
  outcome: string;
  lessons: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type OperationsAuditEvent = {
  id: string;
  at: string;
  actor: string;
  type: AuditEventType;
  signalId: string | null;
  workOrderId: string | null;
  note: string;
};

export type OperationsLoopState = {
  version: 1;
  updatedAt: string;
  signals: OperationSignal[];
  workOrders: WorkOrder[];
  auditEvents: OperationsAuditEvent[];
};

export type OperationsAgent = {
  key: string;
  name: string;
  role: string;
  project: string;
  projectStatus: "active" | "inactive";
};
