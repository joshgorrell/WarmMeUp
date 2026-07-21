
-- Drop the old overly-permissive policy (if it exists from the original schema)
DROP POLICY IF EXISTS "Anyone can lookup couple by invite code for joining" ON couples;
-- Note: the broken USING clause from the original file is intentionally not applied.
-- The corrected version is in the v2 migration that follows immediately after.
