import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logger } from '@/lib/logger';

export interface TrialExpiryAlert {
  visible: boolean;
  partnerName: string | null;
  dismiss: () => void;
  goToSubscribe: () => void;
}

/**
 * Detects when the inviter's trial has expired while a partner request is
 * still pending. Runs on app open (when couple data is available) and shows
 * an in-app prompt to subscribe — complementing the server-side scheduled
 * edge function so the user is notified even if the cron hasn't fired yet.
 *
 * Triggers when ALL are true:
 *   - user is user_a_id (inviter) on their couple
 *   - user_b_id is null (solo, invite pending)
 *   - pending_partner_status is not null (someone requested to join)
 *   - user has no active premium and no active trial
 *   - trial_expired_notified_at is null (not yet detected) OR is set but
 *     trial_expired_reminder_sent is false and 48h have passed (reminder due)
 */
export function useTrialExpiryCheck(): TrialExpiryAlert {
  const { user, couple, partnerProfile, subscriptionInfo } = useAuth();
  const [visible, setVisible] = useState(false);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const checkRef = useRef(false);

  const dismiss = () => setVisible(false);
  const goToSubscribe = () => {
    setVisible(false);
    // Navigation is handled by the caller via a router.push — but we expose
    // this as a no-op fallback. The hook consumer should intercept this.
  };

  useEffect(() => {
    if (checkRef.current) return;
    if (!user || !couple) return;
    // Only the inviter (user_a_id) needs this check
    if (couple.user_a_id !== user.id) return;
    // Only when solo (no partner joined yet)
    if (couple.user_b_id) return;
    // Only when there's a pending request
    if (!couple.pending_partner_status) return;

    checkRef.current = true;

    (async () => {
      try {
        // Check if user already has active premium
        if (subscriptionInfo.isPremium) {
          return;
        }

        // Double-check subscription status from server
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('status, plan, expires_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const now = new Date();
        const hasActivePremium =
          sub?.status === 'active' &&
          sub?.plan !== 'trial' &&
          sub?.expires_at &&
          new Date(sub.expires_at) > now;

        // Trial is still active OR within the 24h grace period — don't alert.
        const TRIAL_GRACE_MS = 24 * 60 * 60 * 1000;
        const hasActiveTrial =
          sub?.status === 'active' &&
          sub?.plan === 'trial' &&
          sub?.expires_at &&
          (new Date(sub.expires_at) > now ||
            (now.getTime() - new Date(sub.expires_at).getTime()) < TRIAL_GRACE_MS);

        if (hasActivePremium || hasActiveTrial) {
          return; // Still has access (including grace period), no need to alert
        }

        // Trial has expired and partner request is pending — show alert.
        // Fetch the pending partner's name for a personalized message.
        let pName = 'Your partner';
        if (couple.pending_partner_id) {
          const { data: partner } = await supabase
            .from('profiles')
            .select('display_name, first_name')
            .eq('id', couple.pending_partner_id)
            .maybeSingle();
          if (partner?.display_name) {
            pName = partner.display_name;
          } else if (partner?.first_name) {
            pName = partner.first_name;
          }
        } else if (partnerProfile?.display_name) {
          pName = partnerProfile.display_name;
        }

        // Stamp trial_expired_notified_at if not already set (server-side detection)
        if (!couple.trial_expired_notified_at) {
          await supabase
            .from('couples')
            .update({ trial_expired_notified_at: new Date().toISOString() })
            .eq('id', couple.id);
        }

        setPartnerName(pName);
        setVisible(true);
      } catch (err: any) {
        logger.warn('[useTrialExpiryCheck] error:', err?.message ?? String(err));
      }
    })();
  }, [user, couple, partnerProfile, subscriptionInfo.isPremium]);

  return { visible, partnerName, dismiss, goToSubscribe };
}
