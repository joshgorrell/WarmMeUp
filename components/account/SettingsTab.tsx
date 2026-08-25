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
  user, s, couple, bioAvailable, hasHardware, biometricLabel, bioAuthenticate, update,
  optimisticPointsEnabled, onTogglePoints, showChangeEmail, newEmail, emailError,
  emailSuccess, savingEmail, onOpenChangeEmail, onCloseChangeEmail, onSetNewEmail,
  onSaveEmail, showChangePw, currentPw, newPw, confirmPw, pwError, pwSuccess,
  savingPw, onOpenChangePw, onCloseChangePw, onSetCurrentPw, onSetNewPw,
  onSetConfirmPw, onSavePassword, onShowVaultSecurityInfo, onShowDiscreetInfo,
  onShowCommunityGuidelines, onShowTerms, onShowPrivacyPolicy, subscriptionInfo,
  onRestorePurchase, onDeleteAccount, onContactSupport, feedbackEnabled, onSendFeedback,
  onVaultSectionLayout,
}: any) {
  const { colors } = useTheme();
  const router = useRouter();
  const didProbingRef = useRef(false);
  const [confirmSheet, setConfirmSheet] = useState<any>(null);

  useEffect(() => {
    if (didProbingRef.current) return;
    if (!hasHardware || bioAvailable) return;
    didProbingRef.current = true;
    bioAuthenticate('Warm Me Up wants to use Face ID').then(() => {});
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
        <TouchableOpacity style={[stylesShared.row, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1 }]} onPress={showChangeEmail ? onCloseChangeEmail : onOpenChangeEmail} activeOpacity={0.7}>
          <View style={stylesShared.rowLeft}><AppText style={[stylesShared.rowLabel, { color: colors.text }]}>Change Email</AppText></View>
          {showChangeEmail ? <X color={colors.textMuted} size={16} /> : <ChevronRight color={colors.textMuted} size={16} />}
        </TouchableOpacity>
        {showChangeEmail && (
          <View style={[stylesShared.inlineForm, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
            {emailSuccess ? <View style={stylesShared.inlineSuccess}><Check color="#33D17A" size={16} strokeWidth={2.5} /><AppText style={[stylesShared.inlineSuccessText, { color: '#33D17A' }]}>Confirmation sent — check your new inbox.</AppText></View> : <>
              <InlineField label="New Email" value={newEmail} onChange={onSetNewEmail} placeholder="you@example.com" last />
              {emailError && <AppText style={[stylesShared.inlineError, { color: colors.danger }]}>{emailError}</AppText>}
              <AppText style={[stylesShared.inlineNote, { color: colors.textMuted }]}>A confirmation link will be sent to your new address. Your email changes once you click it.</AppText>
              <TouchableOpacity style={[stylesShared.inlineSubmitBtn, { backgroundColor: '#FF2E8A', opacity: savingEmail ? 0.6 : 1 }]} onPress={onSaveEmail} disabled={savingEmail} activeOpacity={0.8}>
                {savingEmail ? <ActivityIndicator color="#fff" size="small" /> : <AppText style={stylesShared.inlineSubmitText}>Send Confirmation</AppText>}
              </TouchableOpacity>
            </>}
          </View>
        )}
        <TouchableOpacity style={[stylesShared.row, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1 }]} onPress={showChangePw ? onCloseChangePw : onOpenChangePw} activeOpacity={0.7}>
          <View style={stylesShared.rowLeft}><AppText style={[stylesShared.rowLabel, { color: colors.text }]}>Change Password</AppText></View>
          {showChangePw ? <X color={colors.textMuted} size={16} /> : <ChevronRight color={colors.textMuted} size={16} />}
        </TouchableOpacity>
        {showChangePw && (
          <View style={[stylesShared.inlineForm, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
            {pwSuccess ? <View style={stylesShared.inlineSuccess}><Check color="#33D17A" size={16} strokeWidth={2.5} /><AppText style={[stylesShared.inlineSuccessText, { color: '#33D17A' }]}>Password updated successfully.</AppText></View> : <>
              <InlineField label="Current Password" value={currentPw} onChange={onSetCurrentPw} secure placeholder="••••••••" />
              <InlineField label="New Password" value={newPw} onChange={onSetNewPw} secure placeholder="8+ characters" />
              <InlineField label="Confirm New" value={confirmPw} onChange={onSetConfirmPw} secure placeholder="••••••••" last />
              {pwError && <AppText style={[stylesShared.inlineError, { color: colors.danger }]}>{pwError}</AppText>}
              <TouchableOpacity style={[stylesShared.inlineSubmitBtn, { backgroundColor: '#FF2E8A', opacity: savingPw ? 0.6 : 1 }]} onPress={onSavePassword} disabled={savingPw} activeOpacity={0.8}>
                {savingPw ? <ActivityIndicator color="#fff" size="small" /> : <AppText style={stylesShared.inlineSubmitText}>Update Password</AppText>}
              </TouchableOpacity>
            </>}
          </View>
        )}
      </Section>

      <Section title="MY DEVICE PRIVACY" note="These settings only affect your device. Your partner manages their own independently.">
        <SettingsRow label="Privacy Mode" sub="Show Weather Lock Screen when you open the app" toggle value={s?.stealth_mode_enabled ?? true} onChange={(v: boolean) => update({ stealth_mode_enabled: v })} />
        <RequireUnlockRow current={(s?.login_method === 'biometric' ? 'biometric' : 'none') as UnlockMethod} bioAvailable={bioAvailable} hasHardware={hasHardware} biometricLabel={biometricLabel} colors={colors} onSelect={async (method) => {
          if (method === 'biometric') { const result = await bioAuthenticate('Confirm biometrics to enable this method'); if (!result.success) { if (result.error && !result.error.includes('cancel')) Alert.alert('Face ID Not Available', result.error.includes('not enrolled') || result.error.includes('not set') ? 'Face ID is not set up on this device. Go to iPhone Settings > Face ID & Passcode to enroll your face, then try again.' : result.error); return; } }
          update({ login_method: method });
        }} />
        {(s?.login_method ?? 'none') !== 'none' && <RequireUnlockAfterRow current={s?.lock_after_seconds ?? null} colors={colors} onSelect={(seconds) => update({ lock_after_seconds: seconds })} />}
        <VaultProtectionRow isAdditional={s?.vault_face_id_required ?? false} bioAvailable={bioAvailable} hasHardware={hasHardware} biometricLabel={biometricLabel} colors={colors} onSelect={async (additional) => {
          if (additional) { const result = await bioAuthenticate('Confirm biometrics to enable Vault protection'); if (!result.success) { if (result.error && !result.error.includes('cancel')) Alert.alert('Face ID Not Available', result.error.includes('not enrolled') || result.error.includes('not set') ? 'Face ID is not set up on this device. Go to iPhone Settings > Face ID & Passcode to enroll your face, then try again.' : result.error); return; } }
          update({ vault_face_id_required: additional });
        }} />
        <SettingsRow
          label="Screenshot Alerts & Protection"
          sub="Get alerted when Warm Me Up detects your partner taking a screenshot of your content. Warm Me Up also uses available device protections to help limit screen capture where supported. Screen-capture protection varies by device and operating system."
          toggle
          value={s?.screenshot_notify_partner ?? true}
          onChange={(v: boolean) => {
            if (v) { update({ screenshot_notify_partner: true }); return; }
            setConfirmSheet({
              title: 'Turn Off Screenshot Alerts?',
              message: 'You’ll no longer receive Warm Me Up alerts when your partner takes a detected screenshot of your content. Available screen-capture protections will also be turned off.',
              actions: [
                { label: 'Turn Off', onPress: () => { update({ screenshot_notify_partner: false }); setConfirmSheet(null); }, destructive: true },
                { label: 'Keep On', onPress: () => setConfirmSheet(null) },
              ],
            });
          }}
        />
      </Section>

      <View onLayout={(e) => onVaultSectionLayout(e.nativeEvent.layout.y)}>
        <Section title="VAULT PREFERENCES" note="These are your defaults for items you add. They only apply to content you upload — your partner controls their own uploads separately." onInfo={onShowVaultSecurityInfo}>
          <SettingsRow label="Blur Vault Photos & Videos" sub="Vault items stay blurred until tapped; re-blurs when you leave the app." toggle value={s?.blur_vault_media ?? s?.blur_media ?? true} onChange={(v: boolean) => update({ blur_vault_media: v })} />
          <SettingsRow label="Allow Saving My Uploads" sub="Your partner can save your uploads to their phone. Applies to all your past and future uploads." toggle value={s?.vault_allow_save_default ?? false} onChange={(v: boolean) => { if (!v) { update({ vault_allow_save_default: v }); return; } setConfirmSheet({ title: 'Allow Saving?', message: 'Your partner will be able to download all your uploaded photos and videos — including everything you have already uploaded — to their phone. Turn this on?', actions: [{ label: 'Allow Saving', onPress: () => { update({ vault_allow_save_default: true, vault_allow_share_default: false }); setConfirmSheet(null); } }, { label: 'Cancel', onPress: () => setConfirmSheet(null) }] }); }} />
          <SettingsRow label="Allow Sharing My Uploads Outside App" sub="Your partner can share your content externally. Requires saving to be enabled. Applies to all your past and future uploads." toggle value={s?.vault_allow_share_default ?? false} onChange={(v: boolean) => { if (!v) { update({ vault_allow_share_default: v }); return; } if (!(s?.vault_allow_save_default ?? false)) { Alert.alert('Saving Required', 'You must enable Allow Saving before you can allow sharing.'); return; } setConfirmSheet({ title: 'Allow Sharing?', message: 'Your partner will be able to share your uploaded content outside the app — including everything you have already uploaded. Turn this on?', actions: [{ label: 'Allow Sharing', onPress: () => { update({ vault_allow_share_default: true }); setConfirmSheet(null); } }, { label: 'Cancel', onPress: () => setConfirmSheet(null) }] }); }} last />
          <SettingsRow label="Auto-Save Chat Media to Vault" sub="Photos and videos you send in Chat are automatically saved to your Vault. Deleting from either place removes both." toggle value={s?.chat_auto_save_to_vault ?? true} onChange={(v: boolean) => update({ chat_auto_save_to_vault: v })} last />
        </Section>
      </View>

      <Section title="CHAT">
        <SettingsRow label="Blur Chat Photos & Videos" sub="Photos and videos sent in Chat stay blurred until tapped; re-blurs when you leave the app." toggle value={s?.blur_chat_media ?? s?.blur_media ?? true} onChange={(v: boolean) => update({ blur_chat_media: v })} />
        <ChatFontSizeRow current={s?.chat_font_scale ?? 1.0} colors={colors} onSelect={(scale) => update({ chat_font_scale: scale })} />
      </Section>

      <Section title="NOTIFICATIONS">
        <SettingsRow label="Discreet Notifications" sub="Never show content previews" toggle value={s?.discreet_notifications ?? true} onChange={(v: boolean) => update({ discreet_notifications: v })} onInfo={onShowDiscreetInfo} />
        <SettingsRow label="App Icon Badge" sub="Show a red dot on the app icon when you have unread activity" toggle value={s?.app_icon_badge_enabled ?? true} onChange={async (v: boolean) => { await update({ app_icon_badge_enabled: v }); if (!v) { const { setAppBadge } = await import('@/lib/appBadge'); setAppBadge(0); } }} last />
      </Section>

      <Section title="POINTS" note={couple?.id ? "Points are optional for couples who enjoy the game. Turning them off hides scores and Cash In features without affecting your Weekly Streak." : "Connect with a partner to enable Points."}>
        <SettingsRow label="Points" sub="Show scores, leaderboard, and Cash In features" toggle value={optimisticPointsEnabled !== null ? optimisticPointsEnabled : (couple?.points_enabled ?? true)} onChange={onTogglePoints} disabled={!couple?.id} last />
      </Section>

      <Section title="SUPPORT">
        {feedbackEnabled && <SettingsRow label="Send Feedback" sub="Share ideas, report issues, or send us a note" onPress={onSendFeedback} />}
        <SettingsRow label="Contact Support" sub="Get help from the Warm Me Up team" onPress={onContactSupport} />
        <SettingsRow label="Community Guidelines" sub="How we keep this space safe and respectful" onPress={onShowCommunityGuidelines} last />
      </Section>

      <Section title="MEMBERSHIP">
        {subscriptionInfo.loading ? <SettingsRow label="Status" sub="Loading…" last /> : (subscriptionInfo.source === 'admin' || subscriptionInfo.source === 'super_admin' || subscriptionInfo.source === 'admin_grant') ? <SettingsRow label="Access" sub="Complimentary — full access granted" last /> : subscriptionInfo.source === 'partner' ? <><SettingsRow label="Plan" sub="Covered by partner's subscription" /><SettingsRow label="Manage" sub="View or cancel in the App Store" onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')} accent last /></> : subscriptionInfo.source === 'self' && subscriptionInfo.isOnTrial ? <><SettingsRow label="Plan" sub={`Free Trial${subscriptionInfo.trialExpiresAt ? ` · ends ${new Date(subscriptionInfo.trialExpiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`} /><SettingsRow label="Subscribe" sub="Unlock full access · your partner joins free" onPress={() => router.push('/(auth)/subscription')} accent /><SettingsRow label="Restore Purchase" sub="Recover a previous subscription" onPress={onRestorePurchase} last /></> : subscriptionInfo.source === 'self' && subscriptionInfo.isPremium ? <><SettingsRow label="Plan" sub={`${subscriptionInfo.plan === 'yearly' ? 'Yearly' : 'Monthly'} · Active${subscriptionInfo.expiresAt ? ` — renews ${new Date(subscriptionInfo.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`} /><SettingsRow label="Manage Subscription" sub="View or cancel in the App Store" onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')} accent /><SettingsRow label="Restore Purchase" sub="Recover a previous subscription" onPress={onRestorePurchase} last /></> : <><SettingsRow label="Plan" sub="No active subscription" /><SettingsRow label="Subscribe" sub="One subscription covers both of you · partner joins free" onPress={() => router.push('/(auth)/subscription')} accent /><SettingsRow label="Restore Purchase" sub="Recover a previous subscription" onPress={onRestorePurchase} last /></>}
      </Section>

      <Section title="SECURITY">
        <SettingsRow label="Terms of Service" sub="The rules for using Warm Me Up" onPress={onShowTerms} />
        <SettingsRow label="Privacy Policy" sub="How we handle your data" onPress={onShowPrivacyPolicy} />
        <SettingsRow label="Delete My Account" danger onPress={onDeleteAccount} last />
      </Section>

      <View style={styles.footerLogoWrap}><Image source={require('@/assets/images/image_(2).png')} style={styles.footerLogo} resizeMode="contain" /></View>
      <TouchableOpacity onPress={shareApp} activeOpacity={0.6} style={styles.shareAppLink}><Share2 color={colors.textMuted} size={13} strokeWidth={2} /><AppText style={[styles.shareAppLinkText, { color: colors.textMuted }]}>Share Warm Me Up with a friend</AppText></TouchableOpacity>
      <ConfirmSheet visible={!!confirmSheet} title={confirmSheet?.title ?? ''} message={confirmSheet?.message ?? ''} actions={confirmSheet?.actions ?? []} onDismiss={() => setConfirmSheet(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  footerLogoWrap: { alignItems: 'center', paddingTop: Spacing.xxl, paddingBottom: Spacing.xl, opacity: 0.7 },
  footerLogo: { width: 320, height: 160 },
  shareAppLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: Spacing.xl },
  shareAppLinkText: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', textDecorationLine: 'underline', textDecorationColor: 'rgba(150,150,160,0.35)' },
});

const stylesShared = {
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 15 } as any,
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