-- Table: activity_events
CREATE TABLE IF NOT EXISTS activity_events (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid NOT NULL, actor_user_id uuid NOT NULL, target_user_id uuid NOT NULL, event_type text NOT NULL, vault_item_id uuid, read boolean NOT NULL DEFAULT false, created_at timestamp with time zone NOT NULL DEFAULT now(), wish_id uuid, metadata jsonb, source_screen text);

-- Table: activity_views
CREATE TABLE IF NOT EXISTS activity_views (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid NOT NULL, user_id uuid NOT NULL, source_table text NOT NULL, source_id uuid NOT NULL, viewed_at timestamp with time zone NOT NULL DEFAULT now());

-- Table: admin_grants
CREATE TABLE IF NOT EXISTS admin_grants (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, granted_by uuid NOT NULL, entitlement_type text NOT NULL DEFAULT 'free_access'::text, starts_at timestamp with time zone NOT NULL DEFAULT now(), expires_at timestamp with time zone, active boolean NOT NULL DEFAULT true, notes text, created_at timestamp with time zone NOT NULL DEFAULT now(), can_invite boolean NOT NULL DEFAULT true);

-- Table: ai_issues
CREATE TABLE IF NOT EXISTS ai_issues (id uuid NOT NULL DEFAULT gen_random_uuid(), title text NOT NULL, body text, severity text NOT NULL DEFAULT 'medium'::text, source_loop_type text, source_run_id uuid, status text NOT NULL DEFAULT 'open'::text, resolved_at timestamp with time zone, created_at timestamp with time zone NOT NULL DEFAULT now());

-- Table: ai_loop_runs
CREATE TABLE IF NOT EXISTS ai_loop_runs (id uuid NOT NULL DEFAULT gen_random_uuid(), loop_type text NOT NULL, started_at timestamp with time zone NOT NULL DEFAULT now(), completed_at timestamp with time zone, status text NOT NULL DEFAULT 'running'::text, stop_condition_met boolean NOT NULL DEFAULT false, success_condition_met boolean NOT NULL DEFAULT false, findings jsonb, error_message text, created_at timestamp with time zone NOT NULL DEFAULT now());

-- Table: ai_loop_settings
CREATE TABLE IF NOT EXISTS ai_loop_settings (loop_type text NOT NULL, enabled boolean NOT NULL DEFAULT true, require_human_approval boolean NOT NULL DEFAULT false, last_triggered_at timestamp with time zone, created_at timestamp with time zone NOT NULL DEFAULT now());

-- Table: app_config
CREATE TABLE IF NOT EXISTS app_config (key text NOT NULL, value jsonb NOT NULL, updated_at timestamp with time zone DEFAULT now(), updated_by uuid);

-- Table: cancellation_surveys
CREATE TABLE IF NOT EXISTS cancellation_surveys (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(), couple_id uuid, survey_type text NOT NULL, primary_reason text, other_reason_text text, most_used_feature text, never_used_feature text, would_convince_feature text, would_return text, submitted_at timestamp with time zone NOT NULL DEFAULT now());

-- Table: cash_in_events
CREATE TABLE IF NOT EXISTS cash_in_events (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid NOT NULL, winner_user_id uuid NOT NULL, loser_user_id uuid NOT NULL, winner_choice text NOT NULL, winner_points integer NOT NULL DEFAULT 0, loser_points integer NOT NULL DEFAULT 0, created_at timestamp with time zone DEFAULT now());

-- Table: chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid NOT NULL, sender_id uuid NOT NULL, content_text text, media_storage_path text, media_storage_bucket text, media_type text, allow_screenshot boolean NOT NULL DEFAULT false, allow_save boolean NOT NULL DEFAULT false, allow_share boolean NOT NULL DEFAULT false, created_at timestamp with time zone NOT NULL DEFAULT now(), edited_at timestamp with time zone, vault_item_id uuid, deleted_at timestamp with time zone, media_url text, reply_to uuid, burn_after_seconds integer, burns_at timestamp with time zone);

-- Table: couple_health_scores
CREATE TABLE IF NOT EXISTS couple_health_scores (couple_id uuid NOT NULL, status text NOT NULL DEFAULT 'inactive'::text, computed_at timestamp with time zone NOT NULL DEFAULT now(), last_activity_at timestamp with time zone, days_since_activity integer, partner_a_active boolean NOT NULL DEFAULT false, partner_b_active boolean NOT NULL DEFAULT false, shared_activity_7d integer NOT NULL DEFAULT 0);

-- Table: couple_hidden_prompts
CREATE TABLE IF NOT EXISTS couple_hidden_prompts (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid NOT NULL, prompt_table text NOT NULL, prompt_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now());

-- Table: couples
CREATE TABLE IF NOT EXISTS couples (id uuid NOT NULL DEFAULT gen_random_uuid(), user_a_id uuid NOT NULL, user_b_id uuid, invite_code text, active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), admin_notes text DEFAULT ''::text, points_enabled boolean NOT NULL DEFAULT true, streaks_enabled boolean NOT NULL DEFAULT true, subscription_owner_id uuid, disconnected_at timestamp with time zone, invite_code_expires_at timestamp with time zone, invite_code_used_at timestamp with time zone, updated_at timestamp with time zone DEFAULT now(), anniversary_date date, pending_partner_id uuid, pending_partner_status text, pending_requested_at timestamp with time zone);

-- Table: dare_prompts
CREATE TABLE IF NOT EXISTS dare_prompts (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid, created_by_user_id uuid, text text NOT NULL, is_default boolean DEFAULT false, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());

-- Table: debug_access_log
CREATE TABLE IF NOT EXISTS debug_access_log (id uuid NOT NULL DEFAULT gen_random_uuid(), admin_user_id uuid, action text NOT NULL, device_info jsonb, support_code_regenerated boolean DEFAULT false, created_at timestamp with time zone DEFAULT now());

-- Table: decline_prompts
CREATE TABLE IF NOT EXISTS decline_prompts (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid, created_by_user_id uuid, text text NOT NULL, is_default boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now());

-- Table: dice_face_labels
CREATE TABLE IF NOT EXISTS dice_face_labels (id uuid NOT NULL DEFAULT gen_random_uuid(), label text NOT NULL, color text NOT NULL DEFAULT '#FFB347'::text, sort_order integer NOT NULL DEFAULT 0, created_at timestamp with time zone DEFAULT now());

-- Table: dice_prompts
CREATE TABLE IF NOT EXISTS dice_prompts (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid, created_by_user_id uuid, text text NOT NULL, category text DEFAULT 'general'::text, is_default boolean DEFAULT false, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), face_label text);

-- Table: greeting_subtitles
CREATE TABLE IF NOT EXISTS greeting_subtitles (id uuid NOT NULL DEFAULT gen_random_uuid(), text text NOT NULL, is_active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now());

-- Table: interactions
CREATE TABLE IF NOT EXISTS interactions (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid NOT NULL, type text NOT NULL, sender_id uuid NOT NULL, receiver_id uuid NOT NULL, content_text text, prompt_id uuid, mode text, status text DEFAULT 'sent'::text, is_active boolean DEFAULT true, points_awarded integer DEFAULT 0, created_at timestamp with time zone DEFAULT now(), expires_at timestamp with time zone, answer_text text, answered_at timestamp with time zone, rolled_for text, media_url text, media_type text, allow_screenshot boolean DEFAULT false, allow_save boolean DEFAULT false, allow_share boolean DEFAULT false, screenshot_detected boolean DEFAULT false, viewed_by_partner boolean DEFAULT false, media_storage_path text, media_storage_bucket text DEFAULT 'chat_media'::text, completed_at timestamp with time zone, completed_verified_by uuid, completion_requested_at timestamp with time zone, decline_reason text, deleted_at timestamp with time zone);

-- Table: invite_join_attempts
CREATE TABLE IF NOT EXISTS invite_join_attempts (user_id uuid NOT NULL, attempt_count integer NOT NULL DEFAULT 0, window_start timestamp with time zone NOT NULL DEFAULT now());

-- Table: media_reactions
CREATE TABLE IF NOT EXISTS media_reactions (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid NOT NULL, user_id uuid NOT NULL, source_table text NOT NULL, source_id uuid NOT NULL, emoji text NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());

-- Table: monthly_scores
CREATE TABLE IF NOT EXISTS monthly_scores (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid NOT NULL, user_id uuid NOT NULL, year integer NOT NULL, month integer NOT NULL, points integer NOT NULL DEFAULT 0, dares_accepted integer NOT NULL DEFAULT 0, dares_completed integer NOT NULL DEFAULT 0, dares_skipped integer NOT NULL DEFAULT 0, dice_accepted integer NOT NULL DEFAULT 0, dice_completed integer NOT NULL DEFAULT 0, dice_skipped integer NOT NULL DEFAULT 0, asks_sent integer NOT NULL DEFAULT 0, asks_replied integer NOT NULL DEFAULT 0, chat_messages_sent integer NOT NULL DEFAULT 0, media_sent integer NOT NULL DEFAULT 0, vault_uploads integer NOT NULL DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now(), wishes_sent integer NOT NULL DEFAULT 0, wishes_fulfilled integer NOT NULL DEFAULT 0);

