import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Check, KeyRound, Lock, ScanFace, FingerprintPattern as Fingerprint, CircleQuestionMark } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import Toggle from '@/components/Toggle';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import BottomSheet from '@/components/BottomSheet';
import WarmupLogo from '@/components/WarmupLogo';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { registerForPushNotifications, savePushToken, clearPushToken } from '@/lib/notifications';
import CommunityGuidelinesModal from '@/components/CommunityGuidelinesModal';

function OwnershipNote({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.ownerNote, { borderBottomColor: colors.borderSubtle }]}>
      <Text style={[styles.ownerNoteText, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
}

function SettingsRow({
  label,
  sub,
  toggle,
  value,
  onChange,
  onPress,
  onInfo,
  danger,
  disabled,
}: {
  label: string;
  sub?: string;
  toggle?: boolean;
  value?: boolean;
  onChange?: (v: boolean) => void;
  onPress?: () => void;
  onInfo?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.row, { borderBottomColor: colors.borderSubtle }]}>
      <View style={styles.rowLeft}>
        <View style={styles.rowLabelRow}>
          <Text style={[styles.rowLabel, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
          {onInfo && (
            <TouchableOpacity onPress={onInfo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
              <CircleQuestionMark color="rgba(255,46,138,0.7)" size={14} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
        {sub && <Text style={[styles.rowSub, { color: colors.textMuted }]}>{sub}</Text>}
      </View>
      {toggle ? (
        <Toggle value={value ?? false} onChange={onChange ?? (() => {})} disabled={disabled} />
      ) : (
        <ChevronRight color={danger ? colors.danger : colors.textMuted} size={16} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
        {note && <OwnershipNote text={note} />}
        {children}
      </View>
    </View>
  );
}

function SettingsLoginMethodRow({
  current, bioAvailable, biometricLabel, colors, onSelect,
}: {
  current: 'password' | 'pin' | 'biometric';
  bioAvailable: boolean;
  biometricLabel: string;
  colors: any;
  onSelect: (method: 'password' | 'pin' | 'biometric') => void;
}) {
  const BiometricIcon = biometricLabel === 'Touch ID' ? Fingerprint : ScanFace;
  const methods: { key: 'biometric' | 'pin' | 'password'; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { key: 'biometric', label: biometricLabel, icon: <BiometricIcon color={bioAvailable ? '#FF2E8A' : colors.textDisabled} size={15} strokeWidth={1.8} />, disabled: !bioAvailable },
    { key: 'pin', label: 'PIN', icon: <KeyRound color="#FFB347" size={15} strokeWidth={1.8} /> },
    { key: 'password', label: 'Password', icon: <Lock color={colors.textMuted} size={15} strokeWidth={1.8} /> },
  ];

  return (
    <View style={[slm.wrap, { borderBottomColor: colors.borderSubtle }]}>
      <Text style={[slm.label, { color: colors.text }]}>Unlock Method</Text>
      <Text style={[slm.sub, { color: colors.textMuted }]}>How you open Warm Me Up each time</Text>
      <View style={slm.row}>
        {methods.map((m) => {
          const sel = current === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              style={[slm.chip, sel && slm.chipSelected, m.disabled && slm.chipDisabled, { borderColor: sel ? 'rgba(255,46,138,0.5)' : colors.borderSubtle }]}
              onPress={() => !m.disabled && onSelect(m.key)}
              activeOpacity={m.disabled ? 1 : 0.72}
              disabled={m.disabled}
            >
              {m.icon}
              <Text style={[slm.chipLabel, { color: m.disabled ? colors.textDisabled : sel ? '#fff' : colors.textSecondary }]}>{m.label}</Text>
              {sel && <Check color="#FF2E8A" size={12} strokeWidth={2.5} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const slm = StyleSheet.create({
  wrap: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, borderBottomWidth: 1 },
  label: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', marginBottom: 2 },
  sub: { fontSize: 11, fontFamily: 'Inter-Regular', marginBottom: Spacing.sm },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 9,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipSelected: { backgroundColor: 'rgba(255,46,138,0.08)' },
  chipDisabled: { opacity: 0.4 },
  chipLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
});

const LOCK_TIMEOUT_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Always', value: null },
  { label: '5 min', value: 300 },
  { label: '15 min', value: 900 },
  { label: '1 hour', value: 3600 },
];

const EXPIRY_OPTIONS: { label: string; value: number }[] = [
  { label: '1 hour', value: 1 },
  { label: '4 hours', value: 4 },
  { label: '12 hours', value: 12 },
  { label: '24 hours', value: 24 },
];

function ChallengeExpiryRow({
  current, colors, onSelect,
}: {
  current: number;
  colors: any;
  onSelect: (hours: number) => void;
}) {
  return (
    <View style={[slm.wrap, { borderBottomColor: colors.borderSubtle }]}>
      <Text style={[slm.label, { color: colors.text }]}>Dare & Dice Expiry Window</Text>
      <Text style={[slm.sub, { color: colors.textMuted }]}>How long your partner has to respond before a challenge disappears</Text>
      <View style={[slm.row, { justifyContent: 'space-between' }]}>
        {EXPIRY_OPTIONS.map((opt) => {
          const sel = current === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[slm.chip, sel && slm.chipSelected, { borderColor: sel ? 'rgba(255,179,71,0.5)' : colors.borderSubtle, flex: 1, marginHorizontal: 3 }]}
              onPress={() => onSelect(opt.value)}
              activeOpacity={0.72}
            >
              <Text style={[slm.chipLabel, { color: sel ? '#fff' : colors.textSecondary, textAlign: 'center' }]}>{opt.label}</Text>
              {sel && <Check color="#FFB347" size={12} strokeWidth={2.5} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function RequireUnlockAfterRow({
  current, colors, onSelect,
}: {
  current: number | null;
  colors: any;
  onSelect: (seconds: number | null) => void;
}) {
  return (
    <View style={[slm.wrap, { borderBottomColor: colors.borderSubtle }]}>
      <Text style={[slm.label, { color: colors.text }]}>Require Unlock After</Text>
      <Text style={[slm.sub, { color: colors.textMuted }]}>How long before you need to unlock again</Text>
      <View style={[slm.row, { justifyContent: 'space-between' }]}>
        {LOCK_TIMEOUT_OPTIONS.map((opt) => {
          const sel = current === opt.value;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[slm.chip, sel && slm.chipSelected, { borderColor: sel ? 'rgba(255,46,138,0.5)' : colors.borderSubtle, flex: 1, marginHorizontal: 3 }]}
              onPress={() => onSelect(opt.value)}
              activeOpacity={0.72}
            >
              <Text style={[slm.chipLabel, { color: sel ? '#fff' : colors.textSecondary }]}>{opt.label}</Text>
              {sel && <Check color="#FF2E8A" size={12} strokeWidth={2.5} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, settings, couple, refreshSettings, refreshCouple, signOut, unlockApp } = useAuth();
  const { colors } = useTheme();
  const { available: bioAvailable, biometricLabel, authenticate: bioAuthenticate } = useBiometricAuth();
  const [showDiscreetInfo, setShowDiscreetInfo] = useState(false);
  const [showCommunityGuidelines, setShowCommunityGuidelines] = useState(false);

  const s = settings;

  const update = async (patch: Record<string, unknown>) => {
    if (!user) return;
    await supabase.from('user_settings').upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() });
    await refreshSettings();
  };

  const handleTogglePushNotifications = async (enabled: boolean) => {
    if (!user) return;
    if (enabled) {
      const token = await registerForPushNotifications();
      if (token) {
        await savePushToken(user.id, token);
        await update({ push_notifications_enabled: true });
      }
      // If permission was denied, don't toggle on
    } else {
      await clearPushToken(user.id);
      await update({ push_notifications_enabled: false });
    }
  };

  const handleTogglePoints = async (enabled: boolean) => {
    if (!couple?.id) return;
    await supabase.from('couples').update({ points_enabled: enabled }).eq('id', couple.id);
    await refreshCouple();
  };

  const handleToggleStreaks = async (enabled: boolean) => {
    if (!couple?.id) return;
    await supabase.from('couples').update({ streaks_enabled: enabled }).eq('id', couple.id);
    await refreshCouple();
  };

  const handleDisconnect = () => {
    Alert.alert(
      'End Connection',
      'This will disconnect you from your partner. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            if (couple?.id) {
              await supabase.from('couples').update({ user_b_id: null, active: false }).eq('id', couple.id);
            }
            signOut();
          },
        },
      ]
    );
  };

  return (
    <AppShell scrollable={false}>
      <ScreenHeader title="Settings" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <Section
          title="MY DEVICE PRIVACY"
          note="These settings only affect how Warm Me Up behaves on your device. Your partner manages their own independently."
        >
          <SettingsRow
            label="Privacy Mode"
            sub="Show Weather Lock Screen when you open the app"
            toggle
            value={s?.stealth_mode_enabled ?? true}
            onChange={v => update({ stealth_mode_enabled: v })}
          />
          {(s?.login_method ?? 'pin') !== 'password' && (
            <RequireUnlockAfterRow
              current={s?.lock_after_seconds ?? null}
              colors={colors}
              onSelect={(seconds) => update({ lock_after_seconds: seconds })}
            />
          )}
          <SettingsLoginMethodRow
            current={s?.login_method ?? 'pin'}
            bioAvailable={bioAvailable}
            biometricLabel={biometricLabel}
            colors={colors}
            onSelect={async (method) => {
              if (method === 'biometric') {
                const result = await bioAuthenticate('Confirm biometrics to enable this method');
                if (!result.success) return;
              }
              // Switching to password means no PIN/biometric gate — clear any pending lock
              // so the user isn't immediately sent to the unlock screen.
              if (method === 'password') {
                unlockApp();
              }
              update({ login_method: method });
            }}
          />
          <SettingsRow
            label="Face ID for Vault"
            sub="Extra biometric check when you open the Vault"
            toggle
            value={s?.vault_face_id_required ?? true}
            onChange={v => update({ vault_face_id_required: v })}
          />
          <SettingsRow
            label="Blur App in Switcher"
            sub="Hide Warm Me Up content when you switch apps"
            toggle
            value={s?.blur_on_background ?? true}
            onChange={v => update({ blur_on_background: v })}
          />
          <SettingsRow
            label="Community Guidelines"
            sub="How we keep this space safe and respectful"
            onPress={() => setShowCommunityGuidelines(true)}
          />
        </Section>

        <Section
          title="MY VAULT UPLOADS"
          note="These are your defaults for items you add to the Vault. They only apply to content you upload — your partner controls their own uploads separately."
        >
          <SettingsRow
            label="Allow Screenshots of My Uploads"
            sub="Your partner can screenshot items you've shared"
            toggle
            value={s?.vault_allow_screenshot_default ?? false}
            onChange={v => update({ vault_allow_screenshot_default: v })}
          />
          <SettingsRow
            label="Allow Saving My Uploads"
            sub="Your partner can save your shared items to their phone"
            toggle
            value={s?.vault_allow_save_default ?? false}
            onChange={v => update({ vault_allow_save_default: v })}
          />
          <SettingsRow
            label="Allow Sharing My Uploads Outside App"
            sub="Your partner can share your content externally"
            toggle
            value={s?.vault_allow_share_default ?? false}
            onChange={v => update({ vault_allow_share_default: v })}
          />
          <SettingsRow
            label="Notify Me if My Content is Screenshotted"
            sub="You'll get an alert when your partner screenshots something you uploaded"
            toggle
            value={s?.screenshot_notify_partner ?? true}
            onChange={v => update({ screenshot_notify_partner: v })}
          />
          <SettingsRow
            label="Remind Me When I Screenshot Partner Content"
            sub="A personal reminder on your device when you screenshot their uploads"
            toggle
            value={s?.notify_me_on_own_screenshots ?? false}
            onChange={v => update({ notify_me_on_own_screenshots: v })}
          />
        </Section>

        <Section
          title="MY NOTIFICATIONS"
          note="Controls how push notifications appear on your device only."
        >
          <SettingsRow
            label="Push Notifications"
            sub="Receive alerts when your partner sends you something"
            toggle
            value={s?.push_notifications_enabled ?? false}
            onChange={handleTogglePushNotifications}
          />
          <SettingsRow
            label="Discreet Notifications"
            sub="Never show content previews in your notifications"
            toggle
            value={s?.discreet_notifications ?? true}
            onChange={v => update({ discreet_notifications: v })}
            onInfo={() => setShowDiscreetInfo(true)}
          />
          {(['New activity', 'Something new is waiting', 'You have an update'] as const).map(copy => (
            <TouchableOpacity
              key={copy}
              style={[styles.row, { borderBottomColor: colors.borderSubtle }]}
              onPress={() => update({ notification_copy: copy })}
              activeOpacity={0.7}
            >
              <Text style={[styles.rowLabel, { color: colors.text }]}>{copy}</Text>
              <View style={[styles.radioOuter, { borderColor: s?.notification_copy === copy ? '#FF2E8A' : colors.borderSubtle }]}>
                {s?.notification_copy === copy && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          ))}
        </Section>

        <Section
          title="POINTS & SCORE"
          note={
            couple?.active
              ? "This setting affects both you and your partner. Points are always tallied in the background — turning this off just hides the scores."
              : "Connect with a partner to enable the points system."
          }
        >
          <SettingsRow
            label="Points System"
            sub={couple?.active ? "Show scores, leaderboard, and Cash In features" : "Requires an active partner connection"}
            toggle
            value={couple?.active ? (couple?.points_enabled ?? true) : false}
            onChange={handleTogglePoints}
            disabled={!couple?.active}
          />
        </Section>

        <Section
          title="STREAKS"
          note={
            couple?.active
              ? "This setting affects both you and your partner. Your streak is always tracked in the background — turning this off just hides it."
              : "Connect with a partner to enable streaks."
          }
        >
          <SettingsRow
            label="Day Streak"
            sub={couple?.active ? "Show your current consecutive-day activity streak" : "Requires an active partner connection"}
            toggle
            value={couple?.active ? (couple?.streaks_enabled ?? true) : false}
            onChange={handleToggleStreaks}
            disabled={!couple?.active}
          />
        </Section>

        <Section
          title="CHALLENGES"
          note="Controls how Dare and Dice challenges you send behave. Your partner manages their own expiry window independently."
        >
          <ChallengeExpiryRow
            current={s?.challenge_expiry_hours ?? 24}
            colors={colors}
            onSelect={(hours) => update({ challenge_expiry_hours: hours })}
          />
        </Section>

        <Section title="ACCOUNT">
          <SettingsRow label="End Partner Connection" danger onPress={handleDisconnect} />
          <SettingsRow label="Sign Out" danger onPress={signOut} />
        </Section>

        <View style={{ height: 60 }} />
      </ScrollView>

      <CommunityGuidelinesModal
        visible={showCommunityGuidelines}
        onClose={() => setShowCommunityGuidelines(false)}
      />

      <BottomSheet
        visible={showDiscreetInfo}
        onClose={() => setShowDiscreetInfo(false)}
        title="Discreet Notifications"
        subtitle="Here's what a notification looks like with this setting on."
      >
        <View style={styles.previewWrap}>
          {/* Mock notification bubble */}
          <View style={[styles.notifCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <View style={styles.notifAppRow}>
              <View style={styles.notifAppIconWrap}>
                <WarmupLogo size={20} />
              </View>
              <Text style={[styles.notifAppName, { color: colors.textMuted }]}>WARM ME UP</Text>
              <Text style={[styles.notifTime, { color: colors.textMuted }]}>now</Text>
            </View>
            <Text style={[styles.notifTitle, { color: colors.text }]}>
              {s?.notification_copy ?? 'Something new is waiting'}
            </Text>
            <Text style={[styles.notifBody, { color: colors.textSecondary }]}>
              Tap to open
            </Text>
          </View>

          <Text style={[styles.previewNote, { color: colors.textMuted }]}>
            No message content or previews are ever shown — just a discreet nudge.
          </Text>
        </View>
      </BottomSheet>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 40 },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2, marginBottom: Spacing.sm, paddingHorizontal: 4 },
  sectionCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  ownerNote: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  ownerNoteText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    lineHeight: 17,
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 15, borderBottomWidth: 1,
  },
  rowLeft: { flex: 1, gap: 2, marginRight: Spacing.md },
  rowLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
  rowSub: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 16 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#FF2E8A' },
  rowLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // Discreet notification preview sheet
  previewWrap: { paddingBottom: Spacing.sm, gap: Spacing.md },
  notifCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 4,
  },
  notifAppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  notifAppIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifAppName: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.8,
    flex: 1,
  },
  notifTime: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  notifTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 19,
  },
  notifBody: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    lineHeight: 16,
  },
  previewNote: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: Spacing.sm,
  },
});
