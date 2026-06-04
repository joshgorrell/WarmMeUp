import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, StyleSheet, FlatList, KeyboardAvoidingView, Platform,
  TouchableOpacity, TouchableWithoutFeedback, Pressable, Image, ActivityIndicator, TextInput, Alert,
  AppState, AppStateStatus, Keyboard, Animated, LayoutAnimation, UIManager, InteractionManager,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image as ImageIcon, Camera, X, Lock, EyeOff, Pencil, ArrowUp } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { awardPoints, getPointValue, incrementMonthlyCounter } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { uploadMediaFile, PICKER_OPTIONS, resolveAssetMimeType, mimeToExtension, extensionToMime } from '@/lib/uploadMedia';
import { ChatMessage } from '@/lib/types';
import AppShell from '@/components/AppShell';
import TabHeader from '@/components/TabHeader';
import MediaActionRow from '@/components/MediaActionRow';
import ConfirmSheet, { ConfirmAction } from '@/components/ConfirmSheet';
import { useMediaReactions } from '@/hooks/useMediaReactions';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
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

  const handleImagePress = () => {
    if (isBlurred) {
      onReveal(msg.id);
    } else {
      onOpen(msg);
    }
  };

  return (
    <Pressable
      onPress={handleImagePress}
      onLongPress={() => onLongPress(msg)}
      delayLongPress={350}
      android_ripple={null}
      style={[
        styles.mediaTap,
        { width: bubbleWidth, height: bubbleHeight },
        radii,
      ]}
    >
      {!loaded ? (
        <View style={styles.mediaPlaceholder}>
          <ShimmerPlaceholder />
        </View>
      ) : signedUrl ? (
        <Image
          source={{ uri: signedUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={isBlurred ? 20 : 0}
        />
      ) : (
        <View style={styles.mediaPlaceholder}>
          <Lock color="rgba(255,255,255,0.5)" size={20} />
        </View>
      )}
      {msg.media_type === 'video' && loaded && signedUrl && !isBlurred && (
        <View style={styles.playOverlay}>
          <View style={styles.playCircle}>
            <AppText style={styles.playTriangle}>&#9654;</AppText>
          </View>
        </View>
      )}
      {isBlurred && loaded && signedUrl && (
        <View style={styles.mediaBlurOverlay}>
          <EyeOff color="rgba(255,255,255,0.8)" size={22} strokeWidth={2} />
        </View>
      )}
    </Pressable>
  );
}

// Animated shimmer for media loading state
function ShimmerPlaceholder() {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.06)', opacity: anim }]} />
  );
}

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

  const blurEnabled = settings?.blur_media ?? true;
  const chatFontScale = settings?.chat_font_scale ?? 1.0;

  const messageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { reactionsMap, react: reactOnMessage } = useMediaReactions(
    couple?.id,
    user?.id,
    'chat_messages',
    messageIds,
  );
  const { width: screenWidth, height: screenHeight } = useLayout();
  // Larger, more natural media preview — 65% width, 4:3 aspect ratio
  const mediaBubbleWidth = Math.min(Math.round(screenWidth * 0.65), 300);
  const mediaBubbleHeight = Math.round(mediaBubbleWidth * 0.75);

  // Re-blur chat media when returning from background
  useEffect(() => {
    if (!blurEnabled) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        setRevealedMedia(new Set());
      }
    });
    return () => sub.remove();
  }, [blurEnabled]);

  const fetchSignedUrls = useCallback(async (msgs: ChatMessage[]) => {
    const mediaMessages = msgs.filter(m => m.media_storage_path);
    if (mediaMessages.length === 0) return;

    const byBucket: Record<string, ChatMessage[]> = {};
    for (const m of mediaMessages) {
      const bucket = m.media_storage_bucket ?? 'chat_media';
      if (!byBucket[bucket]) byBucket[bucket] = [];
      byBucket[bucket].push(m);
    }

    const results: Record<string, string | null> = {};
    await Promise.all(
      Object.entries(byBucket).map(async ([bucket, bucketMsgs]) => {
        const paths = bucketMsgs.map(m => m.media_storage_path!);
        const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
        for (const m of bucketMsgs) {
          const entry = data?.find(d => d.path === m.media_storage_path);
          results[m.id] = entry?.signedUrl ?? null;
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
        setMessages(sorted);
        // Pre-populate signedUrls from embedded media_url where available.
        const withUrl = sorted.filter(m => m.media_url);
        if (withUrl.length > 0) {
          setSignedUrls(prev => ({
            ...prev,
            ...Object.fromEntries(withUrl.map(m => [m.id, m.media_url!])),
          }));
        }
        const needsFetch = sorted.filter(m => m.media_storage_path && !m.media_url);
        if (needsFetch.length > 0) fetchSignedUrls(needsFetch);
        oldestCreatedAtRef.current = sorted[0]?.created_at ?? null;
        setHasMore(data.length === PAGE_SIZE);
      }
    } finally {
      setChatLoading(false);
    }
  }, [couple?.id, fetchSignedUrls]);

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
        setMessages(prev => [...sorted, ...prev]);
        const withUrl = sorted.filter(m => m.media_url);
        if (withUrl.length > 0) {
          setSignedUrls(prev => ({
            ...prev,
            ...Object.fromEntries(withUrl.map(m => [m.id, m.media_url!])),
          }));
        }
        const needsFetch = sorted.filter(m => m.media_storage_path && !m.media_url);
        if (needsFetch.length > 0) fetchSignedUrls(needsFetch);
        oldestCreatedAtRef.current = sorted[0].created_at;
        setHasMore(data.length === PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [couple?.id, loadingOlder, hasMore, fetchSignedUrls]);

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

  const pickMedia = async (source: 'library' | 'camera') => {
    try {
      const ImagePicker = await import('expo-image-picker');
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission Required', 'Please allow camera access in Settings.');
          return;
        }
        result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission Required', 'Please allow access to your photo library in Settings.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      }
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      const resolvedMime = resolveAssetMimeType(asset);
      setAttachedMedia({
        uri: asset.uri,
        type: isVideo ? 'video' : 'photo',
        mimeType: resolvedMime,
        fileName: `chat_${Date.now()}.${mimeToExtension(resolvedMime)}`,
      });
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
      await uploadMediaFile(media.uri, 'chat_media', path, media.mimeType, (pct) => setUploadPct(pct));
      return path;
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message ?? 'Could not upload media. Please try again.');
      return null;
    } finally {
      setUploadProgress(false);
      setUploadPct(0);
    }
  };

  const handleSend = async () => {
    if (editingState) {
      await handleSaveEdit();
      return;
    }
    const hasText = text.trim().length > 0;
    const hasMedia = attachedMedia !== null;
    if (!hasText && !hasMedia) return;
    if (!couple?.id || !user || !hasPartner) return;
    setSending(true);

    let chatStoragePath: string | null = null;

    if (hasMedia && attachedMedia) {
      chatStoragePath = await uploadChatMedia(attachedMedia, couple.id, user.id);
      if (!chatStoragePath) {
        setSending(false);
        return;
      }
    }

    // Generate a 7-day signed URL immediately after upload so the recipient
    // receives it inside the realtime INSERT event — no extra round-trip needed.
    let preSignedMediaUrl: string | null = null;
    if (chatStoragePath) {
      const { data: signedData } = await supabase.storage
        .from('chat_media')
        .createSignedUrl(chatStoragePath, 7 * 24 * 3600);
      preSignedMediaUrl = signedData?.signedUrl ?? null;
    }

    // Optimistic display — show the message in the sender's own list immediately
    // using a temporary ID. The local file URI is used as the image source so the
    // sender sees the image instantly without a separate signed URL fetch.
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      couple_id: couple.id,
      sender_id: user.id,
      content_text: hasText ? text.trim() : null,
      media_url: preSignedMediaUrl,
      media_storage_path: chatStoragePath,
      media_storage_bucket: hasMedia ? 'chat_media' : null,
      media_type: attachedMedia?.type === 'video' ? 'video' : hasMedia ? 'photo' : null,
      allow_screenshot: settings?.vault_allow_screenshot_default ?? false,
      allow_save: settings?.vault_allow_save_default ?? false,
      allow_share: settings?.vault_allow_share_default ?? false,
      vault_item_id: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    // Use the local file URI immediately for the sender's own preview.
    if (attachedMedia?.uri) {
      setSignedUrls(prev => ({ ...prev, [tempId]: attachedMedia.uri }));
    }

    const payload = {
      couple_id: couple.id,
      sender_id: user.id,
      content_text: hasText ? text.trim() : null,
      media_url: preSignedMediaUrl,
      media_storage_path: chatStoragePath,
      media_storage_bucket: hasMedia ? 'chat_media' : null,
      media_type: attachedMedia?.type ?? null,
      allow_screenshot: settings?.vault_allow_screenshot_default ?? false,
      allow_save: settings?.vault_allow_save_default ?? false,
      allow_share: settings?.vault_allow_share_default ?? false,
      vault_item_id: null,
    };
    console.log('[CHAT_SEND]', payload);
    const { data, error: insertError } = await supabase.from('chat_messages').insert(payload).select().single();
    console.log('[CHAT_INSERT_RESULT]', { data, error: insertError });

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
    setMessages(prev => prev.map(m => m.id === tempId ? { ...data as ChatMessage } : m));
    if (attachedMedia?.uri || preSignedMediaUrl) {
      setSignedUrls(prev => {
        const next = { ...prev };
        delete next[tempId];
        next[data.id] = preSignedMediaUrl ?? attachedMedia?.uri ?? null;
        return next;
      });
    }

    const capturedMedia = attachedMedia;
    setText('');
    setAttachedMedia(null);
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
            allow_screenshot: settings?.vault_allow_screenshot_default ?? false,
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

    notifyPartner({ event_type: 'new_message', couple_id: coupleId, target_route: '/(app)/(tabs)/note', partnerUserId: partnerProfile?.id });
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

  const handleStartEdit = (msg: ChatMessage) => {
    handleDismissMenu();
    setEditingState({ messageId: msg.id, originalText: msg.content_text ?? '' });
    setText(msg.content_text ?? '');
    setTimeout(() => inputRef.current?.focus(), 100);
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
        .eq('sender_id', user!.id);
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
    router.push({
      pathname: '/(app)/vault-viewer',
      params: {
        storagePath: msg.media_storage_path,
        storageBucket: msg.media_storage_bucket ?? 'chat_media',
        coupleId: msg.couple_id,
        mediaType: msg.media_type ?? 'photo',
        allowScreenshot: msg.allow_screenshot ? '1' : '0',
        allowSave: msg.allow_save ? '1' : '0',
        allowShare: msg.allow_share ? '1' : '0',
      },
    });
  }, [router]);

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
        blurEnabled={blurEnabled && !isMine}
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
      />
    );
  }, [user?.id, profile?.display_name, partnerProfile?.display_name, activeMenuId, reactionsMap, colors, blurEnabled, revealedMedia, signedUrls, handleRevealMedia, handleOpenMedia, mediaBubbleWidth, mediaBubbleHeight, chatFontScale, reactOnMessage, highlightedId]);

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
        <AppShell scrollable={false}>
          <TabHeader title="Chat" />

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

          {/* Compose bar */}
          <View style={[
            styles.compose,
            { borderTopColor: colors.borderSubtle, paddingBottom: insets.bottom > 0 ? insets.bottom + 4 : Spacing.sm },
            !hasPartner && styles.composeHidden,
          ]}>
            {attachedMedia && !editingState && (
              <View style={styles.previewRow}>
                <Image source={{ uri: attachedMedia.uri }} style={styles.previewThumb} />
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
                    <ImageIcon color={colors.textMuted} size={22} strokeWidth={2} />
                  </TouchableOpacity>
                  {Platform.OS !== 'web' && (
                    <TouchableOpacity onPress={() => pickMedia('camera')} style={styles.attachIcon} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Camera color={colors.textMuted} size={22} strokeWidth={2} />
                    </TouchableOpacity>
                  )}
                </>
              )}
              <AppTextInput
                ref={inputRef}
                style={[styles.input, { color: colors.text, backgroundColor: colors.bg2 ?? 'rgba(255,255,255,0.06)' }]}
                value={text}
                onChangeText={setText}
                placeholder={editingState ? 'Edit message…' : 'Message…'}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={1000}
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!canSend}
                style={[styles.sendBtn, { opacity: canSend ? 1 : 0.35 }]}
                activeOpacity={0.75}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <View style={[styles.sendCircle, { backgroundColor: editingState ? '#FF8A3D' : '#FF5A3D' }]}>
                    <ArrowUp color="#fff" size={16} strokeWidth={2.5} />
                  </View>
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
            {/* Dim backdrop */}
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.menuBackdrop]}
              pointerEvents="none"
            />
            <View
              style={{ position: 'absolute', left, top }}
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
                onDismiss={handleDismissMenu}
              />
            </View>
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
          <View style={[styles.dateLine, { backgroundColor: colors.borderSubtle }]} />
          <AppText style={[styles.dateText, { color: colors.textMuted }]}>{getDividerLabel(item.created_at)}</AppText>
          <View style={[styles.dateLine, { backgroundColor: colors.borderSubtle }]} />
        </View>
      )}
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
            <View style={[
              styles.bubble,
              radii,
              isMine
                ? { backgroundColor: 'rgba(255,80,55,0.22)', borderColor: isMenuOpen ? 'rgba(255,90,61,0.7)' : 'rgba(255,80,55,0.32)' }
                : { backgroundColor: colors.card, borderColor: colors.borderSubtle },
              mediaOnly && styles.bubbleMediaOnly,
            ]}>
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
                  radii={mediaOnly ? radii : { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}
                />
              )}
              {item.content_text ? (
                <AppText style={[styles.bubbleText, {
                  color: colors.text,
                  fontSize: Math.round(15 * chatFontScale),
                  lineHeight: Math.round(15 * chatFontScale * 1.55),
                }]}>
                  {item.content_text}
                </AppText>
              ) : null}
              {/* Timestamp + edited — only shown inside bubble when there's text, or below media */}
              <View style={styles.bubbleMeta}>
                <AppText style={[styles.bubbleTime, {
                  color: isMine ? 'rgba(255,255,255,0.55)' : colors.textMuted,
                  fontSize: Math.round(11 * chatFontScale),
                }]}>
                  {formatTime(item.created_at)}
                </AppText>
                {item.edited_at && (
                  <AppText style={[styles.editedLabel, {
                    color: isMine ? 'rgba(255,255,255,0.38)' : colors.textMuted,
                    fontSize: Math.round(10 * chatFontScale),
                  }]}>
                    edited
                  </AppText>
                )}
              </View>
            </View>
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
    </>
  );
});

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.md,
    paddingBottom: 20,
  },
  loadingOlderWrap: { alignItems: 'center', paddingVertical: Spacing.sm },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  emptyEmoji: { fontSize: 52, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold', textAlign: 'center' },
  emptySub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 22 },

  // Date separator
  dateDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 20,
    marginBottom: 8,
  },
  dateLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.8,
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

  // Bubble
  bubble: {
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 5,
  },
  bubbleMediaOnly: {
    padding: 0,
    paddingHorizontal: 0,
    gap: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden',
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

  // Media bubble
  mediaTap: {
    overflow: 'hidden',
  },
  mediaPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  mediaBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
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
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: 'rgba(8,7,14,0.97)',
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
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    maxHeight: 120,
    minHeight: 40,
    lineHeight: 20,
  },
  sendBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
