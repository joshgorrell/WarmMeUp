import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, KeyboardAvoidingView, Platform,
  TouchableOpacity, TouchableWithoutFeedback, Image, ActivityIndicator, TextInput, Alert,
  AppState, AppStateStatus, Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image as ImageIcon, Camera, X, Lock, Send, Vault, Pencil, Trash2, EyeOff } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { awardPoints, getPointValue, incrementMonthlyCounter } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { uploadMediaFile, PICKER_OPTIONS } from '@/lib/uploadMedia';
import { ChatMessage } from '@/lib/types';
import AppShell from '@/components/AppShell';
import TabHeader from '@/components/TabHeader';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';

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
          <Text style={[styles.menuText, { color: colors.text }]}>Edit</Text>
        </TouchableOpacity>
        <View style={[styles.menuDivider, { backgroundColor: 'rgba(255,255,255,0.10)' }]} />
        <TouchableOpacity style={styles.menuItem} onPress={onDelete} activeOpacity={0.75}>
          <Trash2 color="#FF4444" size={14} strokeWidth={2} />
          <Text style={[styles.menuText, { color: '#FF4444' }]}>Delete</Text>
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
  getSignedUrl,
  onOpen,
  onSaveToVault,
  bubbleWidth,
  bubbleHeight,
}: {
  msg: ChatMessage;
  blurEnabled: boolean;
  revealed: boolean;
  onReveal: (id: string) => void;
  getSignedUrl: (m: ChatMessage) => Promise<string | null>;
  onOpen: (m: ChatMessage) => void;
  onSaveToVault: (m: ChatMessage) => void;
  bubbleWidth: number;
  bubbleHeight: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSignedUrl(msg).then(u => {
      setUrl(u);
      setLoaded(true);
    });
  }, [msg.id]);

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
        ) : url ? (
          <Image
            source={{ uri: url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            blurRadius={isBlurred ? 6 : 0}
          />
        ) : (
          <View style={styles.mediaPlaceholder}>
            <Lock color="rgba(255,255,255,0.5)" size={20} />
          </View>
        )}
        {msg.media_type === 'video' && loaded && url && (
          <View style={styles.playOverlay}>
            <View style={styles.playCircle}>
              <Text style={styles.playTriangle}>&#9654;</Text>
            </View>
          </View>
        )}
        {isBlurred && loaded && url && (
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
            <Text style={[styles.vaultBtnText, msg.vault_item_id ? styles.vaultBtnTextSaved : null]}>
              {msg.vault_item_id ? 'In Vault' : 'Save to Vault'}
            </Text>
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState<AttachedMedia | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [editingState, setEditingState] = useState<EditingState | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [revealedMedia, setRevealedMedia] = useState<Set<string>>(new Set());
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const bubbleRefs = useRef<Record<string, View | null>>({});
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

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

  useEffect(() => {
    if (!couple?.id) return;
    loadMessages();
    const ch = supabase.channel(`chat_tab_${couple.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `couple_id=eq.${couple.id}` }, () => loadMessages())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `couple_id=eq.${couple.id}` }, () => loadMessages())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `couple_id=eq.${couple.id}` }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id]);

  const loadMessages = useCallback(async () => {
    if (!couple?.id) return;
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('couple_id', couple.id)
      .order('created_at', { ascending: true })
      .limit(100);
    if (data) setMessages(data);
  }, [couple?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
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
      setAttachedMedia({
        uri: asset.uri,
        type: isVideo ? 'video' : 'photo',
        mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
        fileName: `chat_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
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
    if (!couple?.id || !user) return;
    setSending(true);

    let chatStoragePath: string | null = null;
    let vaultItemId: string | null = null;

    if (hasMedia && attachedMedia) {
      chatStoragePath = await uploadChatMedia(attachedMedia, couple.id, user.id);
      if (!chatStoragePath) {
        // Upload failed — error already shown
        setSending(false);
        return;
      }

      // Auto-save to vault if enabled
      if (settings?.chat_auto_save_to_vault ?? true) {
        try {
          const vaultPath = `${couple.id}/${user.id}/vault_${Date.now()}.${attachedMedia.type === 'video' ? 'mp4' : 'jpg'}`;
          await uploadMediaFile(attachedMedia.uri, 'vault', vaultPath, attachedMedia.mimeType);
          const { data: vaultData } = await supabase.from('vault_items').insert({
            couple_id: couple.id,
            uploaded_by_user_id: user.id,
            media_type: attachedMedia.type,
            file_path: vaultPath,
            storage_path: vaultPath,
            storage_bucket: 'vault',
            blurred_thumbnail_path: null,
            allow_screenshot: settings?.vault_allow_screenshot_default ?? false,
            allow_save: settings?.vault_allow_save_default ?? false,
            allow_share: settings?.vault_allow_share_default ?? false,
            chat_message_id: null, // will be back-filled after chat_messages insert
          }).select('id').single();
          if (vaultData?.id) vaultItemId = vaultData.id;
        } catch {
          // Non-fatal: vault save fails silently — chat message still sends
        }
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
      vault_item_id: vaultItemId,
    }).select().single();

    if (insertError || !data) {
      Alert.alert('Send failed', 'Your message could not be sent. Please try again.');
      setSending(false);
      return;
    }

    // Back-fill the chat_message_id on the vault item so deletions can cascade
    if (data.id && vaultItemId) {
      await supabase.from('vault_items').update({ chat_message_id: data.id }).eq('id', vaultItemId);
    }

    const eventKey = hasMedia ? 'chat_media' : 'chat_message';
    const pts = await getPointValue(eventKey);
    const reason = hasMedia ? 'Chat media' : 'Chat message';
    await awardPoints(couple.id, user.id, pts, reason);
    const field = hasMedia ? 'media_sent' : 'chat_messages_sent';
    await incrementMonthlyCounter(couple.id, user.id, field, pts);
    notifyPartner({ event_type: 'new_message', couple_id: couple.id, target_route: '/(app)/(tabs)/note' });

    setText('');
    setAttachedMedia(null);
    setSending(false);
  };

  const handleSaveEdit = async () => {
    if (!editingState) return;
    const newText = text.trim();
    if (!newText) return;
    setSending(true);
    await supabase
      .from('chat_messages')
      .update({ content_text: newText, edited_at: new Date().toISOString() })
      .eq('id', editingState.messageId)
      .eq('sender_id', user!.id);
    setMessages(prev => prev.map(m =>
      m.id === editingState.messageId
        ? { ...m, content_text: newText, edited_at: new Date().toISOString() }
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
    const doDelete = async () => {
      setMessages(prev => prev.filter(m => m.id !== msg.id));
      // Delete chat storage file
      if (msg.media_storage_path) {
        const bucket = msg.media_storage_bucket ?? 'chat_media';
        await supabase.storage.from(bucket).remove([msg.media_storage_path]);
      }
      // Delete linked vault item and its storage file
      if (msg.vault_item_id) {
        const { data: vItem } = await supabase
          .from('vault_items')
          .select('storage_path, storage_bucket')
          .eq('id', msg.vault_item_id)
          .maybeSingle();
        if (vItem?.storage_path) {
          const vBucket = vItem.storage_bucket ?? 'vault';
          await supabase.storage.from(vBucket).remove([vItem.storage_path]);
        }
        await supabase.from('vault_items').delete().eq('id', msg.vault_item_id);
      }
      await supabase.from('chat_messages').delete().eq('id', msg.id).eq('sender_id', user!.id);
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Delete this message? This cannot be undone.')) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete message',
        'This will permanently remove the message. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const getSignedUrl = async (msg: ChatMessage): Promise<string | null> => {
    if (signedUrls[msg.id]) return signedUrls[msg.id];
    if (!msg.media_storage_path) return null;
    const bucket = msg.media_storage_bucket ?? 'chat_media';
    const { data } = await supabase.storage.from(bucket).createSignedUrl(msg.media_storage_path, 3600);
    if (data?.signedUrl) {
      setSignedUrls(prev => ({ ...prev, [msg.id]: data.signedUrl }));
      return data.signedUrl;
    }
    return null;
  };

  const handleOpenMedia = (msg: ChatMessage) => {
    if (!msg.media_storage_path) return;
    router.push({
      pathname: '/vault-viewer',
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
  };

  const handleSaveToVault = async (msg: ChatMessage) => {
    if (!msg.media_storage_path || !couple?.id || !user) return;
    // If already linked to a vault item, nothing to do
    if (msg.vault_item_id) {
      Alert.alert('Already in Vault', 'This media is already saved to your Vault.');
      return;
    }
    const srcBucket = msg.media_storage_bucket ?? 'chat_media';
    const mimeType = msg.media_type === 'video' ? 'video/mp4' : 'image/jpeg';
    const ext = msg.media_type === 'video' ? 'mp4' : 'jpg';
    const destPath = `${couple.id}/${user.id}/vault_${Date.now()}.${ext}`;
    try {
      // Get a short-lived signed URL for the source file
      const { data: srcData } = await supabase.storage.from(srcBucket).createSignedUrl(msg.media_storage_path, 120);
      if (!srcData?.signedUrl) throw new Error('Could not access source media.');
      // Re-upload to vault bucket via the shared utility (web-safe)
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
        // Link the message back to the vault item
        await supabase.from('chat_messages').update({ vault_item_id: vaultData.id }).eq('id', msg.id);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, vault_item_id: vaultData.id } : m));
      }
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message ?? 'Could not save to Vault. Please try again.');
    }
  };

  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isMine = item.sender_id === user?.id;
    const name = isMine ? (profile?.display_name ?? 'You') : (partnerProfile?.display_name ?? 'Partner');
    const hasMedia = !!item.media_storage_path;
    const isMenuOpen = activeMenuId === item.id;

    const showDivider = index === 0 || new Date(messages[index - 1].created_at).toDateString() !== new Date(item.created_at).toDateString();

    return (
      <>
        {showDivider && (
          <View style={styles.dateDivider}>
            <View style={[styles.dateLine, { backgroundColor: colors.borderSubtle }]} />
            <Text style={[styles.dateText, { color: colors.textMuted }]}>{getDividerLabel(item.created_at)}</Text>
            <View style={[styles.dateLine, { backgroundColor: colors.borderSubtle }]} />
          </View>
        )}
        <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
          {!isMine && (
            <View style={[styles.msgAvatar, { backgroundColor: 'rgba(255,138,61,0.20)' }]}>
              <Text style={styles.msgAvatarText}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <TouchableOpacity
            ref={ref => { bubbleRefs.current[item.id] = ref as any; }}
            onLongPress={isMine ? () => handleLongPress(item) : undefined}
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
                  revealed={revealedMedia.has(item.id)}
                  onReveal={id => setRevealedMedia(prev => new Set([...prev, id]))}
                  getSignedUrl={getSignedUrl}
                  onOpen={handleOpenMedia}
                  onSaveToVault={handleSaveToVault}
                  bubbleWidth={mediaBubbleWidth}
                  bubbleHeight={mediaBubbleHeight}
                />
              )}
              {item.content_text ? (
                <Text style={[styles.bubbleText, { color: colors.text }]}>{item.content_text}</Text>
              ) : null}
              <View style={styles.bubbleMeta}>
                <Text style={[styles.bubbleTime, { color: isMine ? 'rgba(255,255,255,0.45)' : colors.textMuted }]}>
                  {formatTime(item.created_at)}
                </Text>
                {item.edited_at && (
                  <Text style={[styles.editedLabel, { color: isMine ? 'rgba(255,255,255,0.35)' : colors.textMuted }]}>
                    edited
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  const canSend = editingState
    ? text.trim().length > 0 && !sending
    : (text.trim().length > 0 || attachedMedia !== null) && !sending && !uploadProgress;

  const activeMsg = activeMenuId ? messages.find(m => m.id === activeMenuId) : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#05040A' }}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#05040A' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <AppShell scrollable={false}>
          <TabHeader title="Chat" />

          {messages.length === 0 ? (
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>💬</Text>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Start the conversation</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  Send a message, photo, or video.{'\n'}Only the two of you will see it.
                </Text>
              </View>
            </TouchableWithoutFeedback>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={m => m.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            />
          )}

          {/* Edit mode banner */}
          {editingState && (
            <View style={[styles.editBanner, { backgroundColor: 'rgba(255,138,61,0.12)', borderTopColor: 'rgba(255,138,61,0.3)' }]}>
              <Pencil color="#FF8A3D" size={13} strokeWidth={2} />
              <Text style={[styles.editBannerText, { color: '#FF8A3D' }]}>Editing message</Text>
              <TouchableOpacity onPress={handleCancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color="#FF8A3D" size={15} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}

          {/* Compose bar */}
          <View style={[styles.compose, { backgroundColor: colors.card, borderTopColor: colors.borderSubtle }]}>
            {attachedMedia && !editingState && (
              <View style={styles.previewRow}>
                <Image source={{ uri: attachedMedia.uri }} style={styles.previewThumb} />
                <View style={styles.previewInfo}>
                  <Lock color="#FF8A3D" size={11} />
                  <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
                    {attachedMedia.type === 'video' ? 'Video' : 'Photo'} — vault privacy
                  </Text>
                </View>
                {uploadProgress && (
                  <View style={styles.uploadPctWrap}>
                    <ActivityIndicator color="#FF5A3D" size="small" />
                    {uploadPct > 0 && (
                      <Text style={styles.uploadPctText}>{uploadPct}%</Text>
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
              <TextInput
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

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing.screen, paddingVertical: Spacing.md, paddingBottom: 16 },
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
  bubble: { maxWidth: '78%', borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm, paddingHorizontal: 12, gap: 4 },
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
  compose: { borderTopWidth: 1, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, paddingBottom: Platform.OS === 'ios' ? 24 : Spacing.sm },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: Spacing.sm, paddingHorizontal: 4 },
  previewThumb: { width: 44, height: 44, borderRadius: Radius.sm },
  previewInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewLabel: { fontSize: 11, fontFamily: 'Inter-Regular' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  attachIcon: { paddingHorizontal: 4, paddingBottom: 10 },
  input: { flex: 1, borderRadius: Radius.xl, paddingHorizontal: 14, paddingVertical: 10, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', maxHeight: 120, minHeight: 40 },
  sendBtn: { paddingHorizontal: 4, paddingBottom: 10 },
});
