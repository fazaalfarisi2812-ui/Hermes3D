export type CapabilityKind =
  | "workspace"
  | "model"
  | "data"
  | "erp"
  | "communication"
  | "marketing"
  | "research"
  | "observability"
  | "security";

export type CapabilityEnvironment = "local" | "development" | "staging" | "production" | "external";
export type CapabilityStatus = "available" | "degraded" | "unavailable" | "unverified" | "retired";
export type CapabilityEnforcement = "block" | "review" | "observe";
export type DataClassification = "public" | "internal" | "confidential" | "restricted";
export type CapabilityAccessMode = "read" | "write" | "controlled";
export type CapabilityAuditType =
  | "capability_created"
  | "capability_updated"
  | "capability_status_changed"
  | "capability_archived";

export type Capability = {
  id: string;
  name: string;
  kind: CapabilityKind;
  provider: string;
  environment: CapabilityEnvironment;
  status: CapabilityStatus;
  enforcement: CapabilityEnforcement;
  dataClassification: DataClassification;
  accessMode: CapabilityAccessMode;
  ownerKey: string;
  accountableHuman: string;
  canBlockUse: boolean;
  allowedAgentKeys: string[];
  workflowIds: string[];
  connectionReference: string;
  usageBoundary: string;
  evidenceRequirement: string;
  rollback: string;
  statusNote: string;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CapabilityAuditEvent = {
  id: string;
  at: string;
  actor: string;
  type: CapabilityAuditType;
  capabilityId: string;
  note: string;
};

export type CapabilityRegistryState = {
  version: 1;
  updatedAt: string;
  capabilities: Capability[];
  auditEvents: CapabilityAuditEvent[];
};

export type CapabilityAgent = {
  key: string;
  name: string;
  role: string;
  project: string;
  projectStatus: "active" | "inactive";
};

export type CapabilityWorkflow = {
  id: string;
  name: string;
  project: string;
  lifecycle: "draft" | "ready" | "paused" | "archived";
  ownerKey: string;
};
