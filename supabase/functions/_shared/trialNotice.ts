export const TRIAL_GRACE_MS = 24 * 60 * 60 * 1000;

/** When a subscription's access ends: trials keep access through their grace period. */
export function lapseEndMs(plan: string, expiresAt: string): number {
  const end = Date.parse(expiresAt);
  return plan === "trial" ? end + TRIAL_GRACE_MS : end;
}

export type NoticeStatus = "pending" | "sent" | "uncertain" | "failed" | "unreachable";

export interface NoticeRecord {
  for: string | null;
  status: NoticeStatus | null;
}

/**
 * A user is eligible for a notice for one trial expiration unless a notice for that
 * same expiration already exists in any state other than "failed". Uncertain or
 * in-flight deliveries are never resent, so duplicates are avoided.
 */
export function isNoticeEligible(notice: NoticeRecord | null, expirationMs: number): boolean {
  if (!notice || notice.for === null || Date.parse(notice.for) !== expirationMs) return true;
  return notice.status === "failed";
}
