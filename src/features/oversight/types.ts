export type OversightCapacityStatus = "within_limit" | "near_limit" | "over_capacity";
export type OversightReviewType = "quality" | "exception" | "override" | "pause";

export type OversightHandoff = {
  id: string;
  workOrderId: string;
  fromAgentKey: string;
  toAgentKey: string;
  supervisorKey: string;
  reason: string;
  recordedBy: string;
  at: string;
};

export type OversightReview = {
  id: string;
  workOrderId: string;
  agentKey: string;
  supervisorKey: string;
  reviewType: OversightReviewType;
  qualityScore: number | null;
  note: string;
  recordedBy: string;
  at: string;
};

export type OversightSupervisorMetric = {
  supervisorKey: string;
  handoffs: number;
  reviews: number;
  averageQuality: number | null;
  capacityStatus: OversightCapacityStatus;
  activeAgentCount: number;
};

export type OversightCapacitySummary = {
  periodDays: number;
  checkedAt: string;
  thresholds: { handoffsPerSupervisor: number; reviewsPerSupervisor: number };
  totals: { handoffs: number; reviews: number; agentToAgentHandoffs: number; supervisors: number };
  capacityStatus: OversightCapacityStatus;
  supervisors: OversightSupervisorMetric[];
  recentHandoffs: OversightHandoff[];
  recentReviews: OversightReview[];
};

export type OversightCapacityState = {
  version: 1;
  updatedAt: string;
  handoffs: OversightHandoff[];
  reviews: OversightReview[];
};
