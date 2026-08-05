import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Share, Alert, Platform,
  ActivityIndicator, Modal, Image, Linking, TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronRight, ChevronLeft, Shield, Lock, Trash2, RotateCcw, TriangleAlert as AlertTriangle, UserX, Clock, Users, Smartphone, ScanFace, FileSliders as Sliders, X, Check } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { logDebugEvent } from '@/lib/debugLog';
import { FontSize, Spacing, Radius, Gradient } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import BottomSheet from '@/components/BottomSheet';
import WarmupLogo from '@/components/WarmupLogo';
import BrandHeader from '@/components/BrandHeader';
import { UserSettings } from '@/lib/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import CommunityGuidelinesModal from '@/components/CommunityGuidelinesModal';
import TermsModal from '@/components/TermsModal';
import PrivacyPolicyModal from '@/components/PrivacyPolicyModal';
import LeavePartnerSheet from '@/components/LeavePartnerSheet';
import { useLayout } from '@/hooks/useLayout';
import { shareApp } from '@/lib/shareApp';
import { ensureConfigured } from '@/lib/purchases';
import { logger } from '@/lib/logger';
import { ProfileTab } from '@/components/account/ProfileTab';
import { SettingsTab } from '@/components/account/SettingsTab';
import FeedbackSheet from '@/components/FeedbackSheet';

type AccountTab = 'profile' | 'settings';

