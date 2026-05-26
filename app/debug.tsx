import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform, Share,
} from 'react-native';
import * as Updates from 'expo-updates';
import * as Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { ChevronLeft, Trash2, LogOut, Shield, Share2 } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { secureKey, hasPinStored } from '@/lib/secureKey';
import { clearWeatherSessionCache } from '@/hooks/useWeather';
import { Spacing, Radius, FontSize } from '@/constants/theme';

function Row({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  const display =
    value === null || value === undefined
      ? 'null'
      : value === true
      ? 'true'
      : value === false
      ? 'false'
      : String(value);

  const isNull = value === null || value === undefined;
  const isBad = value === false || value === 'null';

  return (
    <View style={styles.row}>
      <AppText style={styles.label}>{label}</AppText>
      <AppText
        style={[
          styles.value,
          isNull && styles.valueNull,
          isBad && !isNull && styles.valueBad,
        ]}
        numberOfLines={2}
        selectable
      >
        {display}
      </AppText>
    </View>
  );
}

function Section({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
    </View>
  );
}

export default function DebugScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { session, user, profile, settings, couple, subscriptionInfo, signOut, refreshSettings } = useAuth();
  const [clearing, setClearing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [hasPin, setHasPin] = useState<boolean | null>(null);

  const userId = user?.id ?? session?.user?.id ?? null;

  useEffect(() => {
    if (userId) {
      hasPinStored(userId).then(setHasPin).catch(() => setHasPin(null));
    }
  }, [userId]);

  // expo-updates values are only available in a real build, not Expo Go / dev client
  let updateId: string | null = null;
  let runtimeVersion: string | null = null;
  let channel: string | null = null;
  let isEmbeddedLaunch: boolean | null = null;
  let isEmergencyLaunch: boolean | null = null;
  let createdAt: string | null = null;
  try {
    updateId = Updates.updateId ?? null;
    runtimeVersion = Updates.runtimeVersion ?? null;
    channel = (Updates as any).channel ?? null;
    isEmbeddedLaunch = (Updates as any).isEmbeddedLaunch ?? null;
    isEmergencyLaunch = (Updates as any).isEmergencyLaunch ?? null;
    const raw = (Updates as any).createdAt ?? (Updates as any).manifest?.createdAt ?? null;
    createdAt = raw ? new Date(raw).toISOString() : null;
  } catch {}

  const appVersion = Constants.default?.expoConfig?.version ?? null;
  const nativeVersion = Constants.default?.nativeAppVersion ?? null;
  const buildVersion = Constants.default?.nativeBuildVersion ?? null;

  // --- Action: Clear Local Device State ---
  const handleClearLocalState = () => {
    Alert.alert(
      'Clear Local Device State',
      'Deletes PIN, unlock timer, and weather cache from this device. You will stay logged in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              if (userId && Platform.OS !== 'web') {
                const pinKey = secureKey('warmup_pin', userId);
                await SecureStore.deleteItemAsync(pinKey).catch(() => {});
                const unlockKey = secureKey('warmup_unlocked_at', userId);
                await SecureStore.deleteItemAsync(unlockKey).catch(() => {});
              } else if (userId && typeof window !== 'undefined') {
                window.localStorage.removeItem(secureKey('warmup_pin', userId));
              }
              clearWeatherSessionCache();
              if (userId) hasPinStored(userId).then(setHasPin).catch(() => {});
              Alert.alert('Done', 'Local device state cleared.');
            } catch (e) {
              console.error('[DebugScreen] clearLocalState error:', e);
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  };

  // --- Action: Force Logout ---
  const handleForceLogout = () => {
    Alert.alert(
      'Force Logout',
      'Signs out of Supabase immediately and returns to welcome screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await supabase.auth.signOut();
              signOut();
              router.replace('/(auth)/welcome');
            } catch (e) {
              console.error('[DebugScreen] forceLogout error:', e);
              setLoggingOut(false);
            }
          },
        },
      ],
    );
  };

  // --- Action: Reset Security Settings ---
  const handleResetSecurity = () => {
    Alert.alert(
      'Reset Security Settings',
      'Sets login_method=password, disables stealth mode, and clears the lock timer in Supabase. PIN on this device is not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              if (!userId) throw new Error('No user id');
              const { error } = await supabase
                .from('user_settings')
                .update({
                  login_method: 'password',
                  lock_after_seconds: 0,
                  stealth_mode_enabled: false,
                })
                .eq('user_id', userId);
              if (error) throw error;
              await refreshSettings();
              Alert.alert('Done', 'Security settings reset.');
            } catch (e: any) {
              console.error('[DebugScreen] resetSecurity error:', e);
              Alert.alert('Error', e?.message ?? 'Could not reset security settings.');
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
  };

  // --- Action: Copy Debug Info via native Share sheet ---
  const handleShareDebugInfo = async () => {
    const info: Record<string, string | number | boolean | null> = {
      updateId,
      runtimeVersion,
      channel,
      isEmbeddedLaunch,
      isEmergencyLaunch,
      createdAt,
      appVersion,
      nativeAppVersion: nativeVersion,
      nativeBuildVersion: buildVersion,
      userId,
      email: user?.email ?? session?.user?.email ?? null,
      is_admin: profile?.is_admin ?? null,
      login_method: settings?.login_method ?? null,
      stealth_mode_enabled: settings?.stealth_mode_enabled ?? null,
      lock_after_seconds: settings?.lock_after_seconds ?? null,
      hasStoredPIN: hasPin,
      blur_on_background: settings?.blur_on_background ?? null,
      push_notifications_enabled: settings?.push_notifications_enabled ?? null,
      sub_loading: subscriptionInfo.loading,
      sub_isPremium: subscriptionInfo.isPremium,
      sub_isOnTrial: subscriptionInfo.isOnTrial,
      sub_source: subscriptionInfo.source,
      sub_plan: (subscriptionInfo as any).plan ?? null,
      sub_expiresAt: (subscriptionInfo as any).expiresAt ?? null,
      sub_trialExpired: subscriptionInfo.trialExpired,
      sub_canInvite: (subscriptionInfo as any).canInvite ?? null,
      couple_id: couple?.id ?? null,
      couple_active: couple?.active ?? null,
      couple_user_a_id: couple?.user_a_id ?? null,
      couple_user_b_id: couple?.user_b_id ?? null,
      couple_points_enabled: couple?.points_enabled ?? null,
      couple_streaks_enabled: couple?.streaks_enabled ?? null,
      couple_subscription_owner_id: couple?.subscription_owner_id ?? null,
      currentRoute: pathname,
      capturedAt: new Date().toISOString(),
    };

    try {
      await Share.share({ message: JSON.stringify(info, null, 2) });
    } catch (e) {
      console.warn('[DebugScreen] share error:', e);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/transition')}
          style={styles.back}
          hitSlop={12}
        >
          <ChevronLeft size={22} color="#aaa" />
        </TouchableOpacity>
        <AppText style={styles.title}>Debug Diagnostics</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Section title="OTA / Build" />
        <Row label="updateId" value={updateId} />
        <Row label="runtimeVersion" value={runtimeVersion} />
        <Row label="channel" value={channel} />
        <Row label="isEmbeddedLaunch" value={isEmbeddedLaunch} />
        <Row label="isEmergencyLaunch" value={isEmergencyLaunch} />
        <Row label="createdAt" value={createdAt} />
        <Row label="appVersion (app.json)" value={appVersion} />
        <Row label="nativeAppVersion" value={nativeVersion} />
        <Row label="nativeBuildVersion" value={buildVersion} />

        <Section title="Auth" />
        <Row label="userId" value={userId} />
        <Row label="email" value={user?.email ?? session?.user?.email ?? null} />
        <Row label="is_admin" value={profile?.is_admin ?? null} />

        <Section title="Settings" />
        <Row label="login_method" value={settings?.login_method ?? null} />
        <Row label="stealth_mode_enabled" value={settings?.stealth_mode_enabled ?? null} />
        <Row label="lock_after_seconds" value={settings?.lock_after_seconds ?? null} />
        <Row label="hasStoredPIN" value={hasPin} />
        <Row label="blur_on_background" value={settings?.blur_on_background ?? null} />
        <Row label="push_notifications_enabled" value={settings?.push_notifications_enabled ?? null} />

        <Section title="Subscription" />
        <Row label="loading" value={subscriptionInfo.loading} />
        <Row label="isPremium" value={subscriptionInfo.isPremium} />
        <Row label="isOnTrial" value={subscriptionInfo.isOnTrial} />
        <Row label="source" value={subscriptionInfo.source} />
        <Row label="plan" value={(subscriptionInfo as any).plan ?? null} />
        <Row label="expiresAt" value={(subscriptionInfo as any).expiresAt ?? null} />
        <Row label="trialExpired" value={subscriptionInfo.trialExpired} />
        <Row label="canInvite" value={(subscriptionInfo as any).canInvite ?? null} />

        <Section title="Couple" />
        <Row label="id" value={couple?.id ?? null} />
        <Row label="active" value={couple?.active ?? null} />
        <Row label="user_a_id" value={couple?.user_a_id ?? null} />
        <Row label="user_b_id" value={couple?.user_b_id ?? null} />
        <Row label="points_enabled" value={couple?.points_enabled ?? null} />
        <Row label="streaks_enabled" value={couple?.streaks_enabled ?? null} />
        <Row label="subscription_owner_id" value={couple?.subscription_owner_id ?? null} />

        <Section title="Navigation" />
        <Row label="currentRoute" value={pathname} />

        {/* Action buttons */}
        <View style={styles.buttonArea}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger, clearing && styles.btnDisabled]}
            onPress={handleClearLocalState}
            disabled={clearing}
            activeOpacity={0.8}
          >
            <Trash2 size={15} color="#fff" />
            <AppText style={styles.actionBtnLabel}>
              {clearing ? 'Clearing…' : 'Clear Local Device State'}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.btnNote}>
            Deletes PIN, unlock timer, and weather cache. Stays logged in.
          </AppText>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger, loggingOut && styles.btnDisabled]}
            onPress={handleForceLogout}
            disabled={loggingOut}
            activeOpacity={0.8}
          >
            <LogOut size={15} color="#fff" />
            <AppText style={styles.actionBtnLabel}>
              {loggingOut ? 'Logging out…' : 'Force Logout'}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.btnNote}>
            Signs out of Supabase and returns to welcome screen.
          </AppText>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnWarn, resetting && styles.btnDisabled]}
            onPress={handleResetSecurity}
            disabled={resetting}
            activeOpacity={0.8}
          >
            <Shield size={15} color="#fff" />
            <AppText style={styles.actionBtnLabel}>
              {resetting ? 'Resetting…' : 'Reset Security Settings'}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.btnNote}>
            Sets login_method=password, disables stealth mode, clears lock timer in DB.
          </AppText>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnNeutral]}
            onPress={handleShareDebugInfo}
            activeOpacity={0.8}
          >
            <Share2 size={15} color="#fff" />
            <AppText style={styles.actionBtnLabel}>Copy Debug Info</AppText>
          </TouchableOpacity>
          <AppText style={styles.btnNote}>
            Opens share sheet with all debug values as JSON.
          </AppText>
        </View>
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#07070A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1f',
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSize.md,
    fontFamily: 'Inter-SemiBold',
    color: '#fff',
  },
  content: {
    paddingBottom: 60,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1f',
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#111115',
    gap: Spacing.sm,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#888',
    width: 180,
    flexShrink: 0,
  },
  value: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#e0e0e0',
    flex: 1,
  },
  valueNull: {
    color: '#555',
    fontStyle: 'italic',
  },
  valueBad: {
    color: '#FF6B6B',
  },
  buttonArea: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    paddingVertical: 13,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  actionBtnDanger: {
    backgroundColor: '#8B0000',
  },
  actionBtnWarn: {
    backgroundColor: '#7A4500',
  },
  actionBtnNeutral: {
    backgroundColor: '#1E3A5F',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  actionBtnLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    color: '#fff',
  },
  btnNote: {
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: Spacing.sm,
  },
});
