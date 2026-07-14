import React, { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Platform, Animated,
} from 'react-native';
import AppText from '@/components/AppText';
import { Trash2, Pencil, Copy, Lock, Check, Reply } from 'lucide-react-native';
import { MediaReaction } from '@/lib/types';

type VaultFeedback = 'idle' | 'saved' | 'already';

export const REACTION_EMOJIS = ['❤️', '😘', '🔥', '🌶️', '🍑', '🍆', '😍', '🤩', '💦', '😂'] as const;

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
  onReply?: (emoji: string) => void;
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
  onReply,
  onDismiss,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(0.82)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [vaultFeedback, setVaultFeedback] = useState<VaultFeedback>('idle');
  const vaultIconScale = useRef(new Animated.Value(1)).current;
  const vaultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reactedEmoji, setReactedEmoji] = useState<string | null>(null);
  const emojiScales = useRef<Record<string, Animated.Value>>({});
  const getEmojiScale = (emoji: string) => {
    if (!emojiScales.current[emoji]) {
      emojiScales.current[emoji] = new Animated.Value(1);
    }
    return emojiScales.current[emoji];
  };

  useEffect(() => {
    if (Platform.OS !== 'web') {
      import('expo-haptics').then(Haptics => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      });
    }
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

    return () => {
      if (vaultTimerRef.current) clearTimeout(vaultTimerRef.current);
    };
  }, []);

  const handleVaultPress = () => {
    if (isInVault) {
      pulseVaultIcon();
      setVaultFeedback('already');
      vaultTimerRef.current = setTimeout(() => {
        onDismiss();
        onAlreadyInVault?.();
      }, 900);
    } else {
      pulseVaultIcon();
      setVaultFeedback('saved');
      vaultTimerRef.current = setTimeout(() => {
        onDismiss();
        onSaveToVault?.();
      }, 900);
    }
  };

  const pulseVaultIcon = () => {
    vaultIconScale.setValue(0.6);
    Animated.spring(vaultIconScale, {
      toValue: 1,
      friction: 5,
      tension: 200,
      useNativeDriver: true,
    }).start();
  };

  const myReaction = reactions.find(r => r.user_id === myUserId)?.emoji ?? null;
  const cardWidth = Math.min(Math.max(screenWidth - 32, 280), 360);

  return (
    <>
      {/* Floating card */}
      <Animated.View
        style={[
          styles.card,
          { width: cardWidth, transform: [{ scale: scaleAnim }], opacity: opacityAnim },
        ]}
      >
        {/* Row 1 — Reactions */}
        <View style={styles.reactionRow}>
          {REACTION_EMOJIS.map(emoji => {
            const isActive = myReaction === emoji;
            const scale = getEmojiScale(emoji);
            return (
              <TouchableOpacity
                key={emoji}
                style={[styles.emojiBtn, isActive && styles.emojiBtnActive, reactedEmoji === emoji && styles.emojiBtnReacted]}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    import('expo-haptics').then(Haptics => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    });
                  }
                  Animated.sequence([
                    Animated.timing(scale, { toValue: 1.35, duration: 80, useNativeDriver: true }),
                    Animated.spring(scale, { toValue: 1, friction: 3, tension: 200, useNativeDriver: true }),
                  ]).start();
                  setReactedEmoji(emoji);
                  setTimeout(() => { onDismiss(); onReact(emoji); }, 150);
                }}
                activeOpacity={0.65}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Animated.Text style={[styles.emojiText, { transform: [{ scale }] }]}>{emoji}</Animated.Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Separator */}
        <View style={styles.separator} />

        {/* Row 2 — Actions */}
        <View style={styles.actionRow}>
          {onReply && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => { onDismiss(); onReply(''); }}
              activeOpacity={0.65}
            >
              <Reply color="rgba(255,255,255,0.70)" size={15} strokeWidth={2} />
              <AppText style={styles.actionLabel}>Reply</AppText>
            </TouchableOpacity>
          )}

          {isMedia ? (
            <>
              {onReply && <View style={styles.actionDivider} />}
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  (isInVault || vaultFeedback !== 'idle') && styles.actionBtnActive,
                ]}
                onPress={handleVaultPress}
                activeOpacity={0.65}
                disabled={vaultFeedback !== 'idle'}
              >
                <Animated.View style={{ transform: [{ scale: vaultIconScale }] }}>
                  {vaultFeedback === 'saved' ? (
                    <Check color="#33D17A" size={15} strokeWidth={2.5} />
                  ) : vaultFeedback === 'already' ? (
                    <Check color="#FF2E8A" size={15} strokeWidth={2.5} />
                  ) : (
                    <Lock
                      color={isInVault ? '#FF2E8A' : 'rgba(255,255,255,0.70)'}
                      size={15}
                      strokeWidth={2}
                    />
                  )}
                </Animated.View>
                <AppText
                  style={[
                    styles.actionLabel,
                    vaultFeedback === 'saved' && styles.actionLabelSuccess,
                    (isInVault || vaultFeedback === 'already') && styles.actionLabelActive,
                  ]}
                >
                  {vaultFeedback === 'saved'
                    ? 'Saved!'
                    : vaultFeedback === 'already'
                    ? 'In Vault'
                    : 'Vault'}
                </AppText>
              </TouchableOpacity>

              <>
                <View style={styles.actionDivider} />
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => { onDismiss(); onDelete?.(); }}
                  activeOpacity={0.65}
                >
                  <Trash2 color="#FF4444" size={15} strokeWidth={2} />
                  <AppText style={styles.actionLabelDanger}>Delete</AppText>
                </TouchableOpacity>
              </>
            </>
          ) : (
            <>
              {onCopy && (
                <>
                  {onReply && <View style={styles.actionDivider} />}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => { onDismiss(); onCopy?.(); }}
                    activeOpacity={0.65}
                  >
                    <Copy color="rgba(255,255,255,0.70)" size={15} strokeWidth={2} />
                    <AppText style={styles.actionLabel}>Copy</AppText>
                  </TouchableOpacity>
                </>
              )}

              {isMine && onEdit && (
                <>
                  {(onReply || onCopy) && <View style={styles.actionDivider} />}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => { onDismiss(); onEdit?.(); }}
                    activeOpacity={0.65}
                  >
                    <Pencil color="rgba(255,255,255,0.70)" size={15} strokeWidth={2} />
                    <AppText style={styles.actionLabel}>Edit</AppText>
                  </TouchableOpacity>
                </>
              )}

              {isMine && onDelete && (
                <>
                  {(onReply || onCopy || onEdit) && <View style={styles.actionDivider} />}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => { onDismiss(); onDelete?.(); }}
                    activeOpacity={0.65}
                  >
                    <Trash2 color="#FF4444" size={15} strokeWidth={2} />
                    <AppText style={styles.actionLabelDanger}>Delete</AppText>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16, 14, 24, 0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 20,
    gap: 8,
  },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emojiBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  emojiBtnActive: {
    backgroundColor: 'rgba(255,46,138,0.20)',
  },
  emojiBtnReacted: {
    backgroundColor: 'rgba(255,46,138,0.35)',
    transform: [{ scale: 1.1 }],
  },
  emojiText: {
    fontSize: 22,
    lineHeight: 28,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginHorizontal: -12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  actionBtnActive: {
    backgroundColor: 'rgba(255,46,138,0.15)',
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.70)',
  },
  actionLabelActive: {
    color: '#FF2E8A',
  },
  actionLabelSuccess: {
    color: '#33D17A',
  },
  actionLabelDanger: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#FF4444',
  },
  actionDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
