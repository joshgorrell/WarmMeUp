import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform, Share,
} from 'react-native';
import * as Updates from 'expo-updates';
import * as Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { ChevronLeft, Trash2, LogOut, Shield, Share2, RefreshCw } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { useAuth, computeIsUnlockRequired, computeShouldShowPrivacyCover } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { secureKey, hasPinStored } from '@/lib/secureKey';
import { clearWeatherSessionCache } from '@/hooks/useWeather';
import { getDebugEvents, clearDebugEvents, subscribeDebugEvents, DebugEvent } from '@/lib/debugLog';
import { APP_CODE_VERSION, GIT_SHA } from '@/lib/appVersion';
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

function EventRow({ event }: { event: DebugEvent }) {
  const time = event.timestamp.substring(11, 19);
  const isError = event.tag.includes('ERROR');
  const isSuccess = event.tag.includes('SUCCESS');
  const tagColor = isError ? '#FF6B6B' : isSuccess ? '#4CAF50' : '#FFA040';
  const pairs = Object.entries(event.data)
    .map(([k, v]) => `${k}=${v === null ? 'null' : String(v)}`)
    .join('  ');
  return (
    <View style={styles.eventRow}>
      <AppText style={styles.eventTime}>{time}</AppText>
      <View style={styles.eventBody}>
        <AppText style={[styles.eventTag, { color: tagColor }]}>[{event.tag}]</AppText>
        {!!pairs && (
          <AppText style={styles.eventPairs} selectable numberOfLines={4}>{pairs}</AppText>
        )}
      </View>
    </View>
  );
}

