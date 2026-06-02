import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, StyleSheet, FlatList, KeyboardAvoidingView, Platform,
  TouchableOpacity, TouchableWithoutFeedback, Image, ActivityIndicator, TextInput, Alert,
  AppState, AppStateStatus, Keyboard,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useRouter } from 'expo-router';
import { Image as ImageIcon, Camera, X, Lock, Send, Vault, Pencil, Trash2, EyeOff } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { awardPoints, getPointValue, incrementMonthlyCounter } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { uploadMediaFile, PICKER_OPTIONS, resolveAssetMimeType, mimeToExtension, extensionToMime } from '@/lib/uploadMedia';
import { ChatMessage } from '@/lib/types';
import AppShell from '@/components/AppShell';
import TabHeader from '@/components/TabHeader';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

// Floating action menu rendered at root level so it appears above all other UI
function BubbleMenu({
  anchor,
  onEdit,
  onDelete,
  onDismiss,
}: {
  anchor: MenuAnchor;
  onEdit: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const menuWidth = 130;
  const menuHeight = 88; // approximate: 2 items * 44px
  const left = Math.max(8, anchor.x + anchor.width - menuWidth);
  const top = anchor.y - menuHeight - 8;

  return (
    <>
      {/* Full-screen tap-away backdrop */}
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onDismiss} activeOpacity={1} />
      <View style={[
        styles.menuCard,
        { backgroundColor: '#1c1c28', borderColor: 'rgba(255,255,255,0.12)', left, top },
      ]}>
        <TouchableOpacity style={styles.menuItem} onPress={onEdit} activeOpacity={0.75}>
          <Pencil color="#FF8A3D" size={14} strokeWidth={2} />
          <AppText style={[styles.menuText, { color: colors.text }]}>Edit</AppText>
        </TouchableOpacity>
        <View style={[styles.menuDivider, { backgroundColor: 'rgba(255,255,255,0.10)' }]} />
        <TouchableOpacity style={styles.menuItem} onPress={onDelete} activeOpacity={0.75}>
          <Trash2 color="#FF4444" size={14} strokeWidth={2} />
          <AppText style={[styles.menuText, { color: '#FF4444' }]}>Delete</AppText>
        </TouchableOpacity>
      </View>
    </>
  );
}

