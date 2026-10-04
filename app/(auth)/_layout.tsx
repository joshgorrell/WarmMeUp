import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { registrationComplete } from '@/lib/registration';

const ACCOUNT_ROUTES = new Set(['onboarding', 'paired-celebration', 'complete-profile', 'subscription', 'verify-age']);
export default function AuthLayout() {
  const { session, loading, profile } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const route = segments[segments.length - 1];
  const needsAccount = ACCOUNT_ROUTES.has(route);
  const needsRegistration = needsAccount && route !== 'verify-age';
  const blocked = !loading && needsAccount && (!session || (needsRegistration && profile && !registrationComplete(profile)));
  useEffect(() => {
    if (loading || !needsAccount) return;
    if (!session) router.replace('/(auth)/login');
    else if (needsRegistration && profile && !registrationComplete(profile))
      router.replace({ pathname: '/(auth)/register', params: { oauthComplete: '1' } });
  }, [loading, session, profile, needsAccount, needsRegistration, router]);
  if (blocked) return null;
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: '#05040A' } }} />;
}
