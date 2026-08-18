import React, { useEffect, useRef, useState } from 'react';
import {
  View, TouchableOpacity, ActivityIndicator, Linking, Image, StyleSheet, Alert,
} from 'react-native';
import { Mail, Check, X, ChevronRight, Share2 } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { shareApp } from '@/lib/shareApp';
import { Section, SettingsRow, InlineField } from '@/components/account/SharedSections';
import ConfirmSheet from '@/components/ConfirmSheet';
import {
  RequireUnlockRow, RequireUnlockAfterRow, VaultProtectionRow, ChatFontSizeRow,
  type UnlockMethod,
} from '@/components/account/SecurityRows';
import type { UserSettings } from '@/lib/types';

export function SettingsTab({
  // Auth
  user,
  // Settings + couple
  s,
  couple,
  // Security/biometric
  bioAvailable,
  hasHardware,
  biometricLabel,
  bioAuthenticate,
  update,
  // Points & streaks
  optimisticPointsEnabled,
  optimisticStreaksEnabled,
  onTogglePoints,
  onToggleStreaks,
  // Change email
  showChangeEmail,
  newEmail,
  emailError,
  emailSuccess,
  savingEmail,
  onOpenChangeEmail,
  onCloseChangeEmail,
  onSetNewEmail,
  onSaveEmail,
  // Change password
  showChangePw,
  currentPw,
  newPw,
  confirmPw,
  pwError,
  pwSuccess,
  savingPw,
  onOpenChangePw,
  onCloseChangePw,
  onSetCurrentPw,
  onSetNewPw,
  onSetConfirmPw,
  onSavePassword,
  // Info modals
  onShowVaultSecurityInfo,
  onShowDiscreetInfo,
  onShowCommunityGuidelines,
  onShowTerms,
  onShowPrivacyPolicy,
  // Subscription
  subscriptionInfo,
  onRestorePurchase,
  // Delete account
  onDeleteAccount,
  // Support
  onContactSupport,
  // Feedback
  feedbackEnabled,
  onSendFeedback,
  // Vault section layout ref
  onVaultSectionLayout,
}: {
  user: any;
  s: UserSettings | null;
  couple: any;
  bioAvailable: boolean;
  hasHardware: boolean;
  biometricLabel: string;
  bioAuthenticate: (msg: string) => Promise<{ success: boolean; error?: string }>
  update: (patch: Record<string, unknown>) => Promise<void>;
  optimisticPointsEnabled: boolean | null;
  optimisticStreaksEnabled: boolean | null;
  onTogglePoints: (enabled: boolean) => Promise<void>;
  onToggleStreaks: (enabled: boolean) => Promise<void>;
  showChangeEmail: boolean;
  newEmail: string;
  emailError: string | null;
  emailSuccess: boolean;
  savingEmail: boolean;
  onOpenChangeEmail: () => void;
  onCloseChangeEmail: () => void;
  onSetNewEmail: (v: string) => void;
  onSaveEmail: () => void;
  showChangePw: boolean;
  currentPw: string;
  newPw: string;
  confirmPw: string;
  pwError: string | null;
  pwSuccess: boolean;
  savingPw: boolean;
  onOpenChangePw: () => void;
  onCloseChangePw: () => void;
  onSetCurrentPw: (v: string) => void;
  onSetNewPw: (v: string) => void;
  onSetConfirmPw: (v: string) => void;
  onSavePassword: () => void;
  onShowVaultSecurityInfo: () => void;
  onShowDiscreetInfo: () => void;
  onShowCommunityGuidelines: () => void;
  onShowTerms: () => void;
  onShowPrivacyPolicy: () => void;
  subscriptionInfo: any;
  onRestorePurchase: () => void;
  onDeleteAccount: () => void;
  onContactSupport: () => void;
  feedbackEnabled: boolean;
  onSendFeedback: () => void;
  onVaultSectionLayout: (y: number) => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const didProbingRef = useRef(false);
  const [confirmSheet, setConfirmSheet] = useState<{ title: string; message: string; actions: { label: string; onPress: () => void; destructive?: boolean }[] } | null>(null);

  // Proactively trigger the iOS Face ID permission prompt once when the user
  // visits Settings and the device has biometric hardware but hasn't been
  // confirmed as enrolled yet. This is what makes the app appear in
  // iOS Settings > Face ID so the user can grant permission.
  useEffect(() => {
    if (didProbingRef.current) return;
    if (!hasHardware || bioAvailable) return;
    didProbingRef.current = true;
    bioAuthenticate('Warm Me Up wants to use Face ID').then((result) => {
      // If it succeeded, the permission is now granted and the app will
      // appear in iOS Settings > Face ID. If it failed (user cancelled or
      // face not enrolled), we silently ignore — the tile is still tappable
      // and will re-prompt when the user taps it.
    });
  }, [hasHardware, bioAvailable, bioAuthenticate]);

  return (
    <>
      <Section title="LOGIN & SECURITY">
        <View style={[stylesShared.row, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1 }]}>
          <View style={stylesShared.rowLeft}>
            <AppText style={[stylesShared.rowLabel, { color: colors.text }]}>Email Address</AppText>
            <AppText style={[stylesShared.rowSub, { color: colors.textMuted }]}>{user?.email ?? '—'}</AppText>
          </View>
          <Mail color={colors.textMuted} size={16} strokeWidth={1.5} />
        </View>

        <TouchableOpacity
          style={[stylesShared.row, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1 }]}
          onPress={showChangeEmail ? onCloseChangeEmail : onOpenChangeEmail}
          activeOpacity={0.7}
        >
          <View style={stylesShared.rowLeft}>
            <AppText style={[stylesShared.rowLabel, { color: colors.text }]}>Change Email</AppText>
          </View>
          {showChangeEmail ? <X color={colors.textMuted} size={16} /> : <ChevronRight color={colors.textMuted} size={16} />}
        </TouchableOpacity>

        {showChangeEmail && (
          <View style={[stylesShared.inlineForm, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
            {emailSuccess ? (
              <View style={stylesShared.inlineSuccess}>
                <Check color="#33D17A" size={16} strokeWidth={2.5} />
                <AppText style={[stylesShared.inlineSuccessText, { color: '#33D17A' }]}>Confirmation sent — check your new inbox.</AppText>
              </View>
            ) : (
              <>
                <InlineField label="New Email" value={newEmail} onChange={onSetNewEmail} placeholder="you@example.com" last />
                {emailError && <AppText style={[stylesShared.inlineError, { color: colors.danger }]}>{emailError}</AppText>}
                <AppText style={[stylesShared.inlineNote, { color: colors.textMuted }]}>
                  A confirmation link will be sent to your new address. Your email changes once you click it.
                </AppText>
                <TouchableOpacity
                  style={[stylesShared.inlineSubmitBtn, { backgroundColor: '#FF2E8A', opacity: savingEmail ? 0.6 : 1 }]}
                  onPress={onSaveEmail}
                  disabled={savingEmail}
                  activeOpacity={0.8}
                >
                  {savingEmail
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <AppText style={stylesShared.inlineSubmitText}>Send Confirmation</AppText>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[stylesShared.row, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1 }]}
          onPress={showChangePw ? onCloseChangePw : onOpenChangePw}
          activeOpacity={0.7}
        >
          <View style={stylesShared.rowLeft}>
            <AppText style={[stylesShared.rowLabel, { color: colors.text }]}>Change Password</AppText>
          </View>
          {showChangePw ? <X color={colors.textMuted} size={16} /> : <ChevronRight color={colors.textMuted} size={16} />}
        </TouchableOpacity>

        {showChangePw && (
          <View style={[stylesShared.inlineForm, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
            {pwSuccess ? (
              <View style={stylesShared.inlineSuccess}>
                <Check color="#33D17A" size={16} strokeWidth={2.5} />
                <AppText style={[stylesShared.inlineSuccessText, { color: '#33D17A' }]}>Password updated successfully.</AppText>
              </View>
            ) : (
              <>
                <InlineField label="Current Password" value={currentPw} onChange={onSetCurrentPw} secure placeholder="••••••••" />
                <InlineField label="New Password" value={newPw} onChange={onSetNewPw} secure placeholder="8+ characters" />
                <InlineField label="Confirm New" value={confirmPw} onChange={onSetConfirmPw} secure placeholder="••••••••" last />
                {pwError && <AppText style={[stylesShared.inlineError, { color: colors.danger }]}>{pwError}</AppText>}
                <TouchableOpacity
                  style={[stylesShared.inlineSubmitBtn, { backgroundColor: '#FF2E8A', opacity: savingPw ? 0.6 : 1 }]}
                  onPress={onSavePassword}
                  disabled={savingPw}
                  activeOpacity={0.8}
                >
                  {savingPw
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <AppText style={stylesShared.inlineSubmitText}>Update Password</AppText>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

      </Section>

      <Section title="MY DEVICE PRIVACY" note="These settings only affect your device. Your partner manages their own independently.">
        <SettingsRow label="Privacy Mode" sub="Show Weather Lock Screen when you open the app" toggle value={s?.stealth_mode_enabled ?? true} onChange={v => update({ stealth_mode_enabled: v })} />
        <RequireUnlockRow
          current={(s?.login_method === 'biometric' ? 'biometric' : 'none') as UnlockMethod}
          bioAvailable={bioAvailable}
          hasHardware={hasHardware}
          biometricLabel={biometricLabel}
          colors={colors}
          onSelect={async (method) => {
            if (method === 'biometric') {
              const result = await bioAuthenticate('Confirm biometrics to enable this method');
              if (!result.success) {
                if (result.error && !result.error.includes('cancel')) {
                  Alert.alert(
                    'Face ID Not Available',
                    result.error.includes('not enrolled') || result.error.includes('not set')
                      ? 'Face ID is not set up on this device. Go to iPhone Settings > Face ID & Passcode to enroll your face, then try again.'
                      : result.error,
                  );
                }
                return;
              }
            }
            update({ login_method: method });
          }}
        />
        {(s?.login_method ?? 'none') !== 'none' && (
          <RequireUnlockAfterRow
            current={s?.lock_after_seconds ?? null}
            colors={colors}
            onSelect={(seconds) => update({ lock_after_seconds: seconds })}
          />
        )}
        <VaultProtectionRow
          isAdditional={s?.vault_face_id_required ?? false}
          bioAvailable={bioAvailable}
          hasHardware={hasHardware}
          biometricLabel={biometricLabel}
          colors={colors}
          onSelect={async (additional) => {
            if (additional) {
              const result = await bioAuthenticate('Confirm biometrics to enable Vault protection');
              if (!result.success) {
                if (result.error && !result.error.includes('cancel')) {
                  Alert.alert(
                    'Face ID Not Available',
                    result.error.includes('not enrolled') || result.error.includes('not set')
                      ? 'Face ID is not set up on this device. Go to iPhone Settings > Face ID & Passcode to enroll your face, then try again.'
                      : result.error,
                  );
                }
                return;
              }
            }
            update({ vault_face_id_required: additional });
          }}
        />
        <SettingsRow label="Notify Me if My Content is Screenshotted" sub="When on, screenshots of your content are detected and your partner sees a warning. When off, screenshots are allowed with no warning. Applies to all your past and future uploads." toggle value={s?.screenshot_notify_partner ?? true} onChange={v => {
          if (v) { update({ screenshot_notify_partner: v }); return; }
          setConfirmSheet({ title: 'Allow Screenshots?', message: 'Your partner will be able to screenshot your photos and videos — including everything you have already uploaded — with no warning or notification. Turn this off?', actions: [{ label: 'Allow Screenshots', onPress: () => { update({ screenshot_notify_partner: false }); setConfirmSheet(null); }, destructive: true }, { label: 'Keep Protection', onPress: () => setConfirmSheet(null) } ] });
        }} />
      </Section>

      <View onLayout={(e) => onVaultSectionLayout(e.nativeEvent.layout.y)}>
        <Section title="VAULT PREFERENCES" note="These are your defaults for items you add. They only apply to content you upload — your partner controls their own uploads separately." onInfo={onShowVaultSecurityInfo}>
          <SettingsRow label="Blur Vault Photos & Videos" sub="Vault items stay blurred until tapped; re-blurs when you leave the app." toggle value={s?.blur_vault_media ?? s?.blur_media ?? true} onChange={v => update({ blur_vault_media: v })} />
          <SettingsRow label="Allow Saving My Uploads" sub="Your partner can save your uploads to their phone. Applies to all your past and future uploads." toggle value={s?.vault_allow_save_default ?? false} onChange={v => {
            if (!v) { update({ vault_allow_save_default: v }); return; }
            setConfirmSheet({ title: 'Allow Saving?', message: 'Your partner will be able to download all your uploaded photos and videos — including everything you have already uploaded — to their phone. Turn this on?', actions: [{ label: 'Allow Saving', onPress: () => { update({ vault_allow_save_default: true, vault_allow_share_default: false }); setConfirmSheet(null); } }, { label: 'Cancel', onPress: () => setConfirmSheet(null) }] });
          }} />
          <SettingsRow label="Allow Sharing My Uploads Outside App" sub="Your partner can share your content externally. Requires saving to be enabled. Applies to all your past and future uploads." toggle value={s?.vault_allow_share_default ?? false} onChange={v => {
            if (!v) { update({ vault_allow_share_default: v }); return; }
            if (!(s?.vault_allow_save_default ?? false)) { Alert.alert('Saving Required', 'You must enable Allow Saving before you can allow sharing.'); return; }
            setConfirmSheet({ title: 'Allow Sharing?', message: 'Your partner will be able to share your uploaded content outside the app — including everything you have already uploaded. Turn this on?', actions: [{ label: 'Allow Sharing', onPress: () => { update({ vault_allow_share_default: true }); setConfirmSheet(null); } }, { label: 'Cancel', onPress: () => setConfirmSheet(null) }] });
          }} last />
          <SettingsRow label="Auto-Save Chat Media to Vault" sub="Photos and videos you send in Chat are automatically saved to your Vault. Deleting from either place removes both." toggle value={s?.chat_auto_save_to_vault ?? true} onChange={v => update({ chat_auto_save_to_vault: v })} last />
        </Section>
      </View>

      <Section title="CHAT">
        <SettingsRow label="Blur Chat Photos & Videos" sub="Photos and videos sent in Chat stay blurred until tapped; re-blurs when you leave the app." toggle value={s?.blur_chat_media ?? s?.blur_media ?? true} onChange={v => update({ blur_chat_media: v })} />
        <ChatFontSizeRow
          current={s?.chat_font_scale ?? 1.0}
          colors={colors}
          onSelect={(scale) => update({ chat_font_scale: scale })}
        />
      </Section>

      <Section title="NOTIFICATIONS">
        <SettingsRow label="Discreet Notifications" sub="Never show content previews" toggle value={s?.discreet_notifications ?? true} onChange={v => update({ discreet_notifications: v })} onInfo={onShowDiscreetInfo} />
        <SettingsRow label="App Icon Badge" sub="Show a red dot on the app icon when you have unread activity" toggle value={s?.app_icon_badge_enabled ?? true} onChange={async (v) => { await update({ app_icon_badge_enabled: v }); if (!v) { const { setAppBadge } = await import('@/lib/appBadge'); setAppBadge(0); } }} last />
      </Section>

      <Section
        title="POINTS & SCORE"
        note={
          couple?.id
            ? "This setting affects both you and your partner. Points are always tallied in the background — turning this off just hides the scores."
            : "Connect with a partner to enable the points system."
        }
      >
        <SettingsRow
          label="Sparks System"
          sub="Show scores, leaderboard, and Cash In features"
          toggle
          value={optimisticPointsEnabled !== null ? optimisticPointsEnabled : (couple?.points_enabled ?? true)}
          onChange={onTogglePoints}
          disabled={!couple?.id}
          last
        />
      </Section>

      <Section
        title="STREAKS"
        note={
          couple?.id
            ? "This setting affects both you and your partner. Your streak is always tracked in the background — turning this off just hides it."
            : "Connect with a partner to enable streaks."
        }
      >
        <SettingsRow
          label="Day Streak"
          sub="Show your current consecutive-day activity streak"
          toggle
          value={optimisticStreaksEnabled !== null ? optimisticStreaksEnabled : (couple?.streaks_enabled ?? true)}
          onChange={onToggleStreaks}
          disabled={!couple?.id}
          last
        />
      </Section>

      <Section title="SUPPORT">
        {feedbackEnabled && (
          <SettingsRow
            label="Send Feedback"
            sub="Share ideas, report issues, or send us a note"
            onPress={onSendFeedback}
          />
        )}
        <SettingsRow
          label="Contact Support"
          sub="Get help from the Warm Me Up team"
          onPress={onContactSupport}
        />
        <SettingsRow
          label="Community Guidelines"
          sub="How we keep this space safe and respectful"
          onPress={onShowCommunityGuidelines}
          last
        />
      </Section>

      <Section title="MEMBERSHIP">
        {subscriptionInfo.loading ? (
          <SettingsRow label="Status" sub="Loading…" last />

        ) : (subscriptionInfo.source === 'admin' || subscriptionInfo.source === 'super_admin' || subscriptionInfo.source === 'admin_grant') ? (
          <SettingsRow
            label="Access"
            sub="Complimentary — full access granted"
            last
          />

        ) : subscriptionInfo.source === 'partner' ? (
          <>
            <SettingsRow
              label="Plan"
              sub="Covered by partner's subscription"
            />
            <SettingsRow
              label="Manage"
              sub="View or cancel in the App Store"
              onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
              accent
              last
            />
          </>

        ) : subscriptionInfo.source === 'self' && subscriptionInfo.isOnTrial ? (
          <>
            <SettingsRow
              label="Plan"
              sub={`Free Trial${subscriptionInfo.trialExpiresAt ? ` · ends ${new Date(subscriptionInfo.trialExpiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`}
            />
            <SettingsRow
              label="Subscribe"
              sub="Unlock full access · your partner joins free"
              onPress={() => router.push('/(auth)/subscription')}
              accent
            />
            <SettingsRow
              label="Restore Purchase"
              sub="Recover a previous subscription"
              onPress={onRestorePurchase}
              last
            />
          </>

        ) : subscriptionInfo.source === 'self' && subscriptionInfo.isPremium ? (
          <>
            <SettingsRow
              label="Plan"
              sub={`${subscriptionInfo.plan === 'yearly' ? 'Yearly' : 'Monthly'} · Active${subscriptionInfo.expiresAt ? ` — renews ${new Date(subscriptionInfo.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`}
            />
            <SettingsRow
              label="Manage Subscription"
              sub="View or cancel in the App Store"
              onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
              accent
            />
            <SettingsRow
              label="Restore Purchase"
              sub="Recover a previous subscription"
              onPress={onRestorePurchase}
              last
            />
          </>

        ) : (
          <>
            <SettingsRow label="Plan" sub="No active subscription" />
            <SettingsRow
              label="Subscribe"
              sub="One subscription covers both of you · partner joins free"
              onPress={() => router.push('/(auth)/subscription')}
              accent
            />
            <SettingsRow
              label="Restore Purchase"
              sub="Recover a previous subscription"
              onPress={onRestorePurchase}
              last
            />
          </>
        )}
      </Section>

      <Section title="SECURITY">
        <SettingsRow label="Terms of Service" sub="The rules for using Warm Me Up" onPress={onShowTerms} />
        <SettingsRow label="Privacy Policy" sub="How we handle your data" onPress={onShowPrivacyPolicy} />
        <SettingsRow label="Delete My Account" danger onPress={onDeleteAccount} last />
      </Section>

      {/* Footer logo */}
      <View style={styles.footerLogoWrap}>
        <Image
          source={require('@/assets/images/image_(2).png')}
          style={styles.footerLogo}
          resizeMode="contain"
        />
      </View>

      {/* Share app with a friend — subtle link, not a button */}
      <TouchableOpacity onPress={shareApp} activeOpacity={0.6} style={styles.shareAppLink}>
        <Share2 color={colors.textMuted} size={13} strokeWidth={2} />
        <AppText style={[styles.shareAppLinkText, { color: colors.textMuted }]}>Share Warm Me Up with a friend</AppText>
      </TouchableOpacity>
      <ConfirmSheet visible={!!confirmSheet} title={confirmSheet?.title ?? ''} message={confirmSheet?.message ?? ''} actions={confirmSheet?.actions ?? []} onDismiss={() => setConfirmSheet(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  footerLogoWrap: { alignItems: 'center', paddingTop: Spacing.xxl, paddingBottom: Spacing.xl, opacity: 0.7 },
  footerLogo: { width: 320, height: 160 },
  shareAppLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: Spacing.xl,
  },
  shareAppLinkText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(150,150,160,0.35)',
  },
});

// Shared row styles (mirror of SharedSections styles, used for the LOGIN & SECURITY inline rows)
const stylesShared = {
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 15,
  } as any,
  rowLeft: { flex: 1, gap: 2, marginRight: Spacing.md } as any,
  rowLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' } as any,
  rowSub: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 16 } as any,
  inlineForm: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm } as any,
  inlineError: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', marginTop: 4, marginBottom: 2 } as any,
  inlineNote: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 17, marginTop: 8, marginBottom: 8 } as any,
  inlineSubmitBtn: { borderRadius: Radius.pill, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 44 } as any,
  inlineSubmitText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' } as any,
  inlineSuccess: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 } as any,
  inlineSuccessText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', flex: 1 } as any,
};
