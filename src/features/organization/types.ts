export type OrganizationAgent = {
  id: string;
  name: string;
  role: string;
  organizationKey: string;
  reportsTo: string | null;
  department: string;
  project: string;
  projectStatus: "active" | "inactive";
  hierarchyRole: string;
  agenticRole: OrganizationAgenticRole;
  agenticLayer: OrganizationAgenticLayer;
  responsibilities: string[];
  deliverables: string[];
};

export type OrganizationAgenticRole =
  | "orchestrator"
  | "supervisor"
  | "specialist"
  | "critic"
  | "guardrail"
  | "compliance"
  | "lifecycle_manager";

export type OrganizationAgenticLayer = "task" | "role" | "team" | "outcome";

export type OrganizationOperatingModelItem = {
  label: string;
  detail: string;
};

export type OrganizationOperatingModel = {
  title: string;
  summary: string;
  authority: OrganizationOperatingModelItem[];
  controls: OrganizationOperatingModelItem[];
  escalationPath: string[];
};

export type OrganizationAgenticModel = {
  title: string;
  summary: string;
  pillars: OrganizationOperatingModelItem[];
  teamRoles: OrganizationOperatingModelItem[];
  humanRoles: OrganizationOperatingModelItem[];
  governanceLayers: OrganizationOperatingModelItem[];
  workLayers: OrganizationOperatingModelItem[];
  pilotPlan: string[];
  lifecycle: string[];
};

export type OrganizationProject = {
  key: string;
  name: string;
  status: "active" | "inactive";
  focus: string;
};

export type OrganizationRoom = {
  key: string;
  name: string;
  kind: "command" | "project" | "function" | "governance";
  description: string;
  status: "active" | "inactive";
  memberAgentIds: string[];
};

export type OrganizationDirectoryData = {
  companyName: string;
  ownerName: string;
  updatedAt: string | null;
  agents: OrganizationAgent[];
  projects: OrganizationProject[];
  rooms: OrganizationRoom[];
  operatingModel: OrganizationOperatingModel | null;
  agenticModel: OrganizationAgenticModel;
};
