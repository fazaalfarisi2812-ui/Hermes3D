export type AgentIdentityClass = "personal_agent" | "workforce_assistant" | "digital_worker" | "consumer_assistant";
export type AgentIdentityLifecycle = "active" | "review" | "suspended" | "retired";
export type AgentSupervision = "attended" | "mixed" | "unattended";
export type AgentRiskTier = "low" | "moderate" | "high" | "critical";
export type IdentityDataClassification = "public" | "internal" | "confidential" | "restricted";
export type DelegationStatus = "active" | "suspended" | "revoked" | "expired";
export type DelegationExecutionLevel = "advisory" | "bounded" | "approval";
export type AgencyAction =
  | "propose"
  | "read"
  | "analyze"
  | "draft"
  | "execute"
  | "write"
  | "communicate"
  | "monitor"
  | "approve"
  | "pause"
  | "override";

export type SpanOfAgency = {
  allowedActions: AgencyAction[];
  requiresHumanApprovalFor: AgencyAction[];
  humanReservedActions: AgencyAction[];
  boundaryOwner: string;
  outcomeOwner: string;
  reviewIntervalDays: number;
  approvedBy: string;
  rationale: string;
  approvedAt: string;
  lastReviewedAt: string;
};
export type IdentityAuditType =
  | "registry_initialized"
  | "identity_reconciled"
  | "identity_updated"
  | "identity_lifecycle_changed"
  | "delegation_created"
  | "delegation_updated"
  | "delegation_status_changed"
  | "delegation_revoked";

export type AgentIdentity = {
  id: string;
  agentKey: string;
  displayName: string;
  agentClass: AgentIdentityClass;
  lifecycle: AgentIdentityLifecycle;
  supervision: AgentSupervision;
  riskTier: AgentRiskTier;
  principal: string;
  accountabilityOwner: string;
  projectScopes: string[];
  maxDataClassification: IdentityDataClassification;
  purpose: string;
  statusNote: string;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DelegationGrant = {
  id: string;
  agentKey: string;
  workflowIds: string[];
  capabilityIds: string[];
  purpose: string;
  executionLevel: DelegationExecutionLevel;
  maxDataClassification: IdentityDataClassification;
  delegatedBy: string;
  boundaryOwner: string;
  outcomeOwner: string;
  spanOfAgency: SpanOfAgency;
  approvalRequired: boolean;
  status: DelegationStatus;
  issuedAt: string;
  expiresAt: string;
  evidenceRequirement: string;
  statusNote: string;
  createdAt: string;
  updatedAt: string;
};

export type IdentityAuditEvent = {
  id: string;
  at: string;
  actor: string;
  type: IdentityAuditType;
  identityId: string | null;
  delegationId: string | null;
  note: string;
};

export type AgentIdentityRegistryState = {
  version: 1;
  updatedAt: string;
  identities: AgentIdentity[];
  delegations: DelegationGrant[];
  auditEvents: IdentityAuditEvent[];
};

export type IdentityOrganizationAgent = {
  key: string;
  name: string;
  role: string;
  department: string;
  project: string;
  projectStatus: "active" | "inactive";
};

export type IdentityWorkflow = {
  id: string;
  name: string;
  project: string;
  lifecycle: "draft" | "ready" | "paused" | "archived";
  executionLevel: DelegationExecutionLevel;
  ownerKey: string;
  allowedAgentKeys: string[];
};

export type IdentityCapability = {
  id: string;
  name: string;
  dataClassification: IdentityDataClassification;
  workflowIds: string[];
  status: string;
};