-- Table: pg_all_foreign_keys
CREATE TABLE IF NOT EXISTS pg_all_foreign_keys (fk_schema_name name, fk_table_name name, fk_constraint_name name, fk_table_oid oid, fk_columns ARRAY, pk_schema_name name, pk_table_name name, pk_constraint_name name, pk_table_oid oid, pk_index_name name, pk_columns ARRAY, match_type text, on_delete text, on_update text, is_deferrable boolean, is_deferred boolean);

-- Table: point_config
CREATE TABLE IF NOT EXISTS point_config (id uuid NOT NULL DEFAULT gen_random_uuid(), event_key text NOT NULL, label text NOT NULL, points integer NOT NULL DEFAULT 0, updated_at timestamp with time zone DEFAULT now());

-- Table: point_events
CREATE TABLE IF NOT EXISTS point_events (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid NOT NULL, user_id uuid NOT NULL, interaction_id uuid, points integer NOT NULL, reason text NOT NULL, created_at timestamp with time zone DEFAULT now());

-- Table: profiles
CREATE TABLE IF NOT EXISTS profiles (id uuid NOT NULL, display_name text NOT NULL DEFAULT ''::text, avatar_url text, push_token text, created_at timestamp with time zone DEFAULT now(), is_admin boolean DEFAULT false, is_super_admin boolean NOT NULL DEFAULT false, tos_accepted_at timestamp with time zone, oauth_provider text, first_name text NOT NULL DEFAULT ''::text, last_name text NOT NULL DEFAULT ''::text);

-- Table: reports
CREATE TABLE IF NOT EXISTS reports (id uuid NOT NULL DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'pending'::text, created_at timestamp with time zone NOT NULL DEFAULT now());

-- Table: scores
CREATE TABLE IF NOT EXISTS scores (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid NOT NULL, user_id uuid NOT NULL, points integer DEFAULT 0, updated_at timestamp with time zone DEFAULT now());

-- Table: subscription_events
CREATE TABLE IF NOT EXISTS subscription_events (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, couple_id uuid, event_type text NOT NULL, plan text, occurred_at timestamp with time zone NOT NULL DEFAULT now(), metadata jsonb);

-- Table: subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, plan text NOT NULL, status text NOT NULL DEFAULT 'active'::text, started_at timestamp with time zone NOT NULL DEFAULT now(), expires_at timestamp with time zone, created_at timestamp with time zone NOT NULL DEFAULT now(), trial_started_at timestamp with time zone);

-- Table: tap_funky
CREATE TABLE IF NOT EXISTS tap_funky (oid oid, schema name, name name, owner name, args text, returns text, langoid oid, is_strict boolean, kind 'char', is_definer boolean, returns_set boolean, volatility character(1), is_visible boolean);

-- Table: tell_me_prompts
CREATE TABLE IF NOT EXISTS tell_me_prompts (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid, created_by_user_id uuid, text text NOT NULL, is_default boolean DEFAULT false, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());

-- Table: user_diagnostics
CREATE TABLE IF NOT EXISTS user_diagnostics (user_id uuid NOT NULL, email text, snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, captured_at timestamp with time zone NOT NULL DEFAULT now());

-- Table: user_settings
CREATE TABLE IF NOT EXISTS user_settings (user_id uuid NOT NULL, stealth_mode_enabled boolean DEFAULT true, stealth_bypass_until timestamp with time zone, face_id_required boolean DEFAULT true, vault_face_id_required boolean DEFAULT false, blur_on_background boolean DEFAULT true, discreet_notifications boolean DEFAULT true, notification_copy text DEFAULT 'New activity'::text, vault_allow_screenshot_default boolean DEFAULT false, vault_allow_save_default boolean DEFAULT false, vault_allow_share_default boolean DEFAULT false, screenshot_notify_partner boolean DEFAULT true, theme text DEFAULT 'dark'::text, updated_at timestamp with time zone DEFAULT now(), notify_me_on_own_screenshots boolean DEFAULT false, login_method text NOT NULL DEFAULT 'none'::text, lock_after_seconds integer, push_notifications_enabled boolean DEFAULT false, challenge_expiry_hours integer NOT NULL DEFAULT 24, blur_media boolean DEFAULT true, celebration_seen boolean NOT NULL DEFAULT false, chat_auto_save_to_vault boolean NOT NULL DEFAULT true, onboarding_seen boolean NOT NULL DEFAULT false, weather_lat double precision, weather_lon double precision, chat_font_scale real NOT NULL DEFAULT 1.0, blur_chat_media boolean DEFAULT true, blur_vault_media boolean DEFAULT true);

-- Table: vault_items
CREATE TABLE IF NOT EXISTS vault_items (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid NOT NULL, uploaded_by_user_id uuid NOT NULL, media_type text NOT NULL, file_path text NOT NULL, blurred_thumbnail_path text, allow_screenshot boolean DEFAULT false, allow_save boolean DEFAULT false, allow_share boolean DEFAULT false, screenshot_detected boolean DEFAULT false, viewed_by_partner boolean DEFAULT false, created_at timestamp with time zone DEFAULT now(), expires_at timestamp with time zone, storage_path text, storage_bucket text DEFAULT 'vault'::text, chat_message_id uuid, deleted_at timestamp with time zone);

-- Table: wish_reactions
CREATE TABLE IF NOT EXISTS wish_reactions (id uuid NOT NULL DEFAULT gen_random_uuid(), wish_id uuid NOT NULL, user_id uuid NOT NULL, emoji text NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());

-- Table: wishes
CREATE TABLE IF NOT EXISTS wishes (id uuid NOT NULL DEFAULT gen_random_uuid(), couple_id uuid NOT NULL, created_by_user_id uuid NOT NULL, title text NOT NULL, description text, category text, image_storage_path text, image_storage_bucket text DEFAULT 'vault'::text, link text, status text NOT NULL DEFAULT 'shared'::text, fulfilled_at timestamp with time zone, fulfilled_note text, fulfilled_image_path text, is_active boolean NOT NULL DEFAULT true, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());

-- RLS: activity_events
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- RLS: activity_views
ALTER TABLE activity_views ENABLE ROW LEVEL SECURITY;

-- RLS: admin_grants
ALTER TABLE admin_grants ENABLE ROW LEVEL SECURITY;

-- RLS: ai_issues
ALTER TABLE ai_issues ENABLE ROW LEVEL SECURITY;

-- RLS: ai_loop_runs
ALTER TABLE ai_loop_runs ENABLE ROW LEVEL SECURITY;

-- RLS: ai_loop_settings
ALTER TABLE ai_loop_settings ENABLE ROW LEVEL SECURITY;

-- RLS: app_config
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- RLS: cancellation_surveys
ALTER TABLE cancellation_surveys ENABLE ROW LEVEL SECURITY;

-- RLS: cash_in_events
ALTER TABLE cash_in_events ENABLE ROW LEVEL SECURITY;

-- RLS: chat_messages
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS: couple_health_scores
ALTER TABLE couple_health_scores ENABLE ROW LEVEL SECURITY;

-- RLS: couple_hidden_prompts
ALTER TABLE couple_hidden_prompts ENABLE ROW LEVEL SECURITY;

-- RLS: couples
ALTER TABLE couples ENABLE ROW LEVEL SECURITY;

-- RLS: dare_prompts
ALTER TABLE dare_prompts ENABLE ROW LEVEL SECURITY;

-- RLS: debug_access_log
ALTER TABLE debug_access_log ENABLE ROW LEVEL SECURITY;

-- RLS: decline_prompts
ALTER TABLE decline_prompts ENABLE ROW LEVEL SECURITY;

-- RLS: dice_face_labels
ALTER TABLE dice_face_labels ENABLE ROW LEVEL SECURITY;

-- RLS: dice_prompts
ALTER TABLE dice_prompts ENABLE ROW LEVEL SECURITY;

-- RLS: greeting_subtitles
ALTER TABLE greeting_subtitles ENABLE ROW LEVEL SECURITY;

-- RLS: interactions
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

-- RLS: invite_join_attempts
ALTER TABLE invite_join_attempts ENABLE ROW LEVEL SECURITY;

-- RLS: media_reactions
ALTER TABLE media_reactions ENABLE ROW LEVEL SECURITY;

-- RLS: monthly_scores
ALTER TABLE monthly_scores ENABLE ROW LEVEL SECURITY;

-- RLS: point_config
ALTER TABLE point_config ENABLE ROW LEVEL SECURITY;

-- RLS: point_events
ALTER TABLE point_events ENABLE ROW LEVEL SECURITY;

-- RLS: profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS: reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- RLS: scores
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- RLS: subscription_events
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- RLS: subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS: tell_me_prompts
ALTER TABLE tell_me_prompts ENABLE ROW LEVEL SECURITY;

-- RLS: user_diagnostics
ALTER TABLE user_diagnostics ENABLE ROW LEVEL SECURITY;

