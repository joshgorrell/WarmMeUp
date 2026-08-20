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
