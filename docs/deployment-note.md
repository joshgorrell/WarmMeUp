# Deployment note

This change modifies `supabase/functions/notify-partner/index.ts`. The `notify-partner` Edge Function must be deployed through the Warm Me Up Supabase project after merge (or by the repository's existing deployment workflow, if configured). The currently connected Supabase account in this ChatGPT session does not expose the Warm Me Up project, so production deployment cannot be performed from this connection.
