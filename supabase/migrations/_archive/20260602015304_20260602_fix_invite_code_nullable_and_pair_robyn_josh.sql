/*
  # Fix invite_code NOT NULL constraint and pair Robyn to Josh

  ## Summary
  The clear_invite_code_on_join trigger sets invite_code = NULL when a couple
  is joined (user_b_id goes from NULL to a real value), but the invite_code
  column had a NOT NULL constraint blocking this. This migration:

  1. Drops the NOT NULL constraint from couples.invite_code (NULL = code consumed after join)
  2. Manually pairs Robyn to Josh's couple (the trigger clears invite_code automatically)
  3. Deletes Robyn's stale solo couple created by the signup trigger
  4. Ensures score rows exist for both users in the joined couple
*/

-- Step 1: Allow invite_code to be NULL (NULL = consumed/used after join)
ALTER TABLE public.couples
  ALTER COLUMN invite_code DROP NOT NULL;

-- Step 2: Pair Robyn to Josh's couple — trigger fires and clears invite_code
UPDATE public.couples
SET
  user_b_id = '99a018f5-4f26-4227-bac9-733366af25d4',
  active = true,
  updated_at = now()
WHERE id = '15df3431-8b4a-4782-b6ed-be05a76d4101'
  AND user_b_id IS NULL;

-- Step 3: Delete Robyn's stale solo couple
DELETE FROM public.couples
WHERE id = '822ad52c-9eab-41e2-9b59-e8baa9f54799'
  AND user_b_id IS NULL;

-- Step 4: Ensure score rows exist for both users
INSERT INTO public.scores (user_id, couple_id, points)
VALUES
  ('99a018f5-4f26-4227-bac9-733366af25d4', '15df3431-8b4a-4782-b6ed-be05a76d4101', 0),
  ('aa307a0e-9cd4-4b56-838c-ad5c848014ac', '15df3431-8b4a-4782-b6ed-be05a76d4101', 0)
ON CONFLICT (user_id, couple_id) DO NOTHING;