// ─── Main screen ──────────────────────────────────────────────────
export default function AccountScreen() {
  const router = useRouter();
  const { profile, partnerProfile, couple, signOut, isAdmin, isSuperAdmin, user, settings, loading, refreshSettings, refreshProfile, refreshCouple, patchCouple, subscriptionInfo, refreshSubscription, notifyScoreReset, scoreResetAt } = useAuth();
  const { colors } = useTheme();
  const { available: bioAvailable, biometricLabel, authenticate: bioAuthenticate } = useBiometricAuth();
  const { contentPadding } = useLayout();

  const params = useLocalSearchParams<{ tab?: string; section?: string }>();
  const [activeTab, setActiveTab] = useState<AccountTab>(params.tab === 'settings' ? 'settings' : 'profile');

  // Deep-link scroll target (e.g. from Vault "Manage in My Profile")
  const scrollViewRef = useRef<ScrollView>(null);
  const [vaultSectionY, setVaultSectionY] = useState<number | null>(null);

  useEffect(() => {
    if (params.section !== 'vault' || activeTab !== 'settings' || vaultSectionY === null) return;
    const id = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, vaultSectionY - 20), animated: false });
    }, 50);
    return () => clearTimeout(id);
  }, [params.section, activeTab, vaultSectionY]);

  // Profile tab state
  const [copied, setCopied] = useState(false);
  const [codeRefreshing, setCodeRefreshing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [firstNameInput, setFirstNameInput] = useState('');
  const [lastNameInput, setLastNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [creatingCouple, setCreatingCouple] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Stats state
  const [streak, setStreak] = useState(0);
  const [momentsToday, setMomentsToday] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [diceRolls, setDiceRolls] = useState(0);

  // Settings tab state
  const [optimistic, setOptimistic] = useState<Partial<UserSettings>>({});
  const [optimisticPointsEnabled, setOptimisticPointsEnabled] = useState<boolean | null>(null);
  const [optimisticStreaksEnabled, setOptimisticStreaksEnabled] = useState<boolean | null>(null);

  // Change Password
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // Change Email
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Legal modals
  const [showCommunityGuidelines, setShowCommunityGuidelines] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  // Feedback
  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false);
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);

  // Reset Points modal
  const [resetPointsOpen, setResetPointsOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const [showDiscreetInfo, setShowDiscreetInfo] = useState(false);
  const [showVaultSecurityInfo, setShowVaultSecurityInfo] = useState(false);

  // Delete Account modal
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  // Leave partner sheet
  const [showLeaveSheet, setShowLeaveSheet] = useState(false);

  // Cancel pending invite
  const [showCancelInviteSheet, setShowCancelInviteSheet] = useState(false);
  const [cancellingInvite, setCancellingInvite] = useState(false);

  // Enter partner's code (solo users joining a partner's couple)
  const [showEnterCodeSheet, setShowEnterCodeSheet] = useState(false);
  const [enterCode, setEnterCode] = useState('');
  const [enterCodeLoading, setEnterCodeLoading] = useState(false);
  const [enterCodeError, setEnterCodeError] = useState<string | null>(null);

  // Anniversary date picker
  const [showAnniversarySheet, setShowAnniversarySheet] = useState(false);
  const [anniversaryDate, setAnniversaryDate] = useState<Date | null>(null);
  const [annivMonth, setAnnivMonth] = useState('');
  const [annivDay, setAnnivDay] = useState('');
  const [annivYear, setAnnivYear] = useState('');
  const [anniversaryError, setAnniversaryError] = useState<string | null>(null);
  const [savingAnniversary, setSavingAnniversary] = useState(false);
  const [deleteAccountStep, setDeleteAccountStep] = useState<1 | 2>(1);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const cancelingNameRef = useRef(false);
  const nameWrapRef = useRef<View | null>(null);
  const saveNameRef = useRef<() => void>(() => {});
  const profileRetriedRef = useRef(false);
  // Stable ref so useFocusEffect always calls the latest refreshCouple without
  // depending on its identity — avoids the stale-closure trap where the callback
  // only fires once because refreshCouple never changes reference.
  const refreshCoupleRef = useRef(refreshCouple);
  useEffect(() => { refreshCoupleRef.current = refreshCouple; }, [refreshCouple]);

  React.useEffect(() => {
    if (!loading && user && !profile && !profileRetriedRef.current) {
      profileRetriedRef.current = true;
      refreshProfile();
    }
  }, [loading, user, profile, refreshProfile]);

  useEffect(() => {
    if (!couple?.id || !user) return;
    loadStats();

    const channel = supabase
      .channel(`account_scores_${couple.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `couple_id=eq.${couple.id}` }, () => {
        loadStats();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [couple?.id, user]);

  // Reload stats immediately when Reset Points fires on this device.
  useEffect(() => {
    if (scoreResetAt === 0) return;
    if (couple?.id && user) loadStats();
  }, [scoreResetAt]);

  useFocusEffect(useCallback(() => {
    refreshCoupleRef.current();
  }, []));

  // Direct DB read on every focus — bypasses AuthContext fetch path entirely.
  // Fixes a case where fetchCouple's .or() query returns a stale/error result
  // while the direct user_a_id query always succeeds, ensuring the invite code
  // displayed is always the live DB value.
  useFocusEffect(useCallback(() => {
    if (!user?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from('couples')
        .select('invite_code, id, user_b_id, user_a_id, active, points_enabled, streaks_enabled, subscription_owner_id, disconnected_at, admin_notes')
        .eq('user_a_id', user.id)
        .is('user_b_id', null)
        .eq('active', true)
        .maybeSingle();
      if (!error && data && data.invite_code !== couple?.invite_code) {
        logger.log('[account] direct fetch corrected invite_code from', couple?.invite_code, 'to', data.invite_code);
        patchCouple(data);
      } else if (!error && !data) {
        // User may be user_b in a paired couple — refresh via context
        refreshCoupleRef.current();
      }
    })();
  }, [user?.id, couple?.invite_code]));

  // Refresh subscription state every time this screen comes into focus so that
  // returning from the entitlements or subscription screen immediately reflects
  // any newly granted access.
  useFocusEffect(useCallback(() => {
    refreshSubscription();
  }, []));

  // Fetch feedback_enabled config flag
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'feedback_enabled')
        .maybeSingle();
      if (data?.value === true) setFeedbackEnabled(true);
    })();
  }, []);

  const handleRestorePurchase = useCallback(async () => {
    if (Platform.OS === 'web') { Alert.alert('Not Available', 'Restoration is only available in the mobile app.'); return; }
    try {
      const Purchases = await ensureConfigured();
      if (!Purchases) { Alert.alert('Unavailable', 'Purchases are not available on this device.'); return; }
      const info = await Purchases.restorePurchases();
      if (info.entitlements.active['premium']) {
        await refreshSubscription();
        Alert.alert('Restored', 'Your subscription has been restored.');
      } else {
        Alert.alert('No Purchases Found', 'No active subscription was found.');
      }
    } catch (e: any) { Alert.alert('Restore Failed', e?.message ?? 'Please try again.'); }
  }, [refreshSubscription]);

  // Reload scores when this screen regains focus so stale totals are never shown.
  useFocusEffect(useCallback(() => {
    if (couple?.id && user) loadStats();
  }, [couple?.id, user]));

  const loadStats = async () => {
    if (!couple?.id || !user) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    // Fetch streak data: only dates from the past 366 days (enough for a full year streak).
    // Fetching by a date window instead of a row limit avoids truncating couples with
    // many interactions spread across many calendar days.
    const streakWindowStart = new Date();
    streakWindowStart.setDate(streakWindowStart.getDate() - 366);
    const [scoresRes, momentsTodayRes, streakRes, diceRes] = await Promise.all([
      supabase.from('scores').select('points').eq('couple_id', couple.id),
      supabase.from('interactions').select('*', { count: 'exact', head: true }).eq('couple_id', couple.id).gte('created_at', start.toISOString()),
      supabase.from('interactions').select('created_at').eq('couple_id', couple.id).gte('created_at', streakWindowStart.toISOString()).order('created_at', { ascending: false }),
      supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('couple_id', couple.id).eq('type', 'dice'),
    ]);
    if (scoresRes.data) setTotalPoints(scoresRes.data.reduce((sum, s) => sum + (s.points ?? 0), 0));
    setMomentsToday(momentsTodayRes.count ?? 0);
    setDiceRolls(diceRes.count ?? 0);
    const streakData = streakRes.data ?? [];
    if (streakData.length > 0) {
      const activeDays = new Set(streakData.map((r: { created_at: string }) => new Date(r.created_at).toDateString()));
      let days = 0;
      const cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      while (activeDays.has(cursor.toDateString())) {
        days++;
        cursor.setDate(cursor.getDate() - 1);
      }
      setStreak(days);
    }
  };

  const s = settings ? { ...settings, ...optimistic } : (Object.keys(optimistic).length > 0 ? optimistic as UserSettings : null);

  const update = useCallback(async (patch: Record<string, unknown>) => {
    if (!user) return;
    setOptimistic(prev => ({ ...prev, ...patch }));
    const { error } = await supabase.from('user_settings').upsert(
      { user_id: user.id, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) {
      console.error('user_settings upsert failed', error);
      Alert.alert('Could not save', error.message ?? 'Please try again.');
      setOptimistic(prev => {
        const next = { ...prev };
        for (const key of Object.keys(patch)) delete (next as any)[key];
        return next;
      });
      return;
    }
    await refreshSettings();
    setOptimistic({});
  }, [user, refreshSettings]);

  // ── Anniversary helpers ─────────────────────────────────────────
  const handleSaveAnniversary = async () => {
    if (!couple?.id) return;
    setAnniversaryError(null);

    const m = parseInt(annivMonth, 10);
    const d = parseInt(annivDay, 10);
    const y = parseInt(annivYear, 10);

    if (!annivMonth || !annivDay || !annivYear || isNaN(m) || isNaN(d) || isNaN(y)) {
      setAnniversaryError('Please enter a complete date.');
      return;
    }
    if (m < 1 || m > 12) {
      setAnniversaryError('Month must be 1–12.');
      return;
    }
    if (d < 1 || d > 31) {
      setAnniversaryError('Day must be 1–31.');
      return;
    }
    if (y < 1900 || y > new Date().getFullYear()) {
      setAnniversaryError('Year must be 1900–' + new Date().getFullYear() + '.');
      return;
    }

    // Validate the date exists (e.g. Feb 30 doesn't)
    const check = new Date(y, m - 1, d);
    if (check.getDate() !== d || check.getMonth() !== m - 1) {
      setAnniversaryError('That date doesn\'t exist.');
      return;
    }
    // Build ISO string directly to avoid UTC timezone offset shifting the day
    const isoDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (isoDate > new Date().toISOString().split('T')[0]) {
      setAnniversaryError("Date can't be in the future.");
      return;
    }

    setSavingAnniversary(true);
    const { error } = await supabase
      .from('couples')
      .update({ anniversary_date: isoDate })
      .eq('id', couple.id);
    setSavingAnniversary(false);

    if (error) {
      setAnniversaryError('Could not save. Try again.');
      return;
    }
    patchCouple({ anniversary_date: isoDate });
    setShowAnniversarySheet(false);
  };

  const handleClearAnniversary = async () => {
    if (!couple?.id) return;
    setSavingAnniversary(true);
    const { error } = await supabase
      .from('couples')
      .update({ anniversary_date: null })
      .eq('id', couple.id);
    setSavingAnniversary(false);
    if (error) return;
    patchCouple({ anniversary_date: null });
    setShowAnniversarySheet(false);
  };

  // ── Partner helpers ──────────────────────────────────────────────
  const handleCopyCode = () => {
    if (!couple?.invite_code) return;
    if (Platform.OS === 'web') navigator.clipboard?.writeText(couple.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareCode = async () => {
    if (!couple?.invite_code) return;
    try { await Share.share({ message: `Join me on Warm Me Up! Use this code to connect: ${couple.invite_code}` }); } catch {}
  };

  const handleRefreshCode = async () => {
    if (codeRefreshing) return;

    // Must be solo (no partner) to refresh
    if (couple?.user_b_id) return;

    // Subscription gate — navigate to subscription screen rather than blocking with an alert
    if (!subscriptionInfo.canInvite) {
      router.push('/(auth)/subscription');
      return;
    }

    setCodeRefreshing(true);

    logDebugEvent('INVITE CREATE START', { source: 'handleRefreshCode', userId: user?.id });
    const { data: result, error } = await supabase.rpc('generate_invite_code');
    if (error || !result) {
      logDebugEvent('INVITE CREATE ERROR', {
        source: 'handleRefreshCode',
        userId: user?.id,
        code: error?.code ?? null,
        message: error?.message ?? null,
      });
      Alert.alert('Error', `Could not generate invite code.\n${error?.message ?? 'Unknown error'}`);
      setCodeRefreshing(false);
      return;
    }
    logDebugEvent('INVITE CREATE SUCCESS', { source: 'handleRefreshCode', inviteCode: result.invite_code });
    patchCouple({ invite_code: result.invite_code });
    try { await refreshCouple(); } catch {}
    setCodeRefreshing(false);
  };

  const handleCancelInvite = async () => {
    if (!couple?.id || couple.user_b_id || cancellingInvite) return;
    setCancellingInvite(true);
    const { error } = await supabase
      .from('couples')
      .delete()
      .eq('id', couple.id)
      .is('user_b_id', null);
    if (!error) {
      await refreshCouple();
    }
    setCancellingInvite(false);
    setShowCancelInviteSheet(false);
  };

  const handleJoinWithCode = async () => {
    const code = enterCode.trim().toUpperCase();
    if (!code || !user) return;
    setEnterCodeLoading(true);
    setEnterCodeError(null);
    const { completePendingJoin } = await import('@/lib/coupleJoin');
    const result = await completePendingJoin(code);
    if (result.ok) {
      setShowEnterCodeSheet(false);
      setEnterCode('');
      await refreshCouple();
      router.replace({
        pathname: '/(auth)/pair',
        params: { prefilledCode: code },
      });
    } else {
      const msg =
        result.reason === 'self' ? "You can't use your own invite code." :
        result.reason === 'already_connected' ? "You're already connected to a partner." :
        result.reason === 'not_found' ? "Invite code not found. Please check and try again." :
        result.reason === 'rate_limited' ? 'Too many attempts. Wait a moment and try again.' :
        'Something went wrong. Please try again.';
      setEnterCodeError(msg);
    }
    setEnterCodeLoading(false);
  };

  const handleInviteCardPress = () => {
    let destination = 'none';

    if (isAdmin || isSuperAdmin) {
      if (!subscriptionInfo.canInvite) {
        destination = '/(admin)/entitlements';
        logger.log('[PROFILE INVITE CARD PRESS]', { userId: user?.id, is_admin: isAdmin, is_super_admin: isSuperAdmin, sub_canInvite: subscriptionInfo.canInvite, sub_isPremium: subscriptionInfo.isPremium, coupleId: couple?.id, coupleActive: couple?.active, destination });
        router.push('/(admin)/entitlements' as any);
        return;
      }
      // Admin with canInvite — fall through to code generation
    }

    if (!subscriptionInfo.canInvite) {
      destination = '/(auth)/subscription';
      logger.log('[PROFILE INVITE CARD PRESS]', { userId: user?.id, is_admin: isAdmin, is_super_admin: isSuperAdmin, sub_canInvite: subscriptionInfo.canInvite, sub_isPremium: subscriptionInfo.isPremium, coupleId: couple?.id, coupleActive: couple?.active, destination });
      router.push('/(auth)/subscription');
      return;
    }

    if (!couple?.invite_code) {
      destination = 'generate_code';
      logger.log('[PROFILE INVITE CARD PRESS]', { userId: user?.id, is_admin: isAdmin, is_super_admin: isSuperAdmin, sub_canInvite: subscriptionInfo.canInvite, sub_isPremium: subscriptionInfo.isPremium, coupleId: couple?.id, coupleActive: couple?.active, destination });
      handleRefreshCode();
      return;
    }

    destination = 'has_code_noop';
    logger.log('[PROFILE INVITE CARD PRESS]', { userId: user?.id, is_admin: isAdmin, is_super_admin: isSuperAdmin, sub_canInvite: subscriptionInfo.canInvite, sub_isPremium: subscriptionInfo.isPremium, coupleId: couple?.id, coupleActive: couple?.active, destination });
  };

  const handleInvitePartner = async () => {
    if (!user || creatingCouple) return;
    if (couple?.invite_code) { handleShareCode(); return; }
    setCreatingCouple(true);
    logDebugEvent('INVITE CREATE START', { source: 'handleInvitePartner', userId: user.id });
    try {
      const { data: result, error } = await supabase.rpc('generate_invite_code');
      if (error || !result) {
        logDebugEvent('INVITE CREATE ERROR', {
          source: 'handleInvitePartner',
          userId: user.id,
          code: error?.code ?? null,
          message: error?.message ?? null,
        });
        Alert.alert('Error', `Could not create invite code.\n${error?.message ?? 'Unknown error'}`);
        return;
      }
      logDebugEvent('INVITE CREATE SUCCESS', { source: 'handleInvitePartner', inviteCode: result.invite_code });
      await refreshCouple();
      const msg = `Join me on Warm Me Up! Use this code to connect: ${result.invite_code}`;
      if (Platform.OS === 'web') { navigator.clipboard?.writeText(result.invite_code); Alert.alert('Code copied!', msg); }
      else await Share.share({ message: msg });
    } finally { setCreatingCouple(false); }
  };

  const handleTogglePoints = async (enabled: boolean) => {
    if (!couple?.id) return;
    setOptimisticPointsEnabled(enabled);
    const { error } = await supabase.from('couples').update({ points_enabled: enabled }).eq('id', couple.id);
    if (error) {
      setOptimisticPointsEnabled(null);
      Alert.alert('Error', 'Could not update points setting. Please try again.');
      return;
    }
    await refreshCouple();
    setOptimisticPointsEnabled(null);
  };

  const handleToggleStreaks = async (enabled: boolean) => {
    if (!couple?.id) return;
    setOptimisticStreaksEnabled(enabled);
    const { error } = await supabase.from('couples').update({ streaks_enabled: enabled }).eq('id', couple.id);
    if (error) {
      setOptimisticStreaksEnabled(null);
      Alert.alert('Error', 'Could not update streaks setting. Please try again.');
      return;
    }
    await refreshCouple();
    setOptimisticStreaksEnabled(null);
  };


  // ── Name edit ────────────────────────────────────────────────────
  const startEditName = () => {
    setFirstNameInput(profile?.first_name ?? '');
    setLastNameInput(profile?.last_name ?? '');
    setEditingName(true);
  };
  const cancelEditName = () => { cancelingNameRef.current = true; setEditingName(false); setFirstNameInput(''); setLastNameInput(''); };

  const saveName = useCallback(async () => {
    if (cancelingNameRef.current) { cancelingNameRef.current = false; return; }
    const fn = firstNameInput.trim();
    const ln = lastNameInput.trim();
    if (!user) { setEditingName(false); return; }
    const unchanged = fn === (profile?.first_name ?? '') && ln === (profile?.last_name ?? '');
    if (!fn || unchanged) { setEditingName(false); return; }
    if (savingName) return;
    setSavingName(true);
    setNameError(null);
    const fullName = `${fn} ${ln}`.trim();
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ first_name: fn, last_name: ln, display_name: fullName })
        .eq('id', user.id)
        .select('id, first_name, last_name, display_name')
        .maybeSingle();
      if (error) { setNameError(error.message ?? 'Could not save. Please try again.'); return; }
      if (!data) { setNameError('Update was blocked. Please sign in again.'); return; }
      await refreshProfile();
      setEditingName(false);
    } finally { setSavingName(false); }
  }, [firstNameInput, lastNameInput, user, profile?.first_name, profile?.last_name, savingName, refreshProfile]);

  useEffect(() => { saveNameRef.current = saveName; }, [saveName]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !editingName) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const wrap = nameWrapRef.current as unknown as HTMLElement | null;
      if (wrap && target && wrap.contains(target)) return;
      saveNameRef.current();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingName]);

  // ── Avatar upload ────────────────────────────────────────────────
  const uploadAvatarFile = useCallback(async (file: File) => {
    if (!user) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
      if (uploadError) { setAvatarError(uploadError.message ?? 'Upload failed.'); return; }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { data: updated, error: updateError } = await supabase
        .from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
        .select('id, avatar_url').maybeSingle();
      if (updateError) { setAvatarError(updateError.message ?? 'Could not link photo to profile.'); return; }
      if (!updated) { setAvatarError('Update was blocked. Please sign in again.'); return; }
      await refreshProfile();
    } catch (err: any) { setAvatarError(err?.message ?? 'Upload failed.'); }
    finally { setUploadingAvatar(false); }
  }, [user, refreshProfile]);

  const uploadAvatarUri = useCallback(async (uri: string) => {
    if (!user) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      // Compress to JPEG first (handles HEIC conversion and size reduction)
      let uploadUri = uri;
      let contentType = 'image/jpeg';
      if (Platform.OS !== 'web') {
        try {
          const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
          const result = await manipulateAsync(uri, [{ resize: { width: 800 } }], { compress: 0.80, format: SaveFormat.JPEG });
          uploadUri = result.uri;
        } catch {}
      }

      const path = `${user.id}/avatar-${Date.now()}.jpg`;

      // XHR reads local file:// and ph:// URIs correctly on React Native.
      // fetch(uri).blob() and the Supabase JS client both return 0-byte blobs for local URIs.
      const blob: Blob = await new Promise((resolve, reject) => {
        if (uploadUri.startsWith('http://') || uploadUri.startsWith('https://')) {
          fetch(uploadUri).then(r => r.blob()).then(resolve).catch(reject);
          return;
        }
        const xhr = new XMLHttpRequest();
        xhr.responseType = 'blob';
        xhr.onload = () => resolve(xhr.response as Blob);
        xhr.onerror = () => reject(new Error('Could not read photo file.'));
        xhr.open('GET', uploadUri);
        xhr.send();
      });

      await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAvatarError('Session expired — please sign in again.'); return; }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const response = await fetch(`${supabaseUrl}/storage/v1/object/avatars/${path}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        body: blob,
      });
      if (!response.ok) {
        let body: any = null;
        try { body = await response.json(); } catch {}
        setAvatarError(body?.message ?? body?.error ?? `Upload failed (HTTP ${response.status}).`);
        return;
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { data: updated, error: updateError } = await supabase
        .from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
        .select('id, avatar_url').maybeSingle();
      if (updateError) { setAvatarError(updateError.message ?? 'Could not link photo to profile.'); return; }
      if (!updated) { setAvatarError('Update was blocked. Please sign in again.'); return; }
      await refreshProfile();
    } catch (err: any) { setAvatarError(err?.message ?? 'Upload failed.'); }
    finally { setUploadingAvatar(false); }
  }, [user, refreshProfile]);

  const handlePickAvatar = useCallback(async () => {
    if (!user || uploadingAvatar) return;
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Photo Library Access Required',
          'Allow access to your photo library in Settings to upload a profile photo.',
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        void uploadAvatarUri(result.assets[0].uri);
      }
      return;
    }
    // Web: file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void uploadAvatarFile(file);
      input.remove();
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }, [user, uploadingAvatar, uploadAvatarFile, uploadAvatarUri]);

  // ── Change Password ──────────────────────────────────────────────
  const openChangePw = () => {
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    setPwError(null); setPwSuccess(false);
    setShowChangePw(true);
    setShowChangeEmail(false);
  };

  const handleSavePassword = async () => {
    if (!user?.email) return;
    setPwError(null);
    if (!currentPw) { setPwError('Enter your current password.'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('New passwords do not match.'); return; }
    setSavingPw(true);
    try {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPw });
      if (verifyErr) { setPwError('Current password is incorrect.'); return; }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) { setPwError(updateErr.message ?? 'Could not update password.'); return; }
      setPwSuccess(true);
      setTimeout(() => { setShowChangePw(false); setPwSuccess(false); }, 2000);
    } finally { setSavingPw(false); }
  };

  // ── Change Email ─────────────────────────────────────────────────
  const openChangeEmail = () => {
    setNewEmail('');
    setEmailError(null); setEmailSuccess(false);
    setShowChangeEmail(true);
    setShowChangePw(false);
  };

  const handleSaveEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) { setEmailError('Enter a valid email address.'); return; }
    setSavingEmail(true);
    setEmailError(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) { setEmailError(error.message ?? 'Could not update email.'); return; }
      setEmailSuccess(true);
      setTimeout(() => { setShowChangeEmail(false); setEmailSuccess(false); }, 3500);
    } finally { setSavingEmail(false); }
  };

  // ── Reset Points ─────────────────────────────────────────────────
  const handleResetPoints = async () => {
    if (!couple?.id) return;
    setResetting(true);
    logger.log('[POINTS_RESET_START]', couple.id);
    try {
      const eventsResult = await supabase.from('point_events').delete().eq('couple_id', couple.id);
      logger.log('[POINTS_RESET_RESULT] point_events delete', eventsResult);
      if (eventsResult.error) throw eventsResult.error;

      const scoresResult = await supabase.from('scores').update({ points: 0 }).eq('couple_id', couple.id);
      logger.log('[POINTS_RESET_RESULT] scores update', scoresResult);
      if (scoresResult.error) throw scoresResult.error;

      const monthlyResult = await supabase.from('monthly_scores').delete().eq('couple_id', couple.id);
      logger.log('[POINTS_RESET_RESULT] monthly_scores delete', monthlyResult);
      if (monthlyResult.error) throw monthlyResult.error;

      const { data: pointsData, error: pointsError } = await supabase
        .from('scores')
        .select('*')
        .eq('couple_id', couple.id);
      logger.log('[POINTS_AFTER_RESET]', pointsError ?? pointsData);

      notifyScoreReset();
      setResetDone(true);
      loadStats();
      setTimeout(() => { setResetPointsOpen(false); setResetDone(false); }, 1800);
    } catch (err: any) {
      console.error('[POINTS_RESET_ERROR]', JSON.stringify(err), err);
      Alert.alert('Reset Failed', 'Could not reset points. Please try again.\n\nDetails: ' + (err?.message ?? String(err)));
    } finally { setResetting(false); }
  };

  const handleContactSupport = async () => {
    const url = 'mailto:support@warmmeup.app?subject=Support%20Request';
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Contact Support', 'Email us at support@warmmeup.app');
      }
    } catch {
      Alert.alert('Contact Support', 'Email us at support@warmmeup.app');
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated. Please sign in again.');

      const { error } = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) throw new Error(error.message ?? 'Could not delete account. Please try again.');

      // Sign out locally and navigate away
      await supabase.auth.signOut();
      router.replace('/(auth)/welcome');
    } catch (err: any) {
      setDeleteAccountError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setDeletingAccount(false);
    }
  };

  if (loading) {
    return (
      <AppShell scrollable={false}>
        <View style={styles.loadingContainer}><ActivityIndicator color="#FF2E8A" size="large" /></View>
      </AppShell>
    );
  }

  return (
    <>
      <AppShell scrollable={false} constrainContent>
        <BrandHeader
          avatarName={profile?.display_name ?? ''}
          avatarUri={profile?.avatar_url ?? null}
          rightSlot={
            <View style={styles.headerRight}>
              {isAdmin && (
                <TouchableOpacity style={styles.adminBadge} onPress={() => router.push('/(admin)')} activeOpacity={0.7}>
                  <Shield color="#FF2E8A" size={14} strokeWidth={2} />
                  <AppText style={styles.adminBadgeText}>Admin</AppText>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
                <ChevronLeft color={colors.textSecondary} size={24} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          }
        />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[styles.scroll, { paddingHorizontal: contentPadding }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Profile / Settings tab switcher */}
          <View style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab('profile')}
              activeOpacity={0.8}
            >
              {activeTab === 'profile' && (
                <LinearGradient
                  colors={Gradient.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: Radius.pill }]}
                />
              )}
              <AppText style={[styles.tabLabel, { color: activeTab === 'profile' ? '#fff' : colors.textMuted }]}>
                Profile
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab('settings')}
              activeOpacity={0.8}
            >
              {activeTab === 'settings' && (
                <LinearGradient
                  colors={Gradient.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: Radius.pill }]}
                />
              )}
              <AppText style={[styles.tabLabel, { color: activeTab === 'settings' ? '#fff' : colors.textMuted }]}>
                Settings
              </AppText>
            </TouchableOpacity>
          </View>

          {activeTab === 'profile' ? (
            <ProfileTab
              couple={couple}
              partnerProfile={partnerProfile}
              profile={profile}
              user={user}
              isAdmin={isAdmin}
              isSuperAdmin={isSuperAdmin}
              subscriptionInfo={subscriptionInfo}
              streak={streak}
              momentsToday={momentsToday}
              totalPoints={totalPoints}
              diceRolls={diceRolls}
              optimisticPointsEnabled={optimisticPointsEnabled}
              optimisticStreaksEnabled={optimisticStreaksEnabled}
              copied={copied}
              codeRefreshing={codeRefreshing}
              editingName={editingName}
              firstNameInput={firstNameInput}
              lastNameInput={lastNameInput}
              savingName={savingName}
              nameError={nameError}
              nameWrapRef={nameWrapRef}
              uploadingAvatar={uploadingAvatar}
              avatarError={avatarError}
              onCopyCode={handleCopyCode}
              onShareCode={handleShareCode}
              onShareApp={shareApp}
              onRefreshCode={handleRefreshCode}
              onInviteCardPress={handleInviteCardPress}
              onManagePairing={() => setShowLeaveSheet(true)}
              onCancelInvite={() => setShowCancelInviteSheet(true)}
              onEnterCode={() => { setEnterCode(''); setEnterCodeError(null); setShowEnterCodeSheet(true); }}
              onPickAvatar={handlePickAvatar}
              onStartEditName={startEditName}
              onSaveName={saveName}
              onCancelEditName={cancelEditName}
              onResetPoints={() => setResetPointsOpen(true)}
              onSignOut={signOut}
              onAnniversaryPress={(existing) => {
                setAnniversaryDate(existing);
                setAnnivMonth(existing ? String(existing.getMonth() + 1).padStart(2, '0') : '');
                setAnnivDay(existing ? String(existing.getDate()).padStart(2, '0') : '');
                setAnnivYear(existing ? String(existing.getFullYear()) : '');
                setAnniversaryError(null);
                setShowAnniversarySheet(true);
              }}
              onSetFirstName={setFirstNameInput}
              onSetLastName={setLastNameInput}
            />
          ) : (
            <SettingsTab
              user={user}
              s={s}
              couple={couple}
              bioAvailable={bioAvailable}
              biometricLabel={biometricLabel}
              bioAuthenticate={bioAuthenticate}
              update={update}
              optimisticPointsEnabled={optimisticPointsEnabled}
              optimisticStreaksEnabled={optimisticStreaksEnabled}
              onTogglePoints={handleTogglePoints}
              onToggleStreaks={handleToggleStreaks}
              showChangeEmail={showChangeEmail}
              newEmail={newEmail}
              emailError={emailError}
              emailSuccess={emailSuccess}
              savingEmail={savingEmail}
              onOpenChangeEmail={openChangeEmail}
              onCloseChangeEmail={() => setShowChangeEmail(false)}
              onSetNewEmail={setNewEmail}
              onSaveEmail={handleSaveEmail}
              showChangePw={showChangePw}
              currentPw={currentPw}
              newPw={newPw}
              confirmPw={confirmPw}
              pwError={pwError}
              pwSuccess={pwSuccess}
              savingPw={savingPw}
              onOpenChangePw={openChangePw}
              onCloseChangePw={() => setShowChangePw(false)}
              onSetCurrentPw={setCurrentPw}
              onSetNewPw={setNewPw}
              onSetConfirmPw={setConfirmPw}
              onSavePassword={handleSavePassword}
              onShowVaultSecurityInfo={() => setShowVaultSecurityInfo(true)}
              onShowDiscreetInfo={() => setShowDiscreetInfo(true)}
              onShowCommunityGuidelines={() => setShowCommunityGuidelines(true)}
              onShowTerms={() => setShowTerms(true)}
              onShowPrivacyPolicy={() => setShowPrivacyPolicy(true)}
              feedbackEnabled={feedbackEnabled}
              onSendFeedback={() => setShowFeedbackSheet(true)}
              onShareApp={shareApp}
              subscriptionInfo={subscriptionInfo}
              onRestorePurchase={handleRestorePurchase}
              onDeleteAccount={() => { setDeleteAccountError(null); setDeleteAccountStep(1); setDeleteAccountOpen(true); }}
              onContactSupport={handleContactSupport}
              onVaultSectionLayout={(y) => setVaultSectionY(y)}
            />
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
        </KeyboardAvoidingView>
      </AppShell>

      {/* ── Reset Points Modal ────────────────────────────────────── */}
      <Modal visible={resetPointsOpen} transparent animationType="fade" onRequestClose={() => { if (!resetting) setResetPointsOpen(false); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.dataModalCard, { backgroundColor: colors.card, borderColor: 'rgba(255,179,71,0.20)' }]}>
            {!resetDone ? (
              <>
                <View style={[styles.dataModalIcon, { backgroundColor: 'rgba(255,179,71,0.12)' }]}>
                  <RotateCcw color="#FFB347" size={28} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.dataModalTitle, { color: colors.text }]}>Reset All Sparks?</AppText>
                <AppText style={[styles.dataModalBody, { color: colors.textSecondary }]}>
                  This will reset all Sparks back to zero — including all-time history. It's like starting the game over fresh!{'\n\n'}Your content, vault, and settings are not affected. This cannot be undone.
                </AppText>
                <View style={styles.dataModalBtns}>
                  <TouchableOpacity style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle }]} onPress={() => setResetPointsOpen(false)} activeOpacity={0.7} disabled={resetting}>
                    <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Cancel</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dataModalResetBtn} onPress={handleResetPoints} activeOpacity={0.8} disabled={resetting}>
                    {resetting ? <ActivityIndicator color="#fff" size="small" /> : <AppText style={styles.dataModalResetBtnText}>Yes, Reset</AppText>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.dataModalIcon, { backgroundColor: 'rgba(51,209,122,0.12)' }]}>
                  <Check color="#33D17A" size={28} strokeWidth={2} />
                </View>
                <AppText style={[styles.dataModalTitle, { color: colors.text }]}>Sparks Reset</AppText>
                <AppText style={[styles.dataModalBody, { color: colors.textSecondary }]}>Both scores are back to zero. Ready for a fresh start!</AppText>
                <TouchableOpacity style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle, marginTop: 4 }]} onPress={() => { setResetPointsOpen(false); setResetDone(false); }} activeOpacity={0.7}>
                  <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Done</AppText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <BottomSheet
        visible={showVaultSecurityInfo}
        onClose={() => setShowVaultSecurityInfo(false)}
        title="Your Vault is Private"
        subtitle="Here is how your photos and videos are kept safe."
        scrollable
      >
        <View style={styles.secInfoContent}>
          {[
            {
              icon: <Lock color="#FF2E8A" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,46,138,0.10)',
              title: 'Private Storage',
              desc: 'Your media lives in a locked, private vault. There is no public link anyone can guess or stumble upon — files are completely hidden from the internet.',
            },
            {
              icon: <Clock color="#FF8A3D" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,138,61,0.10)',
              title: 'Links Expire in 1 Hour',
              desc: 'Every time a photo or video loads, the app generates a temporary access link. That link stops working after one hour — so even if intercepted, it quickly becomes useless.',
            },
            {
              icon: <Users color="#69A7FF" size={20} strokeWidth={1.8} />,
              bg: 'rgba(105,167,255,0.10)',
              title: 'Just the Two of You',
              desc: 'Server-level security rules ensure only you and your partner can ever access your vault. These rules live on our servers, not just the app, so they cannot be bypassed.',
            },
            {
              icon: <Smartphone color="#33D17A" size={20} strokeWidth={1.8} />,
              bg: 'rgba(51,209,122,0.10)',
              title: 'Never Saved to Your Device',
              desc: 'Photos and videos taken inside the app go straight to the vault. They are never written to your camera roll or stored anywhere on your phone.',
            },
            {
              icon: <ScanFace color="#FFB347" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,179,71,0.10)',
              title: 'Face ID Lock',
              desc: 'You can require biometric verification (Face ID or fingerprint) before the vault even opens. Turn this on in your Account settings for an extra layer of protection.',
            },
            {
              icon: <Shield color="#FF5A3D" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,90,61,0.10)',
              title: 'Screenshot Detection',
              desc: 'When screenshots are turned off for an item, the app detects if your partner takes one and sends you a notification immediately.',
            },
            {
              icon: <Sliders color="rgba(255,255,255,0.65)" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,255,255,0.06)',
              title: 'Your Rules, Your Control',
              desc: 'You decide whether each upload can be screenshotted, saved, or shared. Defaults are set in your Profile and apply to every new item you add.',
            },
          ].map(({ icon, bg, title, desc }) => (
            <View key={title} style={[styles.secInfoRow, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={[styles.secInfoIcon, { backgroundColor: bg }]}>{icon}</View>
              <View style={styles.secInfoText}>
                <AppText style={[styles.secInfoTitle, { color: colors.text }]}>{title}</AppText>
                <AppText style={[styles.secInfoDesc, { color: colors.textSecondary }]}>{desc}</AppText>
              </View>
            </View>
          ))}
          <View style={[styles.secInfoFooter, { backgroundColor: 'rgba(255,46,138,0.06)', borderColor: 'rgba(255,46,138,0.18)' }]}>
            <Shield color="#FF2E8A" size={14} strokeWidth={2} />
            <AppText style={[styles.secInfoFooterText, { color: colors.textSecondary }]}>
              Your moments are safe. We built this app to protect your privacy at every step.
            </AppText>
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={showDiscreetInfo}
        onClose={() => setShowDiscreetInfo(false)}
        title="Discreet Notifications"
        subtitle="Here's what a notification looks like with this setting on."
      >
        <View style={styles.previewWrap}>
          <View style={[styles.notifCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <View style={styles.notifAppRow}>
              <View style={styles.notifAppIconWrap}>
                <WarmupLogo size={20} />
              </View>
              <AppText style={[styles.notifAppName, { color: colors.textMuted }]}>WARM ME UP</AppText>
              <AppText style={[styles.notifTime, { color: colors.textMuted }]}>now</AppText>
            </View>
            <AppText style={[styles.notifTitle, { color: colors.text }]}>
              {s?.notification_copy ?? 'Something new is waiting'}
            </AppText>
            <AppText style={[styles.notifBody, { color: colors.textSecondary }]}>
              Tap to open
            </AppText>
          </View>
          <AppText style={[styles.previewNote, { color: colors.textMuted }]}>
            No message content or previews are ever shown — just a discreet nudge.
          </AppText>
        </View>
      </BottomSheet>

      <TermsModal visible={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyModal visible={showPrivacyPolicy} onClose={() => setShowPrivacyPolicy(false)} />
      <FeedbackSheet visible={showFeedbackSheet} onClose={() => setShowFeedbackSheet(false)} />
      <CommunityGuidelinesModal
        visible={showCommunityGuidelines}
        onClose={() => setShowCommunityGuidelines(false)}
      />
      <LeavePartnerSheet
        visible={showLeaveSheet}
        onClose={() => setShowLeaveSheet(false)}
        partnerName={partnerProfile?.display_name ?? 'your partner'}
      />

      {/* Cancel pending invite confirmation sheet */}
      <BottomSheet visible={showCancelInviteSheet} onClose={() => { if (!cancellingInvite) setShowCancelInviteSheet(false); }}>
        <View style={styles.cancelInviteSheet}>
          <View style={styles.cancelInviteIconWrap}>
            <X color="#FF5A5F" size={24} strokeWidth={2} />
          </View>
          <AppText style={[styles.cancelInviteSheetTitle, { color: colors.text }]}>Cancel invite?</AppText>
          <AppText style={[styles.cancelInviteSheetBody, { color: colors.textSecondary }]}>
            Your partner won't be able to use this code. You can generate a new one any time.
          </AppText>
          <TouchableOpacity
            style={[styles.cancelInviteConfirmBtn, cancellingInvite && { opacity: 0.6 }]}
            onPress={handleCancelInvite}
            activeOpacity={0.8}
            disabled={cancellingInvite}
          >
            {cancellingInvite
              ? <ActivityIndicator color="#fff" size="small" />
              : <AppText style={styles.cancelInviteConfirmText}>Yes, cancel invite</AppText>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelInviteKeepBtn}
            onPress={() => setShowCancelInviteSheet(false)}
            activeOpacity={0.7}
            disabled={cancellingInvite}
          >
            <AppText style={[styles.cancelInviteKeepText, { color: colors.textSecondary }]}>Keep it</AppText>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Enter partner's code sheet */}
      <BottomSheet
        visible={showEnterCodeSheet}
        onClose={() => { if (!enterCodeLoading) { setShowEnterCodeSheet(false); setEnterCode(''); setEnterCodeError(null); } }}
        title="Enter Partner's Code"
        subtitle="Ask your partner for their 6-character invite code"
      >
        <View style={styles.enterCodeSheet}>
          <AppTextInput
            style={[styles.enterCodeInput, { color: colors.text, borderColor: enterCodeError ? '#FF5A5F' : colors.borderSubtle, backgroundColor: colors.card }]}
            value={enterCode}
            onChangeText={(t: string) => { setEnterCode(t.toUpperCase()); setEnterCodeError(null); }}
            placeholder="e.g. T9RRG6"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
          />
          {enterCodeError ? (
            <AppText style={styles.enterCodeError}>{enterCodeError}</AppText>
          ) : null}
          <TouchableOpacity
            style={[styles.enterCodeBtn, (!enterCode.trim() || enterCodeLoading) && { opacity: 0.5 }]}
            onPress={handleJoinWithCode}
            activeOpacity={0.85}
            disabled={!enterCode.trim() || enterCodeLoading}
          >
            <LinearGradient
              colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.enterCodeBtnGrad}
            >
              {enterCodeLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <AppText style={styles.enterCodeBtnText}>Connect</AppText>
              }
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Anniversary date sheet */}
      <BottomSheet
        visible={showAnniversarySheet}
        onClose={() => { if (!savingAnniversary) { setShowAnniversarySheet(false); setAnniversaryError(null); } }}
        title="Anniversary Date"
        subtitle="When did your relationship begin?"
      >
        <View style={styles.enterCodeSheet}>
          <View style={styles.dateFieldRow}>
            <View style={styles.dateFieldCol}>
              <AppText style={[styles.dateFieldLabel, { color: colors.textMuted }]}>Month</AppText>
              <TextInput
                style={[styles.dateFieldInput, { borderColor: anniversaryError ? '#FF5A5F' : colors.borderSubtle, backgroundColor: colors.card, color: colors.text }]}
                value={annivMonth}
                onChangeText={(v) => { setAnnivMonth(v.replace(/[^0-9]/g, '').slice(0, 2)); setAnniversaryError(null); }}
                placeholder="MM"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={2}
                returnKeyType="next"
              />
            </View>
            <AppText style={[styles.dateFieldSlash, { color: colors.textMuted }]}>/</AppText>
            <View style={styles.dateFieldCol}>
              <AppText style={[styles.dateFieldLabel, { color: colors.textMuted }]}>Day</AppText>
              <TextInput
                style={[styles.dateFieldInput, { borderColor: anniversaryError ? '#FF5A5F' : colors.borderSubtle, backgroundColor: colors.card, color: colors.text }]}
                value={annivDay}
                onChangeText={(v) => { setAnnivDay(v.replace(/[^0-9]/g, '').slice(0, 2)); setAnniversaryError(null); }}
                placeholder="DD"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={2}
                returnKeyType="next"
              />
            </View>
            <AppText style={[styles.dateFieldSlash, { color: colors.textMuted }]}>/</AppText>
            <View style={styles.dateFieldColWide}>
              <AppText style={[styles.dateFieldLabel, { color: colors.textMuted }]}>Year</AppText>
              <TextInput
                style={[styles.dateFieldInput, { borderColor: anniversaryError ? '#FF5A5F' : colors.borderSubtle, backgroundColor: colors.card, color: colors.text }]}
                value={annivYear}
                onChangeText={(v) => { setAnnivYear(v.replace(/[^0-9]/g, '').slice(0, 4)); setAnniversaryError(null); }}
                placeholder="YYYY"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={4}
                returnKeyType="done"
              />
            </View>
          </View>
          {anniversaryError ? (
            <AppText style={styles.enterCodeError}>{anniversaryError}</AppText>
          ) : null}
          <TouchableOpacity
            style={[styles.enterCodeBtn, savingAnniversary && { opacity: 0.5 }]}
            onPress={handleSaveAnniversary}
            activeOpacity={0.85}
            disabled={savingAnniversary}
          >
            <LinearGradient
              colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.enterCodeBtnGrad}
            >
              {savingAnniversary
                ? <ActivityIndicator color="#fff" size="small" />
                : <AppText style={styles.enterCodeBtnText}>Save</AppText>
              }
            </LinearGradient>
          </TouchableOpacity>
          {couple?.anniversary_date && (
            <TouchableOpacity
              onPress={handleClearAnniversary}
              activeOpacity={0.7}
              disabled={savingAnniversary}
              style={{ paddingVertical: Spacing.sm, alignItems: 'center' }}
            >
              <AppText style={[styles.enterCodeError, { color: colors.textMuted }]}>Remove date</AppText>
            </TouchableOpacity>
          )}
        </View>
      </BottomSheet>

      {/* ── Delete Account Modal ───────────────────────────────────── */}
      <Modal
        visible={deleteAccountOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!deletingAccount) { setDeleteAccountOpen(false); setDeleteAccountStep(1); } }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.dataModalCard, { backgroundColor: colors.card, borderColor: 'rgba(255,59,48,0.18)' }]}>
            {deleteAccountStep === 1 ? (
              <>
                <View style={[styles.dataModalIcon, { backgroundColor: 'rgba(255,59,48,0.10)' }]}>
                  <UserX color="#FF3B30" size={28} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.dataModalTitle, { color: colors.text }]}>Delete My Account?</AppText>
                <AppText style={[styles.dataModalBody, { color: colors.textSecondary }]}>
                  This will permanently delete your account, profile, partner connection, messages, vault items, and all app data. This cannot be undone.
                </AppText>
                <View style={styles.dataModalBtns}>
                  <TouchableOpacity
                    style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle }]}
                    onPress={() => { setDeleteAccountOpen(false); setDeleteAccountStep(1); }}
                    activeOpacity={0.7}
                  >
                    <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Cancel</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dataModalDeleteBtn}
                    onPress={() => { setDeleteAccountError(null); setDeleteAccountStep(2); }}
                    activeOpacity={0.8}
                  >
                    <AppText style={styles.dataModalDeleteBtnText}>Continue</AppText>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.dataModalIcon, { backgroundColor: 'rgba(255,59,48,0.15)' }]}>
                  <AlertTriangle color="#FF3B30" size={28} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.dataModalTitle, { color: colors.text }]}>Are You Sure?</AppText>
                <AppText style={[styles.dataModalBody, { color: colors.textSecondary }]}>
                  This is permanent. Once deleted, your account, all messages, vault content, and connection with your partner cannot be recovered.
                </AppText>
                {deleteAccountError && (
                  <AppText style={[styles.inlineError, { color: colors.danger, textAlign: 'center' }]}>
                    {deleteAccountError}
                  </AppText>
                )}
                <View style={styles.dataModalBtns}>
                  <TouchableOpacity
                    style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle }]}
                    onPress={() => setDeleteAccountStep(1)}
                    disabled={deletingAccount}
                    activeOpacity={0.7}
                  >
                    <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Go Back</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dataModalDeleteBtn}
                    onPress={handleDeleteAccount}
                    disabled={deletingAccount}
                    activeOpacity={0.8}
                  >
                    {deletingAccount
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <AppText style={styles.dataModalDeleteBtnText}>Delete Forever</AppText>
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 40 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,46,138,0.10)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,46,138,0.25)',
  },
  adminBadgeText: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#FF2E8A' },
  tabBar: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    borderWidth: 1,
    padding: 4,
    marginBottom: Spacing.lg,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
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
  statsWrap: { marginBottom: Spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, marginBottom: Spacing.md,
  },
  heartWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1 },
  partnerName: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold', marginTop: 2 },
  inviteCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, marginBottom: Spacing.md, gap: Spacing.md },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  inviteHint: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', marginTop: 2 },
  codeBox: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, alignItems: 'center', position: 'relative' },
  codeRefreshBtn: { position: 'absolute', right: Spacing.md, top: '50%', marginTop: -10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontSize: 22, fontFamily: 'Inter-Bold', letterSpacing: 6 },
  inviteActions: { flexDirection: 'row', gap: Spacing.sm },
  inviteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: Radius.pill, borderWidth: 1, paddingVertical: 11,
  },
  inviteBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  menuCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.md },
  sectionLabel: { fontSize: FontSize.label, fontFamily: 'Inter-SemiBold', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: Spacing.sm },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.card, borderBottomWidth: 1 },
  menuIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  menuText: { flex: 1, fontSize: FontSize.body, fontFamily: 'Inter-Medium' },
  section: { marginBottom: Spacing.lg },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2 },
  sectionCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  ownerNote: { paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1 },
  ownerNoteText: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 17, fontStyle: 'italic' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 15,
  },
  rowLeft: { flex: 1, gap: 2, marginRight: Spacing.md },
  rowLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
  rowSub: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 16 },
  secInfoContent: { paddingBottom: Spacing.lg, gap: Spacing.sm },
  secInfoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md,
  },
  secInfoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  secInfoText: { flex: 1, gap: 4 },
  secInfoTitle: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', lineHeight: 18 },
  secInfoDesc: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 19 },
  secInfoFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginTop: Spacing.xs },
  secInfoFooterText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 18, fontStyle: 'italic' },
  previewWrap: { paddingHorizontal: 4, paddingBottom: 8 },
  notifCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14 },
  notifAppRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  notifAppIconWrap: { width: 20, height: 20, borderRadius: 5, overflow: 'hidden' },
  notifAppName: { flex: 1, fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 0.5 },
  notifTime: { fontSize: 11, fontFamily: 'Inter-Regular' },
  notifTitle: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', marginBottom: 2 },
  notifBody: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular' },
  previewNote: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 18, textAlign: 'center' },
  inlineForm: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  inlineFieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12,
  },
  inlineFieldLabel: { fontSize: FontSize.xs, fontFamily: 'Inter-Medium', width: 114 },
  inlineFieldInput: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'right' },
  inlineError: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', marginTop: 4, marginBottom: 2 },
  inlineNote: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 17, marginTop: 8, marginBottom: 8 },
  inlineSubmitBtn: { borderRadius: Radius.pill, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 44 },
  inlineSubmitText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  inlineSuccess: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  inlineSuccessText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  pinModalCard: {
    borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center', width: '100%', maxWidth: 360,
    gap: Spacing.sm, borderWidth: 1, borderColor: 'rgba(255,46,138,0.18)',
  },
  pinModalClose: { position: 'absolute', top: Spacing.md, right: Spacing.md, padding: 6 },
  pinModalIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  pinModalTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold', textAlign: 'center' },
  pinModalSub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20 },
  pinDots: { flexDirection: 'row', gap: Spacing.md, marginVertical: Spacing.sm },
  pinDot: { width: 14, height: 14, borderRadius: 7 },
  pinError: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', textAlign: 'center' },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: Spacing.sm, marginTop: 4 },
  numKey: {
    width: 82, height: 66, borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  numKeyEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  numKeyText: { color: '#fff', fontSize: FontSize.xxl, fontFamily: 'Inter-Medium' },
  numKeyDelete: { fontSize: FontSize.xl },
  forgotPinBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  forgotPinText: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', textDecorationLine: 'underline' },
  pinRecoverField: { width: '100%', borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 4, marginTop: 4 },
  pinRecoverInput: { fontSize: FontSize.body, fontFamily: 'Inter-Regular', paddingVertical: 12 },
  pinRecoverBtn: { width: '100%', borderRadius: Radius.pill, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 48 },
  pinRecoverBtnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  dataModalCard: { borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md, width: '100%', maxWidth: 360, borderWidth: 1 },
  dataModalIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  dataModalTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold', textAlign: 'center' },
  dataModalBody: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 21 },
  dataModalBtns: { flexDirection: 'row', gap: Spacing.sm, width: '100%', marginTop: 4 },
  dataModalCancelBtn: { flex: 1, borderRadius: Radius.pill, borderWidth: 1, paddingVertical: 13, alignItems: 'center' },
  dataModalCancelText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  dataModalDeleteBtn: { flex: 1, borderRadius: Radius.pill, backgroundColor: '#FF3B30', paddingVertical: 13, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  dataModalDeleteBtnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  dataModalResetBtn: { flex: 1, borderRadius: Radius.pill, backgroundColor: '#FFB347', paddingVertical: 13, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  dataModalResetBtnText: { color: '#1a1a1a', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  dataOptionBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card },
  dataOptionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dataOptionText: { flex: 1, gap: 3 },
  dataOptionTitle: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold' },
  dataOptionSub: { fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 17 },
  reportInput: { width: '100%', borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', minHeight: 100, lineHeight: 20 },
  footerLogoWrap: { alignItems: 'center', paddingTop: Spacing.xxl, paddingBottom: Spacing.xl, opacity: 0.7 },
  footerLogo: { width: 320, height: 160 },
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
  codeExpiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,90,90,0.10)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,90,90,0.25)',
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    marginBottom: 4,
  },
  codeExpiredText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-SemiBold',
    color: '#FF5A5F',
  },
  cancelInviteSheet: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  cancelInviteIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,90,90,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cancelInviteSheetTitle: {
    fontSize: FontSize.xl,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  cancelInviteSheetBody: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: Spacing.sm,
  },
  cancelInviteConfirmBtn: {
    width: '100%',
    borderRadius: Radius.pill,
    backgroundColor: '#FF5A5F',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 4,
  },
  cancelInviteConfirmText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  cancelInviteKeepBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelInviteKeepText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
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
  enterCodeSheet: {
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  enterCodeInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    letterSpacing: 6,
    textAlign: 'center',
  },
  enterCodeError: {
    color: '#FF5A5F',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
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
  enterCodeBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    width: '100%',
  },
  enterCodeBtnGrad: {
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: Radius.pill,
  },
  enterCodeBtnText: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
    alignSelf: 'center',
  },
  debugRowText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#2a2a2f',
    textDecorationLine: 'underline',
    textDecorationColor: '#2a2a2f',
  },
  dateFieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  dateFieldCol: {
    flex: 1,
    gap: 6,
  },
  dateFieldColWide: {
    flex: 1.5,
    gap: 6,
  },
  dateFieldLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateFieldSlash: {
    fontSize: FontSize.h2,
    fontFamily: 'Inter-Bold',
    paddingBottom: 12,
  },
  dateFieldInput: {
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
});
