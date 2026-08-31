/*
  # Clean up spurious solo couple created for Josh while already paired

  ## Summary
  On 2026-06-02, a second couple row was created for Josh (aa307a0e)
  because the pair screen called generate_invite_code() after his real paired
  couple (15df3431, user_b = Robyn) had already been established. The RPC
  found no solo row (user_b_id IS NULL) for him and created a new orphan one.

  ## Changes
  - Hard-deletes couple 6517e632-9383-476d-98f8-f9ee76db6279 (solo orphan)
  - Verifies the real paired couple 15df3431-8b4a-4782-b6ed-be05a76d4101
    (Josh + Robyn, active = true) is untouched

  ## Notes
  - Only deletes the solo orphan row; no data was ever associated with it
    (no vault items, no interactions, no scores reference this couple_id)
*/

DELETE FROM public.couples
WHERE id = '6517e632-9383-476d-98f8-f9ee76db6279'
  AND user_a_id = 'aa307a0e-9cd4-4b56-838c-ad5c848014ac'
  AND user_b_id IS NULL;
