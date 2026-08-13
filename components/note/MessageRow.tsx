import React from 'react';
import {
  View, TouchableOpacity, Animated,
} from 'react-native';
import AppText from '@/components/AppText';
import { ChatMessage, MediaReaction } from '@/lib/types';
import ReAnimated, {
  useSharedValue, useAnimatedStyle, withSpring, FadeInDown,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  noteStyles as styles,
  formatTime,
  getDividerLabel,
  getBubbleRadii,
  GroupPos,
} from './noteHelpers';
import { MediaBubble } from './MediaBubble';
import CountdownRing from '@/components/CountdownRing';

export function ReplyQuote({
  msg,
  senderName,
  isMine,
  onPress,
}: {
  msg: ChatMessage;
  senderName?: string;
  isMine: boolean;
  onPress?: (id: string) => void;
}) {
  const hasMedia = !!msg.media_storage_path;
  const preview = msg.content_text ?? (msg.media_type === 'video' ? 'Video' : hasMedia ? 'Photo' : '');
  const accentColor = isMine ? 'rgba(255,255,255,0.55)' : '#E8196E';

  return (
    <TouchableOpacity
      onPress={() => onPress?.(msg.id)}
      style={styles.replyQuoteContainer}
      activeOpacity={0.7}
    >
      <View style={[styles.replyQuoteAccent, { backgroundColor: accentColor }]} />
      <View style={styles.replyQuoteTextCol}>
        <AppText style={[styles.replyQuoteSender, { color: accentColor }]} numberOfLines={1} ellipsizeMode="tail">
          {senderName ?? 'Partner'}
        </AppText>
        <AppText style={styles.replyQuotePreview} numberOfLines={1} ellipsizeMode="tail">
          {preview || '\u00A0'}
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

export const MessageRow = React.memo(function MessageRow({
  item,
  isMine,
  name,
  hasMedia,
  isMenuOpen,
  blurEnabled,
  revealed,
  signedUrl,
  reactions,
  myUserId,
  colors,
  bubbleRefs,
  mediaBubbleWidth,
  mediaBubbleHeight,
  chatFontScale,
  groupPos,
  marginBottom,
  onReveal,
  onOpen,
  onLongPress,
  onBurn,
  onReactQuick,
  prevCreatedAt,
  highlighted,
  repliedMessage,
  replySenderName,
  onJumpToMessage,
}: {
  item: ChatMessage & { __prevCreatedAt?: string | null };
  isMine: boolean;
  name: string;
  hasMedia: boolean;
  isMenuOpen: boolean;
  blurEnabled: boolean;
  revealed: boolean;
  signedUrl: string | null | undefined;
  reactions: MediaReaction[];
  myUserId: string | undefined;
  colors: any;
  bubbleRefs: React.MutableRefObject<Record<string, View | null>>;
  mediaBubbleWidth: number;
  mediaBubbleHeight: number;
  chatFontScale: number;
  groupPos: GroupPos;
  marginBottom: number;
  onReveal: (id: string) => void;
  onOpen: (m: ChatMessage) => void;
  onLongPress: (m: ChatMessage) => void;
  onBurn: (m: ChatMessage) => void;
  onReactQuick: (emoji: string) => void;
  prevCreatedAt?: string | null;
  highlighted?: boolean;
  repliedMessage?: ChatMessage | null;
  replySenderName?: string;
  onJumpToMessage?: (id: string) => void;
}) {
  const highlightAnim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!highlighted) return;
    Animated.sequence([
      Animated.timing(highlightAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
      Animated.delay(1000),
      Animated.timing(highlightAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
    ]).start();
  }, [highlighted]);

  const highlightBg = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,179,71,0)', 'rgba(255,179,71,0.10)'],
  });

  // Swipe-left to reveal timestamp (iOS Messages style)
  const swipeX = useSharedValue(0);
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      'worklet';
      if (e.translationX < 0) {
        swipeX.value = Math.max(e.translationX, -72);
      } else {
        swipeX.value = Math.min(e.translationX * 0.3, 0);
      }
    })
    .onEnd(() => {
      'worklet';
      swipeX.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const swipeRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
  }));
  const timestampStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(swipeX.value) / 40),
    transform: [{ translateX: swipeX.value * 0.4 }],
  }));

  const showDivider = !prevCreatedAt ||
    new Date(prevCreatedAt).toDateString() !== new Date(item.created_at).toDateString();

  const showAvatar = !isMine && (groupPos === 'solo' || groupPos === 'last');
  const showSenderName = !isMine && (groupPos === 'solo' || groupPos === 'first');

  const reactionCounts = reactions.reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
    acc[r.emoji].count++;
    if (r.user_id === myUserId) acc[r.emoji].mine = true;
    return acc;
  }, {});
  const reactionEntries = Object.entries(reactionCounts);

  const radii = getBubbleRadii(isMine, groupPos);
  const mediaOnly = hasMedia && !item.content_text;

  return (
    <>
      {showDivider && (
        <View style={styles.dateDivider}>
          <AppText style={[styles.dateText, { color: colors.textMuted }]}>{getDividerLabel(item.created_at)}</AppText>
        </View>
      )}
      <View style={styles.msgRowOuter}>
        {/* Timestamp revealed by swiping left — positioned to the right of the row */}
        <ReAnimated.View style={[styles.swipeTimestamp, isMine && styles.swipeTimestampRight, timestampStyle]} pointerEvents="none">
          <AppText style={[styles.bubbleTime, { color: 'rgba(255,255,255,0.40)', fontSize: Math.round(11 * chatFontScale) }]}>
            {formatTime(item.created_at)}
          </AppText>
        </ReAnimated.View>
        <GestureDetector gesture={swipeGesture}>
          <ReAnimated.View style={swipeRowStyle} entering={FadeInDown.duration(180).springify().damping(22)}>
            <Animated.View style={[
              styles.msgRow,
              isMine ? styles.msgRowRight : styles.msgRowLeft,
              { backgroundColor: highlightBg, marginBottom },
            ]}>
              {/* Avatar placeholder — keeps layout stable for non-last receiver messages */}
        {!isMine && (
          <View style={[styles.msgAvatar, !showAvatar && styles.msgAvatarHidden, showAvatar && { backgroundColor: 'rgba(255,138,61,0.20)' }]}>
            {showAvatar && (
              <AppText style={styles.msgAvatarText}>{name.charAt(0).toUpperCase()}</AppText>
            )}
          </View>
        )}

        <View style={[styles.bubbleColumn, isMine && styles.bubbleColumnRight]}>
          {showSenderName && (
            <AppText style={[styles.senderName, { color: 'rgba(255,138,61,0.75)' }]}>{name}</AppText>
          )}
          <TouchableOpacity
            ref={ref => { bubbleRefs.current[item.id] = ref as any; }}
            onLongPress={() => onLongPress(item)}
            delayLongPress={350}
            activeOpacity={1}
          >
            {isMine && !mediaOnly ? (
              <View style={[styles.bubble, styles.bubbleOutbound, radii, isMenuOpen && styles.bubbleMenuOpen]}>
                {repliedMessage && (
                  <ReplyQuote
                    msg={repliedMessage}
                    senderName={replySenderName}
                    isMine={isMine}
                    onPress={onJumpToMessage}
                  />
                )}
                {hasMedia && (
                  <MediaBubble
                    msg={item}
                    blurEnabled={blurEnabled}
                    revealed={revealed}
                    onReveal={onReveal}
                    signedUrl={signedUrl}
                    onOpen={onOpen}
                    onLongPress={onLongPress}
                    onBurn={onBurn}
                    bubbleWidth={mediaBubbleWidth}
                    bubbleHeight={mediaBubbleHeight}
                    radii={item.content_text ? { ...radii, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 } : radii}
                    isMine={isMine}
                  />
                )}
                {item.content_text ? (
                  <AppText style={[styles.bubbleText, styles.mediaCaption, {
                    color: '#fff',
                    fontSize: Math.round(15 * chatFontScale),
                    lineHeight: Math.round(15 * chatFontScale * 1.45),
                  }]}>
                    {item.content_text}
                  </AppText>
                ) : null}
                {item.edited_at ? (
                  <AppText style={[styles.editedLabel, {
                    color: 'rgba(255,255,255,0.45)',
                    fontSize: Math.round(10 * chatFontScale),
                    alignSelf: 'flex-end',
                  }]}>
                    edited
                  </AppText>
                ) : null}
                {!hasMedia && item.burns_at && item.burn_after_seconds && new Date(item.burns_at).getTime() > Date.now() && (
                  <View style={styles.textBurnBadge} pointerEvents="none">
                    <View style={styles.textBurnBadgeBg} />
                    <CountdownRing
                      expiresAt={item.burns_at}
                      totalSeconds={item.burn_after_seconds}
                      onExpire={() => onBurn(item)}
                      size={28}
                    />
                  </View>
                )}
              </View>
            ) : (
              <View style={[
                styles.bubble,
                radii,
                isMine
                  ? [styles.bubbleOutboundMediaOnly, isMenuOpen && styles.bubbleMenuOpen]
                  : isMenuOpen && styles.bubbleMenuOpen,
                hasMedia && styles.bubbleMediaOnly,
                !isMine && !hasMedia && styles.bubbleInboundPad,
              ]}>
                  {repliedMessage && (
                    <ReplyQuote
                      msg={repliedMessage}
                      senderName={replySenderName}
                      isMine={isMine}
                      onPress={onJumpToMessage}
                    />
                  )}
                  {hasMedia && (
                  <MediaBubble
                    msg={item}
                    blurEnabled={blurEnabled}
                    revealed={revealed}
                    onReveal={onReveal}
                    signedUrl={signedUrl}
                    onOpen={onOpen}
                    onLongPress={onLongPress}
                    onBurn={onBurn}
                    bubbleWidth={mediaBubbleWidth}
                    bubbleHeight={mediaBubbleHeight}
                    radii={item.content_text ? { ...radii, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 } : radii}
                    isMine={isMine}
                  />
                )}
                {item.content_text ? (
                  <AppText style={[styles.bubbleText, styles.mediaCaption, {
                    color: '#fff',
                    fontSize: Math.round(15 * chatFontScale),
                    lineHeight: Math.round(15 * chatFontScale * 1.45),
                  }]}>
                    {item.content_text}
                  </AppText>
                ) : null}
                {item.edited_at ? (
                  <AppText style={[styles.editedLabel, {
                    color: 'rgba(255,255,255,0.45)',
                    fontSize: Math.round(10 * chatFontScale),
                    alignSelf: 'flex-end',
                  }]}>
                    edited
                  </AppText>
                ) : null}
                {!hasMedia && item.burns_at && item.burn_after_seconds && new Date(item.burns_at).getTime() > Date.now() && (
                  <View style={styles.textBurnBadge} pointerEvents="none">
                    <View style={styles.textBurnBadgeBg} />
                    <CountdownRing
                      expiresAt={item.burns_at}
                      totalSeconds={item.burn_after_seconds}
                      onExpire={() => onBurn(item)}
                      size={28}
                    />
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>

          {/* Reactions — anchored to bubble bottom corner, overlapping slightly */}
          {reactionEntries.length > 0 && (
            <View style={[styles.reactionRow, isMine ? styles.reactionRowRight : styles.reactionRowLeft]}>
              {reactionEntries.map(([emoji, { count, mine }]) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.reactionPill, mine && styles.reactionPillMine]}
                  onPress={() => onReactQuick(emoji)}
                  activeOpacity={0.75}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <AppText style={styles.reactionPillEmoji}>{emoji}</AppText>
                  {count > 1 && (
                    <AppText style={[styles.reactionPillCount, {
                      color: mine ? '#FF2E8A' : 'rgba(255,255,255,0.65)',
                      fontSize: Math.round(10 * chatFontScale),
                    }]}>
                      {count}
                    </AppText>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </Animated.View>
          </ReAnimated.View>
        </GestureDetector>
      </View>
    </>
  );
});

export default MessageRow;