-- RLS: user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS: vault_items
ALTER TABLE vault_items ENABLE ROW LEVEL SECURITY;

-- RLS: wish_reactions
ALTER TABLE wish_reactions ENABLE ROW LEVEL SECURITY;

-- RLS: wishes
ALTER TABLE wishes ENABLE ROW LEVEL SECURITY;

-- Helper functions (referenced by RLS policies below)
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT COALESCE(
  (SELECT (is_admin = true OR is_super_admin = true)
   FROM public.profiles WHERE id = auth.uid()),
  false
);
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT COALESCE(
  (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
  false
);
$function$;

-- Policy: Actor can insert own activity events on activity_events
DROP POLICY IF EXISTS "Actor can insert own activity events" ON activity_events;
CREATE POLICY "Actor can insert own activity events" ON activity_events FOR INSERT TO authenticated USING (true) WITH CHECK ((auth.uid() = actor_user_id));

-- Policy: Couple members can read their activity events on activity_events
DROP POLICY IF EXISTS "Couple members can read their activity events" ON activity_events;
CREATE POLICY "Couple members can read their activity events" ON activity_events FOR SELECT TO authenticated USING (((auth.uid() = target_user_id) OR (auth.uid() = actor_user_id)));

-- Policy: Target user can mark events as read on activity_events
DROP POLICY IF EXISTS "Target user can mark events as read" ON activity_events;
CREATE POLICY "Target user can mark events as read" ON activity_events FOR UPDATE TO authenticated USING ((auth.uid() = target_user_id)) WITH CHECK ((auth.uid() = target_user_id));

-- Policy: Couple members can delete activity views on activity_views
DROP POLICY IF EXISTS "Couple members can delete activity views" ON activity_views;
CREATE POLICY "Couple members can delete activity views" ON activity_views FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = activity_views.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Users can insert own activity views on activity_views
DROP POLICY IF EXISTS "Users can insert own activity views" ON activity_views;
CREATE POLICY "Users can insert own activity views" ON activity_views FOR INSERT TO authenticated USING (true) WITH CHECK ((auth.uid() = user_id));

-- Policy: Users can read own activity views on activity_views
DROP POLICY IF EXISTS "Users can read own activity views" ON activity_views;
CREATE POLICY "Users can read own activity views" ON activity_views FOR SELECT TO authenticated USING ((auth.uid() = user_id));

-- Policy: Super admins can delete admin grants on admin_grants
DROP POLICY IF EXISTS "Super admins can delete admin grants" ON admin_grants;
CREATE POLICY "Super admins can delete admin grants" ON admin_grants FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_super_admin = true)))));

-- Policy: Admins can insert admin grants on admin_grants
DROP POLICY IF EXISTS "Admins can insert admin grants" ON admin_grants;
CREATE POLICY "Admins can insert admin grants" ON admin_grants FOR INSERT TO authenticated USING (true) WITH CHECK (is_current_user_admin());

-- Policy: Admins can read all admin grants on admin_grants
DROP POLICY IF EXISTS "Admins can read all admin grants" ON admin_grants;
CREATE POLICY "Admins can read all admin grants" ON admin_grants FOR SELECT TO authenticated USING ((is_current_user_admin() OR is_super_admin()));

-- Policy: Users can read own admin grants on admin_grants
DROP POLICY IF EXISTS "Users can read own admin grants" ON admin_grants;
CREATE POLICY "Users can read own admin grants" ON admin_grants FOR SELECT TO authenticated USING ((auth.uid() = user_id));

-- Policy: Admins can update admin grants on admin_grants
DROP POLICY IF EXISTS "Admins can update admin grants" ON admin_grants;
CREATE POLICY "Admins can update admin grants" ON admin_grants FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true))))));

-- Policy: admin_delete_ai_issues on ai_issues
DROP POLICY IF EXISTS "admin_delete_ai_issues" ON ai_issues;
CREATE POLICY "admin_delete_ai_issues" ON ai_issues FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true))))));

-- Policy: admin_insert_ai_issues on ai_issues
DROP POLICY IF EXISTS "admin_insert_ai_issues" ON ai_issues;
CREATE POLICY "admin_insert_ai_issues" ON ai_issues FOR INSERT TO authenticated USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true))))));

-- Policy: admin_select_ai_issues on ai_issues
DROP POLICY IF EXISTS "admin_select_ai_issues" ON ai_issues;
CREATE POLICY "admin_select_ai_issues" ON ai_issues FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true))))));

-- Policy: admin_update_ai_issues on ai_issues
DROP POLICY IF EXISTS "admin_update_ai_issues" ON ai_issues;
CREATE POLICY "admin_update_ai_issues" ON ai_issues FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true))))));

-- Policy: admin_insert_ai_loop_runs on ai_loop_runs
DROP POLICY IF EXISTS "admin_insert_ai_loop_runs" ON ai_loop_runs;
CREATE POLICY "admin_insert_ai_loop_runs" ON ai_loop_runs FOR INSERT TO authenticated USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true))))));

-- Policy: admin_select_ai_loop_runs on ai_loop_runs
DROP POLICY IF EXISTS "admin_select_ai_loop_runs" ON ai_loop_runs;
CREATE POLICY "admin_select_ai_loop_runs" ON ai_loop_runs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true))))));

-- Policy: admin_update_ai_loop_runs on ai_loop_runs
DROP POLICY IF EXISTS "admin_update_ai_loop_runs" ON ai_loop_runs;
CREATE POLICY "admin_update_ai_loop_runs" ON ai_loop_runs FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true))))));

-- Policy: admin_select_ai_loop_settings on ai_loop_settings
DROP POLICY IF EXISTS "admin_select_ai_loop_settings" ON ai_loop_settings;
CREATE POLICY "admin_select_ai_loop_settings" ON ai_loop_settings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true))))));

-- Policy: superadmin_update_ai_loop_settings on ai_loop_settings
DROP POLICY IF EXISTS "superadmin_update_ai_loop_settings" ON ai_loop_settings;
CREATE POLICY "superadmin_update_ai_loop_settings" ON ai_loop_settings FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_super_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_super_admin = true)))));

-- Policy: Admins can delete app_config on app_config
DROP POLICY IF EXISTS "Admins can delete app_config" ON app_config;
CREATE POLICY "Admins can delete app_config" ON app_config FOR DELETE TO authenticated USING (is_current_user_admin());

-- Policy: Admins can insert app_config on app_config
DROP POLICY IF EXISTS "Admins can insert app_config" ON app_config;
CREATE POLICY "Admins can insert app_config" ON app_config FOR INSERT TO authenticated USING (true) WITH CHECK (is_current_user_admin());

-- Policy: Authenticated users can read app_config on app_config
DROP POLICY IF EXISTS "Authenticated users can read app_config" ON app_config;
CREATE POLICY "Authenticated users can read app_config" ON app_config FOR SELECT TO authenticated USING (true);

-- Policy: Admins can update app_config on app_config
DROP POLICY IF EXISTS "Admins can update app_config" ON app_config;
CREATE POLICY "Admins can update app_config" ON app_config FOR UPDATE TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

-- Policy: insert_own_cancellation_survey on cancellation_surveys
DROP POLICY IF EXISTS "insert_own_cancellation_survey" ON cancellation_surveys;
CREATE POLICY "insert_own_cancellation_survey" ON cancellation_surveys FOR INSERT TO authenticated USING (true) WITH CHECK ((auth.uid() = user_id));

-- Policy: admin_read_cancellation_surveys on cancellation_surveys
DROP POLICY IF EXISTS "admin_read_cancellation_surveys" ON cancellation_surveys;
CREATE POLICY "admin_read_cancellation_surveys" ON cancellation_surveys FOR SELECT TO authenticated USING (is_current_user_admin());

-- Policy: select_own_cancellation_surveys on cancellation_surveys
DROP POLICY IF EXISTS "select_own_cancellation_surveys" ON cancellation_surveys;
CREATE POLICY "select_own_cancellation_surveys" ON cancellation_surveys FOR SELECT TO authenticated USING ((auth.uid() = user_id));

-- Policy: Couple members can delete cash in events on cash_in_events
DROP POLICY IF EXISTS "Couple members can delete cash in events" ON cash_in_events;
CREATE POLICY "Couple members can delete cash in events" ON cash_in_events FOR DELETE TO authenticated USING ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

-- Policy: Couple members can insert cash in events on cash_in_events
DROP POLICY IF EXISTS "Couple members can insert cash in events" ON cash_in_events;
CREATE POLICY "Couple members can insert cash in events" ON cash_in_events FOR INSERT TO authenticated USING (true) WITH CHECK (((auth.uid() = winner_user_id) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can view cash in events on cash_in_events
DROP POLICY IF EXISTS "Couple members can view cash in events" ON cash_in_events;
CREATE POLICY "Couple members can view cash in events" ON cash_in_events FOR SELECT TO authenticated USING ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

-- Policy: Couple members can delete chat messages on chat_messages
DROP POLICY IF EXISTS "Couple members can delete chat messages" ON chat_messages;
CREATE POLICY "Couple members can delete chat messages" ON chat_messages FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = chat_messages.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can send chat messages on chat_messages
DROP POLICY IF EXISTS "Couple members can send chat messages" ON chat_messages;
CREATE POLICY "Couple members can send chat messages" ON chat_messages FOR INSERT TO authenticated USING (true) WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = chat_messages.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))));

