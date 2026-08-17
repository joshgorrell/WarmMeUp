import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, StyleSheet, FlatList, KeyboardAvoidingView, Platform,
  TouchableOpacity, TouchableWithoutFeedback, Pressable, ActivityIndicator, TextInput, Alert,
  AppState, AppStateStatus, Keyboard, InteractionManager, BackHandler, Linking,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Image as ImageIcon, Camera, X, Lock, Pencil, Send } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { awardPoints, getPointValue, incrementMonthlyCounter } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { uploadMediaFile, PICKER_OPTIONS, resolveAssetMimeType, mimeToExtension, extensionToMime } from '@/lib/uploadMedia';
import { ChatMessage } from '@/lib/types';
import AppShell from '@/components/AppShell';
import { LinearGradient } from 'expo-linear-gradient';
import MediaActionRow from '@/components/MediaActionRow';
import ConfirmSheet, { ConfirmAction } from '@/components/ConfirmSheet';
import BottomSheet from '@/components/BottomSheet';
import PillButton from '@/components/PillButton';
import { useMediaReactions } from '@/hooks/useMediaReactions';
import { useLayout } from '@/hooks/useLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logDebugEvent } from '@/lib/debugLog';
import { clearLocalImageCache } from '@/lib/mediaCache';
import { setGalleryItems, getCachedUrl, setCachedUrl, evictCachedUrl } from '@/lib/mediaGalleryStore';
import { logger } from '@/lib/logger';
import { ChatHeader } from '@/components/note/ChatHeader';
import { MediaBubble } from '@/components/note/MediaBubble';
import { MessageRow } from '@/components/note/MessageRow';
import { consumeCameraCaptureResult } from '@/lib/cameraCaptureStore';
import {
  noteStyles as styles,
  AttachedMedia,
  EditingState,
  MenuAnchor,
  getGroupPos,
  getMessageSpacing,
} from '@/components/note/noteHelpers';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export default function ChatTab() {
  const router = useRouter();
  const { message_id: deepLinkMessageId } = useLocalSearchParams<{ message_id?: string }>();
  const { user, couple, profile, partnerProfile, settings } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const hasPartner = !!couple?.user_b_id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
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
  const [timerSheetMsg, setTimerSheetMsg] = useState<ChatMessage | null>(null);
  const handledMsgLinkRef = useRef<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const bubbleRefs = useRef<Record<string, View | null>>({});
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const prevMsgCountRef = useRef(0);
  const lastInactiveAtRef = useRef<number | null>(null);
  const cameraActiveRef = useRef(false);
  const lastVisibleMediaMsgRef = useRef<ChatMessage | null>(null);
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
        // Re-sync messages on resume — the realtime channel may have dropped
        // while backgrounded, so any messages that arrived during that window
        // would otherwise be missing until a manual reload.
        if (couple?.id) loadMessages();
        const elapsed = lastInactiveAtRef.current ? Date.now() - lastInactiveAtRef.current : 999;
        if (elapsed < 400 && couple?.id && user?.id) {
          supabase.auth.getSession().then(({ data }) => {
            const token = data?.session?.access_token;
            if (!token) return;
            fetch(`${SUPABASE_URL}/functions/v1/notify-screenshot`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ couple_id: couple.id, detected_by_user_id: user.id, source_screen: 'chat', chat_message_id: lastVisibleMediaMsgRef.current?.id ?? null }),
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

  // Debounced batch fetch — when several media messages arrive in quick
  // succession (rapid back-and-forth), coalesce them into a single signed-URL
  // round-trip instead of one fetch per message.
  const pendingSignedFetchRef = useRef<ChatMessage[]>([]);
  const signedFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSignedUrlsBatched = useCallback((msg: ChatMessage) => {
    pendingSignedFetchRef.current.push(msg);
    if (signedFetchTimerRef.current) clearTimeout(signedFetchTimerRef.current);
    signedFetchTimerRef.current = setTimeout(() => {
      const batch = pendingSignedFetchRef.current;
      pendingSignedFetchRef.current = [];
      signedFetchTimerRef.current = null;
      if (batch.length > 0) fetchSignedUrls(batch);
    }, 150);
  }, [fetchSignedUrls]);

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
        const now = Date.now();
        const expired = sorted.filter(m => m.burns_at && new Date(m.burns_at).getTime() < now);
        if (expired.length > 0) {
          const deletedAt = new Date().toISOString();
          for (const m of expired) {
            if (m.media_storage_path) {
              const bucket = m.media_storage_bucket ?? 'chat_media';
              supabase.storage.from(bucket).remove([m.media_storage_path]).catch(() => {});
            }
          }
          if (expired.some(m => m.media_storage_path)) {
            clearLocalImageCache().catch(() => {});
          }
          Promise.resolve(
            supabase
              .from('chat_messages')
              .update({ deleted_at: deletedAt })
              .in('id', expired.map(m => m.id))
              .eq('couple_id', couple.id)
          ).catch(() => {});
          const expiredVaultIds = expired.map(m => m.vault_item_id).filter((id): id is string => !!id);
          if (expiredVaultIds.length > 0) {
            supabase
              .from('vault_items')
              .select('id, storage_path, storage_bucket')
              .in('id', expiredVaultIds)
              .then(({ data: vis }) => {
                supabase
                  .from('vault_items')
                  .update({ deleted_at: deletedAt })
                  .in('id', expiredVaultIds)
                  .then(({ error }) => {
                    if (error) logDebugEvent('chat_burn_vault_cleanup_failed', { error: error.message });
                  });
                if (vis) {
                  for (const vi of vis) {
                    if (vi.storage_path) {
                      supabase.storage.from(vi.storage_bucket ?? 'vault').remove([vi.storage_path]).catch(() => {});
                    }
                  }
                }
              });
          }
        }
        const visible = expired.length > 0 ? sorted.filter(m => !expired.some(e => e.id === m.id)) : sorted;
        const urlMap: Record<string, string> = {};
        const needsNetworkFetch: ChatMessage[] = [];
        for (const m of visible) {
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
        setMessages(visible);
        if (Object.keys(urlMap).length > 0) {
          setSignedUrls(prev => ({ ...prev, ...urlMap }));
        }
        oldestCreatedAtRef.current = visible[0]?.created_at ?? null;
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

  const channelStatusRef = useRef<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!couple?.id) { setChatLoading(false); return; }
    loadMessages();

    const handleInsert = (newMsg: ChatMessage) => {
      setMessages(prev => {
        const tempIdx = prev.findIndex(m =>
          m.id.startsWith('temp_') &&
          ((newMsg.media_storage_path && m.media_storage_path === newMsg.media_storage_path) ||
           (m.sender_id === newMsg.sender_id && m.created_at === newMsg.created_at))
        );
        if (tempIdx >= 0) {
          const next = [...prev];
          next[tempIdx] = newMsg;
          return next;
        }
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      if (newMsg.media_url) {
        setSignedUrls(prev => ({ ...prev, [newMsg.id]: newMsg.media_url! }));
        if (newMsg.media_storage_path) setCachedUrl(newMsg.media_storage_path, newMsg.media_url);
      } else if (newMsg.media_storage_path) {
        fetchSignedUrlsBatched(newMsg);
      }
    };

    const ch = supabase.channel(`chat_tab_${couple.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `couple_id=eq.${couple.id}` },
        (payload) => handleInsert(payload.new as ChatMessage)
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
          if (updated.deleted_at) {
            setMessages(prev => prev.filter(m => m.id !== updated.id));
            return;
          }
          setMessages(prev => prev.map(m => {
            if (m.id !== updated.id) return m;
            return {
              ...m,
              vault_item_id: updated.vault_item_id,
              edited_at: updated.edited_at,
              deleted_at: updated.deleted_at,
              content_text: updated.content_text !== undefined ? updated.content_text : m.content_text,
              media_storage_path: m.media_storage_path ?? updated.media_storage_path,
              media_storage_bucket: m.media_storage_bucket ?? updated.media_storage_bucket,
              media_type: m.media_type ?? updated.media_type,
              burn_after_seconds: updated.burn_after_seconds,
              burns_at: updated.burns_at,
              first_viewed_at: updated.first_viewed_at,
            };
          }));
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          channelStatusRef.current = 'open';
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          channelStatusRef.current = 'error';
          logDebugEvent('chat_realtime_channel_error', { status, error: String(err ?? '') });
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            supabase.removeChannel(ch);
            loadMessages();
          }, 1500);
        } else if (status === 'CLOSED') {
          channelStatusRef.current = 'closed';
        }
      });
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      supabase.removeChannel(ch);
    };
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
      if (source === 'camera') {
        if (Platform.OS === 'web') return;
        cameraActiveRef.current = true;
        router.push({ pathname: '/(app)/camera-capture', params: { mode: 'photo' } });
        return;
      }

      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo Library Access Required', 'Allow access to your photo library in Settings to send media in Chat.', [
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
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
      const uploadResult = await uploadMediaFile(media.uri, 'chat_media', path, media.mimeType, (pct) => setUploadPct(pct));
      const actualPath = uploadResult.storagePath;
      logDebugEvent('chat_photo_upload_success', { bucket: 'chat_media', path: actualPath, requestedPath: path });
      return actualPath;
    } catch (e: any) {
      logDebugEvent('chat_photo_upload_error', { error: e?.message ?? String(e) });
      Alert.alert('Upload Failed', e?.message ?? 'Could not upload media. Please try again.');
      return null;
    } finally {
      setUploadProgress(false);
      setUploadPct(0);
    }
  };

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

    const localMediaUri = media?.uri ?? null;
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
      burn_after_seconds: null,
      burns_at: null,
      first_viewed_at: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    justSentAtRef.current = Date.now();
    setTimeout(() => { justSentAtRef.current = 0; }, 3000);
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
    logger.log('[CHAT_SEND]', payload);
    const { data, error: insertError } = await supabase.from('chat_messages').insert(payload).select().single();
    logger.log('[CHAT_INSERT_RESULT]', { data, error: insertError });
    logDebugEvent('chat_message_insert_result', {
      success: !insertError && !!data,
      error: insertError?.message ?? null,
      returned_media_url_present: !!(data as any)?.media_url,
      returned_media_storage_path: (data as any)?.media_storage_path ?? null,
    });

    if (insertError || !data) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setSignedUrls(prev => { const next = { ...prev }; delete next[tempId]; return next; });
      Alert.alert('Send failed', 'Your message could not be sent. Please try again.');
      setSending(false);
      return;
    }

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
          const vaultMime = capturedMedia.type === 'video' ? capturedMedia.mimeType : 'image/jpeg';
          const vaultUploadResult = await uploadMediaFile(srcData.signedUrl, 'vault', vaultPath, vaultMime);
          const actualVaultPath = vaultUploadResult.storagePath;
          const { data: vaultData } = await supabase.from('vault_items').insert({
            couple_id: coupleId,
            uploaded_by_user_id: userId,
            media_type: capturedMedia.type,
            file_path: actualVaultPath,
            storage_path: actualVaultPath,
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
      } catch {}
    });

    notifyPartner({ event_type: 'new_message', couple_id: coupleId, target_route: '/(app)/(tabs)/note', partnerUserId: partnerProfile?.id, message_text: hasText ? caption : undefined });
  };

  useFocusEffect(
    useCallback(() => {
      if (!cameraActiveRef.current) return;
      const captured = consumeCameraCaptureResult();
      cameraActiveRef.current = false;
      if (!captured) return;

      const media: AttachedMedia = {
        uri: captured.uri,
        type: captured.mediaType,
        mimeType: captured.mimeType,
        fileName: `chat_${Date.now()}.${mimeToExtension(captured.mimeType)}`,
      };
      logDebugEvent('CHAT PICK', {
        source: 'in_app_camera',
        mediaType: captured.mediaType,
        mimeType: captured.mimeType,
        uriPrefix: captured.uri.substring(0, 12),
      });

      if (text.trim().length === 0 && !editingState) {
        sendMediaMessage(media, '');
      } else {
        setAttachedMedia(media);
      }
    }, [text, editingState, couple?.id, user?.id, hasPartner])
  );

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
        clearLocalImageCache().catch(() => {});
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
      clearLocalImageCache().catch(() => {});
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
    const msg = messagesRef.current.find(m => m.id === id);
    if (msg && msg.sender_id !== user?.id && !msg.first_viewed_at) {
      const now = new Date().toISOString();
      setMessages(prev => prev.map(m => m.id === id ? { ...m, first_viewed_at: now } : m));
      supabase
        .from('chat_messages')
        .update({ first_viewed_at: now })
        .eq('id', id)
        .eq('couple_id', couple!.id)
        .then(({ error }) => {
          if (error) logDebugEvent('chat_mark_viewed_failed', { messageId: id, error: error.message });
        });
    }
  }, [user?.id, couple]);

  const handleSetBurnTimer = useCallback(async (msg: ChatMessage, seconds: number | null) => {
    const prevBurn = msg.burn_after_seconds;
    const prevBurnsAt = msg.burns_at;
    const optimisticBurnsAt = (seconds && msg.first_viewed_at)
      ? new Date(new Date(msg.first_viewed_at).getTime() + seconds * 1000).toISOString()
      : null;
    setMessages(prev => prev.map(m =>
      m.id === msg.id
        ? { ...m, burn_after_seconds: seconds, burns_at: optimisticBurnsAt }
        : m
    ));
    const { error } = await supabase
      .from('chat_messages')
      .update({ burn_after_seconds: seconds })
      .eq('id', msg.id)
      .eq('couple_id', couple!.id);
    if (error) {
      setMessages(prev => prev.map(m =>
        m.id === msg.id
          ? { ...m, burn_after_seconds: prevBurn, burns_at: prevBurnsAt }
          : m
      ));
      Alert.alert('Timer Failed', 'Could not set the self-destruct timer. Please try again.');
    }
  }, [couple]);

  useEffect(() => {
    if (!user?.id || !couple?.id) return;
    const toMark = messages.filter(m =>
      m.sender_id !== user.id &&
      !m.first_viewed_at &&
      !m.media_storage_path &&
      m.burn_after_seconds
    );
    if (toMark.length === 0) return;
    const now = new Date().toISOString();
    const ids = toMark.map(m => m.id);
    setMessages(prev => prev.map(m => ids.includes(m.id) ? { ...m, first_viewed_at: now } : m));
    supabase
      .from('chat_messages')
      .update({ first_viewed_at: now })
      .in('id', ids)
      .eq('couple_id', couple.id)
      .then(({ error }) => {
        if (error) logDebugEvent('chat_mark_text_viewed_failed', { error: error.message });
      });
  }, [user?.id, couple?.id, messages]);

  const handleBurnMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    const deletedAt = new Date().toISOString();
    supabase
      .from('chat_messages')
      .update({ deleted_at: deletedAt })
      .eq('id', msg.id)
      .eq('couple_id', couple!.id)
      .then(({ error }) => {
        if (error) {
          logDebugEvent('chat_burn_delete_failed', { messageId: msg.id, error: error.message });
        }
      });
    if (msg.media_storage_path) {
      const bucket = msg.media_storage_bucket ?? 'chat_media';
      supabase.storage.from(bucket).remove([msg.media_storage_path]).catch(() => {});
    }
    if (msg.media_storage_path) evictCachedUrl(msg.media_storage_path);
    if (msg.media_storage_path) clearLocalImageCache().catch(() => {});
    if (msg.vault_item_id) {
      supabase
        .from('vault_items')
        .select('storage_path, storage_bucket')
        .eq('id', msg.vault_item_id)
        .maybeSingle()
        .then(({ data: vi }) => {
          supabase
            .from('vault_items')
            .update({ deleted_at: deletedAt })
            .eq('id', msg.vault_item_id)
            .then(({ error }) => {
              if (error) logDebugEvent('chat_burn_vault_delete_failed', { vaultItemId: msg.vault_item_id, error: error.message });
            });
          if (vi?.storage_path) {
            supabase.storage.from(vi.storage_bucket ?? 'vault').remove([vi.storage_path]).catch(() => {});
          }
        });
    }
  }, [couple]);

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

  const messagesById = useMemo(() => {
    const map: Record<string, ChatMessage> = {};
    for (const m of messages) map[m.id] = m;
    return map;
  }, [messages]);

  const renderItem = useCallback(({ item, index }: { item: ChatMessage & { __prevCreatedAt?: string | null; __nextCreatedAt?: string | null; __prevSenderId?: string | null; __nextSenderId?: string | null }; index: number }) => {
    const isMine = item.sender_id === user?.id;
    const name = isMine ? (profile?.display_name ?? 'You') : (partnerProfile?.display_name ?? 'Partner');
    const hasMedia = !!item.media_storage_path;
    const isMenuOpen = activeMenuId === item.id;
    const itemReactions = reactionsMap[item.id] ?? [];
    const repliedMessage = item.reply_to ? messagesById[item.reply_to] : null;

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
        onBurn={handleBurnMessage}
        onReactQuick={(emoji) => reactOnMessage(item.id, emoji, item.sender_id)}
        prevCreatedAt={index > 0 ? (item as any).__prevCreatedAt : undefined}
        highlighted={item.id === highlightedId}
        repliedMessage={repliedMessage}
        replySenderName={repliedMessage ? (repliedMessage.sender_id === user?.id ? 'You' : (partnerProfile?.first_name || partnerProfile?.display_name || 'Partner')) : undefined}
        onJumpToMessage={handleJumpToMessage}
      />
    );
  }, [user?.id, profile?.display_name, partnerProfile?.display_name, partnerProfile?.first_name, activeMenuId, reactionsMap, colors, blurEnabled, revealedMedia, signedUrls, handleRevealMedia, handleOpenMedia, handleBurnMessage, mediaBubbleWidth, mediaBubbleHeight, chatFontScale, reactOnMessage, highlightedId, messagesById]);

  const canSend = editingState
    ? text.trim().length > 0 && !sending
    : (text.trim().length > 0 || attachedMedia !== null) && !sending && !uploadProgress;

  const activeMsg = useMemo(
    () => (activeMenuId ? messages.find(m => m.id === activeMenuId) ?? null : null),
    [activeMenuId, messages],
  );

  const handleViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: Array<{ item: ChatMessage }> }) => {
    const mediaItems = viewableItems.filter(viewable => viewable.item.media_storage_path).map(viewable => viewable.item);
    lastVisibleMediaMsgRef.current = mediaItems.length > 0
      ? mediaItems[mediaItems.length - 1]
      : null;
  }, []);

  const viewabilityConfig = useMemo(() => ({ viewAreaCoveragePercentThreshold: 50 }), []);

  return (
    <View style={{ flex: 1, backgroundColor: '#05040A' }}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#05040A' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <AppShell scrollable={false} noTopPadding>
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
              removeClippedSubviews
              maxToRenderPerBatch={8}
              initialNumToRender={20}
              windowSize={15}
              onScroll={(e) => {
                if (e.nativeEvent.contentOffset.y < 80) {
                  loadOlderMessages();
                }
              }}
              scrollEventThrottle={200}
              onViewableItemsChanged={handleViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              onScrollBeginDrag={handleDismissMenu}
              onContentSizeChange={(_w, h) => {
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

          {editingState && (
            <View style={[styles.editBanner, { backgroundColor: 'rgba(255,138,61,0.12)', borderTopColor: 'rgba(255,138,61,0.3)' }]}>
              <Pencil color="#FF8A3D" size={13} strokeWidth={2} />
              <AppText style={[styles.editBannerText, { color: '#FF8A3D' }]}>Editing message</AppText>
              <TouchableOpacity onPress={handleCancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color="#FF8A3D" size={15} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}

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
                onReply={() => handleStartReply(activeMsg)}
                onSetTimer={() => setTimerSheetMsg(activeMsg)}
                burnAfterSeconds={activeMsg.burn_after_seconds}
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

      <BottomSheet
        visible={!!timerSheetMsg}
        onClose={() => setTimerSheetMsg(null)}
        title="Self-destruct timer"
        subtitle="This message will automatically disappear from both partners' chat when the timer expires."
      >
        <View style={styles.timerSheetBody}>
          {timerSheetMsg?.burn_after_seconds ? (
            <PillButton
              label="Cancel current timer"
              onPress={() => {
                const m = timerSheetMsg;
                setTimerSheetMsg(null);
                if (m) handleSetBurnTimer(m, null);
              }}
              style={{ width: '100%', paddingVertical: 14, backgroundColor: 'rgba(255,68,68,0.12)', borderColor: 'rgba(255,68,68,0.3)' }}
            />
          ) : null}
          <PillButton
            label="1 minute"
            onPress={() => {
              const m = timerSheetMsg;
              setTimerSheetMsg(null);
              if (m) handleSetBurnTimer(m, 60);
            }}
            active={timerSheetMsg?.burn_after_seconds === 60}
            style={styles.timerSheetBtn}
          />
          <PillButton
            label="5 minutes"
            onPress={() => {
              const m = timerSheetMsg;
              setTimerSheetMsg(null);
              if (m) handleSetBurnTimer(m, 300);
            }}
            active={timerSheetMsg?.burn_after_seconds === 300}
            style={styles.timerSheetBtn}
          />
          <PillButton
            label="10 minutes"
            onPress={() => {
              const m = timerSheetMsg;
              setTimerSheetMsg(null);
              if (m) handleSetBurnTimer(m, 600);
            }}
            active={timerSheetMsg?.burn_after_seconds === 600}
            style={styles.timerSheetBtn}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

/* ReplyQuote and MessageRow extracted to @/components/note/MessageRow */