function MediaBubble({
  msg,
  blurEnabled,
  revealed,
  onReveal,
  signedUrl,
  onOpen,
  onSaveToVault,
  bubbleWidth,
  bubbleHeight,
}: {
  msg: ChatMessage;
  blurEnabled: boolean;
  revealed: boolean;
  onReveal: (id: string) => void;
  signedUrl: string | null | undefined;
  onOpen: (m: ChatMessage) => void;
  onSaveToVault: (m: ChatMessage) => void;
  bubbleWidth: number;
  bubbleHeight: number;
}) {
  // undefined = still loading, null = failed, string = ready
  const loaded = signedUrl !== undefined;
  const isBlurred = blurEnabled && !revealed;

  const handlePress = () => {
    if (isBlurred) {
      onReveal(msg.id);
    } else {
      onOpen(msg);
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handlePress} style={styles.mediaTap}>
      <View style={[styles.mediaWrap, { width: bubbleWidth, height: bubbleHeight }]}>
        {!loaded ? (
          <View style={styles.mediaPlaceholder}>
            <ActivityIndicator color="#FF5A3D" size="small" />
          </View>
        ) : signedUrl ? (
          <Image
            source={{ uri: signedUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            blurRadius={isBlurred ? 6 : 0}
          />
        ) : (
          <View style={styles.mediaPlaceholder}>
            <Lock color="rgba(255,255,255,0.5)" size={20} />
          </View>
        )}
        {msg.media_type === 'video' && loaded && signedUrl && (
          <View style={styles.playOverlay}>
            <View style={styles.playCircle}>
              <AppText style={styles.playTriangle}>&#9654;</AppText>
            </View>
          </View>
        )}
        {isBlurred && loaded && signedUrl && (
          <View style={styles.mediaBlurOverlay}>
            <EyeOff color="rgba(255,255,255,0.7)" size={20} strokeWidth={2} />
          </View>
        )}
        {!isBlurred && (
          <TouchableOpacity
            style={[styles.vaultBtn, msg.vault_item_id ? styles.vaultBtnSaved : null]}
            onPress={() => onSaveToVault(msg)}
            activeOpacity={0.8}
          >
            <Vault color={msg.vault_item_id ? '#4CAF50' : '#FFB347'} size={13} strokeWidth={2} />
            <AppText style={[styles.vaultBtnText, msg.vault_item_id ? styles.vaultBtnTextSaved : null]}>
              {msg.vault_item_id ? 'In Vault' : 'Save to Vault'}
            </AppText>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function ChatTab() {
  const router = useRouter();
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
  const [revealedMedia, setRevealedMedia] = useState<Set<string>>(new Set());
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const bubbleRefs = useRef<Record<string, View | null>>({});
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const prevMsgCountRef = useRef(0);

  const blurEnabled = settings?.blur_media ?? true;
  const { width: screenWidth } = useLayout();
  const mediaBubbleWidth = Math.min(Math.round(screenWidth * 0.55), 260);
  const mediaBubbleHeight = Math.round(mediaBubbleWidth * 0.8);

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

  // Batch-fetch signed URLs for all media messages in one pass
  const fetchSignedUrls = useCallback(async (msgs: ChatMessage[]) => {
    const mediaMessages = msgs.filter(m => m.media_storage_path);
    if (mediaMessages.length === 0) return;

    // Group by bucket so we can use createSignedUrls (batch endpoint)
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
        fetchSignedUrls(sorted);
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
        fetchSignedUrls(sorted);
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
          setMessages(prev => {
            // Avoid duplicate if we already optimistically added it
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.media_storage_path) {
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
          // Soft-delete propagation: remove from local state when deleted_at is set
          if (updated.deleted_at) {
            setMessages(prev => prev.filter(m => m.id !== updated.id));
            return;
          }
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id]);

  // Scroll to end only when new messages are appended (not when older messages are prepended)
  const isLoadingOlderRef = useRef(false);
  useEffect(() => {
    isLoadingOlderRef.current = loadingOlder;
  }, [loadingOlder]);

  useEffect(() => {
    if (messages.length > prevMsgCountRef.current && !isLoadingOlderRef.current) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: prevMsgCountRef.current > 0 }), 80);
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

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

    const { data, error: insertError } = await supabase.from('chat_messages').insert({
      couple_id: couple.id,
      sender_id: user.id,
      content_text: hasText ? text.trim() : null,
      media_storage_path: chatStoragePath,
      media_storage_bucket: hasMedia ? 'chat_media' : null,
      media_type: attachedMedia?.type ?? null,
      allow_screenshot: settings?.vault_allow_screenshot_default ?? false,
      allow_save: settings?.vault_allow_save_default ?? false,
      allow_share: settings?.vault_allow_share_default ?? false,
      vault_item_id: null,
    }).select().single();

    if (insertError || !data) {
      Alert.alert('Send failed', 'Your message could not be sent. Please try again.');
      setSending(false);
      return;
    }

    // Clear UI immediately — message is in DB, realtime will update the list
    const capturedMedia = attachedMedia;
    setText('');
    setAttachedMedia(null);
    setSending(false);

    // Fire background work without blocking the UI
    const coupleId = couple.id;
    const userId = user.id;
    const messageId = data.id;

    Promise.resolve().then(async () => {
      // Auto-save to vault in the background — copy from already-uploaded chat_media
      // rather than re-uploading from the local URI to avoid storing the file twice.
      if (capturedMedia && chatStoragePath && (settings?.chat_auto_save_to_vault ?? true)) {
        try {
          const videoExt = Platform.OS === 'ios' ? 'mov' : 'mp4';
          const ext = capturedMedia.type === 'video' ? videoExt : 'jpg';
          const vaultPath = `${coupleId}/${userId}/vault_${Date.now()}.${ext}`;
          // Fetch a short-lived signed URL for the chat file we just uploaded
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

      // Award points
      try {
        const eventKey = capturedMedia ? 'chat_media' : 'chat_message';
        const pts = await getPointValue(eventKey);
        const reason = capturedMedia ? 'Chat media' : 'Chat message';
        await awardPoints(coupleId, userId, pts, reason);
        const field = capturedMedia ? 'media_sent' : 'chat_messages_sent';
        await incrementMonthlyCounter(coupleId, userId, field, pts);
      } catch {
        // points/stats are non-critical
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
    // Update local state only after DB confirms success
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

    // Soft-delete the chat message row. Storage cleanup depends on the chosen option.
    const softDeleteChat = async () => {
      const deletedAt = new Date().toISOString();
      const { error } = await supabase
        .from('chat_messages')
        .update({ deleted_at: deletedAt })
        .eq('id', msg.id)
        .eq('sender_id', user!.id);
      return error;
    };

    // Delete the vault item linked to this message (soft-delete), then remove its storage file.
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
      // Best-effort storage cleanup for the vault copy
      if (vi?.storage_path) {
        supabase.storage.from(vi.storage_bucket ?? 'vault').remove([vi.storage_path]).catch(() => {});
      }
      return null;
    };

    if (!hasMedia) {
      // Text-only message — simple confirmation, no vault branch needed
      const doDelete = async () => {
        setMessages(prev => prev.filter(m => m.id !== msg.id));
        await softDeleteChat();
      };
      if (Platform.OS === 'web') {
        if (window.confirm('Delete this message? This cannot be undone.')) doDelete();
      } else {
        Alert.alert(
          'Delete message',
          'This will permanently remove the message.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: doDelete },
          ]
        );
      }
      return;
    }

    if (!autoSaveOn || !msg.vault_item_id) {
      // Case B — auto-save OFF (or media was never linked to vault):
      // Simple confirm; remove from chat and delete chat_media storage file only.
      const doDelete = async () => {
        setMessages(prev => prev.filter(m => m.id !== msg.id));
        const chatErr = await softDeleteChat();
        if (chatErr) {
          Alert.alert('Delete Failed', 'Could not remove the message. Please try again.');
          return;
        }
        // Delete chat_media storage file since it was never copied to vault
        if (msg.media_storage_path) {
          const bucket = msg.media_storage_bucket ?? 'chat_media';
          supabase.storage.from(bucket).remove([msg.media_storage_path]).catch(() => {});
        }
      };
      if (Platform.OS === 'web') {
        if (window.confirm('Delete from chat? This will remove the photo/video from this chat.')) doDelete();
      } else {
        Alert.alert(
          'Delete from chat?',
          'This will remove the photo/video from this chat.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: doDelete },
          ]
        );
      }
      return;
    }

    // Case A — auto-save ON and message has a linked vault item: 3-option sheet
    const doChatOnly = async () => {
      setMessages(prev => prev.filter(m => m.id !== msg.id));
      const chatErr = await softDeleteChat();
      if (chatErr) {
        // Re-add message to state since the DB update failed
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
        Alert.alert('Delete Failed', 'Could not remove the message. Please try again.');
      }
      // Vault item is kept intact — do not touch it
    };

    const doChatAndVault = async () => {
      // Delete vault item first — if this fails we bail out and show an error
      const vaultErr = await deleteVaultItem();
      if (vaultErr) {
        Alert.alert('Delete Failed', `Could not remove from Vault: ${vaultErr}\n\nNo changes were made.`);
        return;
      }
      setMessages(prev => prev.filter(m => m.id !== msg.id));
      const chatErr = await softDeleteChat();
      if (chatErr) {
        // Vault is already soft-deleted; best effort to inform user
        Alert.alert('Partial Delete', 'Removed from Vault but could not remove from Chat. Pull to refresh.');
        return;
      }
      // Delete chat_media storage file (vault has its own copy, chat copy is now orphaned)
      if (msg.media_storage_path) {
        const bucket = msg.media_storage_bucket ?? 'chat_media';
        supabase.storage.from(bucket).remove([msg.media_storage_path]).catch(() => {});
      }
    };

    if (Platform.OS === 'web') {
      const choice = window.confirm(
        'Delete media?\n\nOK = Delete from Chat and Vault\nCancel = keep in Vault'
      );
      if (choice) {
        doChatAndVault();
      } else {
        if (window.confirm('Delete from Chat only? (Vault copy will be kept)')) {
          doChatOnly();
        }
      }
    } else {
      Alert.alert(
        'Delete media?',
        msg.vault_item_id
          ? 'This photo/video is saved in your Vault. Choose what to delete.'
          : 'Remove this media from the chat.',
        [
          {
            text: 'Delete from Chat only',
            onPress: doChatOnly,
          },
          {
            text: 'Delete from Chat and Vault',
            style: 'destructive',
            onPress: doChatAndVault,
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
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
    if (msg.vault_item_id) {
      Alert.alert('Already in Vault', 'This media is already saved to your Vault.');
      return;
    }
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

  const renderItem = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const isMine = item.sender_id === user?.id;
    const name = isMine ? (profile?.display_name ?? 'You') : (partnerProfile?.display_name ?? 'Partner');
    const hasMedia = !!item.media_storage_path;
    const isMenuOpen = activeMenuId === item.id;

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
        colors={colors}
        bubbleRefs={bubbleRefs}
        mediaBubbleWidth={mediaBubbleWidth}
        mediaBubbleHeight={mediaBubbleHeight}
        onReveal={handleRevealMedia}
        onOpen={handleOpenMedia}
        onSaveToVault={handleSaveToVault}
        onLongPress={handleLongPress}
        prevCreatedAt={index > 0 ? (item as any).__prevCreatedAt : undefined}
      />
    );
  }, [user?.id, profile?.display_name, partnerProfile?.display_name, activeMenuId, colors, blurEnabled, revealedMedia, signedUrls, handleRevealMedia, handleOpenMedia, handleSaveToVault, mediaBubbleWidth, mediaBubbleHeight]);

  // Attach prev date to each item so renderItem doesn't need the full messages array
  const messagesWithPrev = useMemo(() =>
    messages.map((m, i) => ({ ...m, __prevCreatedAt: i > 0 ? messages[i - 1].created_at : null })),
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
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#05040A' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

          {/* Compose bar — hidden for solo users (no partner yet) */}
          <View style={[styles.compose, { backgroundColor: colors.card, borderTopColor: colors.borderSubtle, paddingBottom: Math.max(insets.bottom, Spacing.sm) }, !hasPartner && styles.composeHidden]}>
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
                  <TouchableOpacity onPress={() => pickMedia('library')} style={styles.attachIcon} activeOpacity={0.7}>
                    <ImageIcon color={colors.textMuted} size={22} strokeWidth={2} />
                  </TouchableOpacity>
                  {Platform.OS !== 'web' && (
                    <TouchableOpacity onPress={() => pickMedia('camera')} style={styles.attachIcon} activeOpacity={0.7}>
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
                style={[styles.sendBtn, { opacity: canSend ? 1 : 0.4 }]}
                activeOpacity={0.8}
              >
                {sending
                  ? <ActivityIndicator color="#FF5A3D" size="small" />
                  : <Send color={editingState ? '#FF8A3D' : '#FF5A3D'} size={20} strokeWidth={2.2} />
                }
              </TouchableOpacity>
            </View>
          </View>
        </AppShell>
      </KeyboardAvoidingView>

      {/* Floating menu — rendered outside AppShell/FlatList so it draws above header */}
      {activeMenuId && menuAnchor && activeMsg && (
        <BubbleMenu
          anchor={menuAnchor}
          onEdit={() => handleStartEdit(activeMsg)}
          onDelete={() => handleDeleteMessage(activeMsg)}
          onDismiss={handleDismissMenu}
        />
      )}
    </View>
  );
}

// Extracted into its own component so React.memo can prevent unnecessary re-renders
const MessageRow = React.memo(function MessageRow({
  item,
  isMine,
  name,
  hasMedia,
  isMenuOpen,
  blurEnabled,
  revealed,
  signedUrl,
  colors,
  bubbleRefs,
  mediaBubbleWidth,
  mediaBubbleHeight,
  onReveal,
  onOpen,
  onSaveToVault,
  onLongPress,
  prevCreatedAt,
}: {
  item: ChatMessage & { __prevCreatedAt?: string | null };
  isMine: boolean;
  name: string;
  hasMedia: boolean;
  isMenuOpen: boolean;
  blurEnabled: boolean;
  revealed: boolean;
  signedUrl: string | null | undefined;
  colors: any;
  bubbleRefs: React.MutableRefObject<Record<string, View | null>>;
  mediaBubbleWidth: number;
  mediaBubbleHeight: number;
  onReveal: (id: string) => void;
  onOpen: (m: ChatMessage) => void;
  onSaveToVault: (m: ChatMessage) => void;
  onLongPress: (m: ChatMessage) => void;
  prevCreatedAt?: string | null;
}) {
  const showDivider = !prevCreatedAt ||
    new Date(prevCreatedAt).toDateString() !== new Date(item.created_at).toDateString();

  return (
    <>
      {showDivider && (
        <View style={styles.dateDivider}>
          <View style={[styles.dateLine, { backgroundColor: colors.borderSubtle }]} />
          <AppText style={[styles.dateText, { color: colors.textMuted }]}>{getDividerLabel(item.created_at)}</AppText>
          <View style={[styles.dateLine, { backgroundColor: colors.borderSubtle }]} />
        </View>
      )}
      <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
        {!isMine && (
          <View style={[styles.msgAvatar, { backgroundColor: 'rgba(255,138,61,0.20)' }]}>
            <AppText style={styles.msgAvatarText}>{name.charAt(0).toUpperCase()}</AppText>
          </View>
        )}
        <TouchableOpacity
          ref={ref => { bubbleRefs.current[item.id] = ref as any; }}
          onLongPress={isMine ? () => onLongPress(item) : undefined}
          delayLongPress={350}
          activeOpacity={1}
        >
          <View style={[
            styles.bubble,
            isMine
              ? { backgroundColor: 'rgba(255,90,61,0.20)', borderColor: isMenuOpen ? 'rgba(255,90,61,0.7)' : 'rgba(255,90,61,0.35)', borderTopRightRadius: 4 }
              : { backgroundColor: colors.card, borderColor: colors.borderSubtle, borderTopLeftRadius: 4 },
          ]}>
            {hasMedia && (
              <MediaBubble
                msg={item}
                blurEnabled={blurEnabled}
                revealed={revealed}
                onReveal={onReveal}
                signedUrl={signedUrl}
                onOpen={onOpen}
                onSaveToVault={onSaveToVault}
                bubbleWidth={mediaBubbleWidth}
                bubbleHeight={mediaBubbleHeight}
              />
            )}
            {item.content_text ? (
              <AppText style={[styles.bubbleText, { color: colors.text }]}>{item.content_text}</AppText>
            ) : null}
            <View style={styles.bubbleMeta}>
              <AppText style={[styles.bubbleTime, { color: isMine ? 'rgba(255,255,255,0.45)' : colors.textMuted }]}>
                {formatTime(item.created_at)}
              </AppText>
              {item.edited_at && (
                <AppText style={[styles.editedLabel, { color: isMine ? 'rgba(255,255,255,0.35)' : colors.textMuted }]}>
                  edited
                </AppText>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing.screen, paddingVertical: Spacing.md, paddingBottom: 16 },
  loadingOlderWrap: { alignItems: 'center', paddingVertical: Spacing.sm },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  emptyEmoji: { fontSize: 52, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold', textAlign: 'center' },
  emptySub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 22 },
  dateDivider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.md },
  dateLine: { flex: 1, height: 1 },
  dateText: { fontSize: 11, fontFamily: 'Inter-Medium', letterSpacing: 0.5 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 6 },
  msgRowRight: { justifyContent: 'flex-end' },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  msgAvatarText: { fontSize: 12, fontFamily: 'Inter-Bold', color: '#FF8A3D' },
  bubble: { maxWidth: '78%', minWidth: 80, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm, paddingHorizontal: 12, gap: 4 },
  bubbleText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 20 },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end' },
  bubbleTime: { fontSize: 10, fontFamily: 'Inter-Regular' },
  editedLabel: { fontSize: 10, fontFamily: 'Inter-Regular', fontStyle: 'italic' },
  // Floating action menu
  menuCard: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 20,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    minWidth: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11 },
  menuText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
  menuDivider: { height: 1, marginHorizontal: 8 },
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
  mediaTap: { borderRadius: Radius.md, overflow: 'hidden', marginBottom: 4 },
  mediaWrap: { width: 200, height: 160, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: '#1A1A2E' },
  mediaPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  mediaBlurOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)' },
  playCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  playTriangle: { color: '#fff', fontSize: 14, marginLeft: 3 },
  vaultBtn: { position: 'absolute', bottom: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,179,71,0.35)' },
  vaultBtnSaved: { borderColor: 'rgba(76,175,80,0.4)' },
  vaultBtnText: { color: '#FFB347', fontSize: 10, fontFamily: 'Inter-SemiBold' },
  vaultBtnTextSaved: { color: '#4CAF50' },
  uploadPctWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  uploadPctText: { color: '#FF5A3D', fontSize: 11, fontFamily: 'Inter-Bold', minWidth: 30 },
  // Compose
  compose: { borderTopWidth: 1, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: Spacing.sm, paddingHorizontal: 4 },
  previewThumb: { width: 44, height: 44, borderRadius: Radius.sm },
  previewInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewLabel: { fontSize: 11, fontFamily: 'Inter-Regular' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  attachIcon: { paddingHorizontal: 4, paddingBottom: 10 },
  input: { flex: 1, borderRadius: Radius.xl, paddingHorizontal: 14, paddingVertical: 10, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', maxHeight: 120, minHeight: 40 },
  sendBtn: { paddingHorizontal: 4, paddingBottom: 10 },
  composeHidden: { display: 'none' },
  inviteBtn: {
    marginTop: Spacing.md,
    backgroundColor: '#FF2E8A',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  inviteBtnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
});