-- Policy: Couple members can read chat messages on chat_messages
DROP POLICY IF EXISTS "Couple members can read chat messages" ON chat_messages;
CREATE POLICY "Couple members can read chat messages" ON chat_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = chat_messages.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can update chat messages on chat_messages
DROP POLICY IF EXISTS "Couple members can update chat messages" ON chat_messages;
CREATE POLICY "Couple members can update chat messages" ON chat_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = chat_messages.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = chat_messages.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: admin_read_couple_health_scores on couple_health_scores
DROP POLICY IF EXISTS "admin_read_couple_health_scores" ON couple_health_scores;
CREATE POLICY "admin_read_couple_health_scores" ON couple_health_scores FOR SELECT TO authenticated USING (is_current_user_admin());

-- Policy: Couple members can delete own hidden prompts on couple_hidden_prompts
DROP POLICY IF EXISTS "Couple members can delete own hidden prompts" ON couple_hidden_prompts;
CREATE POLICY "Couple members can delete own hidden prompts" ON couple_hidden_prompts FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = couple_hidden_prompts.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can insert own hidden prompts on couple_hidden_prompts
DROP POLICY IF EXISTS "Couple members can insert own hidden prompts" ON couple_hidden_prompts;
CREATE POLICY "Couple members can insert own hidden prompts" ON couple_hidden_prompts FOR INSERT TO authenticated USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = couple_hidden_prompts.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can read own hidden prompts on couple_hidden_prompts
DROP POLICY IF EXISTS "Couple members can read own hidden prompts" ON couple_hidden_prompts;
CREATE POLICY "Couple members can read own hidden prompts" ON couple_hidden_prompts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = couple_hidden_prompts.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Creator can delete their own pending invite on couples
DROP POLICY IF EXISTS "Creator can delete their own pending invite" ON couples;
CREATE POLICY "Creator can delete their own pending invite" ON couples FOR DELETE TO authenticated USING (((auth.uid() = user_a_id) AND (user_b_id IS NULL)));

-- Policy: User can create couple as user_a on couples
DROP POLICY IF EXISTS "User can create couple as user_a" ON couples;
CREATE POLICY "User can create couple as user_a" ON couples FOR INSERT TO authenticated USING (true) WITH CHECK ((auth.uid() = user_a_id));

-- Policy: Couple members can view their couple on couples
DROP POLICY IF EXISTS "Couple members can view their couple" ON couples;
CREATE POLICY "Couple members can view their couple" ON couples FOR SELECT TO authenticated USING (((auth.uid() = user_a_id) OR (auth.uid() = user_b_id)));

-- Policy: Admins can read all couples on couples
DROP POLICY IF EXISTS "Admins can read all couples" ON couples;
CREATE POLICY "Admins can read all couples" ON couples FOR SELECT TO authenticated USING (is_current_user_admin());

-- Policy: Couple members can update their couple on couples
DROP POLICY IF EXISTS "Couple members can update their couple" ON couples;
CREATE POLICY "Couple members can update their couple" ON couples FOR UPDATE TO authenticated USING (((auth.uid() = user_a_id) OR (auth.uid() = user_b_id))) WITH CHECK ((((auth.uid() = user_a_id) OR (auth.uid() = user_b_id)) AND (NOT ((auth.uid() = user_a_id) AND (NOT (user_b_id IS DISTINCT FROM auth.uid()))))));

-- Policy: Admins can update any couple on couples
DROP POLICY IF EXISTS "Admins can update any couple" ON couples;
CREATE POLICY "Admins can update any couple" ON couples FOR UPDATE TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

-- Policy: Couple members can delete their couple dare prompts on dare_prompts
DROP POLICY IF EXISTS "Couple members can delete their couple dare prompts" ON dare_prompts;
CREATE POLICY "Couple members can delete their couple dare prompts" ON dare_prompts FOR DELETE TO authenticated USING (((is_default = false) AND (couple_id IS NOT NULL) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE (((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())) AND (couples.active = true))))));

-- Policy: Admins can delete default dare prompts on dare_prompts
DROP POLICY IF EXISTS "Admins can delete default dare prompts" ON dare_prompts;
CREATE POLICY "Admins can delete default dare prompts" ON dare_prompts FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));

-- Policy: Admins can insert default dare prompts on dare_prompts
DROP POLICY IF EXISTS "Admins can insert default dare prompts" ON dare_prompts;
CREATE POLICY "Admins can insert default dare prompts" ON dare_prompts FOR INSERT TO authenticated USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));

-- Policy: Couple members can insert own dare prompts on dare_prompts
DROP POLICY IF EXISTS "Couple members can insert own dare prompts" ON dare_prompts;
CREATE POLICY "Couple members can insert own dare prompts" ON dare_prompts FOR INSERT TO authenticated USING (true) WITH CHECK (((couple_id IS NOT NULL) AND (created_by_user_id = auth.uid()) AND (is_default = false) AND (EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = dare_prompts.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))));

-- Policy: Couple members can view dare prompts on dare_prompts
DROP POLICY IF EXISTS "Couple members can view dare prompts" ON dare_prompts;
CREATE POLICY "Couple members can view dare prompts" ON dare_prompts FOR SELECT TO authenticated USING (((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))) OR (is_default = true)));

-- Policy: Admins can update default dare prompts on dare_prompts
DROP POLICY IF EXISTS "Admins can update default dare prompts" ON dare_prompts;
CREATE POLICY "Admins can update default dare prompts" ON dare_prompts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));

-- Policy: Couple members can update their couple dare prompts on dare_prompts
DROP POLICY IF EXISTS "Couple members can update their couple dare prompts" ON dare_prompts;
CREATE POLICY "Couple members can update their couple dare prompts" ON dare_prompts FOR UPDATE TO authenticated USING (((is_default = false) AND (couple_id IS NOT NULL) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE (((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())) AND (couples.active = true)))))) WITH CHECK (((is_default = false) AND (couple_id IS NOT NULL) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE (((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())) AND (couples.active = true))))));

-- Policy: admins_read_debug_access_log on debug_access_log
DROP POLICY IF EXISTS "admins_read_debug_access_log" ON debug_access_log;
CREATE POLICY "admins_read_debug_access_log" ON debug_access_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true))))));

-- Policy: Couple members can delete own decline prompts on decline_prompts
DROP POLICY IF EXISTS "Couple members can delete own decline prompts" ON decline_prompts;
CREATE POLICY "Couple members can delete own decline prompts" ON decline_prompts FOR DELETE TO authenticated USING (((is_default = false) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can insert decline prompts on decline_prompts
DROP POLICY IF EXISTS "Couple members can insert decline prompts" ON decline_prompts;
CREATE POLICY "Couple members can insert decline prompts" ON decline_prompts FOR INSERT TO authenticated USING (true) WITH CHECK (((is_default = false) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))) AND (created_by_user_id = auth.uid())));

-- Policy: Users can read active defaults and own couple decline prompts on decline_prompts
DROP POLICY IF EXISTS "Users can read active defaults and own couple decline prompts" ON decline_prompts;
CREATE POLICY "Users can read active defaults and own couple decline prompts" ON decline_prompts FOR SELECT TO authenticated USING (((is_active = true) AND ((is_default = true) OR (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))));

-- Policy: Couple members can update own decline prompts on decline_prompts
DROP POLICY IF EXISTS "Couple members can update own decline prompts" ON decline_prompts;
CREATE POLICY "Couple members can update own decline prompts" ON decline_prompts FOR UPDATE TO authenticated USING (((is_default = false) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))) WITH CHECK (((is_default = false) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Admins can delete dice face labels on dice_face_labels
DROP POLICY IF EXISTS "Admins can delete dice face labels" ON dice_face_labels;
CREATE POLICY "Admins can delete dice face labels" ON dice_face_labels FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

-- Policy: Admins can insert dice face labels on dice_face_labels
DROP POLICY IF EXISTS "Admins can insert dice face labels" ON dice_face_labels;
CREATE POLICY "Admins can insert dice face labels" ON dice_face_labels FOR INSERT TO authenticated USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

-- Policy: Authenticated users can read dice face labels on dice_face_labels
DROP POLICY IF EXISTS "Authenticated users can read dice face labels" ON dice_face_labels;
CREATE POLICY "Authenticated users can read dice face labels" ON dice_face_labels FOR SELECT TO authenticated USING (true);

-- Policy: Admins can update dice face labels on dice_face_labels
DROP POLICY IF EXISTS "Admins can update dice face labels" ON dice_face_labels;
CREATE POLICY "Admins can update dice face labels" ON dice_face_labels FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

-- Policy: Couple members can delete their couple dice prompts on dice_prompts
DROP POLICY IF EXISTS "Couple members can delete their couple dice prompts" ON dice_prompts;
CREATE POLICY "Couple members can delete their couple dice prompts" ON dice_prompts FOR DELETE TO authenticated USING (((is_default = false) AND (couple_id IS NOT NULL) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE (((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())) AND (couples.active = true))))));

