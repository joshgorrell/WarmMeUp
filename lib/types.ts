export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  push_token: string | null;
  is_admin: boolean;
  is_super_admin: boolean;
  created_at: string;
}

export interface Couple {
  id: string;
  user_a_id: string;
  user_b_id: string | null;
  invite_code: string;
  active: boolean;
  admin_notes: string;
  points_enabled: boolean;
  streaks_enabled: boolean;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  stealth_mode_enabled: boolean;
  stealth_bypass_until: string | null;
  face_id_required: boolean;
  vault_face_id_required: boolean;
  login_method: 'password' | 'pin' | 'biometric';
  blur_on_background: boolean;
  discreet_notifications: boolean;
  notification_copy: string;
  vault_allow_screenshot_default: boolean;
  vault_allow_save_default: boolean;
  vault_allow_share_default: boolean;
  screenshot_notify_partner: boolean;
  notify_me_on_own_screenshots: boolean;
  theme: 'dark' | 'light' | 'system';
  lock_after_seconds: number | null;
  push_notifications_enabled: boolean;
  challenge_expiry_hours: number;
  updated_at: string;
}

export interface Interaction {
  id: string;
  couple_id: string;
  type: 'dice' | 'dare' | 'tell_me' | 'media';
  sender_id: string;
  receiver_id: string;
  content_text: string | null;
  answer_text: string | null;
  answered_at: string | null;
  prompt_id: string | null;
  mode: 'tell_me' | 'text_me' | null;
  status: 'sent' | 'seen' | 'accepted' | 'rejected' | 'completed' | 'answered' | 'pending_verification';
  rolled_for: 'self' | 'partner' | null;
  is_active: boolean;
  points_awarded: number;
  created_at: string;
  expires_at: string | null;
  completed_at: string | null;
  completed_verified_by: string | null;
  completion_requested_at: string | null;
  // media fields
  media_url: string | null;
  media_storage_path: string | null;
  media_storage_bucket: string | null;
  media_type: 'photo' | 'video' | null;
  allow_screenshot: boolean;
  allow_save: boolean;
  allow_share: boolean;
  screenshot_detected: boolean;
  viewed_by_partner: boolean;
}

export interface ChatMessage {
  id: string;
  couple_id: string;
  sender_id: string;
  content_text: string | null;
  media_storage_path: string | null;
  media_storage_bucket: string | null;
  media_type: 'photo' | 'video' | null;
  allow_screenshot: boolean;
  allow_save: boolean;
  allow_share: boolean;
  created_at: string;
  edited_at: string | null;
}

export interface VaultItem {
  id: string;
  couple_id: string;
  uploaded_by_user_id: string;
  media_type: 'photo' | 'video';
  file_path: string;
  storage_path: string | null;
  storage_bucket: string | null;
  blurred_thumbnail_path: string | null;
  allow_screenshot: boolean;
  allow_save: boolean;
  allow_share: boolean;
  screenshot_detected: boolean;
  viewed_by_partner: boolean;
  created_at: string;
  expires_at: string | null;
}

export interface Score {
  id: string;
  couple_id: string;
  user_id: string;
  points: number;
  updated_at: string;
}

export interface PointEvent {
  id: string;
  couple_id: string;
  user_id: string;
  interaction_id: string | null;
  points: number;
  reason: string;
  created_at: string;
}

export interface PointConfig {
  id: string;
  event_key: string;
  label: string;
  points: number;
  updated_at: string;
}

export interface MonthlyScore {
  id: string;
  couple_id: string;
  user_id: string;
  year: number;
  month: number;
  points: number;
  dares_accepted: number;
  dares_completed: number;
  dares_skipped: number;
  dice_accepted: number;
  dice_completed: number;
  dice_skipped: number;
  asks_sent: number;
  asks_replied: number;
  chat_messages_sent: number;
  media_sent: number;
  vault_uploads: number;
  created_at: string;
}

export interface CashInEvent {
  id: string;
  couple_id: string;
  winner_user_id: string;
  loser_user_id: string;
  winner_choice: 'give' | 'receive';
  winner_points: number;
  loser_points: number;
  created_at: string;
}

export interface DicePrompt {
  id: string;
  couple_id: string | null;
  created_by_user_id: string | null;
  text: string;
  category: string;
  face_label: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface DarePrompt {
  id: string;
  couple_id: string | null;
  created_by_user_id: string | null;
  text: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface TellMePrompt {
  id: string;
  couple_id: string | null;
  created_by_user_id: string | null;
  text: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}