export default function DebugScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { session, user, profile, settings, couple, subscriptionInfo, unlockedAtMs, signOut, refreshSettings } = useAuth();
  const [clearing, setClearing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [inactiveCoupleCount, setInactiveCoupleCount] = useState<number | null>(null);
  const [events, setEvents] = useState<DebugEvent[]>(() => getDebugEvents());
  const [rpcTestResult, setRpcTestResult] = useState<string | null>(null);
  const [rpcTesting, setRpcTesting] = useState(false);

  const userId = user?.id ?? session?.user?.id ?? null;

  // Derived diagnostics
  const isUnlockRequired = computeIsUnlockRequired(settings, unlockedAtMs);
  const shouldShowPrivacyCover = computeShouldShowPrivacyCover(session, settings);
  const activeCoupleFound = couple?.active === true;
  const canRefreshInviteCode = (subscriptionInfo as any).canInvite === true && !couple?.user_b_id && couple?.active === true;
  const refreshBlockReason = couple?.user_b_id
    ? 'already_paired'
    : !(subscriptionInfo as any).canInvite
    ? 'no_subscription'
    : !couple?.id
    ? 'no_couple'
    : null;

  useEffect(() => {
    if (userId) {
      hasPinStored(userId).then(setHasPin).catch(() => setHasPin(null));
      // Count inactive couple rows for this user
      supabase
        .from('couples')
        .select('id', { count: 'exact', head: true })
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .eq('active', false)
        .then(({ count, error }) => {
          if (error) setInactiveCoupleCount(null);
          else setInactiveCoupleCount(count ?? 0);
        });
    }
  }, [userId]);

  useEffect(() => {
    return subscribeDebugEvents(() => setEvents(getDebugEvents()));
  }, []);

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

  // Session / token derived values
  const tokenPresent = !!session?.access_token;
  const sessionExpiry = session?.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : null;
  const tokenExpiryCountdown = session?.expires_at
    ? Math.max(0, Math.round(session.expires_at - Date.now() / 1000))
    : null;
  const supabaseHost = process.env.EXPO_PUBLIC_SUPABASE_URL
    ? (() => { try { return new URL(process.env.EXPO_PUBLIC_SUPABASE_URL!).hostname; } catch { return null; } })()
    : null;

  // Vault upload diagnostics from event log
  const lastVaultPick = events.find(e => e.tag === 'VAULT PICK');
  const lastVaultUploadStart = events.find(e => e.tag === 'VAULT UPLOAD START');
  const lastVaultUploadSuccess = events.find(e => e.tag === 'VAULT UPLOAD SUCCESS');
  const lastVaultUploadError = events.find(e => e.tag === 'VAULT UPLOAD ERROR');

  const uploadPathTemplate = couple?.id && userId
    ? `${couple.id}/${userId}/{ts}.ext`
    : couple?.id
    ? `${couple.id}/{user_id}/{ts}.ext`
    : '{couple_id}/{user_id}/{ts}.ext';

  // --- Action: Test generate_invite_code RPC ---
  const handleTestRpc = async () => {
    setRpcTesting(true);
    setRpcTestResult(null);
    try {
      const { data, error } = await supabase.rpc('generate_invite_code');
      if (error) {
        setRpcTestResult(`ERROR code=${error.code} msg=${error.message} details=${error.details ?? 'none'} hint=${error.hint ?? 'none'}`);
      } else {
        setRpcTestResult(`OK data=${JSON.stringify(data)}`);
      }
    } catch (e: any) {
      setRpcTestResult(`EXCEPTION: ${e?.message ?? String(e)}`);
    } finally {
      setRpcTesting(false);
    }
  };

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
      'Sets login_method=password, disables stealth mode, and sets lock_after_seconds=-1 (Never Lock) in Supabase. PIN on this device is not deleted.',
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
                  lock_after_seconds: -1,
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
    const lastErr = lastVaultUploadError?.data ?? null;
    const info: Record<string, unknown> = {
      APP_CODE_VERSION, gitSha: GIT_SHA,
      updateId, runtimeVersion, channel, isEmbeddedLaunch, isEmergencyLaunch, createdAt,
      appVersion, nativeAppVersion: nativeVersion, nativeBuildVersion: buildVersion,
      userId,
      email: user?.email ?? session?.user?.email ?? null,
      is_admin: profile?.is_admin ?? null,
      is_super_admin: profile?.is_super_admin ?? null,
      login_method: settings?.login_method ?? null,
      stealth_mode_enabled: settings?.stealth_mode_enabled ?? null,
      lock_after_seconds: settings?.lock_after_seconds ?? null,
      unlockedAtMs,
      hasStoredPIN: hasPin,
      isUnlockRequired,
      shouldShowPrivacyCover,
      blur_on_background: settings?.blur_on_background ?? null,
      push_notifications_enabled: settings?.push_notifications_enabled ?? null,
      tokenPresent, sessionExpiry, tokenExpiryCountdown,
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
      activeCoupleFound,
      inactiveCoupleCount,
      couple_user_a_id: couple?.user_a_id ?? null,
      couple_user_b_id: couple?.user_b_id ?? null,
      couple_points_enabled: couple?.points_enabled ?? null,
      couple_streaks_enabled: couple?.streaks_enabled ?? null,
      couple_subscription_owner_id: couple?.subscription_owner_id ?? null,
      canRefreshInviteCode,
      refreshBlockReason,
      couple_invite_code: couple?.invite_code ?? null,
      rpc_test_result: rpcTestResult,
      vault_bucket: 'vault',
      vault_uploadPathTemplate: uploadPathTemplate,
      vault_lastPickAt: lastVaultPick?.timestamp ?? null,
      vault_lastPickMime: lastVaultPick?.data?.mimeType ?? null,
      vault_lastUploadStartAt: lastVaultUploadStart?.timestamp ?? null,
      vault_lastUploadStartBlobSize: lastVaultUploadStart?.data?.blobSize ?? null,
      vault_lastUploadSuccessAt: lastVaultUploadSuccess?.timestamp ?? null,
      vault_lastUploadSuccessPath: lastVaultUploadSuccess?.data?.storagePath ?? null,
      vault_lastErrorAt: lastVaultUploadError?.timestamp ?? null,
      vault_lastErrorReason: lastErr?.reason ?? lastErr?.supabaseError ?? lastErr?.error ?? null,
      vault_lastErrorHttpStatus: lastErr?.httpStatus ?? null,
      vault_lastErrorSupabaseMessage: lastErr?.supabaseMessage ?? null,
      vault_lastErrorFullBody: lastErr ? JSON.stringify(lastErr) : null,
      currentRoute: pathname,
      capturedAt: new Date().toISOString(),
      recentEvents: events.slice(0, 20).map(e => ({ tag: e.tag, ts: e.timestamp, ...e.data })),
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
        {/* ── 0. App Code Version ── */}
        <Section title="App Code Version" />
        <Row label="APP_CODE_VERSION" value={APP_CODE_VERSION} />
        <Row label="gitSha" value={GIT_SHA} />
        <Row label="updateId" value={updateId} />
        <Row label="createdAt" value={createdAt} />
        <Row label="isEmbeddedLaunch" value={isEmbeddedLaunch} />
        <Row label="runtimeVersion" value={runtimeVersion} />
        <Row label="channel" value={channel} />

        {/* ── 1. Launch / Auth State ── */}
        <Section title="Launch / Auth State" />
        <Row label="userId" value={userId} />
        <Row label="email" value={user?.email ?? session?.user?.email ?? null} />
        <Row label="is_admin" value={profile?.is_admin ?? null} />
        <Row label="is_super_admin" value={profile?.is_super_admin ?? null} />
        <Row label="login_method" value={settings?.login_method ?? null} />
        <Row label="stealth_mode_enabled" value={settings?.stealth_mode_enabled ?? null} />
        <Row label="lock_after_seconds" value={settings?.lock_after_seconds ?? null} />
        <Row label="unlockedAtMs" value={unlockedAtMs} />
        <Row label="hasStoredPIN" value={hasPin} />
        <Row label="isUnlockRequired" value={isUnlockRequired} />
        <Row label="shouldShowPrivacyCover" value={shouldShowPrivacyCover} />
        <Row label="blur_on_background" value={settings?.blur_on_background ?? null} />
        <Row label="push_notifications_enabled" value={settings?.push_notifications_enabled ?? null} />

        {/* ── 2. Subscription / Pairing State ── */}
        <Section title="Subscription / Pairing State" />
        <Row label="sub.loading" value={subscriptionInfo.loading} />
        <Row label="sub.isPremium" value={subscriptionInfo.isPremium} />
        <Row label="sub.isOnTrial" value={subscriptionInfo.isOnTrial} />
        <Row label="sub.source" value={subscriptionInfo.source} />
        <Row label="sub.plan" value={(subscriptionInfo as any).plan ?? null} />
        <Row label="sub.expiresAt" value={(subscriptionInfo as any).expiresAt ?? null} />
        <Row label="sub.trialExpired" value={subscriptionInfo.trialExpired} />
        <Row label="sub.canInvite" value={(subscriptionInfo as any).canInvite ?? null} />
        <Row label="couple.id" value={couple?.id ?? null} />
        <Row label="couple.active" value={couple?.active ?? null} />
        <Row label="activeCoupleFound" value={activeCoupleFound} />
        <Row label="inactiveCoupleCount" value={inactiveCoupleCount} />
        <Row label="couple.user_a_id" value={couple?.user_a_id ?? null} />
        <Row label="couple.user_b_id" value={couple?.user_b_id ?? null} />
        <Row label="couple.points_enabled" value={couple?.points_enabled ?? null} />
        <Row label="couple.streaks_enabled" value={couple?.streaks_enabled ?? null} />
        <Row label="canRefreshInviteCode" value={canRefreshInviteCode} />
        <Row label="refreshBlockReason" value={refreshBlockReason} />
        <Row label="couple.invite_code" value={couple?.invite_code ?? null} />
        <Row label="couple.subscription_owner_id" value={couple?.subscription_owner_id ?? null} />
        <Row label="rpc.test_result" value={rpcTestResult} />

        {/* ── 3. Vault Upload Diagnostics ── */}
        <Section title="Vault Upload Diagnostics" />
        <Row label="bucket" value="vault" />
        <Row label="uploadPathTemplate" value={uploadPathTemplate} />
        <Row label="lastPick.at" value={lastVaultPick?.timestamp ?? null} />
        <Row label="lastPick.mimeType" value={(lastVaultPick?.data?.mimeType as string) ?? null} />
        <Row label="lastPick.source" value={(lastVaultPick?.data?.source as string) ?? null} />
        <Row label="lastUploadStart.at" value={lastVaultUploadStart?.timestamp ?? null} />
        <Row label="lastUploadStart.blobSize" value={(lastVaultUploadStart?.data?.blobSize as number) ?? null} />
        <Row label="lastUploadSuccess.at" value={lastVaultUploadSuccess?.timestamp ?? null} />
        <Row label="lastUploadSuccess.path" value={(lastVaultUploadSuccess?.data?.storagePath as string) ?? null} />
        <Row label="lastError.at" value={lastVaultUploadError?.timestamp ?? null} />
        <Row
          label="lastError.reason"
          value={
            (lastVaultUploadError?.data?.reason as string) ??
            (lastVaultUploadError?.data?.supabaseError as string) ??
            (lastVaultUploadError?.data?.error as string) ??
            null
          }
        />
        <Row label="lastError.httpStatus" value={(lastVaultUploadError?.data?.httpStatus as number) ?? null} />
        <Row label="lastError.supabaseMessage" value={(lastVaultUploadError?.data?.supabaseMessage as string) ?? null} />
        <Row label="lastError.supabaseStatusCode" value={(lastVaultUploadError?.data?.supabaseStatusCode as string) ?? null} />

        {/* ── 4. Storage / Auth Token State ── */}
        <Section title="Storage / Auth Token State" />
        <Row label="tokenPresent" value={tokenPresent} />
        <Row label="sessionExpiry (ISO)" value={sessionExpiry} />
        <Row label="tokenExpiryCountdown (s)" value={tokenExpiryCountdown} />
        <Row label="supabaseHost" value={supabaseHost} />
        <Row label="vaultBucket" value="vault" />

        {/* ── 5. EAS / OTA Runtime Info ── */}
        <Section title="EAS / OTA Runtime Info" />
        <Row label="updateId" value={updateId} />
        <Row label="runtimeVersion" value={runtimeVersion} />
        <Row label="channel" value={channel} />
        <Row label="isEmbeddedLaunch" value={isEmbeddedLaunch} />
        <Row label="isEmergencyLaunch" value={isEmergencyLaunch} />
        <Row label="createdAt" value={createdAt} />
        <Row label="appVersion (app.json)" value={appVersion} />
        <Row label="nativeAppVersion" value={nativeVersion} />
        <Row label="nativeBuildVersion" value={buildVersion} />
        <Row label="currentRoute" value={pathname} />

        {/* ── 6. Recent Debug Events ── */}
        <Section title="Recent Debug Events" />
        <View style={styles.eventsHeader}>
          <AppText style={styles.eventsCount}>{events.length} event{events.length !== 1 ? 's' : ''}</AppText>
          <TouchableOpacity
            onPress={() => { clearDebugEvents(); setEvents([]); }}
            style={styles.clearEventsBtn}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <RefreshCw size={12} color="#555" />
            <AppText style={styles.clearEventsBtnText}>Clear</AppText>
          </TouchableOpacity>
        </View>
        {events.length === 0 ? (
          <View style={styles.emptyEvents}>
            <AppText style={styles.emptyEventsText}>No events yet — trigger a vault upload to see logs here.</AppText>
          </View>
        ) : (
          events.slice(0, 30).map((ev, i) => <EventRow key={i} event={ev} />)
        )}

        {/* ── Action Buttons ── */}
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
            style={[styles.actionBtn, { backgroundColor: '#1a3a1a' }, rpcTesting && styles.btnDisabled]}
            onPress={handleTestRpc}
            disabled={rpcTesting}
            activeOpacity={0.8}
          >
            <RefreshCw size={15} color="#4CAF50" />
            <AppText style={[styles.actionBtnLabel, { color: '#4CAF50' }]}>
              {rpcTesting ? 'Testing RPC…' : 'Test generate_invite_code RPC'}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.btnNote}>
            Calls the RPC directly and shows raw data/error in rpc.test_result above.
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
            Opens share sheet with all debug values and recent events as JSON.
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
  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  eventsCount: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#555',
  },
  clearEventsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  clearEventsBtnText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#555',
  },
  emptyEvents: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  emptyEventsText: {
    fontSize: 12,
    color: '#444',
    fontStyle: 'italic',
  },
  eventRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#111115',
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  eventTime: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#444',
    width: 60,
    flexShrink: 0,
    paddingTop: 2,
  },
  eventBody: {
    flex: 1,
    gap: 2,
  },
  eventTag: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.3,
  },
  eventPairs: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#666',
    lineHeight: 14,
  },
});
