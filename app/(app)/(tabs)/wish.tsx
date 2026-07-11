import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Animated, Modal,
  Pressable, Linking, ActivityIndicator, Alert,
  AppState, AppStateStatus,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Sparkles, Plus, Heart, X, Check, ChevronRight,
  ExternalLink, Image as ImageIcon, Trash2, Pencil,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { awardPoints, getPointValue, incrementMonthlyCounter } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { logDebugEvent } from '@/lib/debugLog';
import { uploadMediaFile, resolveAssetMimeType } from '@/lib/uploadMedia';
import { Wish, WishReaction, WishCategory } from '@/lib/types';
import AppShell from '@/components/AppShell';
import TabHeader from '@/components/TabHeader';
import BottomSheet from '@/components/BottomSheet';
import { FontSize, Spacing, Radius, Gradient as GradientColors } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';

// ─── constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

const WISH_ACCENT = '#E8637A';
const WISH_GOLD = '#F0A96A';

const CATEGORIES: { label: WishCategory; emoji: string }[] = [
  { label: 'Romantic',    emoji: '🌹' },
  { label: 'Travel',      emoji: '✈️' },
  { label: 'Food & Drink', emoji: '🍷' },
  { label: 'Fantasy',     emoji: '✨' },
  { label: 'Adventure',   emoji: '🏔️' },
  { label: 'Gifts',       emoji: '🎁' },
  { label: 'Date Night',  emoji: '🕯️' },
  { label: 'Intimate',    emoji: '🔥' },
  { label: 'Someday',     emoji: '🌙' },
];

const REACTIONS = ['❤️', '🔥', '😍', '🤩'];

type TabKey = 'mine' | 'shared' | 'theirs' | 'granted';

