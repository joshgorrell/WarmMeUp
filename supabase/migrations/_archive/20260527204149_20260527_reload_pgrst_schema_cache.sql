/*
  # Reload PostgREST schema cache

  Forces PostgREST to reload its schema cache so it picks up any columns
  (e.g. invite_code_expires_at on couples) that were added in prior migrations
  but may still be missing from the cached schema seen by the API layer.
*/

NOTIFY pgrst, 'reload schema';
