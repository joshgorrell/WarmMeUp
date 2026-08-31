// Shared domain types used across the app.

export interface Profile {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  age_verified_at: string | null;
  tos_accepted_at: string | null;
  is_admin: boolean | null;
  is_super_admin: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Couple {
  id: string;
  user_a_id: string;
  user_b_id: string | null;
  invite_code: string | null;
  active: boolean;
  created_at: string | null;
  pending_partner_id: string | null;
  pending_partner_status: string | null;
  pending_partner_responded_at: string | null;
  subscription_owner_id: string | null;
  trial_expired_notified_at: string | null;
  celebration_seen: boolean | null;
}

export interface UserSettings {
  user_id: string;
  push_notifications_enabled: boolean;
  in_app_notifications_enabled: boolean;
  app_icon_badge_enabled: boolean;
  stealth_mode_enabled: boolean;
  login_method: 'none' | 'password' | 'pin' | 'biometric';
  lock_after_seconds: number | null;
  chat_wallpaper: string | null;
  celebration_seen: boolean | null;
  weather_lat: number | null;
  weather_lon: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export type SubscriptionSource = 'self' | 'partner' | 'none' | 'admin_grant' | 'admin' | 'super_admin';

export interface SubscriptionInfo {
  isPremium: boolean;
  isOnTrial: boolean;
  source: SubscriptionSource;
  plan: string | null;
  expiresAt: string | null;
  trialExpiresAt: string | null;
  trialExpired: boolean;
  grantExpired: boolean;
  grantExpiresAt: string | null;
  canInvite: boolean;
  trialGraceEndsAt: string | null;
  expiredGrantExpiresAt: string | null;
  loading: boolean;
}

export const DEFAULT_SUBSCRIPTION_INFO: SubscriptionInfo = {
  isPremium: false,
  isOnTrial: false,
  source: 'none',
  plan: null,
  expiresAt: null,
  trialExpiresAt: null,
  trialExpired: false,
  grantExpired: false,
  grantExpiresAt: null,
  canInvite: false,
  trialGraceEndsAt: null,
  expiredGrantExpiresAt: null,
  loading: true,
};

export interface ChatMessage {
  id: string;
  couple_id: string;
  sender_id: string;
  content_text: string | null;
  media_storage_path: string | null;
  media_storage_bucket: string | null;
  media_type: 'photo' | 'video' | null;
  media_thumbnail_path: string | null;
  thumbnail_path: string | null;
  first_viewed_at: string | null;
  reply_to_id: string | null;
  burns_at: string | null;
  burn_after_seconds: number | null;
  edited_at: string | null;
  created_at: string;
  __prevCreatedAt?: string | null;
}

export interface MediaReaction {
  id: string;
  couple_id: string;
  message_id?: string | null;
  user_id: string;
  source_table: string;
  source_id: string;
  emoji: string;
  created_at: string;
}

export interface Interaction {
  id: string;
  couple_id: string;
  sender_id: string;
  type: 'dice' | 'dare' | 'tell_me' | string;
  content_text: string | null;
  status: string;
  decline_reason: string | null;
  created_at: string;
}
