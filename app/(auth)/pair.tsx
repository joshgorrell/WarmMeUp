import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Share,
  Platform,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, UserPlus, Lock, X, Copy } from 'lucide-react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

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
  const [activeModal, setActiveModal] = useState<ActiveModal>(prefilledCode ? 'join' : null);

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
    if (couple?.active) {
      router.replace('/(app)/(tabs)');
    }
  }, [couple?.active]);

  const loadOrCreateCouple = async () => {
    if (!user) return;
    const { data: existing } = await supabase
      .from('couples')
      .select('*')
      .eq('user_a_id', user.id)
      .maybeSingle();

    if (existing) {
      setMyCode(existing.invite_code);
    } else {
      const code = generateCode();
      const { data: newCouple, error: insertError } = await supabase
        .from('couples')
        .insert({ user_a_id: user.id, invite_code: code, active: false })
        .select()
        .single();
      if (!insertError && newCouple) {
        setMyCode(newCouple.invite_code);
        await refreshCouple();
      }
    }
  };

  const handleCopy = async () => {
    const deepLink = `warmup://invite/${myCode}`;
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

  const handleJoin = async () => {
    if (!joinCode.trim() || !user) return;
    setError('');
    setLoading(true);
    try {
      const { data: targetCouple } = await supabase
        .from('couples')
        .select('*')
        .eq('invite_code', joinCode.toUpperCase().trim())
        .maybeSingle();

      if (!targetCouple) {
        setError('Invalid code. Check with your partner.');
        return;
      }
      if (targetCouple.user_a_id === user.id) {
        setError("That's your own code! Share it with your partner.");
        return;
      }
      if (targetCouple.user_b_id && targetCouple.user_b_id !== user.id) {
        setError('This couple is already full.');
        return;
      }

      // Update target couple first — only delete our stub if this succeeds
      const { error: updateError } = await supabase
        .from('couples')
        .update({ user_b_id: user.id, active: true })
        .eq('id', targetCouple.id)
        .is('user_b_id', null);

      if (updateError) {
        setError('Something went wrong. Please try again.');
        return;
      }

      await supabase
        .from('couples')
        .delete()
        .eq('user_a_id', user.id)
        .eq('active', false)
        .neq('id', targetCouple.id);

      await supabase.from('scores').upsert([
        { couple_id: targetCouple.id, user_id: targetCouple.user_a_id, points: 0 },
        { couple_id: targetCouple.id, user_id: user.id, points: 0 },
      ]);

      // Notify User A that their partner just joined (fire-and-forget)
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

      // Show celebration if they haven't seen it yet
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
    if (!joinCode.trim()) {
      setError('Please enter the code your partner sent you.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data: targetCouple } = await supabase
        .from('couples')
        .select('id')
        .eq('invite_code', joinCode.toUpperCase().trim())
        .maybeSingle();

      if (!targetCouple) {
        setError('Invalid code. Check with your partner.');
        return;
      }

      router.push({ pathname: '/(auth)/register', params: { pendingCode: joinCode.toUpperCase().trim() } });
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
                <Text style={[styles.sparkle, { top: 8, left: '22%', fontSize: 12 }]}>✦</Text>
                <Text style={[styles.sparkle, { top: 4, right: '20%', fontSize: 7 }]}>✦</Text>
                <Text style={[styles.sparkle, { bottom: 14, left: '14%', fontSize: 8 }]}>✦</Text>
                <Text style={[styles.sparkle, { bottom: 20, right: '15%', fontSize: 6 }]}>✦</Text>
              </View>

              <Text style={[styles.heading, { fontSize: headingSize }]}>Enter your{'\n'}partner's code</Text>
              <Text style={styles.sub}>Type in the invite code they sent you.</Text>

              <View style={styles.inlineJoin}>
                <TextInput
                  style={[styles.codeInput, { fontSize: codeFontSize, letterSpacing: codeLetterSpacing }]}
                  value={joinCode}
                  onChangeText={(t) => { setJoinCode(t); setError(''); }}
                  placeholder="e.g. AB12CD"
                  placeholderTextColor="rgba(255,255,255,0.20)"
                  autoCapitalize="characters"
                  maxLength={6}
                />

                {error ? <Text style={styles.joinError}>{error}</Text> : null}

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
                    <Text style={styles.actionLabel}>{loading ? 'Checking...' : 'Continue'}</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <Text style={styles.preAuthNote}>
                  You'll create your account on the next step, then connect automatically.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.skipRow}
                onPress={() => router.replace('/(auth)/register')}
                activeOpacity={0.6}
              >
                <Text style={styles.skipText}>Register without a code</Text>
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
          <Text style={[styles.heading, { fontSize: headingSize }]}>Connect with{'\n'}your partner</Text>
          <Text style={styles.sub}>This space is just for{'\n'}the two of you.</Text>

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

            <Text style={[styles.sparkle, { top: 8, left: '22%', fontSize: 12 }]}>✦</Text>
            <Text style={[styles.sparkle, { top: 4, right: '20%', fontSize: 7 }]}>✦</Text>
            <Text style={[styles.sparkle, { bottom: 14, left: '14%', fontSize: 8 }]}>✦</Text>
            <Text style={[styles.sparkle, { bottom: 20, right: '15%', fontSize: 6 }]}>✦</Text>
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
                <Text style={styles.optionTitle}>Invite via code</Text>
                <Text style={styles.optionDesc}>Send them your code{'\n'}to invite.</Text>
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
                <Text style={styles.optionTitle}>I have a code</Text>
                <Text style={styles.optionDesc}>Enter the code they{'\n'}sent you.</Text>
              </View>
              <ChevronRight color="rgba(255,255,255,0.28)" size={20} />
            </TouchableOpacity>
          </View>

          <View style={styles.noteRow}>
            <Lock color="rgba(255,255,255,0.22)" size={13} strokeWidth={1.5} />
            <Text style={styles.noteText}>Only one partner connection at a time.</Text>
          </View>

          <TouchableOpacity
            style={styles.skipRow}
            onPress={() => router.replace('/(app)/(tabs)')}
            activeOpacity={0.6}
          >
            <Text style={styles.skipText}>Skip for now</Text>
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
            <Text style={styles.modalTitle}>Your invite code</Text>
            <Text style={styles.modalSub}>Share this with your partner to connect.</Text>

            <View style={styles.codeBox}>
              <Text style={[styles.codeDisplayText, { fontSize: codeFontSize, letterSpacing: codeLetterSpacing }]}>{myCode || '------'}</Text>
            </View>

            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} activeOpacity={0.85}>
              <LinearGradient
                colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.actionGrad}
              >
                <Copy color="#fff" size={16} />
                <Text style={styles.actionLabel}>{copied ? 'Copied!' : 'Copy & Share Code'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.waitingText}>Waiting for your partner to join...</Text>
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
              <Text style={styles.modalTitle}>Enter partner's code</Text>
              <Text style={styles.modalSub}>Ask your partner for their 6-character invite code.</Text>

              <TextInput
                style={[styles.codeInput, { fontSize: codeFontSize, letterSpacing: codeLetterSpacing }]}
                value={joinCode}
                onChangeText={setJoinCode}
                placeholder="e.g. AB12CD"
                placeholderTextColor="rgba(255,255,255,0.20)"
                autoCapitalize="characters"
                maxLength={6}
                autoFocus
              />

              {error ? <Text style={styles.joinError}>{error}</Text> : null}

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
                  <Text style={styles.actionLabel}>{loading ? 'Connecting...' : 'Connect'}</Text>
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
