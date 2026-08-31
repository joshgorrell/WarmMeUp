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
4. Four SECURITY DEFINER functions (`create_chat_activity_for_interaction`,
   `create_chat_activity_for_wish`, `guard_interaction_status_transition`,
   `grant_entitlement`) were callable by `anon`.
5. `vault_items` UPDATE policy allowed the uploader to change `couple_id`,
   `uploaded_by_user_id`, and privacy flags after insert.
6. `storage.objects` still had an `anon` grant (defense-in-depth cleanup).

## Changes

### 1. Revoke anon EXECUTE on grant_entitlement and trigger functions
- `grant_entitlement` already had `REVOKE ... FROM anon` in its original
  migration, but the posture shows `anon` still has EXECUTE. Re-apply to be
  certain, and also revoke from `public`.
- Revoke EXECUTE from `anon` and `public` on:
  - `create_chat_activity_for_interaction()`
  - `create_chat_activity_for_wish()`
  - `guard_interaction_status_transition()`

### 2. Replace chat_messages UPDATE policy with column-restricted policies
- Drop the single broad "Couple members can update chat messages" policy.
- Create three replacement UPDATE policies:
  a) "Sender can update own chat message content" — sender only, allows
     updating `content_text`, `edited_at`, `burn_after_seconds`, `vault_item_id`.
  b) "Partner can mark chat message as viewed" — non-sender couple member only,
     allows updating only `first_viewed_at`.
  c) "Couple members can soft-delete chat messages" — either couple member,
     allows updating only `deleted_at`.
- Restrict the table-level `updatable_columns` grant from `all` to the specific
  set: `content_text, edited_at, burn_after_seconds, vault_item_id,
  first_viewed_at, deleted_at`.
- The existing `protect_chat_message_content` trigger already blocks non-senders
  from changing `content_text`/`edited_at`; the column grant is a second layer.
- DELETE remains open to both couple members (product decision).

### 3. Replace interactions UPDATE policy with role-scoped policies
- Drop the single broad "Couple members can update interactions" policy.
- Create two replacement UPDATE policies:
  a) "Sender can update own interactions" — sender only, allows updating
      `status, answer_text, answered_at, completed_at, completion_requested_at,
      decline_reason, media_storage_path, media_storage_bucket, media_type,
      media_url, allow_screenshot, allow_save, allow_share, is_active,
      viewed_by_partner, completed_verified_by, expires_at`.
  b) "Receiver can update interaction status" — receiver only, allows
     updating `status, answer_text, answered_at, completion_requested_at,
     decline_reason, viewed_by_partner`.
- The `guard_interaction_status_transition` trigger already enforces which
  party can make which status transition; the RLS split prevents the receiver
  from changing media paths or the sender from marking `viewed_by_partner`.
- Restrict `updatable_columns` from `all` to the union of both sets.
- DELETE remains open to both couple members.

### 4. Restrict vault_items UPDATE columns
- The "Uploader can update own vault items" policy currently allows updating
  all columns including `couple_id`, `uploaded_by_user_id`, privacy flags.
- Restrict the table-level `updatable_columns` grant to:
  `blurred_thumbnail_path, deleted_at, viewed_by_partner, screenshot_detected`.
- The "Partner can mark vault item as viewed" policy is already correctly
  scoped and remains unchanged.

### 5. Drop preview_invite_calls table
- RLS is enabled but no policies exist and no grants are given — the table is
  inaccessible and appears unused. Drop it to reduce surface area.

### 6. Revoke anon on storage.objects (re-apply)
- The lockdown migration already did this but the posture may still show it.
  Re-apply as defense-in-depth.

## Security Impact
- Anonymous callers can no longer call `grant_entitlement` or the three
  trigger functions.
- A couple member can no longer impersonate their partner by changing
  `sender_id` on chat messages, nor swap media paths, nor disarm burn timers.
- A couple member can no longer change their partner's interaction media
  or answer fields (the status transition guard already prevented status
  fraud; this prevents column-level tampering).
- Vault uploaders can no longer retroactively change privacy flags or
  reassign ownership of their vault items.
- All legitimate app functionality is preserved: senders can edit their own
  messages, set burn timers, link vault items; partners can mark messages
  viewed; either partner can delete; the state machine is unchanged.

## Important Notes
- The `protect_chat_message_content` trigger remains in place as a
  defense-in-depth layer on top of the column-restricted grant.
- The `guard_interaction_status_transition` trigger remains in place and
  continues to enforce sender/receiver ownership on status transitions.
- All policy names are unique per table; drops use IF EXISTS for idempotency.
*/
