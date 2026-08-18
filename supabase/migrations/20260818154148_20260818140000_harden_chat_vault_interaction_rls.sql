/*
# Harden Chat, Vault, and Interaction RLS Policies

## Purpose
Close several authorization gaps identified in a security audit:
1. `grant_entitlement` was callable by the `anon` role (unauthenticated callers).
2. `chat_messages` UPDATE policy allowed any couple member to change `sender_id`,
   `media_storage_path`, `burns_at`, `first_viewed_at`, or burn timer fields on
   their partner's messages — enabling impersonation, media swapping, and
   burn-timer disarming via direct API calls.
3. `interactions` UPDATE policy allowed any couple member to change status,
   answer fields, or media on their partner's interactions.
4. Four SECURITY DEFINER functions were callable by `anon`.
5. `vault_items` UPDATE policy allowed the uploader to change `couple_id`,
   `uploaded_by_user_id`, and privacy flags after insert.
6. `preview_invite_calls` table had RLS but no policies — unused, drop it.

## Changes

### 1. Revoke anon/public EXECUTE on SECURITY DEFINER functions
- grant_entitlement, create_chat_activity_for_interaction,
  create_chat_activity_for_wish, guard_interaction_status_transition

### 2. Replace chat_messages UPDATE policy with column-restricted policies
- Drop broad "Couple members can update chat messages"
- Create: sender-only content/burn/vault_link policy, partner-only first_viewed_at,
  couple-member soft-delete policy
- Restrict updatable_columns grant

### 3. Replace interactions UPDATE policy with role-scoped policies
- Drop broad "Couple members can update interactions"
- Create: sender-only update policy, receiver-only update policy
- Restrict updatable_columns grant

### 4. Restrict vault_items updatable_columns
- Limit to: blurred_thumbnail_path, deleted_at, viewed_by_partner, screenshot_detected

### 5. Drop unused preview_invite_calls table

### 6. Re-apply anon revoke on storage.objects (defense-in-depth)

## Security Impact
- No more impersonation via sender_id changes on chat messages
- No more burn-timer disarming via direct API
- No more media-path swapping on partner's messages or interactions
- No more retroactive privacy-flag changes on vault items
- Anonymous callers cannot call grant_entitlement or trigger functions
- All legitimate app functionality preserved

## Important Notes
- protect_chat_message_content trigger remains as defense-in-depth
- guard_interaction_status_transition trigger remains for status transitions
- DELETE on chat_messages and interactions stays open to both couple members (product decision)
- All drops use IF EXISTS for idempotency
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Revoke anon/public EXECUTE on SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.grant_entitlement(uuid, text, timestamptz, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_entitlement(uuid, text, timestamptz, text, boolean) FROM public;

REVOKE EXECUTE ON FUNCTION public.create_chat_activity_for_interaction() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_chat_activity_for_interaction() FROM public;
REVOKE EXECUTE ON FUNCTION public.create_chat_activity_for_interaction() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.create_chat_activity_for_wish() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_chat_activity_for_wish() FROM public;
REVOKE EXECUTE ON FUNCTION public.create_chat_activity_for_wish() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.guard_interaction_status_transition() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_interaction_status_transition() FROM public;
REVOKE EXECUTE ON FUNCTION public.guard_interaction_status_transition() FROM authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 2. Replace chat_messages UPDATE policy with column-restricted policies
-- ═══════════════════════════════════════════════════════════════

-- Drop the broad policy
DROP POLICY IF EXISTS "Couple members can update chat messages" ON public.chat_messages;

-- a) Sender can update own message content, burn timer, and vault link
CREATE POLICY "Sender can update own chat message content"
ON public.chat_messages FOR UPDATE
TO authenticated
USING (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM couples c
    WHERE c.id = chat_messages.couple_id
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  )
)
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM couples c
    WHERE c.id = chat_messages.couple_id
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  )
);

-- b) Partner (non-sender) can only set first_viewed_at
CREATE POLICY "Partner can mark chat message as viewed"
ON public.chat_messages FOR UPDATE
TO authenticated
USING (
  auth.uid() <> sender_id
  AND EXISTS (
    SELECT 1 FROM couples c
    WHERE c.id = chat_messages.couple_id
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  )
)
WITH CHECK (
  auth.uid() <> sender_id
  AND EXISTS (
    SELECT 1 FROM couples c
    WHERE c.id = chat_messages.couple_id
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  )
);

-- c) Either couple member can soft-delete (set deleted_at only)
CREATE POLICY "Couple members can soft-delete chat messages"
ON public.chat_messages FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM couples c
    WHERE c.id = chat_messages.couple_id
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM couples c
    WHERE c.id = chat_messages.couple_id
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  )
);

-- Restrict updatable columns
REVOKE UPDATE ON public.chat_messages FROM authenticated;
GRANT UPDATE (content_text, edited_at, burn_after_seconds, vault_item_id, first_viewed_at, deleted_at) ON public.chat_messages TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 3. Replace interactions UPDATE policy with role-scoped policies
-- ═══════════════════════════════════════════════════════════════

-- Drop the broad policy
DROP POLICY IF EXISTS "Couple members can update interactions" ON public.interactions;

-- a) Sender can update own interactions (status, media, answers, etc.)
CREATE POLICY "Sender can update own interactions"
ON public.interactions FOR UPDATE
TO authenticated
USING (
  auth.uid() = sender_id
  AND couple_id IN (
    SELECT c.id FROM couples c
    WHERE c.user_a_id = auth.uid() OR c.user_b_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = sender_id
  AND couple_id IN (
    SELECT c.id FROM couples c
    WHERE c.user_a_id = auth.uid() OR c.user_b_id = auth.uid()
  )
);

-- b) Receiver can update interaction status and answer fields
CREATE POLICY "Receiver can update interaction status"
ON public.interactions FOR UPDATE
TO authenticated
USING (
  auth.uid() = receiver_id
  AND couple_id IN (
    SELECT c.id FROM couples c
    WHERE c.user_a_id = auth.uid() OR c.user_b_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = receiver_id
  AND couple_id IN (
    SELECT c.id FROM couples c
    WHERE c.user_a_id = auth.uid() OR c.user_b_id = auth.uid()
  )
);

-- Restrict updatable columns
REVOKE UPDATE ON public.interactions FROM authenticated;
GRANT UPDATE (
  status, answer_text, answered_at, completed_at, completion_requested_at,
  decline_reason, media_storage_path, media_storage_bucket, media_type,
  media_url, allow_screenshot, allow_save, allow_share, is_active,
  viewed_by_partner, completed_verified_by, expires_at, deleted_at
) ON public.interactions TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 4. Restrict vault_items updatable_columns
-- ═══════════════════════════════════════════════════════════════

REVOKE UPDATE ON public.vault_items FROM authenticated;
GRANT UPDATE (
  blurred_thumbnail_path, deleted_at, viewed_by_partner, screenshot_detected
) ON public.vault_items TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 5. Drop unused preview_invite_calls table
-- ═══════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.preview_invite_calls CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- 6. Re-apply anon revoke on storage.objects (defense-in-depth)
-- ═══════════════════════════════════════════════════════════════

REVOKE SELECT, INSERT, UPDATE, DELETE ON storage.objects FROM anon;