-- Policy: Admins can delete default dice prompts on dice_prompts
DROP POLICY IF EXISTS "Admins can delete default dice prompts" ON dice_prompts;
CREATE POLICY "Admins can delete default dice prompts" ON dice_prompts FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));

-- Policy: Admins can insert default dice prompts on dice_prompts
DROP POLICY IF EXISTS "Admins can insert default dice prompts" ON dice_prompts;
CREATE POLICY "Admins can insert default dice prompts" ON dice_prompts FOR INSERT TO authenticated USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));

-- Policy: Couple members can insert own dice prompts on dice_prompts
DROP POLICY IF EXISTS "Couple members can insert own dice prompts" ON dice_prompts;
CREATE POLICY "Couple members can insert own dice prompts" ON dice_prompts FOR INSERT TO authenticated USING (true) WITH CHECK (((couple_id IS NOT NULL) AND (created_by_user_id = auth.uid()) AND (is_default = false) AND (EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = dice_prompts.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))));

-- Policy: Couple members can view their dice prompts on dice_prompts
DROP POLICY IF EXISTS "Couple members can view their dice prompts" ON dice_prompts;
CREATE POLICY "Couple members can view their dice prompts" ON dice_prompts FOR SELECT TO authenticated USING (((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))) OR (is_default = true)));

-- Policy: Couple members can update their couple dice prompts on dice_prompts
DROP POLICY IF EXISTS "Couple members can update their couple dice prompts" ON dice_prompts;
CREATE POLICY "Couple members can update their couple dice prompts" ON dice_prompts FOR UPDATE TO authenticated USING (((is_default = false) AND (couple_id IS NOT NULL) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE (((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())) AND (couples.active = true)))))) WITH CHECK (((is_default = false) AND (couple_id IS NOT NULL) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE (((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())) AND (couples.active = true))))));

-- Policy: Admins can update default dice prompts on dice_prompts
DROP POLICY IF EXISTS "Admins can update default dice prompts" ON dice_prompts;
CREATE POLICY "Admins can update default dice prompts" ON dice_prompts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));

-- Policy: Admins can delete greeting subtitles on greeting_subtitles
DROP POLICY IF EXISTS "Admins can delete greeting subtitles" ON greeting_subtitles;
CREATE POLICY "Admins can delete greeting subtitles" ON greeting_subtitles FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

-- Policy: Admins can insert greeting subtitles on greeting_subtitles
DROP POLICY IF EXISTS "Admins can insert greeting subtitles" ON greeting_subtitles;
CREATE POLICY "Admins can insert greeting subtitles" ON greeting_subtitles FOR INSERT TO authenticated USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

-- Policy: Authenticated users can read greeting subtitles on greeting_subtitles
DROP POLICY IF EXISTS "Authenticated users can read greeting subtitles" ON greeting_subtitles;
CREATE POLICY "Authenticated users can read greeting subtitles" ON greeting_subtitles FOR SELECT TO authenticated USING (true);

-- Policy: Admins can update greeting subtitles on greeting_subtitles
DROP POLICY IF EXISTS "Admins can update greeting subtitles" ON greeting_subtitles;
CREATE POLICY "Admins can update greeting subtitles" ON greeting_subtitles FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

-- Policy: Couple members can delete interactions on interactions
DROP POLICY IF EXISTS "Couple members can delete interactions" ON interactions;
CREATE POLICY "Couple members can delete interactions" ON interactions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = interactions.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can insert interactions on interactions
DROP POLICY IF EXISTS "Couple members can insert interactions" ON interactions;
CREATE POLICY "Couple members can insert interactions" ON interactions FOR INSERT TO authenticated USING (true) WITH CHECK (((auth.uid() = sender_id) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can view their interactions on interactions
DROP POLICY IF EXISTS "Couple members can view their interactions" ON interactions;
CREATE POLICY "Couple members can view their interactions" ON interactions FOR SELECT TO authenticated USING ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

-- Policy: Admins can read all interactions on interactions
DROP POLICY IF EXISTS "Admins can read all interactions" ON interactions;
CREATE POLICY "Admins can read all interactions" ON interactions FOR SELECT TO authenticated USING (is_current_user_admin());

-- Policy: Couple members can update interactions on interactions
DROP POLICY IF EXISTS "Couple members can update interactions" ON interactions;
CREATE POLICY "Couple members can update interactions" ON interactions FOR UPDATE TO authenticated USING ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))) WITH CHECK ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

-- Policy: select_own_join_attempts on invite_join_attempts
DROP POLICY IF EXISTS "select_own_join_attempts" ON invite_join_attempts;
CREATE POLICY "select_own_join_attempts" ON invite_join_attempts FOR SELECT TO authenticated USING ((auth.uid() = user_id));

-- Policy: Couple members can delete own media reactions on media_reactions
DROP POLICY IF EXISTS "Couple members can delete own media reactions" ON media_reactions;
CREATE POLICY "Couple members can delete own media reactions" ON media_reactions FOR DELETE TO authenticated USING (((auth.uid() = user_id) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can insert own media reactions on media_reactions
DROP POLICY IF EXISTS "Couple members can insert own media reactions" ON media_reactions;
CREATE POLICY "Couple members can insert own media reactions" ON media_reactions FOR INSERT TO authenticated USING (true) WITH CHECK (((auth.uid() = user_id) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can read media reactions on media_reactions
DROP POLICY IF EXISTS "Couple members can read media reactions" ON media_reactions;
CREATE POLICY "Couple members can read media reactions" ON media_reactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = media_reactions.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can update own media reactions on media_reactions
DROP POLICY IF EXISTS "Couple members can update own media reactions" ON media_reactions;
CREATE POLICY "Couple members can update own media reactions" ON media_reactions FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))) WITH CHECK (((auth.uid() = user_id) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can delete monthly scores on monthly_scores
DROP POLICY IF EXISTS "Couple members can delete monthly scores" ON monthly_scores;
CREATE POLICY "Couple members can delete monthly scores" ON monthly_scores FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = monthly_scores.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: System can upsert monthly scores on monthly_scores
DROP POLICY IF EXISTS "System can upsert monthly scores" ON monthly_scores;
CREATE POLICY "System can upsert monthly scores" ON monthly_scores FOR INSERT TO authenticated USING (true) WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = monthly_scores.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))));

-- Policy: Couple members can read monthly scores on monthly_scores
DROP POLICY IF EXISTS "Couple members can read monthly scores" ON monthly_scores;
CREATE POLICY "Couple members can read monthly scores" ON monthly_scores FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = monthly_scores.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: System can update monthly scores on monthly_scores
DROP POLICY IF EXISTS "System can update monthly scores" ON monthly_scores;
CREATE POLICY "System can update monthly scores" ON monthly_scores FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = monthly_scores.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))))) WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = monthly_scores.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))));

-- Policy: Admins can insert point config on point_config
DROP POLICY IF EXISTS "Admins can insert point config" ON point_config;
CREATE POLICY "Admins can insert point config" ON point_config FOR INSERT TO authenticated USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

-- Policy: Authenticated users can read point config on point_config
DROP POLICY IF EXISTS "Authenticated users can read point config" ON point_config;
CREATE POLICY "Authenticated users can read point config" ON point_config FOR SELECT TO authenticated USING (true);

-- Policy: Admins can update point config on point_config
DROP POLICY IF EXISTS "Admins can update point config" ON point_config;
CREATE POLICY "Admins can update point config" ON point_config FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

-- Policy: Couple members can delete point events on point_events
DROP POLICY IF EXISTS "Couple members can delete point events" ON point_events;
CREATE POLICY "Couple members can delete point events" ON point_events FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = point_events.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can insert point events on point_events
DROP POLICY IF EXISTS "Couple members can insert point events" ON point_events;
CREATE POLICY "Couple members can insert point events" ON point_events FOR INSERT TO authenticated USING (true) WITH CHECK ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

-- Policy: Couple members can view point events on point_events
DROP POLICY IF EXISTS "Couple members can view point events" ON point_events;
CREATE POLICY "Couple members can view point events" ON point_events FOR SELECT TO authenticated USING ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

-- Policy: Users can insert own profile on profiles
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated USING (true) WITH CHECK ((auth.uid() = id));

-- Policy: Users can read their partner's profile on profiles
DROP POLICY IF EXISTS "Users can read their partner's profile" ON profiles;
CREATE POLICY "Users can read their partner's profile" ON profiles FOR SELECT TO authenticated USING ((id IN ( SELECT
        CASE
            WHEN (couples.user_a_id = auth.uid()) THEN couples.user_b_id
            ELSE couples.user_a_id
        END AS user_a_id
   FROM couples
  WHERE (((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())) AND (couples.user_b_id IS NOT NULL)))));

-- Policy: Admins can read all profiles on profiles
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles" ON profiles FOR SELECT TO authenticated USING (is_current_user_admin());

