/*
  # Add updated_at column to couples table

  ## Summary
  Adds a missing `updated_at` timestamptz column to the `couples` table.

  ## Problem
  The `generate_invite_code` RPC function sets `updated_at = now()` when updating
  an existing solo couple's invite code. This column was never added to the schema,
  causing a PostgreSQL error: "column updated_at of relation couples does not exist".

  ## Changes
  - `couples` table: add `updated_at timestamptz DEFAULT now()` if not already present

  ## Notes
  - Uses IF NOT EXISTS guard to be safe against re-runs
  - Existing rows will get the current timestamp as their initial value
*/

ALTER TABLE public.couples
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
