import React from 'react';
import {
  View, StyleSheet, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import {
  UserPlus, ChevronRight, Trophy, SlidersHorizontal, RotateCcw, Trash2, LogOut,
  Camera, Pencil, Check, X, RefreshCw, Copy, Share2, Heart,
} from 'lucide-react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import Avatar from '@/components/Avatar';
import QuickStatsRow from '@/components/QuickStatsRow';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { ConnectedPartnerCard } from '@/components/account/ConnectedPartnerCard';
import { useRouter } from 'expo-router';

export function ProfileTab({
  // Couple / partner data
  couple,
  partnerProfile,
  profile,
  user,
  isAdmin,
  isSuperAdmin,
  subscriptionInfo,
  coupleLoading,
  // Stats
  streak,
  momentsToday,
  totalPoints,
  diceRolls,
  optimisticPointsEnabled,
  // Invite code state
  copied,
  codeRefreshing,
  // Name editing
  editingName,
  firstNameInput,
  lastNameInput,
  savingName,
  nameError,
  nameWrapRef,
  // Avatar
  uploadingAvatar,
  avatarError,
  // Handlers
  onCopyCode,
  onShareCode,
  onShareApp,
  onRefreshCode,
  onInviteCardPress,
  onManagePairing,
  onCancelInvite,
  onEnterCode,
  onPickAvatar,
  onStartEditName,
  onSaveName,
  onCancelEditName,
  onResetPoints,
  onSignOut,
  onAnniversaryPress,
  onSetFirstName,
  onSetLastName,
}: {
  couple: any;
  partnerProfile: any;
  profile: any;
  user: any;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  subscriptionInfo: any;
  coupleLoading: boolean;
  streak: number;
  momentsToday: number;
  totalPoints: number | string;
  diceRolls: number;
  optimisticPointsEnabled: boolean | null;
  copied: boolean;
  codeRefreshing: boolean;
  editingName: boolean;
  firstNameInput: string;
  lastNameInput: string;
  savingName: boolean;
  nameError: string | null;
  nameWrapRef: React.RefObject<View | null>;
  uploadingAvatar: boolean;
  avatarError: string | null;
  onCopyCode: () => void;
  onShareCode: () => void;
  onShareApp: () => void;
  onRefreshCode: () => void;
  onInviteCardPress: () => void;
  onManagePairing: () => void;
  onCancelInvite: () => void;
  onEnterCode: () => void;
  onPickAvatar: () => void;
  onStartEditName: () => void;
  onSaveName: () => void;
  onCancelEditName: () => void;
  onResetPoints: () => void;
  onSignOut: () => void;
  onAnniversaryPress: (existing: Date | null) => void;
  onSetFirstName: (v: string) => void;
  onSetLastName: (v: string) => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <>
      {/* Stats row — only shown when no partner; replaced by ConnectedPartnerCard metrics when paired */}
      {!couple?.user_b_id && !coupleLoading && (
        <View style={styles.statsWrap}>
          <QuickStatsRow
            streak={streak}
            momentsToday={momentsToday}
            totalPoints={(optimisticPointsEnabled !== null ? optimisticPointsEnabled : (couple?.points_enabled ?? true)) ? totalPoints : '—'}
          />
        </View>
      )}

      {/* Partner card */}
      {couple?.user_b_id && partnerProfile ? (
        <ConnectedPartnerCard
          userProfile={profile}
          partnerProfile={partnerProfile}
          streak={streak}
          diceRolls={diceRolls}
          momentsToday={momentsToday}
          onManagePairing={onManagePairing}
        />
      ) : coupleLoading ? (
        <View style={[styles.inviteCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
          <View style={styles.inviteHeader}>
            <View style={[styles.heartWrap, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <UserPlus color={colors.textMuted} size={18} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ height: 10, width: 120, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.08)' }} />
              <View style={{ height: 8, width: 180, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.05)' }} />
            </View>
          </View>
        </View>
      ) : !couple?.user_b_id && subscriptionInfo.loading ? (
        <View style={[styles.inviteCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
          <View style={styles.inviteHeader}>
            <View style={[styles.heartWrap, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <UserPlus color={colors.textMuted} size={18} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ height: 10, width: 120, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.08)' }} />
              <View style={{ height: 8, width: 180, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.05)' }} />
            </View>
          </View>
        </View>
      ) : !couple?.user_b_id && !subscriptionInfo.loading ? (
        // Single Pressable card for all "no partner yet" states:
        // has code + canInvite / canInvite but no code / no access (admin or regular)
        <TouchableOpacity
          style={[
            styles.inviteCard,
            { backgroundColor: colors.card, borderColor: subscriptionInfo.canInvite ? 'rgba(255,46,138,0.30)' : colors.borderSubtle },
          ]}
          onPress={onInviteCardPress}
          activeOpacity={0.8}
        >
          <View style={styles.inviteHeader}>
            <View style={[styles.heartWrap, { backgroundColor: subscriptionInfo.canInvite ? 'rgba(255,46,138,0.12)' : 'rgba(255,179,71,0.10)' }]}>
              <UserPlus color={subscriptionInfo.canInvite ? '#FF2E8A' : '#FFB347'} size={18} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={[styles.cardLabel, { color: colors.textMuted }]}>INVITE YOUR PARTNER</AppText>
              <AppText style={[styles.inviteHint, { color: colors.textSecondary }]}>
                {!subscriptionInfo.canInvite
                  ? ((isAdmin || isSuperAdmin) ? 'Manage Access' : 'Subscribe to Invite')
                  : couple?.invite_code
                    ? 'Share your code to connect'
                    : 'Tap to generate your invite code'}
              </AppText>
            </View>
            {!subscriptionInfo.canInvite && (
              <ChevronRight color={colors.textMuted} size={16} strokeWidth={2} />
            )}
            {subscriptionInfo.canInvite && !couple?.invite_code && (
              <ChevronRight color={colors.textMuted} size={16} strokeWidth={2} />
            )}
          </View>

          {/* Code area — only shown when user has access and a code */}
          {subscriptionInfo.canInvite && couple?.invite_code ? (
            <>
              <View style={[styles.codeBox, { backgroundColor: 'rgba(255,46,138,0.06)', borderColor: 'rgba(255,46,138,0.20)' }]}>
                <AppText style={[styles.codeText, { color: colors.text }]}>{couple.invite_code}</AppText>
                <TouchableOpacity
                  style={styles.codeRefreshBtn}
                  onPress={onRefreshCode}
                  activeOpacity={0.7}
                  disabled={codeRefreshing}
                >
                  <RefreshCw
                    color={codeRefreshing ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.45)'}
                    size={15}
                    strokeWidth={2}
                  />
                </TouchableOpacity>
              </View>
              <View style={styles.inviteActions}>
                <TouchableOpacity
                  style={[styles.inviteBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
                  onPress={onCopyCode}
                  activeOpacity={0.75}
                >
                  <Copy color={copied ? '#33D17A' : colors.textSecondary} size={15} strokeWidth={2} />
                  <AppText style={[styles.inviteBtnText, { color: copied ? '#33D17A' : colors.textSecondary }]}>{copied ? 'Copied!' : 'Copy'}</AppText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.inviteBtn, { borderColor: 'rgba(255,46,138,0.35)', backgroundColor: 'rgba(255,46,138,0.07)' }]}
                  onPress={onShareCode}
                  activeOpacity={0.75}
                >
                  <Share2 color="#FF2E8A" size={15} strokeWidth={2} />
                  <AppText style={[styles.inviteBtnText, { color: '#FF2E8A' }]}>Share</AppText>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.cancelInviteBtn}
                onPress={onCancelInvite}
                activeOpacity={0.7}
              >
                <X color="rgba(255,90,90,0.70)" size={13} strokeWidth={2.2} />
                <AppText style={styles.cancelInviteText}>Cancel invite</AppText>
              </TouchableOpacity>
            </>
          ) : subscriptionInfo.canInvite && !couple?.invite_code ? (
            // Generate button as secondary affordance inside the card
            <TouchableOpacity
              style={[styles.inviteBtn, { borderColor: 'rgba(255,46,138,0.35)', backgroundColor: 'rgba(255,46,138,0.07)', alignSelf: 'stretch', justifyContent: 'center', gap: 8 }]}
              onPress={onRefreshCode}
              activeOpacity={0.75}
              disabled={codeRefreshing}
            >
              {codeRefreshing
                ? <ActivityIndicator size="small" color="#FF2E8A" />
                : <RefreshCw color="#FF2E8A" size={15} strokeWidth={2} />}
              <AppText style={[styles.inviteBtnText, { color: '#FF2E8A' }]}>Generate Invite Code</AppText>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      ) : null}

      {/* Anniversary date card — only when paired */}
      {couple?.user_b_id && (
        <TouchableOpacity
          style={[styles.anniversaryCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}
          onPress={() => {
            const existing = couple?.anniversary_date ? new Date(couple.anniversary_date) : null;
            onAnniversaryPress(existing);
          }}
          activeOpacity={0.75}
        >
          <View style={[styles.anniversaryIcon, { backgroundColor: 'rgba(255,46,138,0.10)' }]}>
            <Heart color="#FF2E8A" size={16} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText style={[styles.cardLabel, { color: colors.textMuted }]}>ANNIVERSARY DATE</AppText>
            <AppText style={[styles.anniversaryValue, { color: colors.text }]}>
              {couple?.anniversary_date
                ? new Date(couple.anniversary_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : 'Set your anniversary'}
            </AppText>
          </View>
          <ChevronRight color={colors.textMuted} size={15} strokeWidth={2} />
        </TouchableOpacity>
      )}

      {/* Enter a partner's code — always visible for solo users */}
      {!couple?.user_b_id && !coupleLoading && (
        <TouchableOpacity
          style={[styles.enterCodeRow, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}
          onPress={onEnterCode}
          activeOpacity={0.75}
        >
          <View style={[styles.enterCodeIcon, { backgroundColor: 'rgba(255,122,69,0.10)' }]}>
            <UserPlus color="#FF7A45" size={16} strokeWidth={2} />
          </View>
          <AppText style={[styles.enterCodeText, { color: colors.textSecondary }]}>Have a partner's code? Enter it here</AppText>
          <ChevronRight color={colors.textMuted} size={15} strokeWidth={2} />
        </TouchableOpacity>
      )}

      {/* Profile menu */}
      <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
        <TouchableOpacity
          style={[styles.menuRow, { borderBottomColor: colors.borderSubtle }]}
          onPress={() => router.push('/(app)/my-stats')}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(255,179,71,0.10)' }]}>
            <Trophy color="#FFB347" size={18} strokeWidth={2} />
          </View>
          <AppText style={[styles.menuText, { color: colors.text }]}>My Stats</AppText>
          <ChevronRight color={colors.textMuted} size={16} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuRow, { borderBottomColor: colors.borderSubtle }]}
          onPress={() => router.push('/(app)/customize-prompts')}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(255,179,71,0.10)' }]}>
            <SlidersHorizontal color="#FFB347" size={18} strokeWidth={2} />
          </View>
          <AppText style={[styles.menuText, { color: colors.text }]}>Customize Prompts</AppText>
          <ChevronRight color={colors.textMuted} size={16} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuRow, { borderBottomColor: colors.borderSubtle }]}
          onPress={onResetPoints}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(255,179,71,0.10)' }]}>
            <RotateCcw color="#FFB347" size={18} strokeWidth={2} />
          </View>
          <AppText style={[styles.menuText, { color: colors.text }]}>Reset Points</AppText>
          <ChevronRight color={colors.textMuted} size={16} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuRow, { borderBottomColor: colors.borderSubtle }]}
          onPress={() => router.push('/(app)/delete-content')}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(255,90,95,0.08)' }]}>
            <Trash2 color={colors.danger} size={18} strokeWidth={2} />
          </View>
          <AppText style={[styles.menuText, { color: colors.danger }]}>Delete Content</AppText>
          <ChevronRight color={colors.danger} size={16} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuRow, { borderBottomColor: 'transparent' }]}
          onPress={onSignOut}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(255,90,95,0.08)' }]}>
            <LogOut color={colors.danger} size={18} strokeWidth={2} />
          </View>
          <AppText style={[styles.menuText, { color: colors.danger }]}>Sign Out</AppText>
          <ChevronRight color={colors.danger} size={16} />
        </TouchableOpacity>
      </View>

      {/* My Profile section */}
      <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>My Profile</AppText>
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
        <TouchableOpacity onPress={onPickAvatar} activeOpacity={0.8} style={styles.avatarWrap} disabled={uploadingAvatar}>
          <Avatar key={profile?.avatar_url ?? 'noavatar'} name={profile?.display_name} uri={profile?.avatar_url} size="lg" bgColor="rgba(255,46,138,0.20)" />
          <View style={[styles.cameraChip, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <Camera color={uploadingAvatar ? colors.textMuted : '#FF2E8A'} size={12} strokeWidth={2.5} />
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          {editingName ? (
            <View ref={nameWrapRef} style={styles.nameEditRow}>
              <View style={styles.nameInputsCol}>
                <AppTextInput
                  style={[styles.nameInput, { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: 'rgba(255,255,255,0.04)' }]}
                  value={firstNameInput}
                  onChangeText={onSetFirstName}
                  autoFocus
                  returnKeyType="next"
                  placeholderTextColor={colors.textMuted}
                  placeholder="First name"
                  maxLength={20}
                />
                <AppTextInput
                  style={[styles.nameInput, { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: 'rgba(255,255,255,0.04)' }]}
                  value={lastNameInput}
                  onChangeText={onSetLastName}
                  returnKeyType="done"
                  onSubmitEditing={onSaveName}
                  onBlur={onSaveName}
                  placeholderTextColor={colors.textMuted}
                  placeholder="Last name"
                  maxLength={30}
                />
              </View>
              <View style={styles.nameActionBtns}>
                <TouchableOpacity onPress={onSaveName} disabled={savingName} style={styles.nameActionBtn} activeOpacity={0.7}>
                  <Check color="#33D17A" size={18} strokeWidth={2.5} />
                </TouchableOpacity>
                <TouchableOpacity onPress={onCancelEditName} style={styles.nameActionBtn} activeOpacity={0.7}>
                  <X color={colors.textMuted} size={18} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={onStartEditName} style={styles.nameRow} activeOpacity={0.7}>
              <AppText style={[styles.name, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">{profile ? `${profile.first_name} ${profile.last_name}`.trim() || profile.display_name : 'Your Name'}</AppText>
              <Pencil color={colors.textMuted} size={14} strokeWidth={2} />
            </TouchableOpacity>
          )}
          <AppText style={[styles.emailText, { color: colors.textMuted }]}>{user?.email ?? ''}</AppText>
          {uploadingAvatar && <AppText style={[styles.emailText, { color: '#FF2E8A', marginTop: 4 }]}>Uploading...</AppText>}
          {avatarError && !uploadingAvatar && <AppText style={[styles.emailText, { color: colors.danger, marginTop: 4 }]}>{avatarError}</AppText>}
          {nameError && <AppText style={[styles.emailText, { color: colors.danger, marginTop: 4 }]}>{nameError}</AppText>}
        </View>
      </View>

      {/* Footer logo */}
      <View style={styles.footerLogoWrap}>
        <Image
          source={require('@/assets/images/image_(2).png')}
          style={styles.footerLogo}
          resizeMode="contain"
        />
      </View>

      {/* Share app with a friend — subtle link, not a button */}
      <TouchableOpacity onPress={onShareApp} activeOpacity={0.6} style={styles.shareAppLink}>
        <Share2 color={colors.textMuted} size={13} strokeWidth={2} />
        <AppText style={[styles.shareAppLinkText, { color: colors.textMuted }]}>Share Warm Me Up with a friend</AppText>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  statsWrap: { marginBottom: Spacing.md },
  inviteCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, marginBottom: Spacing.md, gap: Spacing.md },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  inviteHint: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', marginTop: 2 },
  heartWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1 },
  codeBox: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, alignItems: 'center', position: 'relative' },
  codeRefreshBtn: { position: 'absolute', right: Spacing.md, top: '50%', marginTop: -10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontSize: 22, fontFamily: 'Inter-Bold', letterSpacing: 6 },
  inviteActions: { flexDirection: 'row', gap: Spacing.sm },
  inviteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: Radius.pill, borderWidth: 1, paddingVertical: 11,
  },
  inviteBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  cancelInviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  cancelInviteText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,90,90,0.70)',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(255,90,90,0.40)',
  },
  anniversaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    marginBottom: Spacing.sm,
  },
  anniversaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anniversaryValue: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  enterCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  enterCodeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterCodeText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
  },
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
  menuCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.md },
  sectionLabel: { fontSize: FontSize.label, fontFamily: 'Inter-SemiBold', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: Spacing.sm },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.card, borderBottomWidth: 1 },
  menuIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  menuText: { flex: 1, fontSize: FontSize.body, fontFamily: 'Inter-Medium' },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, marginBottom: Spacing.md,
  },
  avatarWrap: { position: 'relative' },
  cameraChip: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  name: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold' },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  nameInputsCol: { flex: 1, gap: 4 },
  nameInput: {
    fontSize: FontSize.body, fontFamily: 'Inter-Medium',
    borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, height: 32,
  },
  nameActionBtns: { flexDirection: 'column', alignItems: 'center', gap: 2 },
  nameActionBtn: { padding: 4 },
  emailText: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', marginTop: 2 },
  footerLogoWrap: { alignItems: 'center', paddingTop: Spacing.xxl, paddingBottom: Spacing.xl, opacity: 0.7 },
  footerLogo: { width: 320, height: 160 },
});