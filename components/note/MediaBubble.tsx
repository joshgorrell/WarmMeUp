import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, Platform, Pressable, Animated,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Lock, EyeOff, Eye, Clock } from 'lucide-react-native';
import AppText from '@/components/AppText';
import CountdownRing from '@/components/CountdownRing';
import { supabase } from '@/lib/supabase';
import { logDebugEvent } from '@/lib/debugLog';
import { ChatMessage } from '@/lib/types';
import { noteStyles as styles, getBubbleRadii, GroupPos } from './noteHelpers';

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
  const isBlurred = blurEnabled && !revealed;
  const [imgError, setImgError] = useState(false);
  const [retryUrl, setRetryUrl] = useState<string | null>(null);
  const retryAttempted = useRef(false);
  // Fade-in animation for the reveal: 0 = overlay visible, 1 = overlay hidden
  const overlayOpacity = useRef(new Animated.Value(isBlurred ? 1 : 0)).current;
  const prevRevealedRef = useRef(revealed);

  useEffect(() => {
    if (prevRevealedRef.current !== revealed) {
      prevRevealedRef.current = revealed;
      Animated.timing(overlayOpacity, {
        toValue: revealed ? 0 : 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [revealed]);

  // Sync overlay when blur is re-enabled (e.g. tab leave)
  useEffect(() => {
    if (isBlurred) {
      overlayOpacity.setValue(1);
    }
  }, [isBlurred]);

  const handleImagePress = () => {
    if (isBlurred) {
      onReveal(msg.id);
    } else {
      // Small delay so the screen-push doesn't race with any in-flight image transition
      setTimeout(() => onOpen(msg), 30);
    }
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
        <View style={styles.playOverlay}>
          <View style={styles.playCircle}>
            <AppText style={styles.playTriangle}>&#9654;</AppText>
          </View>
        </View>
      )}
      {loaded && (retryUrl ?? signedUrl) && !imgError && (
        <Animated.View
          style={[StyleSheet.absoluteFillObject, styles.mediaBlurOverlay, { opacity: overlayOpacity }]}
          pointerEvents={isBlurred ? 'none' : 'none'}
        >
          <View style={styles.blurRevealBtn}>
            <EyeOff color="rgba(255,255,255,0.92)" size={20} strokeWidth={2} />
          </View>
        </Animated.View>
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

export default MediaBubble;
