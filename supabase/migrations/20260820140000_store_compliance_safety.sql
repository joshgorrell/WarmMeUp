-- Store compliance: age verification, safety reports, and durable partner blocks

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS age_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.safety_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  couple_id uuid REFERENCES public.couples(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('harassment','non_consensual_content','underage_concern','illegal_or_harmful','spam_or_misuse','other')),
  notes text,
  content_type text,
  content_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.safety_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safety_reports_insert_own ON public.safety_reports;
CREATE POLICY safety_reports_insert_own ON public.safety_reports
FOR INSERT TO authenticated
WITH CHECK (reporter_user_id = auth.uid());

DROP POLICY IF EXISTS safety_reports_read_own ON public.safety_reports;
CREATE POLICY safety_reports_read_own ON public.safety_reports
FOR SELECT TO authenticated
USING (reporter_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS safety_reports_status_created_idx ON public.safety_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS safety_reports_reported_user_idx ON public.safety_reports(reported_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CHECK (blocker_user_id <> blocked_user_id)
);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocked_users_manage_own ON public.blocked_users;
CREATE POLICY blocked_users_manage_own ON public.blocked_users
FOR ALL TO authenticated
USING (blocker_user_id = auth.uid())
WITH CHECK (blocker_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.prevent_blocked_pairing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate uuid;
BEGIN
  candidate := COALESCE(NEW.user_b_id, NEW.pending_partner_id);
  IF candidate IS NULL OR NEW.user_a_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocked_users b
    WHERE (b.blocker_user_id = NEW.user_a_id AND b.blocked_user_id = candidate)
       OR (b.blocker_user_id = candidate AND b.blocked_user_id = NEW.user_a_id)
  ) THEN
    RAISE EXCEPTION 'partner_blocked' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_blocked_pairing_trigger ON public.couples;
CREATE TRIGGER prevent_blocked_pairing_trigger
BEFORE INSERT OR UPDATE OF user_b_id, pending_partner_id ON public.couples
FOR EACH ROW EXECUTE FUNCTION public.prevent_blocked_pairing();

COMMENT ON COLUMN public.profiles.age_verified_at IS 'Timestamp when the user completed the Warm Me Up 18+ age gate.';
COMMENT ON TABLE public.safety_reports IS 'User-submitted safety reports; private content is not copied automatically.';
COMMENT ON TABLE public.blocked_users IS 'Durable one-way partner blocks used to prevent future pairing.';
