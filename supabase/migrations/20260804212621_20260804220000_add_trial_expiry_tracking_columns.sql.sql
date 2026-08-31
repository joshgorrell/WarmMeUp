/*
# Add trial-expiry tracking columns to couples

## Purpose
When a user sends an invite code and their trial expires before the partner
joins, we need to (a) notify the inviter that their trial has ended and their
partner's request is waiting, and (b) send a 48-hour reminder if still unpaid.
Previously this was only handled by a scheduled edge function. Now the app
also checks on open and shows an in-app prompt, so we need columns to track
whether the first notification and the 48h reminder have been sent.

## New Columns on `couples`
- `trial_expired_notified_at` (timestamptz, nullable) — timestamp of the first
  trial-expiry notification sent to the inviter. NULL means no notification yet.
- `trial_expired_reminder_sent` (boolean, default false) — true after the 48h
  reminder has been sent.

## Security
No RLS policy changes. Existing couple-scoped policies cover the new columns
since they are part of the couples table and inherit the same ownership checks.
*/

ALTER TABLE couples
  ADD COLUMN IF NOT EXISTS trial_expired_notified_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_expired_reminder_sent boolean NOT NULL DEFAULT false;
