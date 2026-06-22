import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform, Share, AppState, Modal, Animated as RNAnimated,
  Pressable, FlatList,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
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
  useSharedValue, useAnimatedStyle, withSpring, runOnJS,
} from 'react-native-reanimated';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const AnimatedExpoImage = Animated.createAnimatedComponent(ExpoImage);
import { awardPoints } from '@/lib/points';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { getGalleryItems, GalleryItem } from '@/lib/mediaGalleryStore';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

const BADGE_SHOW_MS = 200;
const BADGE_HIDE_MS = 400;
const BADGE_AUTO_HIDE_DELAY = 2500;
const SPRING = { damping: 22, stiffness: 220 } as const;

// ─── Single media page ────────────────────────────────────────────────────────

function MediaPage({
  item,
  isActive,
  screenWidth,
  screenHeight,
  insetTop,
  insetBottom,
  onZoomChange,
  user,
  couple,
}: {
  item: GalleryItem;
  isActive: boolean;
  screenWidth: number;
  screenHeight: number;
  insetTop: number;
  insetBottom: number;
  onZoomChange: (zoomed: boolean) => void;
  user: any;
  couple: any;
}) {
  const isVideo = item.mediaType === 'video';
  const canScreenshot = item.allowScreenshot;
  const canShare = item.allowShare;
  const canSave = item.allowSave;
  const showSaveToVault = !!item.interactionId && canSave;

  const [mediaUri, setMediaUri] = useState<string | null>(item.signedUri ?? null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageNativeSize, setImageNativeSize] = useState<{ w: number; h: number } | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoTapped, setVideoTapped] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [screenshotWarning, setScreenshotWarning] = useState(false);
  const [savedToVault, setSavedToVault] = useState(false);
  const [savingToVault, setSavingToVault] = useState(false);
  const [VideoComponent, setVideoComponent] = useState<React.ComponentType<any> | null>(null);
  const [avLoaded, setAvLoaded] = useState(false);
  const videoRef = useRef<any>(null);
  const appStateRef = useRef(AppState.currentState);
  const lastInactiveAt = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => { return () => { isMountedRef.current = false; }; }, []);

  // Pause video when page becomes inactive
  useEffect(() => {
    if (!isActive && videoRef.current && videoPlaying) {
      videoRef.current.pauseAsync?.();
      setVideoPlaying(false);
    }
  }, [isActive]);

  // ─── Badge fade ───────────────────────────────────────────────────────────
  const badgesOpacity = useRef(new RNAnimated.Value(1)).current;
  const [badgesInteractive, setBadgesInteractive] = useState(true);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startFadeTimer = useCallback(() => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      RNAnimated.timing(badgesOpacity, { toValue: 0, duration: BADGE_HIDE_MS, useNativeDriver: true })
        .start(() => { if (isMountedRef.current) setBadgesInteractive(false); });
    }, BADGE_AUTO_HIDE_DELAY);
  }, [badgesOpacity]);

  const revealBadges = useCallback(() => {
    setBadgesInteractive(true);
    RNAnimated.timing(badgesOpacity, { toValue: 1, duration: BADGE_SHOW_MS, useNativeDriver: true }).start();
    startFadeTimer();
  }, [badgesOpacity, startFadeTimer]);

  useEffect(() => {
    startFadeTimer();
    return () => { if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current); };
  }, []);

  // ─── Zoom / pan ───────────────────────────────────────────────────────────
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const notifyZoom = useCallback((v: boolean) => { onZoomChange(v); }, [onZoomChange]);

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
        runOnJS(notifyZoom)(false);
      } else {
        scale.value = withSpring(2.5, { damping: 18, stiffness: 180 });
        savedScale.value = 2.5;
        runOnJS(notifyZoom)(true);
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
        runOnJS(notifyZoom)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(notifyZoom)(true);
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

  const imageGesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  // ─── Signed URL (lazy if not pre-populated) ────────────────────────────────
  useEffect(() => {
    if (item.signedUri || !item.storagePath) return;
    supabase.storage.from(item.storageBucket ?? 'vault').createSignedUrl(item.storagePath, 12 * 60 * 60).then(({ data }) => {
      if (isMountedRef.current && data?.signedUrl) setMediaUri(data.signedUrl);
    });
  }, [item.storagePath, item.storageBucket, item.signedUri]);

  // ─── Video component ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isVideo || !videoTapped) return;
    let mounted = true;
    (async () => {
      try {
        const { Video: V, ResizeMode } = await import('expo-av');
        if (!mounted) return;
        setVideoComponent(() => (props: any) => <V {...props} resizeMode={ResizeMode.CONTAIN} />);
        setAvLoaded(true);
      } catch { if (mounted) setVideoError(true); }
    })();
    return () => { mounted = false; };
  }, [isVideo, videoTapped]);

  // ─── Screenshot detection ──────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web' || !isActive) return;
    const sub = AppState.addEventListener('change', nextState => {
      const prev = appStateRef.current;
      if (prev === 'active' && nextState === 'inactive') lastInactiveAt.current = Date.now();
      if (prev === 'inactive' && nextState === 'active') {
        const elapsed = lastInactiveAt.current ? Date.now() - lastInactiveAt.current : 999;
        if (elapsed < 400) handleScreenshotDetected();
        lastInactiveAt.current = null;
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [isActive, item.id, item.interactionId, item.coupleId, user?.id, canScreenshot]);

  const handleScreenshotDetected = useCallback(async () => {
    if (!item.coupleId || !user?.id) return;
    if (!canScreenshot) setScreenshotWarning(true);
    if (item.interactionId) {
      await supabase.from('interactions').update({ screenshot_detected: true }).eq('id', item.interactionId);
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) {
        await fetch(`${SUPABASE_URL}/functions/v1/notify-screenshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
          body: JSON.stringify({ vault_item_id: item.id, couple_id: item.coupleId, detected_by_user_id: user.id, source_screen: 'vault' }),
        });
      }
    } catch {}
  }, [item, user?.id, canScreenshot]);

  const handleShare = useCallback(async () => {
    if (!canShare || !mediaUri) return;
    try { await Share.share({ url: mediaUri, message: mediaUri }); } catch {}
  }, [canShare, mediaUri]);

  const handleSaveToVault = useCallback(async () => {
    if (!couple?.id || !user?.id || !item.storagePath || savingToVault || savedToVault) return;
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
        if (isMountedRef.current) setSavedToVault(true);
      }
    } catch {}
    if (isMountedRef.current) setSavingToVault(false);
  }, [couple?.id, user?.id, item.storagePath, mediaUri, isVideo, canScreenshot, canSave, canShare, savingToVault, savedToVault]);

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (videoPlaying) { videoRef.current.pauseAsync?.(); } else { videoRef.current.playAsync?.(); }
    setVideoPlaying(!videoPlaying);
  };

  // ─── Layout ────────────────────────────────────────────────────────────────
  const headerH = insetTop + 52;
  const availH = screenHeight - headerH - 24;
  const availW = screenWidth;
  let imgW = availW;
  let imgH = availH;
  if (imageNativeSize && imageNativeSize.w > 0 && imageNativeSize.h > 0) {
    const ratio = imageNativeSize.w / imageNativeSize.h;
    imgH = availH;
    imgW = imgH * ratio;
    if (imgW > availW) { imgW = availW; imgH = imgW / ratio; }
  }

  const formattedTimestamp = (() => {
    const raw = item.createdAt;
    if (!raw) return null;
    try {
      const d = new Date(raw);
      const datePart = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateTime = `${datePart} · ${timePart}`;
      return item.uploaderName ? `${item.uploaderName} · ${dateTime}` : dateTime;
    } catch { return null; }
  })();

  return (
    <View style={{ width: screenWidth, height: screenHeight, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      {/* Full-screen tap to reveal badges */}
      <Pressable style={StyleSheet.absoluteFill} onPress={revealBadges} />

      {/* Media */}
      <View style={styles.mediaContainer}>
        {!mediaUri ? (
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            {item.thumbUri ? (
              <ExpoImage
                source={{ uri: item.thumbUri }}
                style={{ width: screenWidth, height: screenWidth, opacity: 0.45 }}
                contentFit="cover"
                blurRadius={18}
                cachePolicy="memory-disk"
              />
            ) : null}
            <ActivityIndicator
              color="rgba(255,255,255,0.5)"
              size="large"
              style={item.thumbUri ? StyleSheet.absoluteFillObject : undefined}
            />
          </View>
        ) : !isVideo ? (
          <>
            {!imageLoaded && (
              <>
                {item.thumbUri ? (
                  <ExpoImage
                    source={{ uri: item.thumbUri }}
                    style={{ width: screenWidth, height: screenWidth, opacity: 0.4 }}
                    contentFit="cover"
                    blurRadius={12}
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" style={StyleSheet.absoluteFillObject} />
                )}
              </>
            )}
            <GestureDetector gesture={imageGesture}>
              <AnimatedExpoImage
                source={{ uri: mediaUri }}
                style={[{ width: imgW, height: imgH }, imageAnimStyle]}
                contentFit="contain"
                cachePolicy="memory-disk"
                onLoad={(e: any) => {
                  const src = e.source;
                  if (src?.width && src?.height) setImageNativeSize({ w: src.width, h: src.height });
                  setImageLoaded(true);
                }}
              />
            </GestureDetector>
          </>
        ) : (
          <View style={{ width: availW, height: availH, alignItems: 'center', justifyContent: 'center' }}>
            {/* Always show the thumbnail poster for videos */}
            {item.thumbUri && !avLoaded && (
              <ExpoImage
                source={{ uri: item.thumbUri }}
                style={[StyleSheet.absoluteFillObject, { opacity: 0.5 }]}
                contentFit="cover"
                blurRadius={Platform.OS === 'ios' ? 14 : 5}
                cachePolicy="memory-disk"
              />
            )}
            {!videoTapped && !videoError && (
              <TouchableOpacity
                style={styles.playBtn}
                activeOpacity={0.8}
                onPress={() => { setVideoTapped(true); setVideoPlaying(true); }}
              >
                <View style={styles.playBtnInner}>
                  <Play color="#fff" size={26} strokeWidth={2} />
                </View>
              </TouchableOpacity>
            )}
            {videoTapped && !avLoaded && !videoError && (
              <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" />
            )}
            {videoError && <AppText style={styles.videoErrorText}>Video playback unavailable</AppText>}
            {avLoaded && VideoComponent && (
              <>
                <VideoComponent
                  ref={videoRef}
                  source={{ uri: mediaUri ?? undefined }}
                  style={{ width: availW, height: availH }}
                  isMuted={muted}
                  shouldPlay={videoPlaying}
                  onPlaybackStatusUpdate={(status: any) => { if (status.isLoaded) setVideoPlaying(status.isPlaying); }}
                  onError={() => setVideoError(true)}
                  useNativeControls={Platform.OS === 'web'}
                />
                {Platform.OS !== 'web' && (
                  <>
                    <TouchableOpacity onPress={togglePlayPause} style={styles.playBtn} activeOpacity={0.8}>
                      <View style={styles.playBtnInner}>
                        {videoPlaying ? <Pause color="#fff" size={26} strokeWidth={2} /> : <Play color="#fff" size={26} strokeWidth={2} />}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setMuted(!muted)} style={[styles.muteBtn, { bottom: 20, right: 16 }]} activeOpacity={0.8}>
                      {muted ? <VolumeX color="rgba(255,255,255,0.8)" size={18} /> : <Volume2 color="rgba(255,255,255,0.8)" size={18} />}
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        )}
      </View>

      {/* Per-page timestamp — sits top-right below the global top chrome */}
      {formattedTimestamp && (
        <RNAnimated.View
          style={[styles.timestampBadge, { opacity: badgesOpacity, top: insetTop + 14 }]}
          pointerEvents="none"
        >
          <AppText style={styles.timestampBadgeText}>{formattedTimestamp}</AppText>
        </RNAnimated.View>
      )}

      {/* Bottom overlay */}
      <RNAnimated.View
        style={[styles.bottomOverlay, { paddingBottom: insetBottom + 16, opacity: badgesOpacity }]}
        pointerEvents={badgesInteractive ? 'box-none' : 'none'}
      >
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.80)']} style={StyleSheet.absoluteFill} pointerEvents="none" />

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
          <PermBadge icon={<Camera color="rgba(255,255,255,0.28)" size={14} />} label="Never saved" allowed={false} />
          {canShare ? (
            <TouchableOpacity onPress={handleShare} activeOpacity={0.8}>
              <PermBadge icon={<Share2 color="#FF2E8A" size={14} />} label="Share" allowed />
            </TouchableOpacity>
          ) : (
            <PermBadge icon={<Share2 color="rgba(255,255,255,0.28)" size={14} />} label="No sharing" allowed={false} />
          )}
        </View>
      </RNAnimated.View>

      {/* Screenshot modal */}
      <Modal visible={screenshotWarning} transparent animationType="fade" onRequestClose={() => setScreenshotWarning(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <AlertTriangle color="#FFB347" size={32} strokeWidth={1.5} />
            </View>
            <AppText style={styles.modalTitle}>Screenshot Detected</AppText>
            <AppText style={styles.modalBody}>
              Screenshots of this item are restricted. Your partner has been notified.
            </AppText>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setScreenshotWarning(false)} activeOpacity={0.8}>
              <AppText style={styles.modalBtnText}>Got it</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Gallery shell ────────────────────────────────────────────────────────────

export default function VaultViewerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useLayout();
  const { user, couple, settings } = useAuth();

  const {
    initialIndex: initialIndexStr,
    // Legacy single-item params — kept for deep-link backwards compat
    id: legacyId,
    storagePath: legacyStoragePath,
    storageBucket: legacyStorageBucket,
    coupleId: legacyCoupleId,
    mediaType: legacyMediaType,
    allowScreenshot: legacyAllowScreenshot,
    allowSave: legacyAllowSave,
    allowShare: legacyAllowShare,
    interactionId: legacyInteractionId,
    timestamp: legacyTimestamp,
    createdAt: legacyCreatedAt,
    uploaderName: legacyUploaderName,
    signedUri: legacySignedUri,
    thumbUri: legacyThumbUri,
  } = useLocalSearchParams<{
    initialIndex?: string;
    id?: string;
    storagePath?: string;
    storageBucket?: string;
    coupleId?: string;
    mediaType?: string;
    allowScreenshot?: string;
    allowSave?: string;
    allowShare?: string;
    interactionId?: string;
    timestamp?: string;
    createdAt?: string;
    uploaderName?: string;
    signedUri?: string;
    thumbUri?: string;
  }>();

  // Use gallery store if populated; fall back to single-item legacy params
  const storeItems = getGalleryItems();
  const items: GalleryItem[] = storeItems.length > 0 ? storeItems : (() => {
    if (!legacyStoragePath) return [];
    return [{
      id: legacyId ?? '',
      storagePath: legacyStoragePath,
      storageBucket: legacyStorageBucket ?? 'vault',
      coupleId: legacyCoupleId ?? null,
      mediaType: legacyMediaType ?? 'photo',
      allowScreenshot: legacyAllowScreenshot === '1',
      allowSave: legacyAllowSave === '1',
      allowShare: legacyAllowShare === '1',
      interactionId: legacyInteractionId ?? null,
      createdAt: legacyCreatedAt ?? legacyTimestamp ?? null,
      uploaderName: legacyUploaderName ?? null,
      signedUri: legacySignedUri ?? null,
      thumbUri: legacyThumbUri ?? null,
    }];
  })();

  const initialIndex = Math.min(
    Math.max(0, parseInt(initialIndexStr ?? '0', 10)),
    Math.max(0, items.length - 1),
  );

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const listRef = useRef<FlatList>(null);

  const isZoomedShared = useSharedValue(false);
  const translateY = useSharedValue(0);

  const handleBack = useCallback(() => { router.back(); }, [router]);

  const handleZoomChange = useCallback((zoomed: boolean) => {
    setIsZoomed(zoomed);
    isZoomedShared.value = zoomed;
  }, []);

  const swipeDown = Gesture.Pan()
    .failOffsetX([-15, 15])
    .activeOffsetY([10, 500])
    .onUpdate((e) => {
      'worklet';
      if (isZoomedShared.value) return;
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      if (isZoomedShared.value) return;
      if (e.translationY > 120 || e.velocityY > 800) {
        translateY.value = withSpring(600, { damping: 20, stiffness: 120 });
        runOnJS(handleBack)();
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const animRootStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: screenWidth,
    offset: screenWidth * index,
    index,
  }), [screenWidth]);

  const renderItem = useCallback(({ item, index }: { item: GalleryItem; index: number }) => (
    <MediaPage
      item={item}
      isActive={index === activeIndex}
      screenWidth={screenWidth}
      screenHeight={screenHeight}
      insetTop={insets.top}
      insetBottom={insets.bottom}
      onZoomChange={handleZoomChange}
      user={user}
      couple={couple}
    />
  ), [activeIndex, screenWidth, screenHeight, insets.top, insets.bottom, handleZoomChange, user, couple]);

  const keyExtractor = useCallback((item: GalleryItem, index: number) => item.id || String(index), []);

  if (items.length === 0) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <TouchableOpacity
          style={[styles.backBtn, { position: 'absolute', top: insets.top + 6, left: Spacing.md }]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <ChevronLeft color="#fff" size={22} strokeWidth={2.2} />
        </TouchableOpacity>
        <AppText style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: 'Inter-Regular' }}>Media unavailable</AppText>
      </View>
    );
  }

  return (
    <GestureDetector gesture={swipeDown}>
      <Animated.View style={[styles.root, animRootStyle]}>
      <FlatList
        ref={listRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        scrollEnabled={!isZoomed}
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialScrollIndex={initialIndex}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
          setActiveIndex(idx);
          if (isZoomed) setIsZoomed(false);
        }}
        removeClippedSubviews
        windowSize={3}
        maxToRenderPerBatch={3}
      />

      {/* Top chrome — back button + position counter */}
      <LinearGradient
        colors={['rgba(0,0,0,0.70)', 'rgba(0,0,0,0.30)', 'transparent']}
        style={[styles.topGradient, { paddingTop: insets.top + 8, height: insets.top + 64 }]}
        pointerEvents="box-none"
      >
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <ChevronLeft color="#fff" size={22} strokeWidth={2.2} />
          </TouchableOpacity>
          {items.length > 1 && (
            <AppText style={styles.counterText}>{activeIndex + 1} / {items.length}</AppText>
          )}
          {/* Spacer keeps back button left-aligned */}
          <View style={styles.counterSpacer} />
        </View>
      </LinearGradient>
      </Animated.View>
    </GestureDetector>
  );
}

function PermBadge({ icon, label, allowed }: { icon: React.ReactNode; label: string; allowed: boolean }) {
  return (
    <View style={[styles.badge, { borderColor: allowed ? 'rgba(255,46,138,0.35)' : 'rgba(255,255,255,0.10)' }]}>
      {icon}
      <AppText style={[styles.badgeLabel, { color: allowed ? '#fff' : 'rgba(255,255,255,0.32)' }]}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  mediaContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  counterText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: 'rgba(255,255,255,0.80)',
    backgroundColor: 'rgba(0,0,0,0.42)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  counterSpacer: {
    width: 38,
  },
  timestampBadge: {
    position: 'absolute',
    right: Spacing.md,
  },
  timestampBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.55)',
  },
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