-- Policy: Users can read own profile on profiles
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT TO authenticated USING ((auth.uid() = id));

-- Trigger function: protect admin flags from self-elevation
CREATE OR REPLACE FUNCTION public.protect_profile_admin_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF is_super_admin() THEN
    RETURN NEW;
  END IF;
  NEW.is_admin := OLD.is_admin;
  NEW.is_super_admin := OLD.is_super_admin;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_profile_admin_flags_trigger ON public.profiles;
CREATE TRIGGER protect_profile_admin_flags_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_flags();

-- Policy: Users can update own profile on profiles
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));

-- Policy: Super-admins can grant or revoke admin privileges on profiles
DROP POLICY IF EXISTS "Super-admins can grant or revoke admin privileges" ON profiles;
CREATE POLICY "Super-admins can grant or revoke admin privileges" ON profiles FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Policy: Users can submit their own reports on reports
DROP POLICY IF EXISTS "Users can submit their own reports" ON reports;
CREATE POLICY "Users can submit their own reports" ON reports FOR INSERT TO authenticated USING (true) WITH CHECK ((auth.uid() = reporter_id));

-- Policy: Couple members can insert scores on scores
DROP POLICY IF EXISTS "Couple members can insert scores" ON scores;
CREATE POLICY "Couple members can insert scores" ON scores FOR INSERT TO authenticated USING (true) WITH CHECK ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

-- Policy: Admins can read all scores on scores
DROP POLICY IF EXISTS "Admins can read all scores" ON scores;
CREATE POLICY "Admins can read all scores" ON scores FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));

-- Policy: Couple members can view scores on scores
DROP POLICY IF EXISTS "Couple members can view scores" ON scores;
CREATE POLICY "Couple members can view scores" ON scores FOR SELECT TO authenticated USING ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

-- Policy: Couple members can update scores on scores
DROP POLICY IF EXISTS "Couple members can update scores" ON scores;
CREATE POLICY "Couple members can update scores" ON scores FOR UPDATE TO authenticated USING ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))) WITH CHECK ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

-- Policy: admin_read_subscription_events on subscription_events
DROP POLICY IF EXISTS "admin_read_subscription_events" ON subscription_events;
CREATE POLICY "admin_read_subscription_events" ON subscription_events FOR SELECT TO authenticated USING (is_current_user_admin());

-- Policy: select_own_subscription_events on subscription_events
DROP POLICY IF EXISTS "select_own_subscription_events" ON subscription_events;
CREATE POLICY "select_own_subscription_events" ON subscription_events FOR SELECT TO authenticated USING ((auth.uid() = user_id));

-- Policy: Service role can insert subscriptions on subscriptions
DROP POLICY IF EXISTS "Service role can insert subscriptions" ON subscriptions;
CREATE POLICY "Service role can insert subscriptions" ON subscriptions FOR INSERT TO service_role USING (true) WITH CHECK (true);

-- Policy: Admins can read all subscriptions on subscriptions
DROP POLICY IF EXISTS "Admins can read all subscriptions" ON subscriptions;
CREATE POLICY "Admins can read all subscriptions" ON subscriptions FOR SELECT TO authenticated USING ((is_current_user_admin() OR is_super_admin()));

-- Policy: Users can read own subscription on subscriptions
DROP POLICY IF EXISTS "Users can read own subscription" ON subscriptions;
CREATE POLICY "Users can read own subscription" ON subscriptions FOR SELECT TO authenticated USING ((auth.uid() = user_id));

-- Policy: Service role can update subscriptions on subscriptions
DROP POLICY IF EXISTS "Service role can update subscriptions" ON subscriptions;
CREATE POLICY "Service role can update subscriptions" ON subscriptions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- Policy: Couple members can delete their couple tell me prompts on tell_me_prompts
DROP POLICY IF EXISTS "Couple members can delete their couple tell me prompts" ON tell_me_prompts;
CREATE POLICY "Couple members can delete their couple tell me prompts" ON tell_me_prompts FOR DELETE TO authenticated USING (((is_default = false) AND (couple_id IS NOT NULL) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE (((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())) AND (couples.active = true))))));

-- Policy: Admins can delete default tell me prompts on tell_me_prompts
DROP POLICY IF EXISTS "Admins can delete default tell me prompts" ON tell_me_prompts;
CREATE POLICY "Admins can delete default tell me prompts" ON tell_me_prompts FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));

-- Policy: Couple members can insert own tell me prompts on tell_me_prompts
DROP POLICY IF EXISTS "Couple members can insert own tell me prompts" ON tell_me_prompts;
CREATE POLICY "Couple members can insert own tell me prompts" ON tell_me_prompts FOR INSERT TO authenticated USING (true) WITH CHECK (((couple_id IS NOT NULL) AND (created_by_user_id = auth.uid()) AND (is_default = false) AND (EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = tell_me_prompts.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))));

-- Policy: Admins can insert default tell me prompts on tell_me_prompts
DROP POLICY IF EXISTS "Admins can insert default tell me prompts" ON tell_me_prompts;
CREATE POLICY "Admins can insert default tell me prompts" ON tell_me_prompts FOR INSERT TO authenticated USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));

-- Policy: Couple members can view tell me prompts on tell_me_prompts
DROP POLICY IF EXISTS "Couple members can view tell me prompts" ON tell_me_prompts;
CREATE POLICY "Couple members can view tell me prompts" ON tell_me_prompts FOR SELECT TO authenticated USING (((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))) OR (is_default = true)));

-- Policy: Couple members can update their couple tell me prompts on tell_me_prompts
DROP POLICY IF EXISTS "Couple members can update their couple tell me prompts" ON tell_me_prompts;
CREATE POLICY "Couple members can update their couple tell me prompts" ON tell_me_prompts FOR UPDATE TO authenticated USING (((is_default = false) AND (couple_id IS NOT NULL) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE (((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())) AND (couples.active = true)))))) WITH CHECK (((is_default = false) AND (couple_id IS NOT NULL) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE (((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())) AND (couples.active = true))))));

-- Policy: Admins can update default tell me prompts on tell_me_prompts
DROP POLICY IF EXISTS "Admins can update default tell me prompts" ON tell_me_prompts;
CREATE POLICY "Admins can update default tell me prompts" ON tell_me_prompts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));

-- Policy: insert_own_diagnostics on user_diagnostics
DROP POLICY IF EXISTS "insert_own_diagnostics" ON user_diagnostics;
CREATE POLICY "insert_own_diagnostics" ON user_diagnostics FOR INSERT TO authenticated USING (true) WITH CHECK ((auth.uid() = user_id));

-- Policy: admin_select_diagnostics on user_diagnostics
DROP POLICY IF EXISTS "admin_select_diagnostics" ON user_diagnostics;
CREATE POLICY "admin_select_diagnostics" ON user_diagnostics FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.is_super_admin = true))))));

-- Policy: update_own_diagnostics on user_diagnostics
DROP POLICY IF EXISTS "update_own_diagnostics" ON user_diagnostics;
CREATE POLICY "update_own_diagnostics" ON user_diagnostics FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

-- Policy: Users can insert own settings on user_settings
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT TO authenticated USING (true) WITH CHECK ((auth.uid() = user_id));

-- Policy: Users can read own settings on user_settings
DROP POLICY IF EXISTS "Users can read own settings" ON user_settings;
CREATE POLICY "Users can read own settings" ON user_settings FOR SELECT TO authenticated USING ((auth.uid() = user_id));

-- Policy: Users can update own settings on user_settings
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

-- Policy: Couple members can delete vault items on vault_items
DROP POLICY IF EXISTS "Couple members can delete vault items" ON vault_items;
CREATE POLICY "Couple members can delete vault items" ON vault_items FOR DELETE TO authenticated USING ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

-- Policy: Couple members can insert vault items on vault_items
DROP POLICY IF EXISTS "Couple members can insert vault items" ON vault_items;
CREATE POLICY "Couple members can insert vault items" ON vault_items FOR INSERT TO authenticated USING (true) WITH CHECK (((auth.uid() = uploaded_by_user_id) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can view vault items on vault_items
DROP POLICY IF EXISTS "Couple members can view vault items" ON vault_items;
CREATE POLICY "Couple members can view vault items" ON vault_items FOR SELECT TO authenticated USING ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

-- Policy: Uploader can update own vault items on vault_items
DROP POLICY IF EXISTS "Uploader can update own vault items" ON vault_items;
CREATE POLICY "Uploader can update own vault items" ON vault_items FOR UPDATE TO authenticated USING ((auth.uid() = uploaded_by_user_id)) WITH CHECK ((auth.uid() = uploaded_by_user_id));

-- Policy: Partner can mark vault item as viewed on vault_items
DROP POLICY IF EXISTS "Partner can mark vault item as viewed" ON vault_items;
CREATE POLICY "Partner can mark vault item as viewed" ON vault_items FOR UPDATE TO authenticated USING (((uploaded_by_user_id <> auth.uid()) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))) WITH CHECK (((uploaded_by_user_id <> auth.uid()) AND (couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can delete own wish reactions on wish_reactions
DROP POLICY IF EXISTS "Couple members can delete own wish reactions" ON wish_reactions;
CREATE POLICY "Couple members can delete own wish reactions" ON wish_reactions FOR DELETE TO authenticated USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (wishes w
     JOIN couples c ON ((c.id = w.couple_id)))
  WHERE ((w.id = wish_reactions.wish_id) AND ((c.user_a_id = auth.uid()) OR (c.user_b_id = auth.uid())))))));

