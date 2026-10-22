const stageByStatus: Record<string, number> = {
  DRAFT: 0,
  SUBMITTED: 1,
  VERIFYING: 2,
  NEEDS_INFO: 2,
  SCORING: 3,
  MANUAL_REVIEW: 3,
  REJECTED: 3,
  OFFERED: 4,
  ACCEPTED: 4,
  AGREEMENT_PENDING: 4,
  DISBURSED: 4,
  DECLINED: 4,
  EXPIRED: 4,
};

export function getApplicationStage(status: string): number {
  return stageByStatus[status] ?? -1;
}
