import React, { useState } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform,
} from 'react-native';
import * as Updates from 'expo-updates';
import * as Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Trash2 } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { secureKey } from '@/lib/secureKey';
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
  const insets = useSafeAreaInsets();
  const { session, user, settings, couple, subscriptionInfo, signOut } = useAuth();
  const [clearing, setClearing] = useState(false);

  const handleClearCache = () => {
    Alert.alert(
      'Clear Local Auth + Security Cache',
      'This will sign you out, delete your PIN, clear the unlock timer, and reset the weather cache. You will need to log in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              const userId = user?.id ?? session?.user?.id;

              if (userId && Platform.OS !== 'web') {
                // Delete PIN
                const pinKey = secureKey('warmup_pin', userId);
                await SecureStore.deleteItemAsync(pinKey).catch(() => {});

                // Delete unlock timestamp
                const unlockKey = secureKey('warmup_unlocked_at', userId);
                await SecureStore.deleteItemAsync(unlockKey).catch(() => {});
              }

              // Clear module-level weather cache
              clearWeatherSessionCache();

              // Sign out of Supabase (clears keychain session token too)
              await supabase.auth.signOut();

              // signOut in AuthContext clears React state and fires the SIGNED_OUT path
              signOut();

              router.replace('/(auth)/welcome');
            } catch (e) {
              console.error('[DebugScreen] clearCache error:', e);
              setClearing(false);
            }
          },
        },
      ],
    );
  };

  // expo-updates values are only available in a real build, not Expo Go / dev client
  let updateId: string | null = null;
  let runtimeVersion: string | null = null;
  let channel: string | null = null;
  try {
    updateId = Updates.updateId ?? null;
    runtimeVersion = Updates.runtimeVersion ?? null;
    channel = (Updates as any).channel ?? null;
  } catch {}

  const appVersion = Constants.default?.expoConfig?.version ?? null;
  const nativeVersion = Constants.default?.nativeAppVersion ?? null;
  const buildVersion = Constants.default?.nativeBuildVersion ?? null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <ChevronLeft size={22} color="#aaa" />
        </TouchableOpacity>
        <AppText style={styles.title}>Debug Diagnostics</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="OTA / Build" />
        <Row label="updateId" value={updateId} />
        <Row label="runtimeVersion" value={runtimeVersion} />
        <Row label="channel" value={channel} />
        <Row label="appVersion (app.json)" value={appVersion} />
        <Row label="nativeAppVersion" value={nativeVersion} />
        <Row label="nativeBuildVersion" value={buildVersion} />

        <Section title="Auth" />
        <Row label="session userId" value={user?.id ?? session?.user?.id ?? null} />

        <Section title="Settings" />
        <Row label="stealth_mode_enabled" value={settings?.stealth_mode_enabled ?? null} />
        <Row label="login_method" value={settings?.login_method ?? null} />
        <Row label="lock_after_seconds" value={settings?.lock_after_seconds ?? null} />
        <Row label="blur_on_background" value={settings?.blur_on_background ?? null} />
        <Row label="push_notifications_enabled" value={settings?.push_notifications_enabled ?? null} />

        <Section title="Subscription" />
        <Row label="subscriptionInfo.loading" value={subscriptionInfo.loading} />
        <Row label="subscriptionInfo.isPremium" value={subscriptionInfo.isPremium} />
        <Row label="subscriptionInfo.isOnTrial" value={subscriptionInfo.isOnTrial} />
        <Row label="subscriptionInfo.source" value={subscriptionInfo.source} />
        <Row label="subscriptionInfo.trialExpired" value={subscriptionInfo.trialExpired} />

        <Section title="Couple" />
        <Row label="couple.id" value={couple?.id ?? null} />
        <Row label="couple.active" value={couple?.active ?? null} />
        <Row label="couple.user_a_id" value={couple?.user_a_id ?? null} />
        <Row label="couple.user_b_id" value={couple?.user_b_id ?? null} />

        <View style={styles.buttonArea}>
          <TouchableOpacity
            style={[styles.clearButton, clearing && styles.clearButtonDisabled]}
            onPress={handleClearCache}
            disabled={clearing}
            activeOpacity={0.8}
          >
            <Trash2 size={16} color="#fff" />
            <AppText style={styles.clearLabel}>
              {clearing ? 'Clearing...' : 'Clear Local Auth + Security Cache'}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.clearNote}>
            Clears: Supabase session, PIN, unlock timer, weather cache. You will be logged out.
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
    gap: Spacing.sm,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B0000',
    borderRadius: Radius.md,
    paddingVertical: 14,
    gap: Spacing.xs,
  },
  clearButtonDisabled: {
    opacity: 0.5,
  },
  clearLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    color: '#fff',
  },
  clearNote: {
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
    lineHeight: 16,
  },
});
