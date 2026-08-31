import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { logger } from '@/lib/logger';

export interface EntitlementExpiryAlert {
  visible: boolean;
  expiresAt: string | null;
  dismiss: () => void;
  goToSubscribe: () => void;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Warns users 7 days before their comped admin-grant access expires.
 * Fires when subscriptionInfo.source === 'admin_grant' and grantExpiresAt
 * is within 7 days from now. Shows once per session via a ref guard.
 */
export function useEntitlementExpiryCheck(): EntitlementExpiryAlert {
  const { subscriptionInfo } = useAuth();
  const [visible, setVisible] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const checkRef = useRef(false);

  const dismiss = () => setVisible(false);
  const goToSubscribe = () => setVisible(false);

  useEffect(() => {
    if (checkRef.current) return;
    if (subscriptionInfo.loading) return;
    if (subscriptionInfo.source !== 'admin_grant') return;
    if (!subscriptionInfo.grantExpiresAt) return;

    const expiry = new Date(subscriptionInfo.grantExpiresAt).getTime();
    const now = Date.now();
    const msUntilExpiry = expiry - now;

    if (msUntilExpiry > SEVEN_DAYS_MS || msUntilExpiry < 0) return;

    checkRef.current = true;
    setExpiresAt(subscriptionInfo.grantExpiresAt);
    setVisible(true);
    logger.log('[useEntitlementExpiryCheck] grant expiring soon:', subscriptionInfo.grantExpiresAt);
  }, [subscriptionInfo.loading, subscriptionInfo.source, subscriptionInfo.grantExpiresAt]);

  return { visible, expiresAt, dismiss, goToSubscribe };
}