interface WishWithReactions extends Wish {
  reactions: WishReaction[];
  resolvedImageUri?: string | null;
  resolvedMemoryUri?: string | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function getCategoryEmoji(cat: WishCategory | null) {
  return CATEGORIES.find(c => c.label === cat)?.emoji ?? '💭';
}

// ─── WishCard ─────────────────────────────────────────────────────────────────

function WishCard({
  wish, isMine, onOpenDetail,
}: {
  wish: WishWithReactions;
  isMine: boolean;
  onOpenDetail: (wish: WishWithReactions) => void;
}) {
  const { colors } = useTheme();
  const imgUri = wish.resolvedImageUri ?? null;

  const reactionCounts: Record<string, number> = {};
  wish.reactions.forEach(r => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] ?? 0) + 1; });

  const totalReactions = Object.values(reactionCounts).reduce((s, n) => s + n, 0);
  const reactedEmojis = REACTIONS.filter(e => reactionCounts[e] > 0);

  return (
    <TouchableOpacity
      style={[styles.wishCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}
      onPress={() => onOpenDetail(wish)}
      activeOpacity={0.85}
    >
      <View style={styles.wishCardRow}>
        {imgUri ? (
          <View style={styles.wishCardThumbWrap}>
            <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
          </View>
        ) : null}

        <View style={[styles.wishCardBody, !imgUri && styles.wishCardBodyNoImg]}>
          <AppText style={[styles.wishTitle, { color: colors.text }]} numberOfLines={2}>{wish.title}</AppText>

          <AppText style={[styles.wishSubtitle, { color: colors.textMuted }]}>
            {isMine ? 'Added by you' : 'Added by partner'} · {timeAgo(wish.created_at)}
          </AppText>

          <View style={styles.wishCardMeta}>
            {wish.status === 'draft' && isMine && (
              <View style={styles.draftBadge}>
                <AppText style={styles.draftBadgeText}>Draft</AppText>
              </View>
            )}
            {wish.category ? (
              <View style={[styles.categoryBadge, { backgroundColor: 'rgba(232,99,122,0.12)', borderColor: 'rgba(232,99,122,0.28)' }]}>
                <AppText style={styles.categoryBadgeText}>
                  {getCategoryEmoji(wish.category)}  {wish.category}
                </AppText>
              </View>
            ) : null}
            {totalReactions > 0 && (
              <View style={styles.reactionSummaryPill}>
                <AppText style={styles.reactionSummaryText}>
                  {reactedEmojis.join('')}{' '}{totalReactions}
                </AppText>
              </View>
            )}
          </View>

          {wish.description ? (
            <AppText style={[styles.wishDesc, { color: colors.textSecondary }]} numberOfLines={2}>{wish.description}</AppText>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── GrantedCard ──────────────────────────────────────────────────────────────

function GrantedCard({
  wish, isMine, onOpenDetail,
}: {
  wish: WishWithReactions;
  isMine: boolean;
  onOpenDetail: (wish: WishWithReactions) => void;
}) {
  const { colors } = useTheme();
  const memImgUri = wish.resolvedMemoryUri ?? null;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <TouchableOpacity
      style={[styles.grantedCard, { backgroundColor: colors.card, borderColor: 'rgba(240,169,106,0.30)' }]}
      onPress={() => onOpenDetail(wish)}
      activeOpacity={0.85}
    >
      <View style={styles.grantedHeader}>
        <Animated.Text style={[styles.grantedHeart, { transform: [{ scale: pulseAnim }] }]}>❤️</Animated.Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText style={[styles.grantedLabel, { color: WISH_GOLD }]}>Wish Granted</AppText>
          <AppText style={[styles.grantedTitle, { color: colors.text }]} numberOfLines={2}>{wish.title}</AppText>
        </View>
        {wish.category ? (
          <AppText style={styles.grantedEmoji}>{getCategoryEmoji(wish.category)}</AppText>
        ) : null}
      </View>
      {memImgUri && (
        <Image source={{ uri: memImgUri }} style={styles.grantedMemImg} resizeMode="cover" />
      )}
      {wish.fulfilled_note ? (
        <AppText style={[styles.grantedNote, { color: colors.textSecondary }]} numberOfLines={2}>"{wish.fulfilled_note}"</AppText>
      ) : null}
      <AppText style={[styles.grantedDate, { color: colors.textMuted }]}>
        {isMine ? 'Your wish' : "Partner's wish"} · {wish.fulfilled_at ? timeAgo(wish.fulfilled_at) : ''}
      </AppText>
    </TouchableOpacity>
  );
}

// ─── WishDetailSheet ──────────────────────────────────────────────────────────

function WishDetailSheet({
  visible, wish, isMine, userId, isGranted, onClose,
  onReact, onFulfill, onEdit, onArchive, onDelete,
}: {
  visible: boolean;
  wish: WishWithReactions | null;
  isMine: boolean;
  userId: string;
  isGranted: boolean;
  onClose: () => void;
  onReact: (wish: WishWithReactions, emoji: string) => void;
  onFulfill: (wish: WishWithReactions) => void;
  onEdit: (wish: WishWithReactions) => void;
  onArchive: (wish: WishWithReactions) => void;
  onDelete: (wish: WishWithReactions) => void;
}) {
  const { colors } = useTheme();
  if (!wish) return null;

  const imgUri = wish.resolvedImageUri ?? null;
  const memImgUri = wish.resolvedMemoryUri ?? null;
  const myReaction = wish.reactions.find(r => r.user_id === userId)?.emoji ?? null;
  const reactionCounts: Record<string, number> = {};
  wish.reactions.forEach(r => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] ?? 0) + 1; });

  const closeAnd = (fn: () => void) => { onClose(); fn(); };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={wish.title}
      scrollable
    >
      {imgUri && (
        <Image source={{ uri: imgUri }} style={styles.detailImage} resizeMode="cover" />
      )}

      <AppText style={[styles.detailMeta, { color: colors.textMuted }]}>
        {isMine ? 'Added by you' : 'Added by partner'} · {timeAgo(wish.created_at)}
      </AppText>

      {wish.category && (
        <View style={[styles.categoryBadge, { backgroundColor: 'rgba(232,99,122,0.12)', borderColor: 'rgba(232,99,122,0.28)', marginTop: 8 }]}>
          <AppText style={styles.categoryBadgeText}>
            {getCategoryEmoji(wish.category)}  {wish.category}
          </AppText>
        </View>
      )}

      {wish.description && (
        <AppText style={[styles.detailDesc, { color: colors.textSecondary }]}>
          {wish.description}
        </AppText>
      )}

      {wish.link && (
        <TouchableOpacity onPress={() => wish.link && Linking.openURL(wish.link)} activeOpacity={0.7} style={styles.linkRow}>
          <ExternalLink color={WISH_ACCENT} size={12} strokeWidth={2} />
          <AppText style={[styles.linkText, { color: WISH_ACCENT }]} numberOfLines={1}>{wish.link}</AppText>
        </TouchableOpacity>
      )}

      {isGranted && (
        <View style={styles.detailGrantedSection}>
          {memImgUri && (
            <Image source={{ uri: memImgUri }} style={styles.detailMemImage} resizeMode="cover" />
          )}
          {wish.fulfilled_note && (
            <AppText style={[styles.detailFulfilledNote, { color: colors.textSecondary }]}>
              "{wish.fulfilled_note}"
            </AppText>
          )}
          <AppText style={[styles.detailFulfilledDate, { color: colors.textMuted }]}>
            Granted {wish.fulfilled_at ? timeAgo(wish.fulfilled_at) : ''}
          </AppText>
        </View>
      )}

      <View style={styles.detailReactionRow}>
        {REACTIONS.map(emoji => {
          const count = reactionCounts[emoji] ?? 0;
          const mine = myReaction === emoji;
          return (
            <TouchableOpacity
              key={emoji}
              onPress={() => closeAnd(() => onReact(wish, emoji))}
              style={[
                styles.detailReactionBtn,
                mine
                  ? { backgroundColor: 'rgba(232,99,122,0.18)', borderColor: 'rgba(232,99,122,0.50)' }
                  : { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)' },
              ]}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <AppText style={styles.detailReactionEmoji}>{emoji}</AppText>
              {count > 0 && (
                <AppText style={[styles.detailReactionCount, { color: mine ? WISH_ACCENT : 'rgba(255,255,255,0.45)' }]}>
                  {count}
                </AppText>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {!isGranted && (
        <View style={styles.detailActionRow}>
          {wish.status === 'shared' && (
            <TouchableOpacity
              onPress={() => closeAnd(() => onFulfill(wish))}
              style={[styles.detailActionBtn, { backgroundColor: 'rgba(240,169,106,0.15)', borderColor: 'rgba(240,169,106,0.35)' }]}
              activeOpacity={0.8}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Heart color={WISH_GOLD} size={14} strokeWidth={2} />
              <AppText style={[styles.detailActionLabel, { color: WISH_GOLD }]}>{isMine ? 'Granted' : 'Grant'}</AppText>
            </TouchableOpacity>
          )}
          {isMine && (
            <TouchableOpacity
              onPress={() => closeAnd(() => onEdit(wish))}
              style={[styles.detailActionBtn, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }]}
              activeOpacity={0.8}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Pencil color="rgba(255,255,255,0.65)" size={14} strokeWidth={2} />
              <AppText style={[styles.detailActionLabel, { color: 'rgba(255,255,255,0.65)' }]}>Edit</AppText>
            </TouchableOpacity>
          )}
          {isMine && wish.status !== 'archived' && (
            <TouchableOpacity
              onPress={() => closeAnd(() => onArchive(wish))}
              style={[styles.detailActionBtn, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.10)' }]}
              activeOpacity={0.8}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <X color="rgba(255,255,255,0.40)" size={14} strokeWidth={2} />
              <AppText style={[styles.detailActionLabel, { color: 'rgba(255,255,255,0.40)' }]}>Archive</AppText>
            </TouchableOpacity>
          )}
          {isMine && (
            <TouchableOpacity
              onPress={() => closeAnd(() => onDelete(wish))}
              style={[styles.detailActionBtn, { backgroundColor: 'rgba(255,90,95,0.10)', borderColor: 'rgba(255,90,95,0.25)' }]}
              activeOpacity={0.8}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Trash2 color="#FF5A5F" size={14} strokeWidth={2} />
              <AppText style={[styles.detailActionLabel, { color: '#FF5A5F' }]}>Delete</AppText>
            </TouchableOpacity>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

// ─── WishForm ─────────────────────────────────────────────────────────────────

function WishForm({
  visible, initial, onClose, onSave,
}: {
  visible: boolean;
  initial: WishWithReactions | null;
  onClose: () => void;
  onSave: (wish: WishWithReactions) => void;
}) {
  const { colors } = useTheme();
  const { user, couple } = useAuth();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [link, setLink] = useState('');
  const [category, setCategory] = useState<WishCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [imgPath, setImgPath] = useState<string | null>(null);
  const [imgBucket, setImgBucket] = useState<string>('chat_media');
  const [imgUri, setImgUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setTitle(initial?.title ?? '');
      setDesc(initial?.description ?? '');
      setLink(initial?.link ?? '');
      setCategory(initial?.category ?? null);
      setImgPath(initial?.image_storage_path ?? null);
      setImgBucket(initial?.image_storage_bucket ?? 'chat_media');
      setImgUri(null);
      setError('');
      if (initial?.image_storage_path && initial?.image_storage_bucket) {
        supabase.storage.from(initial.image_storage_bucket).createSignedUrl(initial.image_storage_path, 3600)
          .then(({ data, error }) => {
            if (error) {
              logDebugEvent('WISH IMAGE SIGN ERROR', { path: initial.image_storage_path, error: error.message });
              return;
            }
            if (data?.signedUrl) setImgUri(data.signedUrl);
          });
      }
    }
  }, [visible, initial]);

  const pickImage = async () => {
    if (!user) { setError('You must be logged in to add a photo.'); return; }
    if (!couple?.id) { setError('Account not ready — please try again.'); return; }
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photo Access Required',
          'Allow access to your photo library in Settings to add a photo to your wish.',
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];

      const mime = resolveAssetMimeType(asset);
      logDebugEvent('WISH IMAGE PICK', {
        localUri: asset.uri,
        mimeType: mime,
        fileSize: asset.fileSize ?? null,
      });
      logDebugEvent('WISH LAST IMAGE PICK', { at: new Date().toISOString(), mime });

      setUploading(true);
      setError('');

      // Delete the old image from storage before uploading a new one
      if (imgPath) {
        await supabase.storage.from(imgBucket).remove([imgPath]).catch(() => {});
      }

      const storagePath = `${couple.id}/${user.id}/wish_${Date.now()}.jpg`;
      logDebugEvent('WISH IMAGE UPLOAD START', { storagePath });
      logDebugEvent('WISH LAST UPLOAD PATH', { path: storagePath });

      await uploadMediaFile(asset.uri, 'chat_media', storagePath, mime, undefined, user.id, couple.id);

      // Generate a signed URL immediately so the preview survives a restart
      const { data: signedData, error: signError } = await supabase.storage
        .from('chat_media')
        .createSignedUrl(storagePath, 3600);

      if (signError || !signedData?.signedUrl) {
        logDebugEvent('WISH IMAGE SIGN ERROR', { storagePath, error: signError?.message ?? 'no signedUrl' });
        // Still persist the path — the card will re-sign on load
        setImgPath(storagePath);
        setImgBucket('chat_media');
        setImgUri(null);
      } else {
        logDebugEvent('WISH IMAGE UPLOAD SUCCESS', { storagePath, signedUrl: signedData.signedUrl.slice(0, 60) });
        logDebugEvent('WISH LAST UPLOAD ERROR', { error: null });
        setImgPath(storagePath);
        setImgBucket('chat_media');
        setImgUri(signedData.signedUrl);
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Unknown error';
      logDebugEvent('WISH IMAGE UPLOAD ERROR', { error: msg });
      logDebugEvent('WISH LAST UPLOAD ERROR', { error: msg });
      setError(msg.length < 120 ? msg : 'Image upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async () => {
    if (imgPath) {
      await supabase.storage.from(imgBucket).remove([imgPath]).catch(() => {});
      logDebugEvent('WISH IMAGE REMOVE', { path: imgPath, bucket: imgBucket });
    }
    setImgPath(null);
    setImgBucket('chat_media');
    setImgUri(null);
  };

  const handleSave = async (shareNow: boolean) => {
    if (!title.trim() || !couple?.id || !user) return;
    setSaving(true);
    setError('');
    try {
      const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
      const payload = {
        couple_id: couple.id,
        created_by_user_id: user.id,
        title: title.trim(),
        description: desc.trim() || null,
        category: category ?? null,
        image_storage_path: imgPath ?? null,
        image_storage_bucket: imgPath ? imgBucket : null,
        link: link.trim() || null,
        status: shareNow ? 'shared' : 'draft',
        updated_at: new Date().toISOString(),
      };

      let result: Wish;
      if (initial) {
        const { data, error: updateError } = await supabase
          .from('wishes').update(payload).eq('id', initial.id).select().single();
        if (updateError) throw updateError;
        result = data;
        // Log activity event for wish edit
        const imageAdded = !!imgPath && !initial.image_storage_path;
        if (partnerId) {
          supabase.from('activity_events').insert({
            couple_id: couple.id,
            actor_user_id: user.id,
            target_user_id: partnerId,
            event_type: imageAdded ? 'wish_image_added' : 'wish_updated',
            wish_id: result.id,
          }).then(() => {}, () => {});
        }
      } else {
        const { data, error: insertError } = await supabase
          .from('wishes').insert(payload).select().single();
        if (insertError) throw insertError;
        result = data;
        logDebugEvent('WISH SAVE SUCCESS', { wishId: result.id, hasImage: !!imgPath, status: payload.status });
        logDebugEvent('WISH LAST CREATED ID', { id: result.id });
        // Log activity event for new wish creation
        if (partnerId) {
          supabase.from('activity_events').insert({
            couple_id: couple.id,
            actor_user_id: user.id,
            target_user_id: partnerId,
            event_type: imgPath ? 'wish_image_added' : 'wish_created',
            wish_id: result.id,
          }).then(() => {}, () => {});
        }
        if (shareNow) {
          try {
            const pts = await getPointValue('wish_sent');
            await awardPoints(couple.id, user.id, pts, 'Wish shared', result.id);
            await incrementMonthlyCounter(couple.id, user.id, 'wishes_sent', pts);
          } catch {}
          if (partnerId) {
            notifyPartner({ event_type: 'new_wish', couple_id: couple.id, target_route: '/(app)/(tabs)/wish', item_id: result.id, partnerUserId: partnerId });
          }
        }
      }
      onSave({ ...result, reactions: initial?.reactions ?? [], resolvedImageUri: imgUri ?? null });
    } catch (err: any) {
      const msg = err?.message ?? 'Unknown error';
      logDebugEvent('WISH SAVE ERROR', { error: msg, hasImage: !!imgPath });
      setError('Could not save your wish. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.formRoot, { backgroundColor: '#09090F' }]}>
          {/* Header */}
          <View style={styles.formHeader}>
            <TouchableOpacity onPress={onClose} style={styles.formCloseBtn} activeOpacity={0.7}>
              <X color="rgba(255,255,255,0.6)" size={20} strokeWidth={2} />
            </TouchableOpacity>
            <AppText style={styles.formTitle}>{initial ? 'Edit Wish' : 'New Wish'}</AppText>
            <View style={{ width: 32 }} />
          </View>

          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Spark header */}
            <View style={styles.formIconWrap}>
              <LinearGradient colors={['rgba(232,99,122,0.18)', 'rgba(240,169,106,0.08)']} style={styles.formIconBg}>
                <Sparkles color={WISH_ACCENT} size={28} strokeWidth={1.5} />
              </LinearGradient>
              <AppText style={styles.formSubtitle}>What do you desire? Dream big.</AppText>
            </View>

            {error ? (
              <View style={styles.formErrorBanner}>
                <AppText style={styles.formErrorText}>{error}</AppText>
              </View>
            ) : null}

            {/* Title */}
            <AppText style={styles.formLabel}>Title <AppText style={{ color: WISH_ACCENT }}>*</AppText></AppText>
            <AppTextInput
              style={styles.formInput}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Weekend in Paris…"
              placeholderTextColor="rgba(255,255,255,0.25)"
              maxLength={120}
            />

            {/* Category */}
            <AppText style={[styles.formLabel, { marginTop: Spacing.md }]}>Category</AppText>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c.label}
                  onPress={() => setCategory(prev => prev === c.label ? null : c.label)}
                  style={[
                    styles.categoryPill,
                    category === c.label
                      ? { backgroundColor: 'rgba(232,99,122,0.18)', borderColor: 'rgba(232,99,122,0.55)' }
                      : { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.10)' },
                  ]}
                  activeOpacity={0.75}
                >
                  <AppText style={styles.categoryPillEmoji}>{c.emoji}</AppText>
                  <AppText style={[styles.categoryPillLabel, { color: category === c.label ? WISH_ACCENT : 'rgba(255,255,255,0.65)' }]}>{c.label}</AppText>
                </TouchableOpacity>
              ))}
            </View>

            {/* Description */}
            <AppText style={[styles.formLabel, { marginTop: Spacing.md }]}>Description</AppText>
            <AppTextInput
              style={[styles.formInput, styles.formTextarea]}
              value={desc}
              onChangeText={setDesc}
              placeholder="Tell the story behind this wish…"
              placeholderTextColor="rgba(255,255,255,0.25)"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />

            {/* Image */}
            <AppText style={[styles.formLabel, { marginTop: Spacing.md }]}>Photo</AppText>
            <TouchableOpacity onPress={pickImage} style={styles.imgPicker} activeOpacity={0.75} disabled={uploading || !couple?.id}>
              {uploading ? (
                <ActivityIndicator color={WISH_ACCENT} />
              ) : imgUri ? (
                <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
              ) : (
                <>
                  <ImageIcon color="rgba(255,255,255,0.35)" size={22} strokeWidth={1.5} />
                  <AppText style={styles.imgPickerLabel}>Add a photo</AppText>
                </>
              )}
              {imgUri && !uploading && (
                <View style={styles.imgPickerOverlay}>
                  <AppText style={styles.imgPickerChange}>Tap to change</AppText>
                </View>
              )}
            </TouchableOpacity>
            {(imgUri || imgPath) && !uploading && (
              <TouchableOpacity onPress={removeImage} style={styles.imgRemoveBtn} activeOpacity={0.7}>
                <Trash2 color="#FF5A5F" size={13} strokeWidth={2} />
                <AppText style={styles.imgRemoveText}>Remove photo</AppText>
              </TouchableOpacity>
            )}

            {/* Link */}
            <AppText style={[styles.formLabel, { marginTop: Spacing.md }]}>Link</AppText>
            <AppTextInput
              style={styles.formInput}
              value={link}
              onChangeText={setLink}
              placeholder="https://…"
              placeholderTextColor="rgba(255,255,255,0.25)"
              autoCapitalize="none"
              keyboardType="url"
              maxLength={500}
            />

            <View style={{ height: Spacing.xl }} />

            {/* CTAs */}
            <TouchableOpacity
              onPress={() => handleSave(true)}
              disabled={!title.trim() || saving}
              style={[styles.formCTA, (!title.trim() || saving) && { opacity: 0.45 }]}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#E8637A', '#F0A96A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.formCTAGrad}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Sparkles color="#fff" size={16} strokeWidth={2} />
                    <AppText style={styles.formCTAText}>{initial ? 'Save Changes' : couple?.user_b_id ? 'Share with Partner' : 'Save to Wishlist'}</AppText>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
            {!initial && (
              <TouchableOpacity
                onPress={() => handleSave(false)}
                disabled={!title.trim() || saving}
                style={[styles.formDraftBtn, (!title.trim() || saving) && { opacity: 0.45 }]}
                activeOpacity={0.75}
              >
                <AppText style={styles.formDraftText}>Save as Draft</AppText>
              </TouchableOpacity>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── FulfillSheet ─────────────────────────────────────────────────────────────

function FulfillSheet({
  visible, wish, onClose, onFulfilled,
}: {
  visible: boolean;
  wish: WishWithReactions | null;
  onClose: () => void;
  onFulfilled: (updated: WishWithReactions) => void;
}) {
  const { user, couple } = useAuth();
  const [note, setNote] = useState('');
  const [memImgPath, setMemImgPath] = useState<string | null>(null);
  const [memImgUri, setMemImgUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const celebAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setNote('');
      setMemImgPath(null);
      setMemImgUri(null);
      setError('');
      setDone(false);
    }
  }, [visible]);

  const pickMemory = async () => {
    if (!couple?.id || !user) return;
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photo Access Required',
          'Allow access to your photo library in Settings to attach a memory photo.',
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        quality: 0.85,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const mime = asset.mimeType ?? 'image/jpeg';
      logDebugEvent('WISH MEMORY IMAGE PICK', { mimeType: mime, fileSize: asset.fileSize ?? null });

      setUploading(true);
      setError('');

      const path = `${couple.id}/${user.id}/wish_memory_${Date.now()}.jpg`;
      logDebugEvent('WISH MEMORY IMAGE UPLOAD START', { path });

      await uploadMediaFile(asset.uri, 'vault', path, 'image/jpeg', undefined, user.id, couple.id);

      // Use signed URL for the preview so it survives memory flush
      const { data: signedData, error: signErr } = await supabase.storage.from('vault').createSignedUrl(path, 3600);
      if (signErr || !signedData?.signedUrl) {
        logDebugEvent('WISH MEMORY IMAGE SIGN ERROR', { path, error: signErr?.message ?? 'no signedUrl' });
        setMemImgPath(path);
        setMemImgUri(null);
      } else {
        logDebugEvent('WISH MEMORY IMAGE UPLOAD SUCCESS', { path });
        setMemImgPath(path);
        setMemImgUri(signedData.signedUrl);
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Unknown error';
      logDebugEvent('WISH MEMORY IMAGE UPLOAD ERROR', { error: msg });
      setError('Image upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleGrant = async () => {
    if (!wish || !couple?.id || !user) return;
    setSaving(true);
    setError('');
    try {
      const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
      const { data, error: updateErr } = await supabase
        .from('wishes')
        .update({
          status: 'fulfilled',
          fulfilled_at: new Date().toISOString(),
          fulfilled_note: note.trim() || null,
          fulfilled_image_path: memImgPath ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wish.id)
        .select()
        .single();
      if (updateErr) throw updateErr;

      const pts = await getPointValue('wish_fulfilled');
      await awardPoints(couple.id, user.id, pts, 'Wish granted', wish.id);
      if (partnerId) {
        await awardPoints(couple.id, partnerId, pts, 'Wish granted', wish.id);
        notifyPartner({ event_type: 'wish_fulfilled', couple_id: couple.id, target_route: '/(app)/(tabs)/wish', item_id: wish.id, partnerUserId: partnerId });
      }
      await incrementMonthlyCounter(couple.id, user.id, 'wishes_fulfilled', pts);

      // Log wish_completed for both users so both see it in their activity feeds
      supabase.from('activity_events').insert({
        couple_id: couple.id,
        actor_user_id: user.id,
        target_user_id: partnerId ?? user.id,
        event_type: 'wish_completed',
        wish_id: wish.id,
      }).then(() => {}, () => {});

      // Celebration animation
      Animated.spring(celebAnim, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }).start();
      setDone(true);
      setTimeout(() => {
        onFulfilled({ ...data, reactions: wish.reactions });
      }, 1800);
    } catch (err: any) {
      const msg = err?.message ?? 'Unknown error';
      logDebugEvent('WISH GRANT ERROR', { wishId: wish?.id ?? null, error: msg });
      setError('Could not grant this wish. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <Pressable style={[styles.sheetContainer, { backgroundColor: '#0D0D14' }]} onPress={e => e.stopPropagation()}>
          {done ? (
            <Animated.View style={[styles.celebWrap, { transform: [{ scale: Animated.add(0.5, Animated.multiply(celebAnim, 0.5)) }], opacity: celebAnim }]}>
              <AppText style={styles.celebHeart}>❤️</AppText>
              <AppText style={styles.celebTitle}>Wish Granted!</AppText>
              <AppText style={styles.celebSub}>You made it happen.</AppText>
            </Animated.View>
          ) : (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHeaderRow}>
                  <Heart color={WISH_GOLD} size={22} strokeWidth={1.5} />
                  <AppText style={styles.sheetTitle}>Grant this Wish</AppText>
                </View>
                {wish && (
                  <AppText style={styles.sheetWishTitle}>"{wish.title}"</AppText>
                )}

                {error ? <AppText style={styles.sheetError}>{error}</AppText> : null}

                <AppText style={styles.sheetLabel}>Add a memory note</AppText>
                <AppTextInput
                  style={[styles.sheetInput, styles.sheetTextarea]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="How did it happen? How did it feel?"
                  placeholderTextColor="rgba(255,255,255,0.22)"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  maxLength={400}
                />

                <TouchableOpacity onPress={pickMemory} style={styles.sheetImgPicker} activeOpacity={0.8} disabled={uploading}>
                  {uploading ? <ActivityIndicator color={WISH_GOLD} size="small" /> :
                    memImgUri ? (
                      <>
                        <Image source={{ uri: memImgUri }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                        <View style={styles.imgPickerOverlay}><AppText style={styles.imgPickerChange}>Tap to change</AppText></View>
                      </>
                    ) : (
                      <>
                        <ImageIcon color="rgba(255,255,255,0.35)" size={18} strokeWidth={1.5} />
                        <AppText style={styles.sheetImgPickerLabel}>Attach a memory photo</AppText>
                      </>
                    )
                  }
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleGrant}
                  disabled={saving}
                  style={[styles.sheetGrantBtn, saving && { opacity: 0.5 }]}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={['#E8637A', '#F0A96A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sheetGrantGrad}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        <Heart color="#fff" size={16} strokeWidth={2} fill="#fff" />
                        <AppText style={styles.sheetGrantText}>Wish Granted ❤️</AppText>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={styles.sheetCancelBtn} activeOpacity={0.7}>
                  <AppText style={styles.sheetCancelText}>Cancel</AppText>
                </TouchableOpacity>
                <View style={{ height: 32 }} />
              </ScrollView>
            </KeyboardAvoidingView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WishTab() {
  const { user, couple, settings } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isTabletOrLarger, contentPadding } = useLayout();
  const { wish_id: deepLinkWishId } = useLocalSearchParams<{ wish_id?: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>(couple?.user_b_id ? 'shared' : 'mine');
  const [wishes, setWishes] = useState<WishWithReactions[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingWish, setEditingWish] = useState<WishWithReactions | null>(null);
  const [fulfillWish, setFulfillWish] = useState<WishWithReactions | null>(null);
  const [detailWish, setDetailWish] = useState<WishWithReactions | null>(null);
  const tabIndicator = useRef(new Animated.Value(0)).current;
  const handledWishLinkRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastInactiveAtRef = useRef<number | null>(null);

  const TAB_DEFS: { key: TabKey; label: string }[] = [
    { key: 'shared',  label: 'Ours' },
    { key: 'mine',    label: 'Mine' },
    { key: 'theirs',  label: 'Theirs' },
    { key: 'granted', label: 'Granted' },
  ];

  const loadWishes = useCallback(async () => {
    if (!couple?.id) return;
    setLoading(true);
    try {
      const { data: wishData } = await supabase
        .from('wishes')
        .select('*')
        .eq('couple_id', couple.id)
        .neq('status', 'archived')
        .order('created_at', { ascending: false });

      if (!wishData?.length) { setWishes([]); return; }

      const { data: reactions } = await supabase
        .from('wish_reactions')
        .select('*')
        .in('wish_id', wishData.map(w => w.id));

      const reactionMap: Record<string, WishReaction[]> = {};
      (reactions ?? []).forEach(r => {
        if (!reactionMap[r.wish_id]) reactionMap[r.wish_id] = [];
        reactionMap[r.wish_id].push(r);
      });

      // Sign all images in one parallel batch
      const signed = await Promise.all(
        wishData.map(async w => {
          let resolvedImageUri: string | null = null;
          let resolvedMemoryUri: string | null = null;
          if (w.image_storage_path && w.image_storage_bucket) {
            const { data } = await supabase.storage
              .from(w.image_storage_bucket)
              .createSignedUrl(w.image_storage_path, 3600);
            resolvedImageUri = data?.signedUrl ?? null;
          }
          if (w.fulfilled_image_path) {
            const { data } = await supabase.storage
              .from('vault')
              .createSignedUrl(w.fulfilled_image_path, 3600);
            resolvedMemoryUri = data?.signedUrl ?? null;
          }
          return { ...w, reactions: reactionMap[w.id] ?? [], resolvedImageUri, resolvedMemoryUri };
        })
      );

      setWishes(signed);
    } finally {
      setLoading(false);
    }
  }, [couple?.id]);

  // Screenshot detection for Wish tab
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev === 'active' && next === 'inactive') {
        lastInactiveAtRef.current = Date.now();
      }
      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        const elapsed = lastInactiveAtRef.current ? Date.now() - lastInactiveAtRef.current : 999;
        if (elapsed < 400 && couple?.id && user?.id) {
          supabase.auth.getSession().then(({ data }) => {
            const token = data?.session?.access_token;
            if (!token) return;
            fetch(`${SUPABASE_URL}/functions/v1/notify-screenshot`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ couple_id: couple.id, detected_by_user_id: user.id, source_screen: 'wish' }),
            }).catch(() => {});
          });
        }
        lastInactiveAtRef.current = null;
      }
    });
    return () => sub.remove();
  }, [couple?.id, user?.id]);

  useEffect(() => {
    loadWishes();
    const ch = supabase.channel(`wish_tab_${couple.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishes', filter: `couple_id=eq.${couple.id}` }, loadWishes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wish_reactions' }, loadWishes)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id, loadWishes]);

  // Open a specific wish when deep-linked from Home activity feed
  useEffect(() => {
    if (!deepLinkWishId || wishes.length === 0) return;
    if (handledWishLinkRef.current === deepLinkWishId) return;
    const target = wishes.find(w => w.id === deepLinkWishId);
    if (!target) return;
    handledWishLinkRef.current = deepLinkWishId;
    setEditingWish(target);
    setShowForm(true);
  }, [deepLinkWishId, wishes]);

  const handleTabPress = useCallback((key: TabKey, idx: number) => {
    setActiveTab(key);
    Animated.spring(tabIndicator, { toValue: idx, friction: 8, tension: 80, useNativeDriver: false }).start();
  }, [tabIndicator]);

  const handleReact = useCallback(async (wish: WishWithReactions, emoji: string) => {
    if (!user) return;
    const existing = wish.reactions.find(r => r.user_id === user.id);
    if (existing?.emoji === emoji) {
      await supabase.from('wish_reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('wish_reactions').upsert(
        { wish_id: wish.id, user_id: user.id, emoji },
        { onConflict: 'wish_id,user_id' }
      );
    }
    loadWishes();
  }, [user, loadWishes]);

  const handleArchive = useCallback(async (wish: WishWithReactions) => {
    await supabase.from('wishes').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', wish.id);
    setWishes(prev => prev.filter(w => w.id !== wish.id));
  }, []);

  const handleDelete = useCallback(async (wish: WishWithReactions) => {
    await supabase.from('wishes').delete().eq('id', wish.id);
    setWishes(prev => prev.filter(w => w.id !== wish.id));
  }, []);

  const handleFormSave = useCallback((saved: WishWithReactions) => {
    setWishes(prev => {
      const idx = prev.findIndex(w => w.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    setShowForm(false);
    setEditingWish(null);
    if (saved.status === 'shared' && couple?.user_b_id) setActiveTab('shared');
    else setActiveTab('mine');
  }, []);

  const handleFulfilled = useCallback((updated: WishWithReactions) => {
    setWishes(prev => prev.map(w => w.id === updated.id ? updated : w));
    setFulfillWish(null);
    setActiveTab('granted');
  }, []);

  const hasPartner = !!couple?.user_b_id;

  // Filter lists
  // "Mine" shows every wish you created that hasn't been granted — drafts and shared alike.
  const myWishes = wishes.filter(w => w.created_by_user_id === user?.id && w.status !== 'fulfilled');
  const theirWishes = wishes.filter(w => w.created_by_user_id !== user?.id && w.status !== 'fulfilled');
  // "Ours" only makes sense once there's a partner — solo users see all their own wishes under "Mine"
  const sharedWishes = hasPartner ? wishes.filter(w => w.status === 'shared') : [];
  const grantedWishes = wishes.filter(w => w.status === 'fulfilled');

  const displayedWishes = activeTab === 'mine' ? myWishes
    : activeTab === 'theirs' ? theirWishes
    : activeTab === 'shared' ? sharedWishes
    : grantedWishes;

  const tabWidth = 100 / TAB_DEFS.length;

  return (
    <AppShell scrollable={false}>
      <TabHeader title="Wish" />

      {/* Segmented tabs */}
      <View style={[styles.tabBar, { borderColor: colors.borderSubtle, marginHorizontal: contentPadding }]}>
        <View style={styles.tabIndicatorTrack}>
          <Animated.View
            style={[
              styles.tabIndicator,
              {
                width: `${tabWidth}%` as any,
                left: tabIndicator.interpolate({
                  inputRange: [0, 1, 2, 3],
                  outputRange: ['0%', `${tabWidth}%`, `${tabWidth * 2}%`, `${tabWidth * 3}%`],
                }) as any,
              },
            ]}
          />
        </View>
        {TAB_DEFS.map((t, i) => (
          <TouchableOpacity key={t.key} style={styles.tabBtn} onPress={() => handleTabPress(t.key, i)} activeOpacity={0.7}>
            <AppText style={[
              styles.tabBtnLabel,
              activeTab === t.key ? { color: WISH_ACCENT, fontFamily: 'Inter-SemiBold' } : { color: colors.textMuted, fontFamily: 'Inter-Regular' },
            ]}>{t.label}</AppText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading && wishes.length === 0 ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: contentPadding, paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          pointerEvents="none"
        >
          {[0.9, 0.7, 0.8].map((opacity, i) => (
            <View key={i} style={[styles.skeletonCard, { borderColor: colors.borderSubtle, opacity }]}>
              <View style={[styles.skeletonLine, { width: '40%', height: 10, backgroundColor: colors.borderSubtle }]} />
              <View style={[styles.skeletonLine, { width: '75%', height: 14, backgroundColor: colors.borderSubtle }]} />
              <View style={[styles.skeletonLine, { width: '55%', height: 10, backgroundColor: colors.borderSubtle }]} />
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: contentPadding, paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {displayedWishes.length === 0 ? (
            <View style={styles.emptyWrap}>
              <LinearGradient
                colors={['rgba(232,99,122,0.12)', 'rgba(240,169,106,0.06)']}
                style={styles.emptyIconWrap}
              >
                <Sparkles color={WISH_ACCENT} size={32} strokeWidth={1.5} />
              </LinearGradient>
              <AppText style={[styles.emptyTitle, { color: colors.text }]}>
                {activeTab === 'granted' ? 'No granted wishes yet' :
                  activeTab === 'mine' ? 'Start dreaming' :
                  activeTab === 'theirs' ? 'No wishes from your partner yet' :
                  'Your shared wishes will appear here'}
              </AppText>
              <AppText style={[styles.emptySub, { color: colors.textMuted }]}>
                {activeTab === 'granted'
                  ? 'When a wish comes true, it lives here forever ❤️'
                  : activeTab === 'mine'
                  ? 'Tap + to add your first wish'
                  : activeTab === 'theirs'
                  ? "Their wishes will appear here once shared"
                  : 'Share something you desire and invite your partner into your dreams'}
              </AppText>
            </View>
          ) : (
            <View style={isTabletOrLarger ? styles.tabletGrid : undefined}>
              {displayedWishes.map(w =>
                <View key={w.id} style={isTabletOrLarger ? styles.tabletCard : undefined}>
                  {activeTab === 'granted' ? (
                    <GrantedCard wish={w} isMine={w.created_by_user_id === user?.id} onOpenDetail={setDetailWish} />
                  ) : (
                    <WishCard
                      wish={w}
                      isMine={w.created_by_user_id === user?.id}
                      onOpenDetail={setDetailWish}
                    />
                  )}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* FAB */}
      {activeTab !== 'granted' && activeTab !== 'theirs' && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + Spacing.lg }]}
          onPress={() => { setEditingWish(null); setShowForm(true); }}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#E8637A', '#F0A96A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fabGrad}>
            <Plus color="#fff" size={22} strokeWidth={2.5} />
          </LinearGradient>
        </TouchableOpacity>
      )}

      <WishForm
        visible={showForm}
        initial={editingWish}
        onClose={() => { setShowForm(false); setEditingWish(null); }}
        onSave={handleFormSave}
      />
      <FulfillSheet
        visible={!!fulfillWish}
        wish={fulfillWish}
        onClose={() => setFulfillWish(null)}
        onFulfilled={handleFulfilled}
      />
      <WishDetailSheet
        visible={!!detailWish}
        wish={detailWish}
        isMine={detailWish?.created_by_user_id === user?.id}
        userId={user?.id ?? ''}
        isGranted={detailWish?.status === 'fulfilled'}
        onClose={() => setDetailWish(null)}
        onReact={handleReact}
        onFulfill={setFulfillWish}
        onEdit={w => { setEditingWish(w); setShowForm(true); }}
        onArchive={handleArchive}
        onDelete={handleDelete}
      />
    </AppShell>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Tab bar
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, position: 'relative' },
  tabIndicatorTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2 },
  tabIndicator: { position: 'absolute', bottom: 0, height: 2, backgroundColor: WISH_ACCENT, borderRadius: 1 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabBtnLabel: { fontSize: 13, letterSpacing: 0.1 },

  // Skeleton
  skeletonCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 10 },
  skeletonLine: { borderRadius: 6 },
  emptyWrap: { alignItems: 'center', paddingTop: 56, paddingHorizontal: Spacing.xl, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  emptySub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20, marginTop: 4 },

  // Scroll
  scrollContent: { paddingTop: Spacing.md, gap: 4 },
  tabletGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tabletCard: { width: '48.5%' },

  // Wish card
  wishCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  wishCardRow: { flexDirection: 'row', alignItems: 'stretch' },
  wishCardThumbWrap: { width: 100, alignSelf: 'stretch' },
  wishCardBody: { flex: 1, padding: 12, gap: 4, paddingLeft: 12 },
  wishCardBodyNoImg: { paddingLeft: 14 },
  wishCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  categoryBadgeText: { fontSize: 10, fontFamily: 'Inter-Medium', color: WISH_ACCENT, letterSpacing: 0.2 },
  draftBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.18)' },
  draftBadgeText: { fontSize: 10, fontFamily: 'Inter-Medium', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.2 },
  wishAge: { fontSize: 10, fontFamily: 'Inter-Regular' },
  wishSubtitle: { fontSize: 11, fontFamily: 'Inter-Regular', lineHeight: 15 },
  wishTitle: { fontSize: 14, fontFamily: 'Inter-SemiBold', lineHeight: 19 },
  wishDesc: { fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 15 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkText: { fontSize: 11, fontFamily: 'Inter-Regular', flex: 1 },
  reactionSummaryPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  reactionSummaryText: { fontSize: 12, fontFamily: 'Inter-Regular', color: 'rgba(255,255,255,0.55)' },

  // Detail sheet
  detailImage: { width: '100%', aspectRatio: 16 / 10, borderRadius: Radius.md, marginBottom: Spacing.md },
  detailMeta: { fontSize: 12, fontFamily: 'Inter-Regular', marginBottom: 4 },
  detailDesc: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 22, marginTop: Spacing.md, marginBottom: Spacing.md },
  detailGrantedSection: { marginTop: Spacing.md, gap: 8 },
  detailMemImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.md },
  detailFulfilledNote: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', fontStyle: 'italic', lineHeight: 20 },
  detailFulfilledDate: { fontSize: 11, fontFamily: 'Inter-Regular' },
  detailReactionRow: { flexDirection: 'row', gap: 8, marginTop: Spacing.lg, marginBottom: Spacing.md },
  detailReactionBtn: { flex: 1, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, paddingVertical: 8, gap: 2 },
  detailReactionEmoji: { fontSize: 18 },
  detailReactionCount: { fontSize: 10, fontFamily: 'Inter-SemiBold' },
  detailActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.sm },
  detailActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  detailActionLabel: { fontSize: 12, fontFamily: 'Inter-Medium' },

  // Granted card
  grantedCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', padding: Spacing.card, gap: 10 },
  grantedHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grantedHeart: { fontSize: 28 },
  grantedLabel: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 0.8 },
  grantedTitle: { fontSize: FontSize.md, fontFamily: 'Inter-SemiBold', marginTop: 2 },
  grantedEmoji: { fontSize: 22 },
  grantedMemImg: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.md },
  grantedNote: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', fontStyle: 'italic', lineHeight: 20 },
  grantedDate: { fontSize: 11, fontFamily: 'Inter-Regular' },

  // FAB
  fab: { position: 'absolute', right: Spacing.xl, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', elevation: 8, shadowColor: '#E8637A', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  fabGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Form (WishForm modal)
  formRoot: { flex: 1 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.screen, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  formCloseBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  formTitle: { color: '#fff', fontSize: FontSize.md, fontFamily: 'Inter-SemiBold' },
  formScroll: { paddingHorizontal: Spacing.screen, paddingTop: Spacing.sm },
  formIconWrap: { alignItems: 'center', gap: 10, marginBottom: Spacing.lg },
  formIconBg: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  formSubtitle: { color: 'rgba(255,255,255,0.55)', fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center' },
  formErrorBanner: { backgroundColor: 'rgba(255,90,95,0.10)', borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  formErrorText: { color: '#FF5A5F', fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center' },
  formLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: 'Inter-SemiBold', letterSpacing: 0.8, marginBottom: 6 },
  formInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: Spacing.md, paddingVertical: 12, color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  formTextarea: { minHeight: 90, paddingTop: 12 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 6 },
  categoryPillEmoji: { fontSize: 13 },
  categoryPillLabel: { fontSize: 12, fontFamily: 'Inter-Medium' },
  imgPicker: { height: 120, borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)' },
  imgPickerLabel: { color: 'rgba(255,255,255,0.35)', fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  imgPickerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' } as any,
  imgPickerChange: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  imgRemoveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 5, marginTop: 4 },
  imgRemoveText: { color: '#FF5A5F', fontSize: 12, fontFamily: 'Inter-Regular' },
  formCTA: { borderRadius: Radius.pill, overflow: 'hidden', marginTop: Spacing.md },
  formCTAGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54 },
  formCTAText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-Bold', letterSpacing: 0.2 },
  formDraftBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  formDraftText: { color: 'rgba(255,255,255,0.45)', fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },

  // Fulfill sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'flex-end' },
  sheetContainer: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.screen, paddingBottom: 8 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  sheetTitle: { color: '#fff', fontSize: FontSize.lg, fontFamily: 'Inter-SemiBold' },
  sheetWishTitle: { color: 'rgba(255,255,255,0.55)', fontSize: FontSize.sm, fontFamily: 'Inter-Regular', fontStyle: 'italic', marginBottom: Spacing.md, lineHeight: 20 },
  sheetError: { color: '#FF5A5F', fontSize: FontSize.sm, fontFamily: 'Inter-Regular', marginBottom: 8 },
  sheetLabel: { color: 'rgba(255,255,255,0.50)', fontSize: 12, fontFamily: 'Inter-SemiBold', letterSpacing: 0.8, marginBottom: 6 },
  sheetInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: Spacing.md, paddingVertical: 12, color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  sheetTextarea: { minHeight: 80, paddingTop: 12, marginBottom: Spacing.md, textAlignVertical: 'top' },
  sheetImgPicker: { height: 80, borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: Spacing.md },
  sheetImgPickerLabel: { color: 'rgba(255,255,255,0.35)', fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  sheetGrantBtn: { borderRadius: Radius.pill, overflow: 'hidden', marginBottom: 10 },
  sheetGrantGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54 },
  sheetGrantText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-Bold' },
  sheetCancelBtn: { alignItems: 'center', paddingVertical: 12 },
  sheetCancelText: { color: 'rgba(255,255,255,0.40)', fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },

  // Celebration
  celebWrap: { alignItems: 'center', gap: 12, paddingVertical: 60, paddingHorizontal: Spacing.xl },
  celebHeart: { fontSize: 64 },
  celebTitle: { color: '#fff', fontSize: FontSize.xxl, fontFamily: 'Inter-Bold' },
  celebSub: { color: 'rgba(255,255,255,0.55)', fontSize: FontSize.md, fontFamily: 'Inter-Regular' },
});
