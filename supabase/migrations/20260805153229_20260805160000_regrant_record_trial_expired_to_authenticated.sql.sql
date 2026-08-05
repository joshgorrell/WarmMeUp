-- Re-grant EXECUTE on record_trial_expired_notification to authenticated.
-- This function is called directly from the client app (lib/coupleJoin.ts)
-- when a trial expires during the pairing flow. It is safe: it checks
-- auth.uid() and verifies the caller is the pending partner on the couple.
-- The earlier lockdown migration mistakenly revoked it from authenticated.

GRANT EXECUTE ON FUNCTION public.record_trial_expired_notification(uuid) TO authenticated;
