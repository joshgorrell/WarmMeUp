import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform, Share, Image, AppState, Modal, Animated as RNAnimated,
  Pressable,
} from 'react-native';
import AppText from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, Camera, Share2, Play, Pause, Volume2, VolumeX,
  TriangleAlert as AlertTriangle, Archive, Check,
} from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { awardPoints } from '@/lib/points';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// Fade-in duration when re-showing badges
const BADGE_SHOW_MS = 200;
// Fade-out duration when auto-hiding badges
const BADGE_HIDE_MS = 400;
// Delay before badges auto-hide
const BADGE_AUTO_HIDE_DELAY = 2500;

const AnimatedImage = Animated.createAnimatedComponent(Image);

export default function VaultViewerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useLayout();
  const { user, couple, settings } = useAuth();

  const {
    id: itemId,
    storagePath,
    storageBucket,
    coupleId,
    mediaType,
    allowScreenshot,
    allowShare,
    allowSave,
    interactionId,
    timestamp,
  } = useLocalSearchParams<{
    id: string;
    storagePath: string;
    storageBucket: string;
    coupleId: string;
    mediaType: string;
    allowScreenshot: string;
    allowSave: string;
    allowShare: string;
    interactionId?: string;
    timestamp?: string;
  }>();

  const isVideo = mediaType === 'video';
  const canScreenshot = allowScreenshot === '1';
  const canShare = allowShare === '1';
  const canSave = allowSave === '1';
  const showSaveToVault = !!interactionId && canSave;

  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  // Native pixel dimensions of the loaded image — used for aspect-correct sizing
  const [imageNativeSize, setImageNativeSize] = useState<{ w: number; h: number } | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [screenshotWarning, setScreenshotWarning] = useState(false);
  const [savedToVault, setSavedToVault] = useState(false);
  const [savingToVault, setSavingToVault] = useState(false);
  const videoRef = useRef<any>(null);
  const appState = useRef(AppState.currentState);
  const lastInactiveAt = useRef<number | null>(null);

  const [VideoComponent, setVideoComponent] = useState<React.ComponentType<any> | null>(null);
  const [avLoaded, setAvLoaded] = useState(false);

  // ─── Badge fade animation ────────────────────────────────────────────────
  const badgesOpacity = useRef(new RNAnimated.Value(1)).current;
  const [badgesInteractive, setBadgesInteractive] = useState(true);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startFadeTimer = useCallback(() => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      RNAnimated.timing(badgesOpacity, {
        toValue: 0,
        duration: BADGE_HIDE_MS,
        useNativeDriver: true,
      }).start(() => setBadgesInteractive(false));
    }, BADGE_AUTO_HIDE_DELAY);
  }, [badgesOpacity]);

  const revealBadges = useCallback(() => {
    setBadgesInteractive(true);
    RNAnimated.timing(badgesOpacity, {
      toValue: 1,
      duration: BADGE_SHOW_MS,
      useNativeDriver: true,
    }).start();
    startFadeTimer();
  }, [badgesOpacity, startFadeTimer]);

  useEffect(() => {
    startFadeTimer();
    return () => { if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current); };
  }, []);

  // ─── Zoom / pan gestures (images only) ─────────────────────────────────
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const SPRING = { damping: 22, stiffness: 220 } as const;

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd(() => {
      'worklet';
      if (scale.value > 1) {
        scale.value = withSpring(1, SPRING);
        tx.value = withSpring(0, SPRING);
        ty.value = withSpring(0, SPRING);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        scale.value = withSpring(2.5, { damping: 18, stiffness: 180 });
        savedScale.value = 2.5;
      }
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 6));
    })
    .onEnd(() => {
      'worklet';
      if (scale.value <= 1.05) {
        scale.value = withSpring(1, SPRING);
        tx.value = withSpring(0, SPRING);
        ty.value = withSpring(0, SPRING);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      'worklet';
      if (scale.value <= 1) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      'worklet';
      if (scale.value <= 1) return;
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const imageGesture = Gesture.Exclusive(
    doubleTap,
    Gesture.Simultaneous(pinch, pan),
  );

  const imageAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  // ─── Signed URL ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!storagePath) return;
    const bucket = storageBucket ?? 'vault';
    supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 60).then(({ data }) => {
      if (data?.signedUrl) setMediaUri(data.signedUrl);
    });
  }, [storagePath, storageBucket]);

  useEffect(() => {
    if (!isVideo) return;
    let mounted = true;
    (async () => {
      try {
        const { Video, ResizeMode } = await import('expo-av');
        if (!mounted) return;
        setVideoComponent(() => (props: any) => (
          <Video {...props} resizeMode={ResizeMode.CONTAIN} />
        ));
        setAvLoaded(true);
      } catch {
        if (mounted) setVideoError(true);
      }
    })();
    return () => { mounted = false; };
  }, [isVideo]);

  // ─── Screenshot detection ────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', nextState => {
      const prev = appState.current;
      if (prev === 'active' && nextState === 'inactive') {
        lastInactiveAt.current = Date.now();
      }
      if (prev === 'inactive' && nextState === 'active') {
        const elapsed = lastInactiveAt.current ? Date.now() - lastInactiveAt.current : 999;
        if (elapsed < 400) handleScreenshotDetected();
        lastInactiveAt.current = null;
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [itemId, interactionId, coupleId, user?.id, canScreenshot]);

  const handleScreenshotDetected = useCallback(async () => {
    if (!coupleId || !user?.id) return;
    if (!canScreenshot) setScreenshotWarning(true);
    if (interactionId) {
      await supabase.from('interactions').update({ screenshot_detected: true }).eq('id', interactionId);
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) {
        await fetch(`${SUPABASE_URL}/functions/v1/notify-screenshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
          body: JSON.stringify({ vault_item_id: itemId, couple_id: coupleId, detected_by_user_id: user.id }),
        });
      }
    } catch {}
  }, [itemId, interactionId, coupleId, user?.id, canScreenshot]);

  const handleShare = useCallback(async () => {
    if (!canShare || !mediaUri) return;
    try { await Share.share({ url: mediaUri, message: mediaUri }); } catch {}
  }, [canShare, mediaUri]);

  const handleSaveToVault = useCallback(async () => {
    if (!couple?.id || !user?.id || !storagePath || savingToVault || savedToVault) return;
    setSavingToVault(true);
    try {
      const ext = isVideo ? 'mp4' : 'jpg';
      const newPath = `${couple.id}/${user.id}/${Date.now()}.${ext}`;
      if (!mediaUri) return;
      const response = await fetch(mediaUri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage.from('vault').upload(newPath, blob, {
        contentType: isVideo ? 'video/mp4' : 'image/jpeg',
        upsert: false,
      });
      if (uploadError) return;
      const { data } = await supabase.from('vault_items').insert({
        couple_id: couple.id,
        uploaded_by_user_id: user.id,
        media_type: isVideo ? 'video' : 'photo',
        file_path: newPath,
        storage_path: newPath,
        storage_bucket: 'vault',
        allow_screenshot: canScreenshot,
        allow_save: canSave,
        allow_share: canShare,
        screenshot_detected: false,
        viewed_by_partner: false,
      }).select().single();
      if (data) {
        await awardPoints(couple.id, user.id, 5, 'Saved chat media to Vault', data.id);
        setSavedToVault(true);
      }
    } catch {}
    setSavingToVault(false);
  }, [couple?.id, user?.id, storagePath, mediaUri, isVideo, canScreenshot, canSave, canShare, savingToVault, savedToVault]);

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (videoPlaying) { videoRef.current.pauseAsync?.(); }
    else { videoRef.current.playAsync?.(); }
    setVideoPlaying(!videoPlaying);
  };

  // ─── Layout math ─────────────────────────────────────────────────────────
  // Reserve space for header chrome; bottom overlay fades so doesn't need permanent space
  const headerH = insets.top + 52;
  const availH = screenHeight - headerH - 24;
  const availW = screenWidth;

  let imgW = availW;
  let imgH = availH;

  if (imageNativeSize && imageNativeSize.w > 0 && imageNativeSize.h > 0) {
    const nativeAspect = imageNativeSize.w / imageNativeSize.h;
    // Fit height-first (better for portrait photos)
    imgH = availH;
    imgW = imgH * nativeAspect;
    if (imgW > availW) {
      // Too wide — clamp to width
      imgW = availW;
      imgH = imgW / nativeAspect;
    }
  }

  // Format timestamp if provided
  const formattedTimestamp = timestamp
    ? (() => {
        try {
          const d = new Date(timestamp);
          return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' +
            d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch { return null; }
      })()
    : null;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Full-screen tap to reveal badges */}
      <Pressable style={StyleSheet.absoluteFill} onPress={revealBadges} />

      {/* Centered media area */}
      <View style={styles.mediaContainer}>
        {!mediaUri ? (
          <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" />
        ) : !isVideo ? (
          <>
            {!imageLoaded && (
              <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" style={StyleSheet.absoluteFillObject} />
            )}
            <GestureDetector gesture={imageGesture}>
              <AnimatedImage
                source={{ uri: mediaUri }}
                style={[{ width: imgW, height: imgH }, imageAnimStyle]}
                resizeMode="contain"
                onLoad={(e: any) => {
                  const src = e.nativeEvent?.source;
                  if (src?.width && src?.height) {
                    setImageNativeSize({ w: src.width, h: src.height });
                  }
                  setImageLoaded(true);
                }}
              />
            </GestureDetector>
          </>
        ) : (
          <View style={{ width: availW, height: availH, alignItems: 'center', justifyContent: 'center' }}>
            {!avLoaded && !videoError && (
              <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" />
            )}
            {videoError && (
              <AppText style={styles.videoErrorText}>Video playback unavailable</AppText>
            )}
            {avLoaded && VideoComponent && (
              <>
                <VideoComponent
                  ref={videoRef}
                  source={{ uri: mediaUri ?? undefined }}
                  style={{ width: availW, height: availH }}
                  isMuted={muted}
                  shouldPlay={false}
                  onPlaybackStatusUpdate={(status: any) => {
                    if (status.isLoaded) setVideoPlaying(status.isPlaying);
                  }}
                  onError={() => setVideoError(true)}
                  useNativeControls={Platform.OS === 'web'}
                />
                {Platform.OS !== 'web' && (
                  <>
                    {/* Play / pause centered */}
                    <TouchableOpacity
                      onPress={togglePlayPause}
                      style={styles.playBtn}
                      activeOpacity={0.8}
                    >
                      <View style={styles.playBtnInner}>
                        {videoPlaying
                          ? <Pause color="#fff" size={26} strokeWidth={2} />
                          : <Play color="#fff" size={26} strokeWidth={2} />
                        }
                      </View>
                    </TouchableOpacity>
                    {/* Mute button — bottom-right of video frame */}
                    <TouchableOpacity
                      onPress={() => setMuted(!muted)}
                      style={[styles.muteBtn, { bottom: 20, right: 16 }]}
                      activeOpacity={0.8}
                    >
                      {muted
                        ? <VolumeX color="rgba(255,255,255,0.8)" size={18} />
                        : <Volume2 color="rgba(255,255,255,0.8)" size={18} />
                      }
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        )}
      </View>

      {/* Top chrome — compact gradient with back button + optional timestamp */}
      <LinearGradient
        colors={['rgba(0,0,0,0.70)', 'rgba(0,0,0,0.30)', 'transparent']}
        style={[styles.topGradient, { paddingTop: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <ChevronLeft color="#fff" size={22} strokeWidth={2.2} />
          </TouchableOpacity>
          {formattedTimestamp && (
            <AppText style={styles.headerTimestamp}>{formattedTimestamp}</AppText>
          )}
        </View>
      </LinearGradient>

      {/* Bottom overlay — fades in/out */}
      <RNAnimated.View
        style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 16, opacity: badgesOpacity }]}
        pointerEvents={badgesInteractive ? 'box-none' : 'none'}
      >
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.80)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {showSaveToVault && (
          <TouchableOpacity
            style={[styles.saveVaultBtn, savedToVault && styles.saveVaultBtnSaved]}
            onPress={handleSaveToVault}
            activeOpacity={0.8}
            disabled={savingToVault || savedToVault}
          >
            {savingToVault ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : savedToVault ? (
              <>
                <Check color="#4CAF50" size={16} />
                <AppText style={[styles.saveVaultText, { color: '#4CAF50' }]}>Saved to Vault</AppText>
              </>
            ) : (
              <>
                <Archive color="#FF8A3D" size={16} />
                <AppText style={styles.saveVaultText}>Save to Vault</AppText>
              </>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.permRow}>
          <PermBadge
            icon={<Camera color={canScreenshot ? '#FF2E8A' : 'rgba(255,255,255,0.28)'} size={14} />}
            label={canScreenshot ? 'Screenshot OK' : 'Partner notified'}
            allowed={canScreenshot}
          />
          <PermBadge
            icon={<Camera color="rgba(255,255,255,0.28)" size={14} />}
            label="Never saved"
            allowed={false}
          />
          {canShare ? (
            <TouchableOpacity onPress={handleShare} activeOpacity={0.8}>
              <PermBadge
                icon={<Share2 color="#FF2E8A" size={14} />}
                label="Share"
                allowed
              />
            </TouchableOpacity>
          ) : (
            <PermBadge
              icon={<Share2 color="rgba(255,255,255,0.28)" size={14} />}
              label="No sharing"
              allowed={false}
            />
          )}
        </View>
      </RNAnimated.View>

      {/* Screenshot warning modal */}
      <Modal
        visible={screenshotWarning}
        transparent
        animationType="fade"
        onRequestClose={() => setScreenshotWarning(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <AlertTriangle color="#FFB347" size={32} strokeWidth={1.5} />
            </View>
            <AppText style={styles.modalTitle}>Screenshot Detected</AppText>
            <AppText style={styles.modalBody}>
              Screenshots of this item are restricted. Your partner has been notified.
            </AppText>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => setScreenshotWarning(false)}
              activeOpacity={0.8}
            >
              <AppText style={styles.modalBtnText}>Got it</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PermBadge({ icon, label, allowed }: { icon: React.ReactNode; label: string; allowed: boolean }) {
  return (
    <View style={[styles.badge, { borderColor: allowed ? 'rgba(255,46,138,0.35)' : 'rgba(255,255,255,0.10)' }]}>
      {icon}
      <AppText style={[styles.badgeLabel, { color: allowed ? '#fff' : 'rgba(255,255,255,0.32)' }]}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Fills remaining space and centers media vertically
  mediaContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Top chrome
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    paddingHorizontal: Spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  headerTimestamp: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.55)',
  },

  // Bottom overlay
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 52,
    paddingHorizontal: Spacing.xl,
    gap: 10,
  },
  saveVaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,138,61,0.14)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,138,61,0.4)',
    paddingVertical: 12,
    paddingHorizontal: Spacing.xl,
    marginBottom: 4,
  },
  saveVaultBtnSaved: {
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderColor: 'rgba(76,175,80,0.35)',
  },
  saveVaultText: {
    color: '#FF8A3D',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  permRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  badgeLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },

  // Video controls
  playBtn: {
    position: 'absolute',
  },
  playBtnInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteBtn: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 18,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  videoErrorText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },

  // Screenshot modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    backgroundColor: '#1A1114',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: 'rgba(255,179,71,0.25)',
  },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,179,71,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  modalBody: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalBtn: {
    marginTop: 4,
    backgroundColor: 'rgba(255,179,71,0.12)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,179,71,0.35)',
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  modalBtnText: {
    color: '#FFB347',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
});
