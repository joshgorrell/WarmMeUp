import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { logger } from '@/lib/logger';

export interface EntitlementExpiryAlert {
  visible: boolean;
  expiryDate: string | null;
  dismiss: () => void;
  goToSubscribe: () => void;
}

const WARNING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Detects when the user's premium access comes from an admin grant that
 * expires within 7 days, and shows a proactive in-app prompt to subscribe
 * so there is no gap in access.
 *
 * Triggers when ALL are true:
 *   - user is authenticated
 *   - subscriptionInfo.source is 'admin_grant'
 *   - grantExpiresAt is set and within WARNING_WINDOW_MS from now
 *   - the alert hasn't already been shown this session
 */
export function useEntitlementExpiryCheck(): EntitlementExpiryAlert {
  const { subscriptionInfo } = useAuth();
  const [visible, setVisible] = useState(false);
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const checkRef = useRef(false);

  const dismiss = () => setVisible(false);
  const goToSubscribe = () => setVisible(false);

  useEffect(() => {
    if (checkRef.current) return;
    if (subscriptionInfo.loading) return;
    if (!subscriptionInfo.isPremium) return;
    if (subscriptionInfo.source !== 'admin_grant') return;
    if (!subscriptionInfo.grantExpiresAt) return;

    const expiresAt = new Date(subscriptionInfo.grantExpiresAt).getTime();
    const now = Date.now();
    const msUntilExpiry = expiresAt - now;

    if (msUntilExpiry <= 0 || msUntilExpiry > WARNING_WINDOW_MS) return;

    checkRef.current = true;
    setExpiryDate(subscriptionInfo.grantExpiresAt);
    setVisible(true);
    logger.log('[useEntitlementExpiryCheck] grant expiring soon, showing alert', {
      grantExpiresAt: subscriptionInfo.grantExpiresAt,
      msUntilExpiry,
    });
  }, [subscriptionInfo]);

  return { visible, expiryDate, dismiss, goToSubscribe };
}
