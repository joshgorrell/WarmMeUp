import React, { useEffect, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Platform, Animated,
} from 'react-native';
import AppText from '@/components/AppText';
import { Trash2, Pencil, Copy } from 'lucide-react-native';
import { MediaReaction } from '@/lib/types';

export const REACTION_EMOJIS = ['❤️', '🔥', '🌶️', '😍', '🤩', '😈', '🫠', '😂'] as const;

// Compact threshold: screens narrower than this use two-row emoji layout
const COMPACT_THRESHOLD = 380;

type Props = {
  reactions: MediaReaction[];
  myUserId: string | undefined;
  isMedia: boolean;
  isInVault?: boolean;
  isMine: boolean;
  screenWidth: number;
  onReact: (emoji: string) => void;
  onSaveToVault?: () => void;
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
  screenWidth,
  onReact,
  onSaveToVault,
  onAlreadyInVault,
  onDelete,
  onEdit,
  onCopy,
  onDismiss,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'web') {
      import('expo-haptics').then(Haptics => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      });
    }
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 90,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const myReaction = reactions.find(r => r.user_id === myUserId)?.emoji ?? null;
  const isCompact = screenWidth < COMPACT_THRESHOLD;
  const btnSize = isCompact ? 32 : 36;

  const renderEmojis = () => {
    if (isCompact) {
      const row1 = REACTION_EMOJIS.slice(0, 4);
      const row2 = REACTION_EMOJIS.slice(4);
      return (
        <View style={styles.emojiCompactWrap}>
          <View style={styles.emojiRow}>
            {row1.map(emoji => renderEmojiBtn(emoji, btnSize))}
          </View>
          <View style={styles.emojiRow}>
            {row2.map(emoji => renderEmojiBtn(emoji, btnSize))}
          </View>
        </View>
      );
    }
    return (
      <View style={styles.reactionGroup}>
        {REACTION_EMOJIS.map(emoji => renderEmojiBtn(emoji, btnSize))}
      </View>
    );
  };

  const renderEmojiBtn = (emoji: string, size: number) => {
    const isActive = myReaction === emoji;
    return (
      <TouchableOpacity
        key={emoji}
        style={[
          styles.emojiBtn,
          { width: size, height: size, borderRadius: size / 2 },
          isActive && styles.emojiBtnActive,
        ]}
        onPress={() => { onDismiss(); onReact(emoji); }}
        activeOpacity={0.72}
        hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
      >
        <AppText style={[styles.emojiText, isCompact && styles.emojiTextCompact]}>
          {emoji}
        </AppText>
      </TouchableOpacity>
    );
  };

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
        {renderEmojis()}

        <View style={styles.divider} />

        {isMedia ? (
          <View style={[styles.actionGroup, { gap: isCompact ? 2 : 4 }]}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
                isInVault && styles.actionBtnActive,
              ]}
              onPress={() => {
                onDismiss();
                if (isInVault) {
                  onAlreadyInVault?.();
                } else {
                  onSaveToVault?.();
                }
              }}
              activeOpacity={0.72}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <AppText style={[styles.actionEmoji, !isInVault && styles.actionEmojiDim]}>🔒</AppText>
            </TouchableOpacity>

            {isMine && (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
                ]}
                onPress={() => { onDismiss(); onDelete?.(); }}
                activeOpacity={0.72}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <AppText style={styles.actionEmoji}>🗑️</AppText>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={[styles.actionGroup, { gap: isCompact ? 2 : 4 }]}>
            {onCopy && (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
                ]}
                onPress={() => { onDismiss(); onCopy(); }}
                activeOpacity={0.72}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Copy color="rgba(255,255,255,0.75)" size={15} strokeWidth={2} />
              </TouchableOpacity>
            )}
            {isMine && onEdit && (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
                ]}
                onPress={() => { onDismiss(); onEdit(); }}
                activeOpacity={0.72}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Pencil color="rgba(255,255,255,0.75)" size={15} strokeWidth={2} />
              </TouchableOpacity>
            )}
            {isMine && onDelete && (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
                ]}
                onPress={() => { onDismiss(); onDelete(); }}
                activeOpacity={0.72}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Trash2 color="#FF4444" size={15} strokeWidth={2} />
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
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 30, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 18,
    gap: 2,
  },
  reactionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  emojiCompactWrap: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    paddingVertical: 2,
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  emojiBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnActive: {
    backgroundColor: 'rgba(255,46,138,0.18)',
  },
  emojiText: {
    fontSize: 20,
    lineHeight: 26,
  },
  emojiTextCompact: {
    fontSize: 18,
    lineHeight: 24,
  },
  divider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(255,255,255,0.13)',
    marginHorizontal: 10,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: 'rgba(255,46,138,0.15)',
  },
  actionEmoji: {
    fontSize: 18,
    lineHeight: 24,
  },
  actionEmojiDim: {
    opacity: 0.38,
  },
});
