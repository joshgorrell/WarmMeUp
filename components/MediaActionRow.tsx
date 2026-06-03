import React, { useEffect, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Platform, Animated,
} from 'react-native';
import AppText from '@/components/AppText';
import { Trash2, Pencil, Copy } from 'lucide-react-native';
import { MediaReaction } from '@/lib/types';

export const REACTION_EMOJIS = ['❤️', '🔥', '🌶️', '😍', '🤩', '😈', '🫠', '😂'] as const;

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
  const scaleAnim = useRef(new Animated.Value(0.82)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'web') {
      import('expo-haptics').then(Haptics => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      });
    }
    // Faster, snappier spring — closer to iOS tapback feel
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 70,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const myReaction = reactions.find(r => r.user_id === myUserId)?.emoji ?? null;
  const isCompact = screenWidth < COMPACT_THRESHOLD;
  // Larger touch targets — 40/44 instead of 32/36
  const btnSize = isCompact ? 40 : 44;

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
        activeOpacity={0.65}
        hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
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
              activeOpacity={0.65}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
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
                activeOpacity={0.65}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
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
                activeOpacity={0.65}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Copy color="rgba(255,255,255,0.80)" size={16} strokeWidth={2} />
              </TouchableOpacity>
            )}
            {isMine && onEdit && (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
                ]}
                onPress={() => { onDismiss(); onEdit(); }}
                activeOpacity={0.65}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Pencil color="rgba(255,255,255,0.80)" size={16} strokeWidth={2} />
              </TouchableOpacity>
            )}
            {isMine && onDelete && (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
                ]}
                onPress={() => { onDismiss(); onDelete(); }}
                activeOpacity={0.65}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
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
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 14, 24, 0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 20,
    gap: 1,
  },
  reactionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
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
    gap: 1,
  },
  emojiBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnActive: {
    backgroundColor: 'rgba(255,46,138,0.20)',
  },
  emojiText: {
    fontSize: 22,
    lineHeight: 28,
  },
  emojiTextCompact: {
    fontSize: 20,
    lineHeight: 26,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.13)',
    marginHorizontal: 8,
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
    backgroundColor: 'rgba(255,46,138,0.18)',
  },
  actionEmoji: {
    fontSize: 20,
    lineHeight: 26,
  },
  actionEmojiDim: {
    opacity: 0.38,
  },
});
