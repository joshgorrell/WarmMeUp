BEGIN;

-- "Share Your First Moment" was introduced on 2026-10-03. Couples that were
-- already actively paired before the feature existed are established users,
-- not unfinished onboarding. Grandfather only those pre-feature pairings.
-- New pairings still require an actual supported interaction to complete the
-- milestone through record_first_moment().
ALTER TABLE public.couples DISABLE TRIGGER preserve_first_moment;

UPDATE public.couples
SET first_moment_completed_at = created_at
WHERE active
  AND user_b_id IS NOT NULL
  AND first_moment_completed_at IS NULL
  AND created_at < timestamptz '2026-10-03 11:40:27+00';

ALTER TABLE public.couples ENABLE TRIGGER preserve_first_moment;

NOTIFY pgrst, 'reload schema';
COMMIT;
