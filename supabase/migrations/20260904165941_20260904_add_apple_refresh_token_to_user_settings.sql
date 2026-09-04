/*
# Add Apple Refresh Token Storage for Sign in with Apple Revocation

## Purpose
Stores the Apple refresh token needed to revoke a user's Sign in with Apple
authorization when they delete their account. The token is obtained server-side
by exchanging the Apple authorization code at sign-in time and is never exposed
to the client.

## Changes
1. New Column
   - `user_settings.apple_refresh_token` (text, nullable)
   - Stores the Apple refresh token for users who signed in with Apple.
   - NULL for users who did not use Sign in with Apple.

2. Security — Column-Level Privileges
   - REVOKE SELECT on `apple_refresh_token` from the `authenticated` role so
     the app and client-side Supabase queries can never read the token.
   - REVOKE UPDATE on `apple_refresh_token` from the `authenticated` role so
     the client cannot overwrite or clear the token.
   - The `service_role` (used by edge functions) retains full access to all
     columns including this one.
   - All other columns on `user_settings` retain their existing privileges
     for the `authenticated` role.

## Important Notes
1. The token is written exclusively by the `apple-token-exchange` edge function
   using the service-role key, never by the client.
2. The token is read exclusively by the `delete-account` edge function using
   the service-role key, at account deletion time.
3. Apple may or may not return a new refresh token on each authorization code
   exchange. The edge function updates the stored value only when Apple returns
   a new token, preserving the existing one otherwise.
*/

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS apple_refresh_token text;

-- Revoke client access to the Apple refresh token column
REVOKE SELECT (apple_refresh_token) ON user_settings FROM authenticated;
REVOKE UPDATE (apple_refresh_token) ON user_settings FROM authenticated;
