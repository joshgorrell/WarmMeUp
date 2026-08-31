/*
# Admin access to the safety report review queue

1. Security Changes (RLS policies on `safety_reports`)
- `safety_reports_admin_read` (SELECT): allows authenticated admins and super-admins
  to read ALL safety reports (not just their own).
- `safety_reports_admin_update` (UPDATE): allows authenticated admins and super-admins
  to update report status, reviewed_at, reviewed_by, and admin_notes.

2. Admin Check
- Both policies check `profiles.is_admin = true OR profiles.is_super_admin = true`
  for the current user (auth.uid()).
- These are ADDITIVE to the existing `safety_reports_read_own` SELECT policy —
  users can still read their own reports via the original policy.
*/

-- Admin access to the safety report review queue.
DROP POLICY IF EXISTS safety_reports_admin_read ON public.safety_reports;
CREATE POLICY safety_reports_admin_read ON public.safety_reports
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.is_admin = true OR p.is_super_admin = true)
  )
);

DROP POLICY IF EXISTS safety_reports_admin_update ON public.safety_reports;
CREATE POLICY safety_reports_admin_update ON public.safety_reports
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.is_admin = true OR p.is_super_admin = true)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.is_admin = true OR p.is_super_admin = true)
  )
);
