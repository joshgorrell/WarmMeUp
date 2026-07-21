import { StyleSheet } from 'react-native';
import { ChatMessage } from '@/lib/types';
import { FontSize, Spacing, Radius } from '@/constants/theme';

export type AttachedMedia = {
  uri: string;
  type: 'photo' | 'video';
  mimeType: string;
  fileName: string;
};

export type EditingState = {
  messageId: string;
  originalText: string;
};

export type MenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Per-message position in its sender group — controls which corners get the tail radius
export type GroupPos = 'solo' | 'first' | 'middle' | 'last';

export function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return timeStr;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${timeStr}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${timeStr}`;
}

export function getDividerLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

// Dynamic bottom margin between messages — iMessage-style grouping rhythm
export function getMessageSpacing(
  item: ChatMessage,
  prevItem: ChatMessage | null,
): number {
  if (!prevItem) return 10;
  const sameSender = item.sender_id === prevItem.sender_id;
  const gap = new Date(item.created_at).getTime() - new Date(prevItem.created_at).getTime();
  if (!sameSender) return 10;
  if (gap < 20_000) return 2;
  if (gap < 60_000) return 5;
  return 10;
}

export function getGroupPos(
  item: ChatMessage,
  prev: ChatMessage | null,
  next: ChatMessage | null,
): GroupPos {
  const GAP = 60_000; // 60 seconds — same grouping threshold as iMessage
  const samePrev = prev && prev.sender_id === item.sender_id &&
    new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() < GAP;
  const sameNext = next && next.sender_id === item.sender_id &&
    new Date(next.created_at).getTime() - new Date(item.created_at).getTime() < GAP;
  if (samePrev && sameNext) return 'middle';
  if (samePrev) return 'last';
  if (sameNext) return 'first';
  return 'solo';
}

// iMessage-style corner radii: full on 3 corners, small tail on the sender-side corner
export function getBubbleRadii(isMine: boolean, pos: GroupPos) {
  const FULL = 20;
  const TAIL = 4;
  if (pos === 'solo') {
    return {
      borderTopLeftRadius: FULL,
      borderTopRightRadius: FULL,
      borderBottomLeftRadius: FULL,
      borderBottomRightRadius: FULL,
    };
  }
  if (isMine) {
    // Tail = bottom-right corner for last/solo in group
    return {
      borderTopLeftRadius: FULL,
      borderTopRightRadius: FULL,
      borderBottomLeftRadius: FULL,
      borderBottomRightRadius: pos === 'last' ? TAIL : FULL,
    };
  } else {
    // Tail = bottom-left corner for last/solo in group
    return {
      borderTopLeftRadius: FULL,
      borderTopRightRadius: FULL,
      borderBottomLeftRadius: pos === 'last' ? TAIL : FULL,
      borderBottomRightRadius: FULL,
    };
  }
}

// Shared styles used by MessageRow, MediaBubble, and the compose bar in note.tsx.
// Keeping them in one place avoids StyleSheet duplication across extracted components.
export const noteStyles = StyleSheet.create({
  list: {
    paddingHorizontal: 10,
    paddingTop: Spacing.md,
    paddingBottom: 80,
  },
  loadingOlderWrap: { alignItems: 'center', paddingVertical: Spacing.sm },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  emptyEmoji: { fontSize: 52, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold', textAlign: 'center' },
  emptySub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 22 },

  // Date separator — centered text only, no lines
  dateDivider: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  dateLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    letterSpacing: 0.4,
  },

  // Message row outer — holds both the swipe-revealed timestamp and the sliding row
  msgRowOuter: {
    position: 'relative',
    overflow: 'visible',
  },

  // Timestamp shown when swiping left
  swipeTimestamp: {
    position: 'absolute',
    right: 0,
    bottom: 8,
    paddingRight: 4,
  },
  swipeTimestampRight: {
    right: 0,
  },

  // Message row
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
  },
  msgRowRight: { justifyContent: 'flex-end' },
  msgRowLeft: { justifyContent: 'flex-start' },

  // Avatar
  msgAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  msgAvatarHidden: {
    backgroundColor: 'transparent',
  },
  msgAvatarText: { fontSize: 11, fontFamily: 'Inter-Bold', color: '#FF8A3D' },

  // Column wrapper so reactions sit under the bubble
  bubbleColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    maxWidth: '75%',
  },
  bubbleColumnRight: {
    alignItems: 'flex-end',
  },

  senderName: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 3,
    marginLeft: 4,
  },

  // Bubble — shared base (radii applied inline)
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
    overflow: 'hidden',
  },
  bubbleOutbound: {
    backgroundColor: '#2A2A34',
  },
  bubbleInboundPad: {
    backgroundColor: '#1E1D28',
  },
  bubbleOutboundMediaOnly: {
    backgroundColor: 'transparent',
  },
  bubbleMenuOpen: {
    opacity: 0.80,
  },
  bubbleMediaOnly: {
    padding: 0,
    paddingHorizontal: 0,
    gap: 0,
    overflow: 'hidden',
  },
  mediaCaption: {
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 2,
  },
  bubbleMetaMedia: {
    paddingHorizontal: 10,
    paddingBottom: 6,
    marginTop: 0,
  },
  bubbleText: {
    fontFamily: 'Inter-Regular',
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-end',
    marginTop: 1,
  },
  bubbleTime: {
    fontFamily: 'Inter-Regular',
  },
  editedLabel: {
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
  },

  // Reaction pills — sit just below the bubble
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: -6,
    marginBottom: 4,
  },
  reactionRowRight: { justifyContent: 'flex-end' },
  reactionRowLeft: { justifyContent: 'flex-start', paddingLeft: 2 },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(20,18,28,0.92)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  reactionPillMine: {
    backgroundColor: 'rgba(255,46,138,0.14)',
    borderColor: 'rgba(255,46,138,0.40)',
  },
  reactionPillEmoji: { fontSize: 13, lineHeight: 18 },
  reactionPillCount: { fontFamily: 'Inter-SemiBold' },

  // Edit banner
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.screen,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  editBannerText: { flex: 1, fontSize: 12, fontFamily: 'Inter-Medium' },

  // Reply banner
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.screen,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  replyBannerAccent: {
    width: 3,
    height: 24,
    borderRadius: 2,
    backgroundColor: '#E8196E',
    flexShrink: 0,
  },
  replyBannerInfo: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  replyBannerName: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#E8196E',
  },
  replyBannerPreview: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.55)',
  },

  // Reply quote block (inside bubble)
  replyQuoteContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  replyQuoteAccent: {
    width: 2.5,
    borderRadius: 2,
    flexShrink: 0,
  },
  replyQuoteTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  replyQuoteSender: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 14,
  },
  replyQuotePreview: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.50)',
    lineHeight: 16,
  },

  // Media bubble
  mediaTap: {
    overflow: 'hidden',
    backgroundColor: '#1A1520',
  },
  mediaPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  mediaErrorText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  mediaBlurOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  blurRevealBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  playTriangle: { color: '#fff', fontSize: 15, marginLeft: 3 },
  uploadPctWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  uploadPctText: { color: '#FF5A3D', fontSize: 11, fontFamily: 'Inter-Bold', minWidth: 30 },

  // Compose
  compose: {
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#050408',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  previewThumb: { width: 44, height: 44, borderRadius: Radius.sm },
  previewInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewLabel: { fontSize: 11, fontFamily: 'Inter-Regular' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingBottom: 2,
  },
  attachIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    maxHeight: 120,
    minHeight: 44,
    lineHeight: 20,
  },
  sendBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeHidden: { display: 'none' },
  inviteBtn: {
    marginTop: Spacing.md,
    backgroundColor: '#FF2E8A',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  inviteBtnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },

  // Menu backdrop
  menuBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.28)',
  },

  // Burn timer countdown badge on media bubbles
  burnBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burnBadgeBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  // Timer picker sheet
  timerSheetBody: {
    gap: 10,
    paddingBottom: 8,
  },
  timerSheetBtn: {
    width: '100%',
    paddingVertical: 14,
  },
});
