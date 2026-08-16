import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, Platform, Pressable, Animated,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { BlurView } from 'expo-blur';
import { Lock, EyeOff, Eye, Clock, Maximize2, Play, Pause } from 'lucide-react-native';
import AppText from '@/components/AppText';
import CountdownRing from '@/components/CountdownRing';
import { supabase } from '@/lib/supabase';
import { logDebugEvent } from '@/lib/debugLog';
import { ChatMessage } from '@/lib/types';
import { videoThumbnailPath } from '@/lib/uploadMedia';
import { noteStyles as styles, getBubbleRadii } from './noteHelpers';

export function ShimmerPlaceholder() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.10)', opacity: anim }]} />;
}

export function MediaBubble({ msg, blurEnabled, revealed, onReveal, signedUrl, onOpen, onLongPress, onBurn, bubbleWidth, bubbleHeight, radii, isMine }: {
  msg: ChatMessage;
  blurEnabled: boolean;
  revealed: boolean;
  onReveal: (id: string) => void;
  signedUrl: string | null | undefined;
  onOpen: (m: ChatMessage) => void;
  onLongPress: (m: ChatMessage) => void;
  onBurn: (m: ChatMessage) => void;
  bubbleWidth: number;
  bubbleHeight: number;
  radii: ReturnType<typeof getBubbleRadii>;
  isMine: boolean;
}) {
  const loaded = signedUrl !== undefined;
  const isVideo = msg.media_type === 'video';
  const [locallyRevealed, setLocallyRevealed] = useState(revealed);
  const effectiveRevealed = blurEnabled ? locallyRevealed : true;
  const isBlurred = blurEnabled && !effectiveRevealed;
  const [imgError, setImgError] = useState(false);
  const [retryUrl, setRetryUrl] = useState<string | null>(null);
  const retryAttempted = useRef(false);
  const overlayOpacity = useRef(new Animated.Value(isBlurred ? 1 : 0)).current;
  const prevEffectiveRevealedRef = useRef(effectiveRevealed);
  const videoRef = useRef<Video | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterChecked, setPosterChecked] = useState(false);
  const mediaUrl = retryUrl ?? signedUrl ?? null;

  useEffect(() => {
    let cancelled = false;
    setPosterUrl(null);
    setPosterChecked(false);
    if (!isVideo || !msg.media_storage_path) {
      setPosterChecked(true);
      return;
    }
    const bucket = msg.media_storage_bucket ?? 'chat_media';
    const thumbPath = videoThumbnailPath(msg.media_storage_path);
    supabase.storage.from(bucket).createSignedUrl(thumbPath, 12 * 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data?.signedUrl) setPosterUrl(data.signedUrl);
        setPosterChecked(true);
      })
      .catch(() => { if (!cancelled) setPosterChecked(true); });
    return () => { cancelled = true; };
  }, [isVideo, msg.media_storage_path, msg.media_storage_bucket]);

  useEffect(() => {
    if (!revealed && blurEnabled) {
      setLocallyRevealed(false);
      if (isVideo) {
        videoRef.current?.pauseAsync?.().catch(() => {});
        setVideoPlaying(false);
      }
    }
  }, [revealed, blurEnabled, isVideo]);

  useEffect(() => {
    if (prevEffectiveRevealedRef.current !== effectiveRevealed) {
      prevEffectiveRevealedRef.current = effectiveRevealed;
      Animated.timing(overlayOpacity, { toValue: effectiveRevealed ? 0 : 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [effectiveRevealed, overlayOpacity]);

  useEffect(() => {
    if (isBlurred) {
      overlayOpacity.setValue(1);
      if (isVideo) {
        videoRef.current?.pauseAsync?.().catch(() => {});
        setVideoPlaying(false);
      }
    }
  }, [isBlurred, overlayOpacity, isVideo]);

  const revealMedia = () => { setLocallyRevealed(true); onReveal(msg.id); };
  const handlePhotoPress = () => {
    if (isBlurred) revealMedia();
    else if (blurEnabled) setLocallyRevealed(false);
  };
  const handleVideoOuterPress = () => { if (isBlurred) revealMedia(); };
  const toggleVideoPlayback = async (event?: any) => {
    event?.stopPropagation?.();
    if (isBlurred) { revealMedia(); return; }
    if (!videoRef.current) return;
    try {
      if (videoPlaying) await videoRef.current.pauseAsync();
      else await videoRef.current.playAsync();
    } catch (e: any) {
      setVideoError(true);
      logDebugEvent('chat_video_playback_failed', { messageId: msg.id, error: e?.message ?? String(e) });
    }
  };
  const handleExpandPress = (event: any) => {
    event?.stopPropagation?.();
    if (isBlurred) return;
    videoRef.current?.pauseAsync?.().catch(() => {});
    setVideoPlaying(false);
    onOpen(msg);
  };
  const handleReblurVideo = (event: any) => {
    event?.stopPropagation?.();
    if (!blurEnabled || isBlurred) return;
    videoRef.current?.pauseAsync?.().catch(() => {});
    setVideoPlaying(false);
    setLocallyRevealed(false);
  };
  const cappedHeight = Math.min(bubbleHeight, Math.round(bubbleWidth * 1.35));

  return (
    <Pressable onPress={isVideo ? handleVideoOuterPress : handlePhotoPress} onLongPress={() => onLongPress(msg)} delayLongPress={350} android_ripple={null}
      style={[styles.mediaTap, { width: bubbleWidth, height: cappedHeight }, radii]}>
      {!loaded ? <View style={styles.mediaPlaceholder}><ShimmerPlaceholder /></View> : mediaUrl && !imgError ? <>
        {isVideo ? <>
          {posterUrl && !videoPlaying && <ExpoImage source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />}
          {!posterUrl && !posterChecked && <View style={styles.mediaPlaceholder}><ShimmerPlaceholder /></View>}
          {!isBlurred && <Video ref={videoRef} source={{ uri: mediaUrl }} style={[StyleSheet.absoluteFill, !videoPlaying && posterUrl ? { opacity: 0 } : undefined]}
            resizeMode={ResizeMode.COVER} shouldPlay={false} isLooping={false} useNativeControls={false}
            onPlaybackStatusUpdate={(status: any) => {
              if (status?.isLoaded) { setVideoPlaying(!!status.isPlaying); setVideoError(false); }
              else if (status?.error) { setVideoError(true); logDebugEvent('chat_video_status_error', { messageId: msg.id, error: status.error }); }
            }}
            onError={(error: string) => { setVideoError(true); logDebugEvent('chat_video_load_error', { messageId: msg.id, error }); }} />}
        </> : <ExpoImage key={mediaUrl} source={{ uri: mediaUrl }} style={[StyleSheet.absoluteFill, isBlurred && Platform.OS === 'web' ? { filter: 'blur(40px)', transform: 'scale(1.1)' } as any : undefined]}
          contentFit="cover" cachePolicy="memory-disk" onError={() => {
            if (retryAttempted.current) { logDebugEvent('chat_message_image_load_error_hard', { messageId: msg.id }); setImgError(true); return; }
            retryAttempted.current = true;
            if (msg.media_storage_path) {
              const bucket = msg.media_storage_bucket ?? 'chat_media';
              supabase.storage.from(bucket).createSignedUrl(msg.media_storage_path, 12 * 3600).then(({ data }) => data?.signedUrl ? setRetryUrl(data.signedUrl) : setImgError(true)).catch(() => setImgError(true));
            } else setImgError(true);
          }} />}
        {isBlurred && Platform.OS !== 'web' && <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />}
      </> : <View style={styles.mediaPlaceholder}>{imgError || videoError ? <AppText style={styles.mediaErrorText}>{videoError ? 'Video could not be played' : 'Image failed to load'}</AppText> : <Lock color="rgba(255,255,255,0.5)" size={20} />}</View>}

      {isVideo && loaded && mediaUrl && !imgError && !videoError && (
        <Pressable onPress={toggleVideoPlayback} hitSlop={12} style={localStyles.videoPlayButton}>
          <View style={styles.playCircle}>{videoPlaying ? <Pause color="#fff" size={20} strokeWidth={2.2} /> : <Play color="#fff" size={22} strokeWidth={2.2} fill="#fff" />}</View>
        </Pressable>
      )}
      {loaded && mediaUrl && !imgError && <Animated.View style={[StyleSheet.absoluteFillObject, styles.mediaBlurOverlay, { opacity: overlayOpacity }]} pointerEvents="none"><View style={styles.blurRevealBtn}><EyeOff color="rgba(255,255,255,0.92)" size={20} strokeWidth={2} /></View></Animated.View>}
      {loaded && mediaUrl && !imgError && !isBlurred && <Pressable onPress={handleExpandPress} hitSlop={8} style={localStyles.expandButton}><Maximize2 color="#fff" size={17} strokeWidth={2.4} /></Pressable>}
      {isVideo && blurEnabled && loaded && mediaUrl && !imgError && !isBlurred && <Pressable onPress={handleReblurVideo} hitSlop={8} style={localStyles.reblurButton}><EyeOff color="#fff" size={16} strokeWidth={2.3} /></Pressable>}
      {msg.burns_at && msg.burn_after_seconds && new Date(msg.burns_at).getTime() > Date.now() && <View style={styles.burnBadge} pointerEvents="none"><View style={styles.burnBadgeBg} /><CountdownRing expiresAt={msg.burns_at} totalSeconds={msg.burn_after_seconds} onExpire={() => onBurn(msg)} size={44} /></View>}
      {isMine && loaded && mediaUrl && !imgError && !msg.burns_at && <View style={styles.seenBadge} pointerEvents="none"><View style={styles.seenBadgeBg} />{msg.first_viewed_at ? <Eye color="rgba(255,255,255,0.92)" size={16} strokeWidth={2.5} /> : msg.burn_after_seconds ? <View style={styles.seenBadgeArmed}><Eye color="rgba(255,255,255,0.92)" size={13} strokeWidth={2.5} /><Clock color="rgba(255,179,71,0.95)" size={10} strokeWidth={2.5} style={styles.seenBadgeClock} /></View> : <Eye color="rgba(255,255,255,0.55)" size={16} strokeWidth={2} />}</View>}
    </Pressable>
  );
}

const localStyles = StyleSheet.create({
  videoPlayButton: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 15 },
  expandButton: { position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.58)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', zIndex: 20 },
  reblurButton: { position: 'absolute', top: 10, left: 10, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.58)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', zIndex: 20 },
});

export default MediaBubble;
