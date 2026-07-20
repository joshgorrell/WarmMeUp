import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, StyleSheet, FlatList, KeyboardAvoidingView, Platform,
  TouchableOpacity, TouchableWithoutFeedback, Pressable, ActivityIndicator, TextInput, Alert,
  AppState, AppStateStatus, Keyboard, Animated, LayoutAnimation, UIManager, InteractionManager, BackHandler, Linking,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Image as ImageIcon, Camera, X, Lock, EyeOff, Pencil, ChevronLeft, Phone, Video, Send } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { awardPoints, getPointValue, incrementMonthlyCounter } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { uploadMediaFile, PICKER_OPTIONS, resolveAssetMimeType, mimeToExtension, extensionToMime } from '@/lib/uploadMedia';
import { ChatMessage } from '@/lib/types';
import AppShell from '@/components/AppShell';
import Avatar from '@/components/Avatar';
import { LinearGradient } from 'expo-linear-gradient';
import MediaActionRow from '@/components/MediaActionRow';
import ConfirmSheet, { ConfirmAction } from '@/components/ConfirmSheet';
import { useMediaReactions } from '@/hooks/useMediaReactions';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logDebugEvent } from '@/lib/debugLog';
import { setGalleryItems, getCachedUrl, setCachedUrl, evictCachedUrl } from '@/lib/mediaGalleryStore';
import ReAnimated, {
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return timeStr;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${timeStr}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${timeStr}`;
}

function getDividerLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

// Dynamic bottom margin between messages — iMessage-style grouping rhythm
function getMessageSpacing(
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

type AttachedMedia = {
  uri: string;
  type: 'photo' | 'video';
  mimeType: string;
  fileName: string;
};

type EditingState = {
  messageId: string;
  originalText: string;
};

type MenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Per-message position in its sender group — controls which corners get the tail radius
type GroupPos = 'solo' | 'first' | 'middle' | 'last';

function getGroupPos(
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
function getBubbleRadii(isMine: boolean, pos: GroupPos) {
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

function MediaBubble({
  msg,
  blurEnabled,
  revealed,
  onReveal,
  signedUrl,
  onOpen,
  onLongPress,
  bubbleWidth,
  bubbleHeight,
  radii,
}: {
  msg: ChatMessage;
  blurEnabled: boolean;
  revealed: boolean;
  onReveal: (id: string) => void;
  signedUrl: string | null | undefined;
  onOpen: (m: ChatMessage) => void;
  onLongPress: (m: ChatMessage) => void;
  bubbleWidth: number;
  bubbleHeight: number;
  radii: ReturnType<typeof getBubbleRadii>;
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
              isBlurred && Platform.OS === 'web' ? { filter: 'blur(18px)', transform: 'scale(1.1)' } as any : undefined,
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
            <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
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
    </Pressable>
  );
}

// Animated shimmer for media loading state
function ShimmerPlaceholder() {
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

function ChatHeader({
  partnerName,
  partnerAvatarUri,
  hasPartner,
  partnerIsOnline,
  onBack,
}: {
  partnerName: string;
  partnerAvatarUri: string | null;
  hasPartner: boolean;
  partnerIsOnline: boolean;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[chatHeaderStyles.container, { paddingTop: insets.top + 6 }]}>
      <TouchableOpacity onPress={onBack} style={chatHeaderStyles.backBtn} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <ChevronLeft color="#fff" size={26} strokeWidth={2} />
      </TouchableOpacity>

      <View style={chatHeaderStyles.centerRow}>
        <View style={chatHeaderStyles.avatarWrap}>
          <Avatar name={partnerName} uri={partnerAvatarUri} size="sm" bgColor="rgba(255,46,138,0.20)" />
          {partnerIsOnline && <View style={chatHeaderStyles.onlineDot} />}
        </View>
        <View style={chatHeaderStyles.nameWrap}>
          <AppText style={chatHeaderStyles.name} numberOfLines={1} ellipsizeMode="tail">{partnerName}</AppText>
          {partnerIsOnline && <AppText style={chatHeaderStyles.status}>Active now</AppText>}
        </View>
      </View>

      <View style={chatHeaderStyles.rightIcons}>
        <TouchableOpacity style={chatHeaderStyles.iconBtn} activeOpacity={0.7}>
          <Phone color="rgba(255,255,255,0.70)" size={20} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity style={chatHeaderStyles.iconBtn} activeOpacity={0.7}>
          <Video color="rgba(255,255,255,0.70)" size={22} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={chatHeaderStyles.separator} />
    </View>
  );
}

const chatHeaderStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    position: 'relative',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  centerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  nameWrap: {
    flex: 1,
    minWidth: 0,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#33D17A',
    borderWidth: 1.5,
    borderColor: '#050408',
  },
  name: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: -0.2,
  },
  status: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});

export default function ChatTab() {
  const router = useRouter();
  const { message_id: deepLinkMessageId } = useLocalSearchParams<{ message_id?: string }>();
  const { user, couple, profile, partnerProfile, settings } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const hasPartner = !!couple?.user_b_id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState<AttachedMedia | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  // undefined = not yet fetched, null = failed, string = ready
  const [signedUrls, setSignedUrls] = useState<Record<string, string | null>>({});
  const [editingState, setEditingState] = useState<EditingState | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [pillSize, setPillSize] = useState<{ w: number; h: number } | null>(null);
  const [revealedMedia, setRevealedMedia] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [confirmSheet, setConfirmSheet] = useState<{
    title: string;
    message?: string;
    actions: ConfirmAction[];
  } | null>(null);
  const handledMsgLinkRef = useRef<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const bubbleRefs = useRef<Record<string, View | null>>({});
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const prevMsgCountRef = useRef(0);
  const lastInactiveAtRef = useRef<number | null>(null);
  // Timestamp of the most recent send; used by onContentSizeChange to re-pin
  // the list to the bottom once large media bubbles finish laying out.
  const justSentAtRef = useRef(0);
  const lastContentHeightRef = useRef(0);

  const blurEnabled = settings?.blur_chat_media ?? settings?.blur_media ?? true;
  const chatFontScale = settings?.chat_font_scale ?? 1.0;

  const messageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { reactionsMap, react: reactOnMessage } = useMediaReactions(
    couple?.id,
    user?.id,
    'chat_messages',
    messageIds,
  );
  const { width: screenWidth, height: screenHeight } = useLayout();
  // Larger, more natural media preview — 72% width, square-ish ratio
  const mediaBubbleWidth = Math.min(Math.round(screenWidth * 0.72), 320);
  const mediaBubbleHeight = Math.round(mediaBubbleWidth * 1.0);

  // Re-blur chat media when returning from background + screenshot detection
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev === 'active' && next === 'inactive') {
        lastInactiveAtRef.current = Date.now();
      }
      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        if (blurEnabled) setRevealedMedia(new Set());
        const elapsed = lastInactiveAtRef.current ? Date.now() - lastInactiveAtRef.current : 999;
        if (elapsed < 400 && couple?.id && user?.id) {
          supabase.auth.getSession().then(({ data }) => {
            const token = data?.session?.access_token;
            if (!token) return;
            fetch(`${SUPABASE_URL}/functions/v1/notify-screenshot`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ couple_id: couple.id, detected_by_user_id: user.id, source_screen: 'chat' }),
            }).catch(() => {});
          });
        }
        lastInactiveAtRef.current = null;
      }
    });
    return () => sub.remove();
  }, [blurEnabled, couple?.id, user?.id]);

  // Re-blur when leaving the Chat tab
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (blurEnabled) setRevealedMedia(new Set());
      };
    }, [blurEnabled])
  );

  // Real-time presence — tracks whether the partner currently has the app open
  const [partnerIsOnline, setPartnerIsOnline] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!couple?.id || !user?.id || !hasPartner || !partnerProfile?.id) return;
      const ch = supabase.channel(`presence:couple_${couple.id}`)
        .on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState<{ user_id: string }>();
          const allPresences = (Object.values(state) as Array<Array<{ user_id: string }>>).flat();
          setPartnerIsOnline(allPresences.some(p => p.user_id === partnerProfile.id));
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await ch.track({ user_id: user.id });
          }
        });
      return () => {
        ch.untrack().then(() => supabase.removeChannel(ch)).catch(() => {});
        setPartnerIsOnline(false);
      };
    }, [couple?.id, user?.id, hasPartner, partnerProfile?.id])
  );

  const fetchSignedUrls = useCallback(async (msgs: ChatMessage[]) => {
    const mediaMessages = msgs.filter(m => m.media_storage_path);
    if (mediaMessages.length === 0) return;

    // Seed from cross-navigation module-level cache first
    const seeded: Record<string, string> = {};
    const needsFetch: ChatMessage[] = [];
    for (const m of mediaMessages) {
      const cached = getCachedUrl(m.media_storage_path!);
      if (cached) {
        seeded[m.id] = cached;
      } else {
        needsFetch.push(m);
      }
    }
    if (Object.keys(seeded).length > 0) {
      setSignedUrls(prev => ({ ...prev, ...seeded }));
    }
    if (needsFetch.length === 0) return;

    const byBucket: Record<string, ChatMessage[]> = {};
    for (const m of needsFetch) {
      const bucket = m.media_storage_bucket ?? 'chat_media';
      if (!byBucket[bucket]) byBucket[bucket] = [];
      byBucket[bucket].push(m);
    }

    const results: Record<string, string | null> = {};
    await Promise.all(
      Object.entries(byBucket).map(async ([bucket, bucketMsgs]) => {
        const paths = bucketMsgs.map(m => m.media_storage_path!);
        const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 12 * 60 * 60);
        const pathToUrl = new Map(data?.map(d => [d.path, d.signedUrl]) ?? []);
        for (const m of bucketMsgs) {
          const signed = pathToUrl.get(m.media_storage_path!) ?? null;
          results[m.id] = signed;
          if (signed) setCachedUrl(m.media_storage_path!, signed);
        }
      })
    );

    setSignedUrls(prev => ({ ...prev, ...results }));
  }, []);

  const PAGE_SIZE = 30;
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const oldestCreatedAtRef = useRef<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!couple?.id) return;
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('couple_id', couple.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (data) {
        const sorted = [...data].reverse();
        // Build the URL map from embedded media_url and the module-level cache.
        // For anything still missing, await the Supabase storage signed-URL fetch
        // so that setMessages + setSignedUrls fire together in one batched render.
        const urlMap: Record<string, string> = {};
        const needsNetworkFetch: ChatMessage[] = [];
        for (const m of sorted) {
          if (m.media_url) {
            urlMap[m.id] = m.media_url;
            if (m.media_storage_path) setCachedUrl(m.media_storage_path, m.media_url);
          } else if (m.media_storage_path) {
            const cached = getCachedUrl(m.media_storage_path);
            if (cached) {
              urlMap[m.id] = cached;
            } else {
              needsNetworkFetch.push(m);
            }
          }
        }
        if (needsNetworkFetch.length > 0) {
          const byBucket: Record<string, ChatMessage[]> = {};
          for (const m of needsNetworkFetch) {
            const bucket = m.media_storage_bucket ?? 'chat_media';
            if (!byBucket[bucket]) byBucket[bucket] = [];
            byBucket[bucket].push(m);
          }
          await Promise.all(
            Object.entries(byBucket).map(async ([bucket, bucketMsgs]) => {
              const paths = bucketMsgs.map(m => m.media_storage_path!);
              const { data: urlData } = await supabase.storage.from(bucket).createSignedUrls(paths, 12 * 60 * 60);
              const pathToUrl = new Map(urlData?.map(d => [d.path, d.signedUrl]) ?? []);
              for (const m of bucketMsgs) {
                const signed = pathToUrl.get(m.media_storage_path!) ?? null;
                if (signed) {
                  urlMap[m.id] = signed;
                  setCachedUrl(m.media_storage_path!, signed);
                }
              }
            })
          );
        }
        // Single batched render: messages and all available URLs arrive together.
        setMessages(sorted);
        if (Object.keys(urlMap).length > 0) {
          setSignedUrls(prev => ({ ...prev, ...urlMap }));
        }
        oldestCreatedAtRef.current = sorted[0]?.created_at ?? null;
        setHasMore(data.length === PAGE_SIZE);
      }
    } finally {
      setChatLoading(false);
    }
  }, [couple?.id]);

  const loadOlderMessages = useCallback(async () => {
    if (!couple?.id || loadingOlder || !hasMore || !oldestCreatedAtRef.current) return;
    setLoadingOlder(true);
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('couple_id', couple.id)
        .is('deleted_at', null)
        .lt('created_at', oldestCreatedAtRef.current)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (data && data.length > 0) {
        const sorted = [...data].reverse();
        const urlMap: Record<string, string> = {};
        const needsNetworkFetch: ChatMessage[] = [];
        for (const m of sorted) {
          if (m.media_url) {
            urlMap[m.id] = m.media_url;
            if (m.media_storage_path) setCachedUrl(m.media_storage_path, m.media_url);
          } else if (m.media_storage_path) {
            const cached = getCachedUrl(m.media_storage_path);
            if (cached) {
              urlMap[m.id] = cached;
            } else {
              needsNetworkFetch.push(m);
            }
          }
        }
        if (needsNetworkFetch.length > 0) {
          const byBucket: Record<string, ChatMessage[]> = {};
          for (const m of needsNetworkFetch) {
            const bucket = m.media_storage_bucket ?? 'chat_media';
            if (!byBucket[bucket]) byBucket[bucket] = [];
            byBucket[bucket].push(m);
          }
          await Promise.all(
            Object.entries(byBucket).map(async ([bucket, bucketMsgs]) => {
              const paths = bucketMsgs.map(m => m.media_storage_path!);
              const { data: urlData } = await supabase.storage.from(bucket).createSignedUrls(paths, 12 * 60 * 60);
              const pathToUrl = new Map(urlData?.map(d => [d.path, d.signedUrl]) ?? []);
              for (const m of bucketMsgs) {
                const signed = pathToUrl.get(m.media_storage_path!) ?? null;
                if (signed) {
                  urlMap[m.id] = signed;
                  setCachedUrl(m.media_storage_path!, signed);
                }
              }
            })
          );
        }
        setMessages(prev => [...sorted, ...prev]);
        if (Object.keys(urlMap).length > 0) {
          setSignedUrls(prev => ({ ...prev, ...urlMap }));
        }
        oldestCreatedAtRef.current = sorted[0].created_at;
        setHasMore(data.length === PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [couple?.id, loadingOlder, hasMore]);

  useEffect(() => {
    if (!couple?.id) { setChatLoading(false); return; }
    loadMessages();
    const ch = supabase.channel(`chat_tab_${couple.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `couple_id=eq.${couple.id}` },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          console.log('[CHAT_RECEIVED INSERT]', newMsg);
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            return [...prev, newMsg];
          });
          if (newMsg.media_url) {
            // Signed URL already embedded in the row — no extra round-trip needed.
            setSignedUrls(prev => ({ ...prev, [newMsg.id]: newMsg.media_url! }));
          } else if (newMsg.media_storage_path) {
            fetchSignedUrls([newMsg]);
          }
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `couple_id=eq.${couple.id}` },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `couple_id=eq.${couple.id}` },
        (payload) => {
          const updated = payload.new as ChatMessage;
          console.log('[CHAT_RECEIVED UPDATE]', updated);
          if (updated.deleted_at) {
            setMessages(prev => prev.filter(m => m.id !== updated.id));
            return;
          }
          // Defensively merge: preserve immutable content fields from the existing
          // record in case payload.new arrives with partial data (replica identity
          // race). Only mutable fields (vault_item_id, edited_at, content_text on
          // edit, deleted_at) are applied from the update payload.
          setMessages(prev => prev.map(m => {
            if (m.id !== updated.id) return m;
            return {
              ...m,
              vault_item_id: updated.vault_item_id,
              edited_at: updated.edited_at,
              deleted_at: updated.deleted_at,
              // content_text can change on edit — only overwrite if payload has it
              content_text: updated.content_text !== undefined ? updated.content_text : m.content_text,
              // preserve media fields from existing record as the ground truth
              media_storage_path: m.media_storage_path ?? updated.media_storage_path,
              media_storage_bucket: m.media_storage_bucket ?? updated.media_storage_bucket,
              media_type: m.media_type ?? updated.media_type,
            };
          }));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id]);

  const isLoadingOlderRef = useRef(false);
  useEffect(() => {
    isLoadingOlderRef.current = loadingOlder;
  }, [loadingOlder]);

  useEffect(() => {
    if (messages.length > prevMsgCountRef.current && !isLoadingOlderRef.current) {
      const animated = prevMsgCountRef.current > 0;
      InteractionManager.runAfterInteractions(() => {
        listRef.current?.scrollToEnd({ animated });
      });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      listRef.current?.scrollToEnd({ animated: false });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!deepLinkMessageId || messages.length === 0) return;
    if (handledMsgLinkRef.current === deepLinkMessageId) return;
    const idx = messages.findIndex(m => m.id === deepLinkMessageId);
    if (idx === -1) return;
    handledMsgLinkRef.current = deepLinkMessageId;
    setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: idx,
        animated: true,
        viewPosition: 0.5,
      });
      setHighlightedId(deepLinkMessageId);
      setTimeout(() => setHighlightedId(null), 2000);
    }, 150);
  }, [deepLinkMessageId, messages.length]);

  const handleJumpToMessage = useCallback((msgId: string) => {
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx < 0) return;
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setHighlightedId(msgId);
    setTimeout(() => setHighlightedId(null), 2000);
  }, [messages]);

  const pickMedia = async (source: 'library' | 'camera') => {
    try {
      const ImagePicker = await import('expo-image-picker');
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera Access Required', 'Allow camera access in Settings to send photos and videos.', [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Cancel', style: 'cancel' },
          ]);
          return;
        }
        result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Photo Library Access Required', 'Allow access to your photo library in Settings to send media in Chat.', [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Cancel', style: 'cancel' },
          ]);
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      }
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      const resolvedMime = resolveAssetMimeType(asset);
      const media: AttachedMedia = {
        uri: asset.uri,
        type: isVideo ? 'video' : 'photo',
        mimeType: resolvedMime,
        fileName: `chat_${Date.now()}.${mimeToExtension(resolvedMime)}`,
      };
      // iMessage-style: if no caption is in progress, send immediately on
      // picker confirm — no second tap required. If the user is mid-caption,
      // attach for preview so they can finish typing then tap send.
      if (text.trim().length === 0 && !editingState) {
        await sendMediaMessage(media, '');
      } else {
        setAttachedMedia(media);
      }
    } catch (e: any) {
      Alert.alert('Media Error', e?.message ?? 'Could not open media picker.');
    }
  };

  const uploadChatMedia = async (
    media: AttachedMedia,
    coupleId: string,
    userId: string,
  ): Promise<string | null> => {
    try {
      setUploadProgress(true);
      setUploadPct(0);
      const path = `${coupleId}/${userId}/${media.fileName}`;
      logDebugEvent('chat_photo_upload_started', {
        bucket: 'chat_media',
        path,
        mimeType: media.mimeType,
        uri: media.uri,
      });
      await uploadMediaFile(media.uri, 'chat_media', path, media.mimeType, (pct) => setUploadPct(pct));
      logDebugEvent('chat_photo_upload_success', { bucket: 'chat_media', path });
      return path;
    } catch (e: any) {
      logDebugEvent('chat_photo_upload_error', { error: e?.message ?? String(e) });
      Alert.alert('Upload Failed', e?.message ?? 'Could not upload media. Please try again.');
      return null;
    } finally {
      setUploadProgress(false);
      setUploadPct(0);
    }
  };

  // Core send routine. Accepts explicit media/caption overrides so it can be
  // called directly from the picker (iMessage-style one-tap send) without
  // relying on the `attachedMedia`/`text` state, which avoids async state-race
  // issues. When called with no args, falls back to the state values for the
  // manual compose-then-tap-send flow.
  const sendMediaMessage = async (
    mediaOverride?: AttachedMedia | null,
    captionOverride?: string,
  ): Promise<void> => {
    if (!couple?.id || !user || !hasPartner) return;
    const media = mediaOverride !== undefined ? mediaOverride : attachedMedia;
    const caption = captionOverride !== undefined ? captionOverride.trim() : text.trim();
    const hasText = caption.length > 0;
    const hasMedia = media !== null;
    if (!hasText && !hasMedia) return;
    setSending(true);

    let chatStoragePath: string | null = null;

    if (hasMedia && media) {
      chatStoragePath = await uploadChatMedia(media, couple.id, user.id);
      if (!chatStoragePath) {
        setSending(false);
        return;
      }
    }

    // Generate a signed URL immediately after upload so the recipient
    // receives it inside the realtime INSERT event — no extra round-trip needed.
    let preSignedMediaUrl: string | null = null;
    if (chatStoragePath) {
      const { data: signedData, error: signError } = await supabase.storage
        .from('chat_media')
        .createSignedUrl(chatStoragePath, 24 * 3600);
      preSignedMediaUrl = signedData?.signedUrl ?? null;
      logDebugEvent('chat_photo_presigned_url', {
        present: !!preSignedMediaUrl,
        path: chatStoragePath,
        error: signError?.message ?? null,
      });
    }

    // Capture local URI before any state resets — used as immediate preview fallback.
    const localMediaUri = media?.uri ?? null;

    // Optimistic display — show the message in the sender's own list immediately
    // using a temporary ID. The local file URI is used as the image source so the
    // sender sees the image instantly without a separate signed URL fetch.
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      couple_id: couple.id,
      sender_id: user.id,
      content_text: hasText ? caption : null,
      media_url: preSignedMediaUrl,
      media_storage_path: chatStoragePath,
      media_storage_bucket: hasMedia ? 'chat_media' : null,
      media_type: media?.type === 'video' ? 'video' : hasMedia ? 'photo' : null,
      allow_screenshot: false,
      allow_save: settings?.vault_allow_save_default ?? false,
      allow_share: settings?.vault_allow_share_default ?? false,
      vault_item_id: null,
      reply_to: replyingTo?.id ?? null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    // Mark that a send just happened so onContentSizeChange re-pins to the
    // bottom once the (possibly large) media bubble finishes laying out.
    justSentAtRef.current = Date.now();
    // Clear after 3s so partner messages arriving later don't force-scroll
    // while the user is reading older messages.
    setTimeout(() => { justSentAtRef.current = 0; }, 3000);
    // Use the local file URI immediately for the sender's own preview.
    if (localMediaUri) {
      setSignedUrls(prev => ({ ...prev, [tempId]: localMediaUri }));
    }

    const payload = {
      couple_id: couple.id,
      sender_id: user.id,
      content_text: hasText ? caption : null,
      media_url: preSignedMediaUrl,
      media_storage_path: chatStoragePath,
      media_storage_bucket: hasMedia ? 'chat_media' : null,
      media_type: media?.type ?? null,
      allow_screenshot: false,
      allow_save: settings?.vault_allow_save_default ?? false,
      allow_share: settings?.vault_allow_share_default ?? false,
      vault_item_id: null,
      reply_to: replyingTo?.id ?? null,
    };
    logDebugEvent('chat_message_insert_media_field', {
      media_url_present: !!payload.media_url,
      media_storage_path: payload.media_storage_path,
      media_storage_bucket: payload.media_storage_bucket,
      media_type: payload.media_type,
    });
    console.log('[CHAT_SEND]', payload);
    const { data, error: insertError } = await supabase.from('chat_messages').insert(payload).select().single();
    console.log('[CHAT_INSERT_RESULT]', { data, error: insertError });
    logDebugEvent('chat_message_insert_result', {
      success: !insertError && !!data,
      error: insertError?.message ?? null,
      returned_media_url_present: !!(data as any)?.media_url,
      returned_media_storage_path: (data as any)?.media_storage_path ?? null,
    });

    if (insertError || !data) {
      // Roll back the optimistic message on failure.
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setSignedUrls(prev => { const next = { ...prev }; delete next[tempId]; return next; });
      Alert.alert('Send failed', 'Your message could not be sent. Please try again.');
      setSending(false);
      return;
    }

    // Replace the temporary optimistic record with the real DB row and carry
    // the signed URL forward so the image stays visible without a re-fetch.
    // Priority: pre-signed URL > local file URI (immediate preview).
    // If neither is available, fall back to fetchSignedUrls so the image loads.
    setMessages(prev => prev.map(m => m.id === tempId ? { ...data as ChatMessage } : m));
    const bestUrl = preSignedMediaUrl ?? localMediaUri;
    if (chatStoragePath) {
      setSignedUrls(prev => {
        const next = { ...prev };
        delete next[tempId];
        if (bestUrl) {
          next[data.id] = bestUrl;
        }
        return next;
      });
      // If we don't have a URL at all, trigger a fresh signed URL fetch.
      if (!bestUrl) {
        fetchSignedUrls([{ ...data as ChatMessage }]);
      }
      logDebugEvent('chat_message_render_image_url_present', {
        messageId: data.id,
        urlPresent: !!bestUrl,
        source: preSignedMediaUrl ? 'presigned' : localMediaUri ? 'local_uri' : 'fetch_fallback',
      });
    }

    const capturedMedia = media;
    // Only clear composer state when this send was driven by the compose bar
    // (no overrides) — a direct picker send has nothing to clear.
    if (mediaOverride === undefined) {
      setText('');
      setAttachedMedia(null);
      setReplyingTo(null);
    }
    setSending(false);

    const coupleId = couple.id;
    const userId = user.id;
    const messageId = data.id;

    Promise.resolve().then(async () => {
      if (capturedMedia && chatStoragePath && (settings?.chat_auto_save_to_vault ?? true)) {
        try {
          const videoExt = Platform.OS === 'ios' ? 'mov' : 'mp4';
          const ext = capturedMedia.type === 'video' ? videoExt : 'jpg';
          const vaultPath = `${coupleId}/${userId}/vault_${Date.now()}.${ext}`;
          const { data: srcData } = await supabase.storage.from('chat_media').createSignedUrl(chatStoragePath, 120);
          if (!srcData?.signedUrl) throw new Error('Could not access uploaded media for vault save.');
          await uploadMediaFile(srcData.signedUrl, 'vault', vaultPath, capturedMedia.mimeType);
          const { data: vaultData } = await supabase.from('vault_items').insert({
            couple_id: coupleId,
            uploaded_by_user_id: userId,
            media_type: capturedMedia.type,
            file_path: vaultPath,
            storage_path: vaultPath,
            storage_bucket: 'vault',
            allow_screenshot: false,
            allow_save: settings?.vault_allow_save_default ?? false,
            allow_share: settings?.vault_allow_share_default ?? false,
            chat_message_id: messageId,
          }).select('id').single();
          if (vaultData?.id) {
            await supabase.from('chat_messages').update({ vault_item_id: vaultData.id }).eq('id', messageId);
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, vault_item_id: vaultData.id } : m));
          }
        } catch (e: any) {
          Alert.alert('Vault Save Failed', 'The media was sent but could not be saved to your Vault. You can save it manually from the chat bubble.');
        }
      }

      try {
        const eventKey = capturedMedia ? 'chat_media' : 'chat_message';
        const pts = await getPointValue(eventKey);
        const reason = capturedMedia ? 'Chat media' : 'Chat message';
        await awardPoints(coupleId, userId, pts, reason);
        const field = capturedMedia ? 'media_sent' : 'chat_messages_sent';
        await incrementMonthlyCounter(coupleId, userId, field, pts);
      } catch {
        // non-critical
      }
    });

    notifyPartner({ event_type: 'new_message', couple_id: coupleId, target_route: '/(app)/(tabs)/note', partnerUserId: partnerProfile?.id, message_text: hasText ? caption : undefined });
  };

  const handleSend = async () => {
    if (editingState) {
      await handleSaveEdit();
      return;
    }
    await sendMediaMessage();
  };

  const handleSaveEdit = async () => {
    if (!editingState) return;
    const newText = text.trim();
    if (!newText) return;
    setSending(true);
    const editedAt = new Date().toISOString();
    const { error } = await supabase
      .from('chat_messages')
      .update({ content_text: newText, edited_at: editedAt })
      .eq('id', editingState.messageId)
      .eq('sender_id', user!.id);
    if (error) {
      setSending(false);
      Alert.alert('Edit Failed', 'Your edit could not be saved. Please try again.');
      return;
    }
    setMessages(prev => prev.map(m =>
      m.id === editingState.messageId
        ? { ...m, content_text: newText, edited_at: editedAt }
        : m
    ));
    setText('');
    setEditingState(null);
    setSending(false);
  };

  const handleCancelEdit = () => {
    setEditingState(null);
    setText('');
  };

  const handleLongPress = (msg: ChatMessage) => {
    const ref = bubbleRefs.current[msg.id];
    if (!ref) return;
    ref.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setActiveMenuId(msg.id);
    });
  };

  const handleDismissMenu = () => {
    setActiveMenuId(null);
    setMenuAnchor(null);
    setPillSize(null);
  };

  // Android back button closes the popover instead of navigating away
  useEffect(() => {
    if (!activeMenuId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleDismissMenu();
      return true;
    });
    return () => sub.remove();
  }, [activeMenuId]);

  const handleStartEdit = (msg: ChatMessage) => {
    handleDismissMenu();
    setReplyingTo(null);
    setEditingState({ messageId: msg.id, originalText: msg.content_text ?? '' });
    setText(msg.content_text ?? '');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleStartReply = (msg: ChatMessage) => {
    handleDismissMenu();
    setEditingState(null);
    setReplyingTo(msg);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleDeleteMessage = (msg: ChatMessage) => {
    handleDismissMenu();
    const hasMedia = !!msg.media_storage_path;
    const autoSaveOn = settings?.chat_auto_save_to_vault ?? true;

    const softDeleteChat = async () => {
      const deletedAt = new Date().toISOString();
      const { error } = await supabase
        .from('chat_messages')
        .update({ deleted_at: deletedAt })
        .eq('id', msg.id)
        .eq('couple_id', couple!.id);
      return error;
    };

    const deleteVaultItem = async (): Promise<string | null> => {
      if (!msg.vault_item_id) return null;
      const { data: vi, error: fetchErr } = await supabase
        .from('vault_items')
        .select('storage_path, storage_bucket')
        .eq('id', msg.vault_item_id)
        .maybeSingle();
      if (fetchErr) return fetchErr.message;
      const deletedAt = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from('vault_items')
        .update({ deleted_at: deletedAt })
        .eq('id', msg.vault_item_id);
      if (updateErr) return updateErr.message;
      if (vi?.storage_path) {
        supabase.storage.from(vi.storage_bucket ?? 'vault').remove([vi.storage_path]).catch(() => {});
      }
      return null;
    };

    if (!hasMedia) {
      const doDelete = async () => {
        setMessages(prev => prev.filter(m => m.id !== msg.id));
        await softDeleteChat();
      };
      if (Platform.OS === 'web') {
        if (window.confirm('Delete this message? This cannot be undone.')) doDelete();
      } else {
        setConfirmSheet({
          title: 'Delete message',
          message: 'This will permanently remove the message.',
          actions: [
            { label: 'Delete', style: 'destructive', onPress: doDelete },
            { label: 'Cancel', style: 'cancel', onPress: () => {} },
          ],
        });
      }
      return;
    }

    if (!autoSaveOn || !msg.vault_item_id) {
      const doDelete = async () => {
        setMessages(prev => prev.filter(m => m.id !== msg.id));
        const chatErr = await softDeleteChat();
        if (chatErr) {
          Alert.alert('Delete Failed', 'Could not remove the message. Please try again.');
          return;
        }
        if (msg.media_storage_path) {
          const bucket = msg.media_storage_bucket ?? 'chat_media';
          supabase.storage.from(bucket).remove([msg.media_storage_path]).catch(() => {});
        }
      };
      if (Platform.OS === 'web') {
        if (window.confirm('Delete from chat? This will remove the photo/video from this chat.')) doDelete();
      } else {
        setConfirmSheet({
          title: 'Delete from chat?',
          message: 'This will remove the photo/video from this chat.',
          actions: [
            { label: 'Delete', style: 'destructive', onPress: doDelete },
            { label: 'Cancel', style: 'cancel', onPress: () => {} },
          ],
        });
      }
      return;
    }

    const doChatOnly = async () => {
      setMessages(prev => prev.filter(m => m.id !== msg.id));
      const chatErr = await softDeleteChat();
      if (chatErr) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
        Alert.alert('Delete Failed', 'Could not remove the message. Please try again.');
      }
    };

    const doChatAndVault = async () => {
      const vaultErr = await deleteVaultItem();
      if (vaultErr) {
        Alert.alert('Delete Failed', `Could not remove from Vault: ${vaultErr}\n\nNo changes were made.`);
        return;
      }
      setMessages(prev => prev.filter(m => m.id !== msg.id));
      const chatErr = await softDeleteChat();
      if (chatErr) {
        Alert.alert('Partial Delete', 'Removed from Vault but could not remove from Chat. Pull to refresh.');
        return;
      }
      if (msg.media_storage_path) {
        const bucket = msg.media_storage_bucket ?? 'chat_media';
        supabase.storage.from(bucket).remove([msg.media_storage_path]).catch(() => {});
      }
    };

    if (Platform.OS === 'web') {
      const choice = window.confirm('Delete media?\n\nOK = Delete from Chat and Vault\nCancel = keep in Vault');
      if (choice) {
        doChatAndVault();
      } else {
        if (window.confirm('Delete from Chat only? (Vault copy will be kept)')) {
          doChatOnly();
        }
      }
    } else {
      setConfirmSheet({
        title: 'Delete media?',
        message: msg.vault_item_id
          ? 'This photo/video is saved in your Vault. Choose what to delete.'
          : 'Remove this media from the chat.',
        actions: [
          { label: 'Delete from Chat only', style: 'default', onPress: doChatOnly },
          { label: 'Delete from Chat and Vault', style: 'destructive', onPress: doChatAndVault },
          { label: 'Cancel', style: 'cancel', onPress: () => {} },
        ],
      });
    }
  };

  const handleOpenMedia = useCallback((msg: ChatMessage) => {
    if (!msg.media_storage_path) return;

    // Build gallery from all chat messages that have media, in chronological order
    const mediaMessages = messages.filter(m => !!m.media_storage_path);
    const gallery = mediaMessages.map(m => ({
      id: m.id,
      storagePath: m.media_storage_path!,
      storageBucket: m.media_storage_bucket ?? 'chat_media',
      coupleId: m.couple_id,
      mediaType: m.media_type ?? 'photo',
      allowScreenshot: m.allow_screenshot,
      allowSave: m.allow_save,
      allowShare: m.allow_share,
      createdAt: m.created_at,
      uploaderName: null,
      signedUri: signedUrls[m.id] ?? null,
      thumbUri: null,
      interactionId: null,
    }));

    const initialIndex = gallery.findIndex(g => g.id === msg.id);
    setGalleryItems(gallery);

    // Pass the tapped item's data as URL params too — vault-viewer uses these
    // as a guaranteed fallback if the module-level store is cleared before render.
    router.push({
      pathname: '/(app)/vault-viewer',
      params: {
        initialIndex: String(Math.max(0, initialIndex)),
        id: msg.id,
        storagePath: msg.media_storage_path,
        storageBucket: msg.media_storage_bucket ?? 'chat_media',
        coupleId: msg.couple_id,
        mediaType: msg.media_type ?? 'photo',
        allowScreenshot: msg.allow_screenshot ? '1' : '0',
        allowSave: msg.allow_save ? '1' : '0',
        allowShare: msg.allow_share ? '1' : '0',
        signedUri: signedUrls[msg.id] ?? '',
      },
    });
  }, [router, messages, signedUrls]);

  const handleSaveToVault = useCallback(async (msg: ChatMessage) => {
    if (!msg.media_storage_path || !couple?.id || !user) return;
    if (msg.vault_item_id) return;
    const srcBucket = msg.media_storage_bucket ?? 'chat_media';
    const srcExt = (msg.media_storage_path?.split('.').pop() ?? '').toLowerCase();
    const mimeType = extensionToMime(srcExt);
    const destPath = `${couple.id}/${user.id}/vault_${Date.now()}.${srcExt || mimeToExtension(mimeType)}`;
    try {
      const { data: srcData } = await supabase.storage.from(srcBucket).createSignedUrl(msg.media_storage_path, 120);
      if (!srcData?.signedUrl) throw new Error('Could not access source media.');
      await uploadMediaFile(srcData.signedUrl, 'vault', destPath, mimeType);
      const { data: vaultData } = await supabase.from('vault_items').insert({
        couple_id: couple.id,
        uploaded_by_user_id: user.id,
        media_type: msg.media_type ?? 'photo',
        file_path: destPath,
        storage_path: destPath,
        storage_bucket: 'vault',
        allow_screenshot: msg.allow_screenshot,
        allow_save: msg.allow_save,
        allow_share: msg.allow_share,
        chat_message_id: msg.id,
      }).select('id').single();
      if (vaultData?.id) {
        await supabase.from('chat_messages').update({ vault_item_id: vaultData.id }).eq('id', msg.id);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, vault_item_id: vaultData.id } : m));
      }
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message ?? 'Could not save to Vault. Please try again.');
    }
  }, [couple?.id, user]);

  const handleRevealMedia = useCallback((id: string) => {
    setRevealedMedia(prev => new Set([...prev, id]));
  }, []);

  const handleCopy = useCallback((msg: ChatMessage) => {
    if (!msg.content_text) return;
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(msg.content_text).catch(() => {});
    } else {
      import('expo-clipboard').then(Clipboard => {
        Clipboard.setStringAsync(msg.content_text!).catch(() => {});
      }).catch(() => {});
    }
  }, []);

  const renderItem = useCallback(({ item, index }: { item: ChatMessage & { __prevCreatedAt?: string | null; __nextCreatedAt?: string | null; __prevSenderId?: string | null; __nextSenderId?: string | null }; index: number }) => {
    const isMine = item.sender_id === user?.id;
    const name = isMine ? (profile?.display_name ?? 'You') : (partnerProfile?.display_name ?? 'Partner');
    const hasMedia = !!item.media_storage_path;
    const isMenuOpen = activeMenuId === item.id;
    const itemReactions = reactionsMap[item.id] ?? [];
    const repliedMessage = item.reply_to ? messages.find(m => m.id === item.reply_to) : null;

    const prevMsg = (item.__prevCreatedAt && item.__prevSenderId) ? { created_at: item.__prevCreatedAt, sender_id: item.__prevSenderId } as ChatMessage : null;
    const nextMsg = (item.__nextCreatedAt && item.__nextSenderId) ? { created_at: item.__nextCreatedAt, sender_id: item.__nextSenderId } as ChatMessage : null;
    const groupPos = getGroupPos(item, prevMsg, nextMsg);
    const marginBottom = prevMsg ? getMessageSpacing(item, prevMsg) : 10;

    return (
      <MessageRow
        item={item}
        isMine={isMine}
        name={name}
        hasMedia={hasMedia}
        isMenuOpen={isMenuOpen}
        blurEnabled={blurEnabled}
        revealed={revealedMedia.has(item.id)}
        signedUrl={hasMedia ? signedUrls[item.id] : undefined}
        reactions={itemReactions}
        myUserId={user?.id}
        colors={colors}
        bubbleRefs={bubbleRefs}
        mediaBubbleWidth={mediaBubbleWidth}
        mediaBubbleHeight={mediaBubbleHeight}
        chatFontScale={chatFontScale}
        groupPos={groupPos}
        marginBottom={marginBottom}
        onReveal={handleRevealMedia}
        onOpen={handleOpenMedia}
        onLongPress={handleLongPress}
        onReactQuick={(emoji) => reactOnMessage(item.id, emoji, item.sender_id)}
        prevCreatedAt={index > 0 ? (item as any).__prevCreatedAt : undefined}
        highlighted={item.id === highlightedId}
        repliedMessage={repliedMessage}
        replySenderName={repliedMessage ? (repliedMessage.sender_id === user?.id ? 'You' : (partnerProfile?.first_name || partnerProfile?.display_name || 'Partner')) : undefined}
        onJumpToMessage={handleJumpToMessage}
      />
    );
  }, [user?.id, profile?.display_name, partnerProfile?.display_name, partnerProfile?.first_name, activeMenuId, reactionsMap, colors, blurEnabled, revealedMedia, signedUrls, handleRevealMedia, handleOpenMedia, mediaBubbleWidth, mediaBubbleHeight, chatFontScale, reactOnMessage, highlightedId, messages]);

  const messagesWithPrev = useMemo(() =>
    messages.map((m, i) => ({
      ...m,
      __prevCreatedAt: i > 0 ? messages[i - 1].created_at : null,
      __prevSenderId: i > 0 ? messages[i - 1].sender_id : null,
      __nextCreatedAt: i < messages.length - 1 ? messages[i + 1].created_at : null,
      __nextSenderId: i < messages.length - 1 ? messages[i + 1].sender_id : null,
    })),
    [messages]
  );

  const canSend = editingState
    ? text.trim().length > 0 && !sending
    : (text.trim().length > 0 || attachedMedia !== null) && !sending && !uploadProgress;

  const activeMsg = useMemo(
    () => (activeMenuId ? messages.find(m => m.id === activeMenuId) ?? null : null),
    [activeMenuId, messages],
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#05040A' }}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#05040A' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <AppShell scrollable={false} noTopPadding>
          {/* Chat-specific header */}
          <ChatHeader
            partnerName={partnerProfile?.display_name ?? (hasPartner ? 'Partner' : 'Chat')}
            partnerAvatarUri={partnerProfile?.avatar_url ?? null}
            hasPartner={hasPartner}
            partnerIsOnline={partnerIsOnline}
            onBack={() => router.replace('/(app)/(tabs)')}
          />

          {chatLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={colors.textMuted} />
            </View>
          ) : !hasPartner ? (
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.emptyState}>
                <AppText style={styles.emptyEmoji}>💬</AppText>
                <AppText style={[styles.emptyTitle, { color: colors.text }]}>Your private chat</AppText>
                <AppText style={[styles.emptySub, { color: colors.textSecondary }]}>
                  Messages will appear here once your partner joins.{'\n'}Only the two of you will ever see this.
                </AppText>
                <TouchableOpacity
                  onPress={() => router.push('/(app)/account')}
                  style={styles.inviteBtn}
                  activeOpacity={0.8}
                >
                  <AppText style={styles.inviteBtnText}>Invite Partner</AppText>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          ) : messages.length === 0 ? (
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.emptyState}>
                <AppText style={styles.emptyEmoji}>💬</AppText>
                <AppText style={[styles.emptyTitle, { color: colors.text }]}>Start the conversation</AppText>
                <AppText style={[styles.emptySub, { color: colors.textSecondary }]}>
                  Send a message, photo, or video.{'\n'}Only the two of you will see it.
                </AppText>
              </View>
            </TouchableWithoutFeedback>
          ) : (
            <FlatList
              ref={listRef}
              data={messagesWithPrev}
              keyExtractor={m => m.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              onScroll={(e) => {
                if (e.nativeEvent.contentOffset.y < 80) {
                  loadOlderMessages();
                }
              }}
              scrollEventThrottle={200}
              onScrollBeginDrag={handleDismissMenu}
              onContentSizeChange={(_w, h) => {
                // Re-pin to bottom after a send once large media bubbles finish
                // laying out. Guarded by justSentAtRef so it never fights the
                // user when they scroll up to read older messages.
                if (justSentAtRef.current > 0 && h > lastContentHeightRef.current) {
                  listRef.current?.scrollToEnd({ animated: false });
                }
                lastContentHeightRef.current = h;
              }}
              onScrollToIndexFailed={({ index }) => {
                setTimeout(() => {
                  listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
                }, 300);
              }}
              ListHeaderComponent={loadingOlder ? (
                <View style={styles.loadingOlderWrap}>
                  <ActivityIndicator color="rgba(255,255,255,0.3)" size="small" />
                </View>
              ) : null}
            />
          )}

          {/* Edit mode banner */}
          {editingState && (
            <View style={[styles.editBanner, { backgroundColor: 'rgba(255,138,61,0.12)', borderTopColor: 'rgba(255,138,61,0.3)' }]}>
              <Pencil color="#FF8A3D" size={13} strokeWidth={2} />
              <AppText style={[styles.editBannerText, { color: '#FF8A3D' }]}>Editing message</AppText>
              <TouchableOpacity onPress={handleCancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color="#FF8A3D" size={15} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}

          {/* Reply banner */}
          {replyingTo && (
            <View style={[styles.replyBanner, { backgroundColor: 'rgba(232,25,110,0.10)', borderTopColor: 'rgba(232,25,110,0.25)' }]}>
              <View style={styles.replyBannerAccent} />
              <View style={styles.replyBannerInfo}>
                <AppText style={styles.replyBannerName}>
                  {replyingTo.sender_id === user?.id ? 'You' : (partnerProfile?.first_name || partnerProfile?.display_name || 'Partner')}
                </AppText>
                <AppText style={styles.replyBannerPreview} numberOfLines={1} ellipsizeMode="tail">
                  {replyingTo.content_text ?? (replyingTo.media_type === 'video' ? 'Video' : 'Photo')}
                </AppText>
              </View>
              <TouchableOpacity onPress={handleCancelReply} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color={colors.textMuted} size={15} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}

          {/* Compose bar */}
          <View style={[
            styles.compose,
            { paddingBottom: insets.bottom > 0 ? insets.bottom : 6 },
            !hasPartner && styles.composeHidden,
          ]}>
            {attachedMedia && !editingState && (
              <View style={styles.previewRow}>
                <ExpoImage source={{ uri: attachedMedia.uri }} style={styles.previewThumb} contentFit="cover" />
                <View style={styles.previewInfo}>
                  <Lock color="#FF8A3D" size={11} />
                  <AppText style={[styles.previewLabel, { color: colors.textMuted }]}>
                    {attachedMedia.type === 'video' ? 'Video' : 'Photo'} — vault privacy
                  </AppText>
                </View>
                {uploadProgress && (
                  <View style={styles.uploadPctWrap}>
                    <ActivityIndicator color="#FF5A3D" size="small" />
                    {uploadPct > 0 && (
                      <AppText style={styles.uploadPctText}>{uploadPct}%</AppText>
                    )}
                  </View>
                )}
                <TouchableOpacity onPress={() => setAttachedMedia(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X color={colors.textMuted} size={16} />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.inputRow}>
              {!editingState && (
                <>
                  <TouchableOpacity onPress={() => pickMedia('library')} style={styles.attachIcon} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <ImageIcon color="rgba(255,255,255,0.35)" size={22} strokeWidth={2} />
                  </TouchableOpacity>
                  {Platform.OS !== 'web' && (
                    <TouchableOpacity onPress={() => pickMedia('camera')} style={styles.attachIcon} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Camera color="rgba(255,255,255,0.35)" size={22} strokeWidth={2} />
                    </TouchableOpacity>
                  )}
                </>
              )}
              <AppTextInput
                ref={inputRef}
                style={[styles.input, { color: colors.text }]}
                value={text}
                onChangeText={setText}
                placeholder={editingState ? 'Edit message…' : 'Type a message…'}
                placeholderTextColor="rgba(255,255,255,0.32)"
                multiline
                maxLength={1000}
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={handleSend}
                onFocus={handleDismissMenu}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!canSend}
                style={[styles.sendBtn, { opacity: canSend ? 1 : 0.35 }]}
                activeOpacity={0.8}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                {sending ? (
                  <View style={styles.sendCircle}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                ) : (
                  <LinearGradient
                    colors={editingState ? ['#FF8A3D', '#FF5A3D'] : ['#E8196E', '#FF5A3D']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.sendCircle}
                  >
                    <Send color="#fff" size={16} strokeWidth={2.5} style={{ marginLeft: 2 }} />
                  </LinearGradient>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </AppShell>
      </KeyboardAvoidingView>

      {/* Floating MediaActionRow — backdrop + pill above all content */}
      {activeMenuId && menuAnchor && activeMsg && (() => {
        const hasMedia = !!activeMsg.media_storage_path;
        const isMine = activeMsg.sender_id === user?.id;
        const activeReactions = reactionsMap[activeMsg.id] ?? [];

        const pillW = pillSize?.w ?? 0;
        const pillH = pillSize?.h ?? 0;
        const FLOAT_GAP = 12;
        const safeTop = insets.top + 8;

        const centeredLeft = menuAnchor.x + menuAnchor.width / 2 - pillW / 2;
        const clampedLeft = Math.max(12, Math.min(centeredLeft, screenWidth - pillW - 12));

        const aboveTop = menuAnchor.y - pillH - FLOAT_GAP;
        const belowTop = menuAnchor.y + menuAnchor.height + FLOAT_GAP;
        const isNearTop = menuAnchor.y < screenHeight * 0.28;
        const rawTop = isNearTop ? belowTop : aboveTop;
        const computedTop = Math.max(safeTop, Math.min(rawTop, screenHeight - pillH - insets.bottom - 16));

        const left = pillSize ? clampedLeft : -9999;
        const top = pillSize ? computedTop : -9999;

        return (
          <View style={[StyleSheet.absoluteFill, { zIndex: 9998 }]} pointerEvents="box-none">
            {/* Tappable backdrop — closes popover on outside tap */}
            <Pressable
              style={[StyleSheet.absoluteFill, styles.menuBackdrop]}
              onPress={handleDismissMenu}
            />
            <Pressable
              style={{ position: 'absolute', left, top }}
              onPress={e => e.stopPropagation()}
              onLayout={e => {
                const { width: w, height: h } = e.nativeEvent.layout;
                if (w > 0 && h > 0) setPillSize({ w, h });
              }}
            >
              <MediaActionRow
                reactions={activeReactions}
                myUserId={user?.id}
                isMedia={hasMedia}
                isInVault={hasMedia ? !!activeMsg.vault_item_id : undefined}
                isMine={isMine}
                screenWidth={screenWidth}
                onReact={(emoji) => reactOnMessage(activeMsg.id, emoji, activeMsg.sender_id)}
                onSaveToVault={hasMedia ? () => handleSaveToVault(activeMsg) : undefined}
                onAlreadyInVault={() => {}}
                onDelete={() => handleDeleteMessage(activeMsg)}
                onEdit={!hasMedia ? () => handleStartEdit(activeMsg) : undefined}
                onCopy={!hasMedia ? () => handleCopy(activeMsg) : undefined}
                onReply={() => handleStartReply(activeMsg)}
                onDismiss={handleDismissMenu}
              />
            </Pressable>
          </View>
        );
      })()}

      <ConfirmSheet
        visible={!!confirmSheet}
        title={confirmSheet?.title ?? ''}
        message={confirmSheet?.message}
        actions={confirmSheet?.actions ?? []}
        onDismiss={() => setConfirmSheet(null)}
      />
    </View>
  );
}

function ReplyQuote({
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
    <Pressable
      onPress={() => onPress?.(msg.id)}
      style={styles.replyQuoteContainer}
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
    </Pressable>
  );
}

const MessageRow = React.memo(function MessageRow({
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
  reactions: import('@/lib/types').MediaReaction[];
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
          <ReAnimated.View style={swipeRowStyle}>
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
                    bubbleWidth={mediaBubbleWidth}
                    bubbleHeight={mediaBubbleHeight}
                    radii={item.content_text ? { ...radii, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 } : radii}
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
                    bubbleWidth={mediaBubbleWidth}
                    bubbleHeight={mediaBubbleHeight}
                    radii={item.content_text ? { ...radii, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 } : radii}
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

const styles = StyleSheet.create({
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
});
