let subscriptionSequence = 0;

/** Postgres listeners belong to one effect, even when screens overlap or remount.
 * Supabase reuses channels with the same topic, so a fixed name can return an
 * already subscribed channel and reject a new postgres_changes handler.
 * Do not use for presence/broadcast channels that intentionally share a topic.
 */
export function uniqueRealtimeTopic(scope: string): string {
  return `${scope}:${Date.now()}:${++subscriptionSequence}`;
}