-- Policy: Users can add wish reactions on wish_reactions
DROP POLICY IF EXISTS "Users can add wish reactions" ON wish_reactions;
CREATE POLICY "Users can add wish reactions" ON wish_reactions FOR INSERT TO authenticated USING (true) WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (wishes w
     JOIN couples c ON ((c.id = w.couple_id)))
  WHERE ((w.id = wish_reactions.wish_id) AND ((c.user_a_id = auth.uid()) OR (c.user_b_id = auth.uid())))))));

-- Policy: Couple members can view wish reactions on wish_reactions
DROP POLICY IF EXISTS "Couple members can view wish reactions" ON wish_reactions;
CREATE POLICY "Couple members can view wish reactions" ON wish_reactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (wishes w
     JOIN couples c ON ((c.id = w.couple_id)))
  WHERE ((w.id = wish_reactions.wish_id) AND ((c.user_a_id = auth.uid()) OR (c.user_b_id = auth.uid()))))));

-- Policy: Couple members can update own wish reactions on wish_reactions
DROP POLICY IF EXISTS "Couple members can update own wish reactions" ON wish_reactions;
CREATE POLICY "Couple members can update own wish reactions" ON wish_reactions FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (wishes w
     JOIN couples c ON ((c.id = w.couple_id)))
  WHERE ((w.id = wish_reactions.wish_id) AND ((c.user_a_id = auth.uid()) OR (c.user_b_id = auth.uid()))))))) WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (wishes w
     JOIN couples c ON ((c.id = w.couple_id)))
  WHERE ((w.id = wish_reactions.wish_id) AND ((c.user_a_id = auth.uid()) OR (c.user_b_id = auth.uid())))))));

-- Policy: Couple members can delete wishes on wishes
DROP POLICY IF EXISTS "Couple members can delete wishes" ON wishes;
CREATE POLICY "Couple members can delete wishes" ON wishes FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = wishes.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can create wishes on wishes
DROP POLICY IF EXISTS "Couple members can create wishes" ON wishes;
CREATE POLICY "Couple members can create wishes" ON wishes FOR INSERT TO authenticated USING (true) WITH CHECK (((created_by_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = wishes.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))));

-- Policy: Admins can read all wishes on wishes
DROP POLICY IF EXISTS "Admins can read all wishes" ON wishes;
CREATE POLICY "Admins can read all wishes" ON wishes FOR SELECT TO authenticated USING ((is_current_user_admin() OR is_super_admin()));

-- Policy: Couple members can view their wishes on wishes
DROP POLICY IF EXISTS "Couple members can view their wishes" ON wishes;
CREATE POLICY "Couple members can view their wishes" ON wishes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = wishes.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Policy: Couple members can update wishes on wishes
DROP POLICY IF EXISTS "Couple members can update wishes" ON wishes;
CREATE POLICY "Couple members can update wishes" ON wishes FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = wishes.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM couples
  WHERE ((couples.id = wishes.couple_id) AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid()))))));

-- Index: activity_events_unread_idx on activity_events
CREATE INDEX IF NOT EXISTS activity_events_unread_idx ON public.activity_events USING btree (couple_id, target_user_id, read);

-- Index: activity_views_couple_user_idx on activity_views
CREATE INDEX IF NOT EXISTS activity_views_couple_user_idx ON public.activity_views USING btree (couple_id, user_id);

-- Index: activity_views_source_idx on activity_views
CREATE INDEX IF NOT EXISTS activity_views_source_idx ON public.activity_views USING btree (source_table, source_id);

-- Index: activity_views_user_id_source_table_source_id_key on activity_views
CREATE INDEX IF NOT EXISTS activity_views_user_id_source_table_source_id_key ON public.activity_views USING btree (user_id, source_table, source_id);

-- Index: admin_grants_granted_by_idx on admin_grants
CREATE INDEX IF NOT EXISTS admin_grants_granted_by_idx ON public.admin_grants USING btree (granted_by);

-- Index: admin_grants_one_active_per_user on admin_grants
CREATE INDEX IF NOT EXISTS admin_grants_one_active_per_user ON public.admin_grants USING btree (user_id) WHERE (active = true);

-- Index: admin_grants_user_id_idx on admin_grants
CREATE INDEX IF NOT EXISTS admin_grants_user_id_idx ON public.admin_grants USING btree (user_id);

-- Index: ai_issues_status_created_at_idx on ai_issues
CREATE INDEX IF NOT EXISTS ai_issues_status_created_at_idx ON public.ai_issues USING btree (status, created_at DESC);

-- Index: ai_loop_runs_loop_type_started_at_idx on ai_loop_runs
CREATE INDEX IF NOT EXISTS ai_loop_runs_loop_type_started_at_idx ON public.ai_loop_runs USING btree (loop_type, started_at DESC);

-- Index: idx_cancellation_surveys_couple_id on cancellation_surveys
CREATE INDEX IF NOT EXISTS idx_cancellation_surveys_couple_id ON public.cancellation_surveys USING btree (couple_id);

-- Index: idx_cancellation_surveys_submitted_at on cancellation_surveys
CREATE INDEX IF NOT EXISTS idx_cancellation_surveys_submitted_at ON public.cancellation_surveys USING btree (submitted_at);

-- Index: idx_cancellation_surveys_user_id on cancellation_surveys
CREATE INDEX IF NOT EXISTS idx_cancellation_surveys_user_id ON public.cancellation_surveys USING btree (user_id);

-- Index: idx_cash_in_events_couple on cash_in_events
CREATE INDEX IF NOT EXISTS idx_cash_in_events_couple ON public.cash_in_events USING btree (couple_id);

-- Index: idx_chat_messages_active_couple on chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_active_couple ON public.chat_messages USING btree (couple_id, created_at DESC) WHERE (deleted_at IS NULL);

-- Index: idx_chat_messages_couple on chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_couple ON public.chat_messages USING btree (couple_id);

-- Index: idx_chat_messages_couple_created on chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_couple_created ON public.chat_messages USING btree (couple_id, created_at DESC);

-- Index: idx_chat_messages_pending_burn on chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_pending_burn ON public.chat_messages USING btree (burns_at) WHERE ((burns_at IS NOT NULL) AND (deleted_at IS NULL));

-- Index: idx_chat_messages_reply_to on chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to ON public.chat_messages USING btree (reply_to) WHERE (reply_to IS NOT NULL);

-- Index: idx_couple_health_scores_status on couple_health_scores
CREATE INDEX IF NOT EXISTS idx_couple_health_scores_status ON public.couple_health_scores USING btree (status);

-- Index: couple_hidden_prompts_couple_id_prompt_table_prompt_id_key on couple_hidden_prompts
CREATE INDEX IF NOT EXISTS couple_hidden_prompts_couple_id_prompt_table_prompt_id_key ON public.couple_hidden_prompts USING btree (couple_id, prompt_table, prompt_id);

-- Index: couple_hidden_prompts_couple_idx on couple_hidden_prompts
CREATE INDEX IF NOT EXISTS couple_hidden_prompts_couple_idx ON public.couple_hidden_prompts USING btree (couple_id, prompt_table);

-- Index: couples_invite_code_key on couples
CREATE INDEX IF NOT EXISTS couples_invite_code_key ON public.couples USING btree (invite_code);

-- Index: couples_user_b_active_unique on couples
CREATE INDEX IF NOT EXISTS couples_user_b_active_unique ON public.couples USING btree (user_b_id) WHERE ((active = true) AND (user_b_id IS NOT NULL));

-- Index: idx_couples_invite_code on couples
CREATE INDEX IF NOT EXISTS idx_couples_invite_code ON public.couples USING btree (invite_code);

-- Index: idx_couples_user_a on couples
CREATE INDEX IF NOT EXISTS idx_couples_user_a ON public.couples USING btree (user_a_id);

-- Index: idx_couples_user_b on couples
CREATE INDEX IF NOT EXISTS idx_couples_user_b ON public.couples USING btree (user_b_id);

-- Index: idx_decline_prompts_couple_id on decline_prompts
CREATE INDEX IF NOT EXISTS idx_decline_prompts_couple_id ON public.decline_prompts USING btree (couple_id);

-- Index: idx_decline_prompts_is_default on decline_prompts
CREATE INDEX IF NOT EXISTS idx_decline_prompts_is_default ON public.decline_prompts USING btree (is_default) WHERE (is_default = true);

-- Index: dice_face_labels_label_unique on dice_face_labels
CREATE INDEX IF NOT EXISTS dice_face_labels_label_unique ON public.dice_face_labels USING btree (label);

