-- Subscription rows and events are written only by the server (service role) and the
-- SECURITY DEFINER logging trigger. Signed-in and anonymous clients keep read access
-- where their policies allow it, but must not write, truncate, or reference these tables.
-- Row-level security does not block TRUNCATE, so the table grants are what matter here.

DROP POLICY IF EXISTS system_insert_subscription_events ON public.subscription_events;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.subscription_events FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.subscriptions FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
