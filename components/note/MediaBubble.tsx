import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, Platform, Pressable, Animated,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { BlurView } from 'expo-blur';
import { Lock, EyeOff, Eye, Check, Maximize2, Play, Pause } from 'lucide-react-native';
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

function WebVideoPlayer({
  mediaUrl,
  posterUrl,
  videoPlaying,
  setVideoPlaying,
  setVideoError,
  messageId,
}: {
  mediaUrl: string;
  posterUrl: string | null;
  videoPlaying: boolean;
  setVideoPlaying: (v: boolean) => void;
  setVideoError: (v: boolean) => void;
  messageId: string;
}) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = videoElRef.current;
    if (!v) return;
    if (videoPlaying) {
      v.play().catch((e: any) => {
        setVideoError(true);
        logDebugEvent('chat_video_playback_failed', { messageId, error: e?.message ?? String(e) });
      });
    } else {
      v.pause();
    }
  }, [videoPlaying]);

  return (
    <video
      ref={videoElRef as any}
      src={mediaUrl}
      poster={posterUrl ?? undefined}
      style={{
        position: 'absolute',
        top: 0, left: 0, width: '100%', height: '100%',
        objectFit: 'cover',
        opacity: videoPlaying ? 1 : (posterUrl ? 0 : 1),
      }}
      playsInline
      preload="metadata"
      onError={() => {
        setVideoError(true);
        logDebugEvent('chat_video_load_error', { messageId });
      }}
      onPlay={() => setVideoPlaying(true)}
      onPause={() => setVideoPlaying(false)}
    />
  );
}