-- Index: idx_interactions_active on interactions
CREATE INDEX IF NOT EXISTS idx_interactions_active ON public.interactions USING btree (couple_id, is_active);

-- Index: idx_interactions_couple on interactions
CREATE INDEX IF NOT EXISTS idx_interactions_couple ON public.interactions USING btree (couple_id);

-- Index: idx_interactions_live_couple on interactions
CREATE INDEX IF NOT EXISTS idx_interactions_live_couple ON public.interactions USING btree (couple_id, type, status) WHERE (deleted_at IS NULL);

-- Index: media_reactions_couple_time_idx on media_reactions
CREATE INDEX IF NOT EXISTS media_reactions_couple_time_idx ON public.media_reactions USING btree (couple_id, created_at DESC);

-- Index: media_reactions_lookup_idx on media_reactions
CREATE INDEX IF NOT EXISTS media_reactions_lookup_idx ON public.media_reactions USING btree (couple_id, source_table, source_id);

-- Index: media_reactions_user_id_source_table_source_id_key on media_reactions
CREATE INDEX IF NOT EXISTS media_reactions_user_id_source_table_source_id_key ON public.media_reactions USING btree (user_id, source_table, source_id);

-- Index: idx_monthly_scores_couple_user on monthly_scores
CREATE INDEX IF NOT EXISTS idx_monthly_scores_couple_user ON public.monthly_scores USING btree (couple_id, user_id);

-- Index: monthly_scores_couple_id_user_id_year_month_key on monthly_scores
CREATE INDEX IF NOT EXISTS monthly_scores_couple_id_user_id_year_month_key ON public.monthly_scores USING btree (couple_id, user_id, year, month);

-- Index: point_config_event_key_key on point_config
CREATE INDEX IF NOT EXISTS point_config_event_key_key ON public.point_config USING btree (event_key);

-- Index: idx_point_events_couple on point_events
CREATE INDEX IF NOT EXISTS idx_point_events_couple ON public.point_events USING btree (couple_id);

-- Index: idx_scores_couple on scores
CREATE INDEX IF NOT EXISTS idx_scores_couple ON public.scores USING btree (couple_id);

-- Index: scores_couple_id_user_id_key on scores
CREATE INDEX IF NOT EXISTS scores_couple_id_user_id_key ON public.scores USING btree (couple_id, user_id);

-- Index: idx_subscription_events_couple_id on subscription_events
CREATE INDEX IF NOT EXISTS idx_subscription_events_couple_id ON public.subscription_events USING btree (couple_id);

-- Index: idx_subscription_events_event_type on subscription_events
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type ON public.subscription_events USING btree (event_type);

-- Index: idx_subscription_events_occurred_at on subscription_events
CREATE INDEX IF NOT EXISTS idx_subscription_events_occurred_at ON public.subscription_events USING btree (occurred_at);

-- Index: idx_subscription_events_user_id on subscription_events
CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON public.subscription_events USING btree (user_id);

-- Index: subscriptions_user_id_key on subscriptions
CREATE INDEX IF NOT EXISTS subscriptions_user_id_key ON public.subscriptions USING btree (user_id);

-- Index: idx_vault_items_active_couple on vault_items
CREATE INDEX IF NOT EXISTS idx_vault_items_active_couple ON public.vault_items USING btree (couple_id, created_at DESC) WHERE (deleted_at IS NULL);

-- Index: idx_vault_items_couple on vault_items
CREATE INDEX IF NOT EXISTS idx_vault_items_couple ON public.vault_items USING btree (couple_id);

-- Index: wish_reactions_wish_id_idx on wish_reactions
CREATE INDEX IF NOT EXISTS wish_reactions_wish_id_idx ON public.wish_reactions USING btree (wish_id);

-- Index: wish_reactions_wish_id_user_id_key on wish_reactions
CREATE INDEX IF NOT EXISTS wish_reactions_wish_id_user_id_key ON public.wish_reactions USING btree (wish_id, user_id);

-- Storage bucket: avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

-- Storage bucket: chat_media
INSERT INTO storage.buckets (id, name, public) VALUES ('chat_media', 'chat_media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage bucket: vault
INSERT INTO storage.buckets (id, name, public) VALUES ('vault', 'vault', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: avatars (owner-scoped)
DROP POLICY IF EXISTS "Users can read their own avatars" ON storage.objects;
CREATE POLICY "Users can read their own avatars" ON storage.objects FOR SELECT
  TO authenticated USING ((bucket_id = 'avatars') AND ((storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK ((bucket_id = 'avatars') AND ((storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE
  TO authenticated USING ((bucket_id = 'avatars') AND ((storage.foldername(name))[1] = (auth.uid())::text))
  WITH CHECK ((bucket_id = 'avatars') AND ((storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE
  TO authenticated USING ((bucket_id = 'avatars') AND ((storage.foldername(name))[1] = (auth.uid())::text));

-- Storage RLS: chat_media (couple-scoped)
DROP POLICY IF EXISTS "Chat media: couple members can read media" ON storage.objects;
CREATE POLICY "Chat media: couple members can read media" ON storage.objects FOR SELECT
  TO authenticated USING ((bucket_id = 'chat_media') AND (EXISTS (SELECT 1 FROM couples
    WHERE ((couples.id)::text = (storage.foldername(objects.name))[1])
    AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

DROP POLICY IF EXISTS "Chat media: couple members can upload to own path" ON storage.objects;
CREATE POLICY "Chat media: couple members can upload to own path" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK ((bucket_id = 'chat_media') AND (EXISTS (SELECT 1 FROM couples
    WHERE ((couples.id)::text = (storage.foldername(objects.name))[1])
    AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))
    AND ((storage.foldername(name))[2] = (auth.uid())::text));

DROP POLICY IF EXISTS "Chat media: uploaders can update own media" ON storage.objects;
CREATE POLICY "Chat media: uploaders can update own media" ON storage.objects FOR UPDATE
  TO authenticated USING ((bucket_id = 'chat_media') AND (EXISTS (SELECT 1 FROM couples
    WHERE ((couples.id)::text = (storage.foldername(objects.name))[1])
    AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))
    AND ((storage.foldername(name))[2] = (auth.uid())::text))
  WITH CHECK ((bucket_id = 'chat_media') AND (EXISTS (SELECT 1 FROM couples
    WHERE ((couples.id)::text = (storage.foldername(objects.name))[1])
    AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))
    AND ((storage.foldername(name))[2] = (auth.uid())::text));

DROP POLICY IF EXISTS "Chat media: uploaders can delete own media" ON storage.objects;
CREATE POLICY "Chat media: uploaders can delete own media" ON storage.objects FOR DELETE
  TO authenticated USING ((bucket_id = 'chat_media') AND (EXISTS (SELECT 1 FROM couples
    WHERE ((couples.id)::text = (storage.foldername(objects.name))[1])
    AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))
    AND ((storage.foldername(name))[2] = (auth.uid())::text));

-- Storage RLS: vault (couple-scoped)
DROP POLICY IF EXISTS "Vault: couple members can read media" ON storage.objects;
CREATE POLICY "Vault: couple members can read media" ON storage.objects FOR SELECT
  TO authenticated USING ((bucket_id = 'vault') AND (EXISTS (SELECT 1 FROM couples
    WHERE ((couples.id)::text = (storage.foldername(objects.name))[1])
    AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))));

DROP POLICY IF EXISTS "Vault: couple members can upload to own path" ON storage.objects;
CREATE POLICY "Vault: couple members can upload to own path" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK ((bucket_id = 'vault') AND (EXISTS (SELECT 1 FROM couples
    WHERE ((couples.id)::text = (storage.foldername(objects.name))[1])
    AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))
    AND ((storage.foldername(name))[2] = (auth.uid())::text));

DROP POLICY IF EXISTS "Vault: uploaders can update own media" ON storage.objects;
CREATE POLICY "Vault: uploaders can update own media" ON storage.objects FOR UPDATE
  TO authenticated USING ((bucket_id = 'vault') AND (EXISTS (SELECT 1 FROM couples
    WHERE ((couples.id)::text = (storage.foldername(objects.name))[1])
    AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))
    AND ((storage.foldername(name))[2] = (auth.uid())::text))
  WITH CHECK ((bucket_id = 'vault') AND (EXISTS (SELECT 1 FROM couples
    WHERE ((couples.id)::text = (storage.foldername(objects.name))[1])
    AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))
    AND ((storage.foldername(name))[2] = (auth.uid())::text));

DROP POLICY IF EXISTS "Vault: uploaders can delete own media" ON storage.objects;
CREATE POLICY "Vault: uploaders can delete own media" ON storage.objects FOR DELETE
  TO authenticated USING ((bucket_id = 'vault') AND (EXISTS (SELECT 1 FROM couples
    WHERE ((couples.id)::text = (storage.foldername(objects.name))[1])
    AND ((couples.user_a_id = auth.uid()) OR (couples.user_b_id = auth.uid())))
    AND ((storage.foldername(name))[2] = (auth.uid())::text));
