import React, { useEffect, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Platform, Animated,
} from 'react-native';
import AppText from '@/components/AppText';
import { Lock, Trash2, Pencil, Copy } from 'lucide-react-native';
import { MediaReaction } from '@/lib/types';

export const REACTION_EMOJIS = ['❤️', '🔥', '🌶️', '😍', '🤩', '😈', '🫠', '😂'] as const;

type Props = {
  /** Reactions already on this item (for active-state highlight) */
  reactions: MediaReaction[];
  myUserId: string | undefined;
  /** True for media messages; false for text-only */
  isMedia: boolean;
  /** Whether media is already saved to vault (controls lock icon state) */
  isInVault?: boolean;
  /** Whether the current user is the sender/owner */
  isMine: boolean;
  onReact: (emoji: string) => void;
  onSaveToVault?: () => void;
  /** Called when lock is tapped and media IS already in vault */
  onAlreadyInVault?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onCopy?: () => void;
  onDismiss: () => void;
};

export default function MediaActionRow({
  reactions,
  myUserId,
  isMedia,
  isInVault,
  isMine,
  onReact,
  onSaveToVault,
  onAlreadyInVault,
  onDelete,
  onEdit,
  onCopy,
  onDismiss,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Trigger light haptic on mount (native only)
    if (Platform.OS !== 'web') {
      import('expo-haptics').then(Haptics => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      });
    }
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 120,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const myReaction = reactions.find(r => r.user_id === myUserId)?.emoji ?? null;

  return (
    <>
      {/* Full-screen tap-away backdrop */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        activeOpacity={1}
      />

      {/* Floating pill */}
      <Animated.View
        style={[
          styles.pill,
          { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
        ]}
        pointerEvents="box-none"
      >
        {/* Reaction emojis */}
        <View style={styles.reactionGroup}>
          {REACTION_EMOJIS.map(emoji => {
            const isActive = myReaction === emoji;
            return (
              <TouchableOpacity
                key={emoji}
                style={[styles.emojiBtn, isActive && styles.emojiBtnActive]}
                onPress={() => { onDismiss(); onReact(emoji); }}
                activeOpacity={0.75}
                hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
              >
                <AppText style={styles.emojiText}>{emoji}</AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Separator + action icons */}
        <View style={styles.divider} />

        {isMedia ? (
          <View style={styles.actionGroup}>
            {/* Lock */}
            <TouchableOpacity
              style={[styles.actionBtn, isInVault && styles.actionBtnActive]}
              onPress={() => {
                onDismiss();
                if (isInVault) {
                  onAlreadyInVault?.();
                } else {
                  onSaveToVault?.();
                }
              }}
              activeOpacity={0.75}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <AppText style={[styles.actionEmoji, !isInVault && styles.actionEmojiDim]}>🔒</AppText>
            </TouchableOpacity>

            {/* Trash */}
            {isMine && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => { onDismiss(); onDelete?.(); }}
                activeOpacity={0.75}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <AppText style={styles.actionEmoji}>🗑️</AppText>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          // Text-only actions
          <View style={styles.actionGroup}>
            {onCopy && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => { onDismiss(); onCopy(); }}
                activeOpacity={0.75}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Copy color="rgba(255,255,255,0.75)" size={16} strokeWidth={2} />
              </TouchableOpacity>
            )}
            {isMine && onEdit && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => { onDismiss(); onEdit(); }}
                activeOpacity={0.75}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Pencil color="rgba(255,255,255,0.75)" size={16} strokeWidth={2} />
              </TouchableOpacity>
            )}
            {isMine && onDelete && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => { onDismiss(); onDelete(); }}
                activeOpacity={0.75}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Trash2 color="#FF4444" size={16} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 0,
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  reactionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  emojiBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnActive: {
    backgroundColor: 'rgba(255,46,138,0.18)',
  },
  emojiText: {
    fontSize: 22,
    lineHeight: 28,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 6,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: 'rgba(255,46,138,0.15)',
  },
  actionEmoji: {
    fontSize: 20,
    lineHeight: 26,
  },
  actionEmojiDim: {
    opacity: 0.4,
  },
});
