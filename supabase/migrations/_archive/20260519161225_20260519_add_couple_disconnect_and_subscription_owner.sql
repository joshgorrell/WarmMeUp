/*
  # Couple table: add subscription_owner_id and disconnected_at

  ## Summary
  Extends the couples table with two new nullable columns to support:
  1. Subscription ownership tracking — which partner holds the active paid subscription
     for this relationship. Used by the get-effective-subscription Edge Function to determine
     shared premium access without exposing raw subscription rows to the client.
  2. Disconnect timestamp — records exactly when a couple was disconnected, enabling the
     partner notification system and the "disconnected" state UI on next app open.

  ## Modified Tables
  - `couples`
    - `subscription_owner_id` (uuid, nullable, FK to auth.users) — the user who owns
      the active subscription that covers this couple. NULL until a subscriber invites
      or connects with a partner.
    - `disconnected_at` (timestamptz, nullable) — set to now() when active is set to
      false via a disconnect action. NULL for active couples and couples that were never
      fully connected.

  ## Security
  - No RLS policy changes needed. Existing couple-member read/update policies already
    cover these columns.
  - No data is dropped or modified. Both columns default to NULL.

  ## Notes
  - subscription_owner_id is intentionally separate from user_a_id / user_b_id to allow
    future "family/shared" subscription logic where neither role implies ownership.
  - disconnected_at is NOT reset when a couple is re-activated; it reflects the most
    recent disconnect event.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couples' AND column_name = 'subscription_owner_id'
  ) THEN
    ALTER TABLE couples ADD COLUMN subscription_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couples' AND column_name = 'disconnected_at'
  ) THEN
    ALTER TABLE couples ADD COLUMN disconnected_at timestamptz;
  END IF;
END $$;
