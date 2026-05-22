import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Share,
  Platform,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, UserPlus, Lock, X, Copy, RefreshCw } from 'lucide-react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import {
  generateInviteCode,
  codeExpiresAt,
  isCodeExpired,
  validateCodeFormat,
  savePendingCode,
} from '@/lib/inviteCode';

const DEEP_LINK_SCHEME = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME ?? 'warmup';
const JOIN_COOLDOWN_MS = 3000;

type ActiveModal = 'invite' | 'join' | null;

function HeartOutline({
  size,
  gradientId,
  colorA,
  colorB,
}: {
  size: number;
  gradientId: string;
  colorA: string;
  colorB: string;
}) {
  return (
    <Svg width={size} height={size * 0.92} viewBox="0 0 100 92">
      <Defs>
        <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colorA} />
          <Stop offset="1" stopColor={colorB} />
        </SvgLinearGradient>
      </Defs>
      <Path
        d="M50 85 C50 85 8 54 8 27 C8 14 18 5 30 5 C39 5 46 10 50 18 C54 10 61 5 70 5 C82 5 92 14 92 27 C92 54 50 85 50 85 Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="7.5"
        fill="none"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function PairScreen() {
  const router = useRouter();
  const { prefilledCode } = useLocalSearchParams<{ prefilledCode?: string }>();
  const { user, couple, refreshCouple, settings } = useAuth();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const insets = useSafeAreaInsets();
  const headingSize = Math.min(Math.round(width * 0.086), 36);
  const codeFontSize = Math.min(Math.round((width - 64) / 7.5), 40);
  const codeLetterSpacing = Math.min(Math.round(codeFontSize * 0.22), 10);
  const glowWidth = Math.min(width - Spacing.xl * 2, 420);
  const scrollPaddingTop = Math.max(Math.round(height * 0.08), 56);
  const heartsHeight = Math.min(Math.round(height * 0.22), 200);
  const heartSize = Math.round(heartsHeight * 0.68);
  const heartOverlap = -Math.round(heartSize * 0.34);
  const minSheetHeight = Math.round(height * 0.52);
  const isAuthed = !!user;

  const centerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' as const }
    : {};

  const [myCode, setMyCode] = useState('');
  const [joinCode, setJoinCode] = useState(prefilledCode ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(prefilledCode ? 'join' : null);
  const lastJoinAttemptRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    loadOrCreateCouple();
  }, [user]);

  useEffect(() => {
    if (!couple?.id) return;
    const interval = setInterval(async () => {
      await refreshCouple();
    }, 3000);
    return () => clearInterval(interval);
  }, [couple?.id]);

  useEffect(() => {
    if (couple?.user_b_id) {
      router.replace('/(app)/(tabs)');
    }
  }, [couple?.user_b_id]);

  const loadOrCreateCouple = async () => {
    if (!user) return;

    // If user already has a partner, skip straight to the app
    const { data: paired } = await supabase
      .from('couples')
      .select('id')
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .not('user_b_id', 'is', null)
      .maybeSingle();
    if (paired) {
      router.replace('/(app)/(tabs)');
      return;
    }

    // Use the solo couple already created by the signup trigger
    const { data: existing } = await supabase
      .from('couples')
      .select('*')
      .eq('user_a_id', user.id)
      .is('user_b_id', null)
      .maybeSingle();

    if (existing) {
      setMyCode(existing.invite_code);
    } else {
      // Fallback: no solo couple exists yet — create one
      const code = generateInviteCode();
      const { data: newCouple, error: insertError } = await supabase
        .from('couples')
        .insert({
          user_a_id: user.id,
          invite_code: code,
          active: true,
          invite_code_expires_at: codeExpiresAt(),
        })
        .select()
        .single();
      if (!insertError && newCouple) {
        setMyCode(newCouple.invite_code);
        await refreshCouple();
      }
    }
  };

  const handleCopy = async () => {
    const deepLink = `${DEEP_LINK_SCHEME}://invite/${myCode}`;
    const shareText = `Join me on Warm Me Up!\n\nTap to connect: ${deepLink}\n\nOr enter code: ${myCode}`;
    if (Platform.OS !== 'web') {
      await Share.share({ message: shareText, url: deepLink });
    } else {
      try {
        await navigator.clipboard.writeText(myCode);
      } catch {}
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRefreshCode = async () => {
    if (!couple?.id || refreshing || couple.user_b_id) return;
    setRefreshing(true);
    const newCode = generateInviteCode();
    const { error: updateError } = await supabase
      .from('couples')
      .update({ invite_code: newCode, invite_code_expires_at: codeExpiresAt() })
      .eq('id', couple.id);
    if (!updateError) {
      setMyCode(newCode);
    }
    setRefreshing(false);
  };

  const handleJoin = async () => {
    const normalized = joinCode.toUpperCase().trim();
    if (!normalized || !user) return;

    if (!validateCodeFormat(normalized)) {
      setError('Codes are 6 characters (letters and numbers). Double-check and try again.');
      return;
    }

    const now = Date.now();
    if (now - lastJoinAttemptRef.current < JOIN_COOLDOWN_MS) {
      setError('Please wait a moment before trying again.');
      return;
    }
    lastJoinAttemptRef.current = now;

    setError('');
    setLoading(true);
    try {
      // Prevent double-connecting
      const { data: existingPaired } = await supabase
        .from('couples')
        .select('id')
        .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
        .not('user_b_id', 'is', null)
        .maybeSingle();
      if (existingPaired) {
        setError("You're already connected to a partner.");
        return;
      }

      const { data: targetCouple } = await supabase
        .from('couples')
        .select('*')
        .eq('invite_code', normalized)
        .maybeSingle();

      if (!targetCouple) {
        setError('Invalid code. Check with your partner.');
        return;
      }
      if (targetCouple.user_a_id === user.id) {
        setError("That's your own code! Share it with your partner.");
        return;
      }
      if (isCodeExpired(targetCouple.invite_code_expires_at)) {
        setError('This code has expired. Ask your partner to generate a new one.');
        return;
      }
      if (targetCouple.user_b_id && targetCouple.user_b_id !== user.id) {
        setError('This code has already been used.');
        return;
      }

      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('couples')
        .update({ user_b_id: user.id, active: true, invite_code_used_at: now })
        .eq('id', targetCouple.id)
        .is('user_b_id', null);

      if (updateError) {
        // Re-fetch to provide an accurate error message
        const { data: refetched } = await supabase
          .from('couples')
          .select('user_b_id')
          .eq('id', targetCouple.id)
          .maybeSingle();
        if (refetched?.user_b_id && refetched.user_b_id !== user.id) {
          setError('This code was just used by someone else.');
        } else {
          setError('Something went wrong. Please try again.');
        }
        return;
      }

      // Stamp subscription_owner_id
      const { data: subA } = await supabase
        .from('subscriptions').select('id').eq('user_id', targetCouple.user_a_id).eq('status', 'active').maybeSingle();
      const { data: subB } = await supabase
        .from('subscriptions').select('id').eq('user_id', user.id).eq('status', 'active').maybeSingle();
      const subOwnerId = subA ? targetCouple.user_a_id : subB ? user.id : null;
      if (subOwnerId) {
        await supabase.from('couples').update({ subscription_owner_id: subOwnerId }).eq('id', targetCouple.id);
      }

      // Clean up User B's own solo placeholder (active or inactive)
      await supabase
        .from('couples')
        .delete()
        .eq('user_a_id', user.id)
        .is('user_b_id', null)
        .neq('id', targetCouple.id);

      await supabase.from('scores').upsert([
        { couple_id: targetCouple.id, user_id: targetCouple.user_a_id, points: 0 },
        { couple_id: targetCouple.id, user_id: user.id, points: 0 },
      ]);

      // Notify User A (fire-and-forget)
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/notify-partner`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ event_type: 'partner_joined', couple_id: targetCouple.id }),
        }).catch(() => {});
      }

      await refreshCouple();

      if (!settings?.celebration_seen) {
        const { data: partnerProf } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', targetCouple.user_a_id)
          .maybeSingle();
        router.replace({
          pathname: '/(auth)/paired-celebration',
          params: { partnerName: partnerProf?.display_name || '' },
        });
      } else {
        router.replace('/(app)/(tabs)');
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handlePreAuthJoin = async () => {
    const normalized = joinCode.toUpperCase().trim();
    if (!normalized) {
      setError('Please enter the code your partner sent you.');
      return;
    }
    if (!validateCodeFormat(normalized)) {
      setError('Codes are 6 characters (letters and numbers). Double-check and try again.');
      return;
    }

    const now = Date.now();
    if (now - lastJoinAttemptRef.current < JOIN_COOLDOWN_MS) {
      setError('Please wait a moment before trying again.');
      return;
    }
    lastJoinAttemptRef.current = now;

    setError('');
    setLoading(true);
    try {
      const { data: targetCouple } = await supabase
        .from('couples')
        .select('id, invite_code_expires_at, user_b_id')
        .eq('invite_code', normalized)
        .maybeSingle();

      if (!targetCouple) {
        setError('Invalid code. Check with your partner.');
        return;
      }
      if (isCodeExpired(targetCouple.invite_code_expires_at)) {
        setError('This code has expired. Ask your partner to generate a new one.');
        return;
      }
      if (targetCouple.user_b_id) {
        setError('This code has already been used.');
        return;
      }

      // Persist so the code survives OAuth redirects and app restarts
      await savePendingCode(normalized);
      router.push({ pathname: '/(auth)/register', params: { pendingCode: normalized } });
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthed) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#060406', '#0A060A', '#0E080E']}
          style={StyleSheet.absoluteFill}
        />

        <TouchableOpacity
          style={[styles.backBtn, { top: insets.top + 12 }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ChevronLeft color="rgba(255,255,255,0.75)" size={20} strokeWidth={2.2} />
        </TouchableOpacity>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingTop: scrollPaddingTop }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={centerStyle}>
              <View style={[styles.heartsWrap, { height: heartsHeight }]} pointerEvents="none">
                <View style={styles.heartsGlowWrap}>
                  <LinearGradient
                    colors={['transparent', 'rgba(255,80,30,0.22)', 'rgba(255,46,138,0.28)', 'rgba(255,80,30,0.22)', 'transparent']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[styles.heartsGlow, { width: glowWidth, height: glowWidth * 0.42 }]}
                  />
                </View>
                <View style={styles.heartsRow}>
                  <View style={[styles.heartContainer, { marginRight: heartOverlap, zIndex: 1 }]}>
                    <View style={styles.heartGlowOrange} />
                    <HeartOutline size={heartSize} gradientId="heartL2" colorA="#FFB347" colorB="#FF5A3D" />
                  </View>
                  <View style={[styles.heartContainer, { marginLeft: heartOverlap, zIndex: 2 }]}>
                    <View style={styles.heartGlowPink} />
                    <HeartOutline size={heartSize} gradientId="heartR2" colorA="#FF5A3D" colorB="#FF2E8A" />
                  </View>
                </View>
                <AppText style={[styles.sparkle, { top: 8, left: '22%', fontSize: 12 }]}>✦</AppText>
                <AppText style={[styles.sparkle, { top: 4, right: '20%', fontSize: 7 }]}>✦</AppText>
                <AppText style={[styles.sparkle, { bottom: 14, left: '14%', fontSize: 8 }]}>✦</AppText>
                <AppText style={[styles.sparkle, { bottom: 20, right: '15%', fontSize: 6 }]}>✦</AppText>
              </View>

              <AppText style={[styles.heading, { fontSize: headingSize }]}>Enter your{'\n'}partner's code</AppText>
              <AppText style={styles.sub}>Type in the invite code they sent you.</AppText>

              <View style={styles.inlineJoin}>
                <AppTextInput
                  style={[styles.codeInput, { fontSize: codeFontSize, letterSpacing: codeLetterSpacing }]}
                  value={joinCode}
                  onChangeText={(t) => { setJoinCode(t); setError(''); }}
                  placeholder="e.g. AB12CD"
                  placeholderTextColor="rgba(255,255,255,0.20)"
                  autoCapitalize="characters"
                  maxLength={6}
                />

                {error ? <AppText style={styles.joinError}>{error}</AppText> : null}

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handlePreAuthJoin}
                  activeOpacity={0.85}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.actionGrad}
                  >
                    <AppText style={styles.actionLabel}>{loading ? 'Checking...' : 'Continue'}</AppText>
                  </LinearGradient>
                </TouchableOpacity>

                <AppText style={styles.preAuthNote}>
                  You'll create your account on the next step, then connect automatically.
                </AppText>
              </View>

              <TouchableOpacity
                style={styles.skipRow}
                onPress={() => router.replace('/(auth)/register')}
                activeOpacity={0.6}
              >
                <AppText style={styles.skipText}>Register without a code</AppText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#060406', '#0A060A', '#0E080E']}
        style={StyleSheet.absoluteFill}
      />

      <TouchableOpacity style={[styles.backBtn, { top: insets.top + 12 }]} onPress={() => router.back()} activeOpacity={0.7}>
        <ChevronLeft color="rgba(255,255,255,0.75)" size={20} strokeWidth={2.2} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: scrollPaddingTop }]} showsVerticalScrollIndicator={false}>
        <View style={centerStyle}>
          <AppText style={[styles.heading, { fontSize: headingSize }]}>Connect with{'\n'}your partner</AppText>
          <AppText style={styles.sub}>This space is just for{'\n'}the two of you.</AppText>

          <View style={[styles.heartsWrap, { height: heartsHeight }]} pointerEvents="none">
            <View style={styles.heartsGlowWrap}>
              <LinearGradient
                colors={['transparent', 'rgba(255,80,30,0.22)', 'rgba(255,46,138,0.28)', 'rgba(255,80,30,0.22)', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.heartsGlow, { width: glowWidth, height: glowWidth * 0.42 }]}
              />
            </View>

            <View style={styles.heartsRow}>
              <View style={[styles.heartContainer, { marginRight: heartOverlap, zIndex: 1 }]}>
                <View style={styles.heartGlowOrange} />
                <HeartOutline size={heartSize} gradientId="heartL" colorA="#FFB347" colorB="#FF5A3D" />
              </View>
              <View style={[styles.heartContainer, { marginLeft: heartOverlap, zIndex: 2 }]}>
                <View style={styles.heartGlowPink} />
                <HeartOutline size={heartSize} gradientId="heartR" colorA="#FF5A3D" colorB="#FF2E8A" />
              </View>
            </View>

            <AppText style={[styles.sparkle, { top: 8, left: '22%', fontSize: 12 }]}>✦</AppText>
            <AppText style={[styles.sparkle, { top: 4, right: '20%', fontSize: 7 }]}>✦</AppText>
            <AppText style={[styles.sparkle, { bottom: 14, left: '14%', fontSize: 8 }]}>✦</AppText>
            <AppText style={[styles.sparkle, { bottom: 20, right: '15%', fontSize: 6 }]}>✦</AppText>
          </View>

          <View style={styles.cards}>
            <TouchableOpacity
              style={styles.optionCard}
              activeOpacity={0.8}
              onPress={() => setActiveModal('invite')}
            >
              <View style={styles.optionIconOuter}>
                <LinearGradient
                  colors={['rgba(255,90,60,0.42)', 'rgba(255,46,138,0.30)']}
                  style={styles.optionIconCircle}
                >
                  <UserPlus color="#FF6B3D" size={22} strokeWidth={1.8} />
                </LinearGradient>
              </View>
              <View style={styles.optionText}>
                <AppText style={styles.optionTitle}>Invite via code</AppText>
                <AppText style={styles.optionDesc}>Send them your code{'\n'}to invite.</AppText>
              </View>
              <ChevronRight color="rgba(255,255,255,0.28)" size={20} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionCard}
              activeOpacity={0.8}
              onPress={() => setActiveModal('join')}
            >
              <View style={styles.optionIconOuter}>
                <LinearGradient
                  colors={['rgba(255,90,60,0.42)', 'rgba(255,46,138,0.30)']}
                  style={styles.optionIconCircle}
                >
                  <Lock color="#FF6B3D" size={22} strokeWidth={1.8} />
                </LinearGradient>
              </View>
              <View style={styles.optionText}>
                <AppText style={styles.optionTitle}>I have a code</AppText>
                <AppText style={styles.optionDesc}>Enter the code they{'\n'}sent you.</AppText>
              </View>
              <ChevronRight color="rgba(255,255,255,0.28)" size={20} />
            </TouchableOpacity>
          </View>

          <View style={styles.noteRow}>
            <Lock color="rgba(255,255,255,0.22)" size={13} strokeWidth={1.5} />
            <AppText style={styles.noteText}>Only one partner connection at a time.</AppText>
          </View>

          <TouchableOpacity
            style={styles.skipRow}
            onPress={() => router.replace('/(app)/(tabs)')}
            activeOpacity={0.6}
          >
            <AppText style={styles.skipText}>Skip for now</AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Invite modal */}
      <Modal visible={activeModal === 'invite'} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 36, minHeight: minSheetHeight }]}>
            <LinearGradient colors={['#18101C', '#100810']} style={StyleSheet.absoluteFill} />
            <TouchableOpacity style={styles.modalClose} onPress={() => setActiveModal(null)}>
              <X color="rgba(255,255,255,0.80)" size={20} />
            </TouchableOpacity>
            <AppText style={styles.modalTitle}>Your invite code</AppText>
            <AppText style={styles.modalSub}>Share this with your partner to connect.</AppText>

            <View style={styles.codeBox}>
              <AppText style={[styles.codeDisplayText, { fontSize: codeFontSize, letterSpacing: codeLetterSpacing }]}>{myCode || '------'}</AppText>
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={handleRefreshCode}
                activeOpacity={0.7}
                disabled={refreshing}
              >
                <RefreshCw
                  color={refreshing ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.45)'}
                  size={15}
                  strokeWidth={2}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} activeOpacity={0.85}>
              <LinearGradient
                colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.actionGrad}
              >
                <Copy color="#fff" size={16} />
                <AppText style={styles.actionLabel}>{copied ? 'Copied!' : 'Copy & Share Code'}</AppText>
              </LinearGradient>
            </TouchableOpacity>

            <AppText style={styles.waitingText}>Waiting for your partner to join...</AppText>
          </View>
        </View>
      </Modal>

      {/* Join modal */}
      <Modal visible={activeModal === 'join'} transparent animationType="slide" onRequestClose={() => { setActiveModal(null); setError(''); setJoinCode(''); }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 36, minHeight: minSheetHeight }]}>
              <LinearGradient colors={['#18101C', '#100810']} style={StyleSheet.absoluteFill} />
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => { setActiveModal(null); setError(''); setJoinCode(''); }}
              >
                <X color="rgba(255,255,255,0.80)" size={20} />
              </TouchableOpacity>
              <AppText style={styles.modalTitle}>Enter partner's code</AppText>
              <AppText style={styles.modalSub}>Ask your partner for their 6-character invite code.</AppText>

              <AppTextInput
                style={[styles.codeInput, { fontSize: codeFontSize, letterSpacing: codeLetterSpacing }]}
                value={joinCode}
                onChangeText={setJoinCode}
                placeholder="e.g. AB12CD"
                placeholderTextColor="rgba(255,255,255,0.20)"
                autoCapitalize="characters"
                maxLength={6}
                autoFocus
              />

              {error ? <AppText style={styles.joinError}>{error}</AppText> : null}

              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleJoin}
                activeOpacity={0.85}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.actionGrad}
                >
                  <AppText style={styles.actionLabel}>{loading ? 'Connecting...' : 'Connect'}</AppText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060406' },
  backBtn: {
    position: 'absolute',
    left: Spacing.xl,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 50,
  },
  heading: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
    lineHeight: 44,
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  sub: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  heartsWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    position: 'relative',
  },
  heartsGlowWrap: {
    position: 'absolute',
    top: '10%',
    left: -20,
    right: -20,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartsGlow: {
    borderRadius: 80,
  },
  heartsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heartGlowOrange: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,110,50,0.28)',
    shadowColor: '#FF6030',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 0,
  },
  heartGlowPink: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,46,138,0.28)',
    shadowColor: '#FF2E8A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 0,
  },
  sparkle: {
    position: 'absolute',
    color: 'rgba(255,180,60,0.85)',
  },
  cards: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,80,60,0.15)',
    padding: Spacing.md,
    paddingVertical: 20,
    gap: Spacing.md,
  },
  optionIconOuter: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,90,60,0.45)',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.50,
    shadowRadius: 12,
    elevation: 8,
  },
  optionIconCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionTitle: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 3,
  },
  optionDesc: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  noteText: {
    color: 'rgba(255,255,255,0.26)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  skipRow: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    marginTop: Spacing.sm,
  },
  skipText: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(255,255,255,0.20)',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    overflow: 'hidden',
    gap: Spacing.md,
  },
  modalClose: {
    alignSelf: 'flex-end',
    padding: 4,
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  modalSub: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    marginBottom: Spacing.sm,
  },
  codeBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    position: 'relative',
  },
  refreshBtn: {
    position: 'absolute',
    right: 14,
    top: '50%',
    marginTop: -10,
    padding: 4,
  },
  codeDisplayText: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
  },
  actionBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.40,
    shadowRadius: 16,
    elevation: 8,
  },
  actionGrad: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderRadius: Radius.pill,
  },
  actionLabel: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
  },
  waitingText: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  codeInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: Radius.lg,
    color: '#fff',
    fontFamily: 'Inter-Bold',
    paddingHorizontal: Spacing.md,
    paddingVertical: 18,
    textAlign: 'center',
  },
  joinError: {
    color: '#FF5A5F',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  inlineJoin: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  preAuthNote: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
});
