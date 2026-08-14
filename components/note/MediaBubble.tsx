import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, Platform, Pressable, Animated,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Lock, EyeOff, Eye, Clock, Maximize2 } from 'lucide-react-native';
import AppText from '@/components/AppText';
import CountdownRing from '@/components/CountdownRing';
import { supabase } from '@/lib/supabase';
import { logDebugEvent } from '@/lib/debugLog';
import { ChatMessage } from '@/lib/types';
import { noteStyles as styles, getBubbleRadii } from './noteHelpers';

// Animated shimmer for media loading state
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
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.10)', opacity: anim }]} />
  );
}

export function MediaBubble({
  msg,
  blurEnabled,
  revealed,
  onReveal,
  signedUrl,
  onOpen,
  onLongPress,
  onBurn,
  bubbleWidth,
  bubbleHeight,
  radii,
  isMine,
}: {
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

  // Keep the privacy toggle local to the media bubble. The parent `revealed`
  // state still records first-view and resets all media when chat loses focus.
  const [locallyRevealed, setLocallyRevealed] = useState(revealed);
  const effectiveRevealed = blurEnabled ? locallyRevealed : true;
  const isBlurred = blurEnabled && !effectiveRevealed;

  const [imgError, setImgError] = useState(false);
  const [retryUrl, setRetryUrl] = useState<string | null>(null);
  const retryAttempted = useRef(false);
  // Fade-in animation for the reveal: 0 = overlay visible, 1 = overlay hidden
  const overlayOpacity = useRef(new Animated.Value(isBlurred ? 1 : 0)).current;
  const prevEffectiveRevealedRef = useRef(effectiveRevealed);

  // If the parent re-blurs media (leaving Chat/backgrounding), honor it locally.
  useEffect(() => {
    if (!revealed && blurEnabled) {
      setLocallyRevealed(false);
    }
  }, [revealed, blurEnabled]);

  useEffect(() => {
    if (prevEffectiveRevealedRef.current !== effectiveRevealed) {
      prevEffectiveRevealedRef.current = effectiveRevealed;
      Animated.timing(overlayOpacity, {
        toValue: effectiveRevealed ? 0 : 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [effectiveRevealed, overlayOpacity]);

  // Sync overlay when blur is re-enabled (e.g. tab leave)
  useEffect(() => {
    if (isBlurred) {
      overlayOpacity.setValue(1);
    }
  }, [isBlurred, overlayOpacity]);

  const handleImagePress = () => {
    if (!blurEnabled) return;

    if (isBlurred) {
      setLocallyRevealed(true);
      // Parent callback records the first view and starts any burn timer.
      onReveal(msg.id);
    } else {
      // A second tap simply hides the media again. Full-screen is handled by
      // the dedicated expand control below.
      setLocallyRevealed(false);
    }
  };

  const handleExpandPress = (event: any) => {
    event?.stopPropagation?.();
    if (isBlurred) return;
    onOpen(msg);
  };

  // Cap portrait height so tall images don't dominate the chat
  const cappedHeight = Math.min(bubbleHeight, Math.round(bubbleWidth * 1.35));

  return (
    <Pressable
      onPress={handleImagePress}
      onLongPress={() => onLongPress(msg)}
      delayLongPress={350}
      android_ripple={null}
      style={[
        styles.mediaTap,
        { width: bubbleWidth, height: cappedHeight },
        radii,
      ]}
    >
      {!loaded ? (
        <View style={styles.mediaPlaceholder}>
          <ShimmerPlaceholder />
        </View>
      ) : (retryUrl ?? signedUrl) && !imgError ? (
        <>
          <ExpoImage
            key={retryUrl ?? signedUrl ?? 'img'}
            source={{ uri: retryUrl ?? signedUrl! }}
            style={[
              StyleSheet.absoluteFill,
              isBlurred && Platform.OS === 'web' ? { filter: 'blur(40px)', transform: 'scale(1.1)' } as any : undefined,
            ]}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => {
              if (retryAttempted.current) {
                logDebugEvent('chat_message_image_load_error_hard', { messageId: msg.id });
                setImgError(true);
                return;
              }
              retryAttempted.current = true;
              logDebugEvent('chat_message_image_load_error_retrying', { messageId: msg.id });
              if (msg.media_storage_path) {
                const bucket = msg.media_storage_bucket ?? 'chat_media';
                supabase.storage.from(bucket).createSignedUrl(msg.media_storage_path, 12 * 3600)
                  .then(({ data }) => {
                    if (data?.signedUrl) {
                      setRetryUrl(data.signedUrl);
                    } else {
                      setImgError(true);
                    }
                  })
                  .catch(() => setImgError(true));
              } else {
                setImgError(true);
              }
            }}
          />
          {/* Native blur via BlurView — matches vault blur quality; blurRadius on expo-image is broken on iOS */}
          {isBlurred && Platform.OS !== 'web' && (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          )}
        </>
      ) : (
        <View style={styles.mediaPlaceholder}>
          {imgError ? (
            <AppText style={styles.mediaErrorText}>Image failed to load</AppText>
          ) : (
            <Lock color="rgba(255,255,255,0.5)" size={20} />
          )}
        </View>
      )}

      {msg.media_type === 'video' && loaded && (retryUrl ?? signedUrl) && !isBlurred && !imgError && (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playCircle}>
            <AppText style={styles.playTriangle}>&#9654;</AppText>
          </View>
        </View>
      )}

      {loaded && (retryUrl ?? signedUrl) && !imgError && (
        <Animated.View
          style={[StyleSheet.absoluteFillObject, styles.mediaBlurOverlay, { opacity: overlayOpacity }]}
          pointerEvents="none"
        >
          <View style={styles.blurRevealBtn}>
            <EyeOff color="rgba(255,255,255,0.92)" size={20} strokeWidth={2} />
          </View>
        </Animated.View>
      )}

      {/* Full-screen is intentionally a separate action from tapping the media.
          Only show it after the photo/video is visible. */}
      {loaded && (retryUrl ?? signedUrl) && !imgError && !isBlurred && (
        <Pressable
          onPress={handleExpandPress}
          hitSlop={8}
          style={localStyles.expandButton}
        >
          <Maximize2 color="#fff" size={17} strokeWidth={2.4} />
        </Pressable>
      )}

      {msg.burns_at && msg.burn_after_seconds && new Date(msg.burns_at).getTime() > Date.now() && (
        <View style={styles.burnBadge} pointerEvents="none">
          <View style={styles.burnBadgeBg} />
          <CountdownRing
            expiresAt={msg.burns_at}
            totalSeconds={msg.burn_after_seconds}
            onExpire={() => onBurn(msg)}
            size={44}
          />
        </View>
      )}
      {/* Sender-side "seen" indicator on all outgoing media */}
      {isMine && loaded && (retryUrl ?? signedUrl) && !imgError && !msg.burns_at && (
        <View style={styles.seenBadge} pointerEvents="none">
          <View style={styles.seenBadgeBg} />
          {msg.first_viewed_at ? (
            <Eye color="rgba(255,255,255,0.92)" size={16} strokeWidth={2.5} />
          ) : msg.burn_after_seconds ? (
            <View style={styles.seenBadgeArmed}>
              <Eye color="rgba(255,255,255,0.92)" size={13} strokeWidth={2.5} />
              <Clock color="rgba(255,179,71,0.95)" size={10} strokeWidth={2.5} style={styles.seenBadgeClock} />
            </View>
          ) : (
            <Eye color="rgba(255,255,255,0.55)" size={16} strokeWidth={2} />
          )}
        </View>
      )}
    </Pressable>
  );
}

const localStyles = StyleSheet.create({
  expandButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    zIndex: 20,
  },
});

export default MediaBubble;