function NativeVideoPlayer({
  mediaUrl,
  videoPlaying,
  setVideoPlaying,
  setVideoError,
  messageId,
}: {
  mediaUrl: string;
  videoPlaying: boolean;
  setVideoPlaying: (v: boolean) => void;
  setVideoError: (v: boolean) => void;
  messageId: string;
}) {
  const player = useVideoPlayer({ uri: mediaUrl }, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    const sub = player.addListener('statusChange', (payload: any) => {
      if (payload.status === 'error') {
        setVideoError(true);
        logDebugEvent('chat_video_status_error', { messageId, error: payload.error?.message ?? 'unknown' });
      } else if (payload.status === 'readyToPlay') {
        setVideoError(false);
      }
    });
    return () => sub.remove();
  }, [player, messageId, setVideoError]);

  useEffect(() => {
    const sub = player.addListener('playingChange', (payload: any) => {
      setVideoPlaying(!!payload.isPlaying);
    });
    return () => sub.remove();
  }, [player, setVideoPlaying]);

  useEffect(() => {
    if (videoPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [videoPlaying, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      onFirstFrameRender={() => setVideoError(false)}
    />
  );
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
  const loaded = typeof signedUrl === 'string';
  const isVideo = msg.media_type === 'video';
  const [locallyRevealed, setLocallyRevealed] = useState(revealed);
  const effectiveRevealed = blurEnabled ? locallyRevealed : true;
  const isBlurred = blurEnabled && !effectiveRevealed;
  const [imgError, setImgError] = useState(false);
  const [retryUrl, setRetryUrl] = useState<string | null>(null);
  const [selfFetchedUrl, setSelfFetchedUrl] = useState<string | null>(null);
  const [selfFetchFailed, setSelfFetchFailed] = useState(false);
  const retryAttempted = useRef(false);
  const overlayOpacity = useRef(new Animated.Value(isBlurred ? 1 : 0)).current;
  const prevEffectiveRevealedRef = useRef(effectiveRevealed);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterChecked, setPosterChecked] = useState(false);
  const effectiveSignedUrl = signedUrl ?? selfFetchedUrl;
  const mediaUrl = retryUrl ?? effectiveSignedUrl ?? null;

  // If the parent never resolves a signed URL (batch fetch failed or returned null),
  // attempt a direct fetch after a short delay so the bubble doesn't shimmer forever.
  // Tries the thumbnail first, then falls back to the full-res path.
  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!msg.media_storage_path) return;
      const bucket = msg.media_storage_bucket ?? 'chat_media';
      const thumbPath = msg.thumbnail_path ?? msg.media_storage_path;
      const tryPaths = thumbPath !== msg.media_storage_path
        ? [thumbPath, msg.media_storage_path]
        : [thumbPath];
      for (const path of tryPaths) {
        if (cancelled) return;
        try {
          const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 12 * 3600);
          if (cancelled) return;
          if (!error && data?.signedUrl) {
            setSelfFetchedUrl(data.signedUrl);
            return;
          }
        } catch {}
      }
      if (!cancelled) setSelfFetchFailed(true);
    }, 4000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [loaded, msg.media_storage_path, msg.media_storage_bucket, msg.thumbnail_path]);

  const effectiveLoaded = loaded || selfFetchedUrl !== null || selfFetchFailed;

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
      if (isVideo) setVideoPlaying(false);
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
      if (isVideo) setVideoPlaying(false);
    }
  }, [isBlurred, overlayOpacity, isVideo]);

  const revealMedia = () => { setLocallyRevealed(true); onReveal(msg.id); };
  const handlePhotoPress = () => {
    if (isBlurred) revealMedia();
    else if (blurEnabled) setLocallyRevealed(false);
  };
  const handleVideoOuterPress = () => {
    if (isBlurred) { revealMedia(); return; }
    if (blurEnabled) { setVideoPlaying(false); setLocallyRevealed(false); }
  };
  const toggleVideoPlayback = async (event?: any) => {
    event?.stopPropagation?.();
    if (isBlurred) { revealMedia(); return; }
    setVideoPlaying(!videoPlaying);
  };
  const handleExpandPress = (event: any) => {
    event?.stopPropagation?.();
    if (isBlurred) return;
    setVideoPlaying(false);
    onOpen(msg);
  };
  const cappedHeight = Math.min(bubbleHeight, Math.round(bubbleWidth * 1.35));

  return (
    <Pressable onPress={isVideo ? handleVideoOuterPress : handlePhotoPress} onLongPress={() => onLongPress(msg)} delayLongPress={350} android_ripple={null}
      style={[styles.mediaTap, { width: bubbleWidth, height: cappedHeight }, radii]}>
      {!effectiveLoaded ? <View style={styles.mediaPlaceholder}><ShimmerPlaceholder /></View> : mediaUrl && !imgError ? <>
        {isVideo ? <>
          {posterUrl && !videoPlaying && <ExpoImage source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />}
          {!posterUrl && !posterChecked && <View style={styles.mediaPlaceholder}><ShimmerPlaceholder /></View>}
          {Platform.OS === 'web'
            ? <WebVideoPlayer mediaUrl={mediaUrl!} posterUrl={posterUrl} videoPlaying={videoPlaying} setVideoPlaying={setVideoPlaying} setVideoError={setVideoError} messageId={msg.id} />
            : <NativeVideoPlayer mediaUrl={mediaUrl!} videoPlaying={videoPlaying} setVideoPlaying={setVideoPlaying} setVideoError={setVideoError} messageId={msg.id} />}
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
      </> : <View style={styles.mediaPlaceholder}>{imgError || videoError ? <AppText style={styles.mediaErrorText}>{videoError ? 'Video could not be played' : 'Image failed to load'}</AppText> : selfFetchFailed ? <AppText style={styles.mediaErrorText}>Image failed to load</AppText> : <Lock color="rgba(255,255,255,0.5)" size={20} />}</View>}

      {isVideo && effectiveLoaded && mediaUrl && !imgError && !videoError && !isBlurred && (
        <Pressable onPress={toggleVideoPlayback} hitSlop={12} style={localStyles.videoPlayButton}>
          <View style={styles.playCircle}>{videoPlaying ? <Pause color="#fff" size={20} strokeWidth={2.2} /> : <Play color="#fff" size={22} strokeWidth={2.2} fill="#fff" />}</View>
        </Pressable>
      )}
      {effectiveLoaded && mediaUrl && !imgError && <Animated.View style={[StyleSheet.absoluteFillObject, styles.mediaBlurOverlay, { opacity: overlayOpacity }]} pointerEvents="none"><View style={styles.blurRevealBtn}><EyeOff color="rgba(255,255,255,0.92)" size={20} strokeWidth={2} /></View></Animated.View>}
      {effectiveLoaded && mediaUrl && !imgError && !isBlurred && <Pressable onPress={handleExpandPress} hitSlop={8} style={localStyles.expandButton}><Maximize2 color="#fff" size={17} strokeWidth={2.4} /></Pressable>}
      {msg.burns_at && msg.burn_after_seconds && new Date(msg.burns_at).getTime() > Date.now() && <View style={styles.burnBadge} pointerEvents="none"><View style={styles.burnBadgeBg} /><CountdownRing expiresAt={msg.burns_at} totalSeconds={msg.burn_after_seconds} onExpire={() => onBurn(msg)} size={44} /></View>}
      {isMine && effectiveLoaded && mediaUrl && !imgError && !msg.burns_at && !!msg.first_viewed_at && <View style={styles.seenBadge} pointerEvents="none"><View style={styles.seenBadgeBg} /><Check color="rgba(255,255,255,0.95)" size={17} strokeWidth={2.8} /></View>}
    </Pressable>
  );
}

const localStyles = StyleSheet.create({
  videoPlayButton: { position: 'absolute', left: '50%', top: '50%', width: 64, height: 64, marginLeft: -32, marginTop: -32, alignItems: 'center', justifyContent: 'center', zIndex: 15 },
  expandButton: { position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.58)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', zIndex: 20 },
});

export default MediaBubble;
