import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Animated, Modal,
  Pressable, Linking, ActivityIndicator,
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
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { awardPoints, getPointValue, incrementMonthlyCounter } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { logDebugEvent } from '@/lib/debugLog';
import { Wish, WishReaction, WishCategory } from '@/lib/types';
import AppShell from '@/components/AppShell';
import TabHeader from '@/components/TabHeader';
import { FontSize, Spacing, Radius, Gradient as GradientColors } from '@/constants/theme';

// ─── constants ────────────────────────────────────────────────────────────────

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

const REACTIONS = ['❤️', '🔥', '✨', '💫', '😍'];

type TabKey = 'mine' | 'shared' | 'theirs' | 'granted';

interface WishWithReactions extends Wish {
  reactions: WishReaction[];
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
  wish, isMine, userId, onReact, onFulfill, onEdit, onArchive, onDelete,
}: {
  wish: WishWithReactions;
  isMine: boolean;
  userId: string;
  onReact: (wish: WishWithReactions, emoji: string) => void;
  onFulfill: (wish: WishWithReactions) => void;
  onEdit: (wish: WishWithReactions) => void;
  onArchive: (wish: WishWithReactions) => void;
  onDelete: (wish: WishWithReactions) => void;
}) {
  const { colors } = useTheme();
  const [showActions, setShowActions] = useState(false);
  const [imgUri, setImgUri] = useState<string | null>(null);
  const myReaction = wish.reactions.find(r => r.user_id === userId)?.emoji ?? null;

  useEffect(() => {
    if (!wish.image_storage_path || !wish.image_storage_bucket) return;
    supabase.storage
      .from(wish.image_storage_bucket)
      .createSignedUrl(wish.image_storage_path, 3600)
      .then(({ data, error }) => {
        if (error) {
          logDebugEvent('WISH IMAGE SIGN ERROR', { path: wish.image_storage_path, error: error.message });
          return;
        }
        if (data?.signedUrl) setImgUri(data.signedUrl);
      });
  }, [wish.image_storage_path, wish.image_storage_bucket]);

  const reactionCounts: Record<string, number> = {};
  wish.reactions.forEach(r => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] ?? 0) + 1; });

  return (
    <View style={[styles.wishCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
      {imgUri ? (
        <Image source={{ uri: imgUri }} style={styles.wishCardImg} resizeMode="cover" />
      ) : null}

      <View style={styles.wishCardBody}>
        <View style={styles.wishCardTop}>
          <View style={styles.wishCardMeta}>
            {wish.category ? (
              <View style={[styles.categoryBadge, { backgroundColor: 'rgba(232,99,122,0.12)', borderColor: 'rgba(232,99,122,0.28)' }]}>
                <AppText style={styles.categoryBadgeText}>
                  {getCategoryEmoji(wish.category)}  {wish.category}
                </AppText>
              </View>
            ) : null}
            <AppText style={[styles.wishAge, { color: colors.textMuted }]}>{timeAgo(wish.created_at)}</AppText>
          </View>
          <TouchableOpacity onPress={() => setShowActions(v => !v)} style={styles.moreBtn} activeOpacity={0.7}>
            <View style={styles.dotRow}>
              {[0,1,2].map(i => <View key={i} style={[styles.dot, { backgroundColor: colors.textMuted }]} />)}
            </View>
          </TouchableOpacity>
        </View>

        <AppText style={[styles.wishTitle, { color: colors.text }]}>{wish.title}</AppText>
        {wish.description ? (
          <AppText style={[styles.wishDesc, { color: colors.textSecondary }]} numberOfLines={3}>{wish.description}</AppText>
        ) : null}
        {wish.link ? (
          <TouchableOpacity onPress={() => wish.link && Linking.openURL(wish.link)} activeOpacity={0.7} style={styles.linkRow}>
            <ExternalLink color={WISH_ACCENT} size={12} strokeWidth={2} />
            <AppText style={[styles.linkText, { color: WISH_ACCENT }]} numberOfLines={1}>{wish.link}</AppText>
          </TouchableOpacity>
        ) : null}

        {/* Reaction bar */}
        <View style={styles.reactionBar}>
          {REACTIONS.map(emoji => {
            const count = reactionCounts[emoji] ?? 0;
            const mine = myReaction === emoji;
            return (
              <TouchableOpacity
                key={emoji}
                onPress={() => onReact(wish, emoji)}
                style={[styles.reactionBtn, mine && { backgroundColor: 'rgba(232,99,122,0.15)', borderColor: 'rgba(232,99,122,0.40)' }, !mine && { borderColor: colors.borderSubtle }]}
                activeOpacity={0.7}
              >
                <AppText style={styles.reactionEmoji}>{emoji}</AppText>
                {count > 0 && <AppText style={[styles.reactionCount, { color: mine ? WISH_ACCENT : colors.textMuted }]}>{count}</AppText>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Actions dropdown */}
        {showActions && (
          <View style={[styles.actionsMenu, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            {!isMine && wish.status === 'shared' && (
              <TouchableOpacity onPress={() => { setShowActions(false); onFulfill(wish); }} style={styles.actionItem} activeOpacity={0.8}>
                <Heart color={WISH_GOLD} size={15} strokeWidth={2} />
                <AppText style={[styles.actionLabel, { color: WISH_GOLD }]}>Grant this Wish</AppText>
              </TouchableOpacity>
            )}
            {isMine && wish.status === 'shared' && (
              <TouchableOpacity onPress={() => { setShowActions(false); onFulfill(wish); }} style={styles.actionItem} activeOpacity={0.8}>
                <Heart color={WISH_GOLD} size={15} strokeWidth={2} />
                <AppText style={[styles.actionLabel, { color: WISH_GOLD }]}>Mark as Granted</AppText>
              </TouchableOpacity>
            )}
            {isMine && (
              <TouchableOpacity onPress={() => { setShowActions(false); onEdit(wish); }} style={styles.actionItem} activeOpacity={0.8}>
                <Pencil color={colors.textSecondary} size={15} strokeWidth={2} />
                <AppText style={[styles.actionLabel, { color: colors.textSecondary }]}>Edit</AppText>
              </TouchableOpacity>
            )}
            {isMine && wish.status !== 'archived' && (
              <TouchableOpacity onPress={() => { setShowActions(false); onArchive(wish); }} style={styles.actionItem} activeOpacity={0.8}>
                <X color={colors.textMuted} size={15} strokeWidth={2} />
                <AppText style={[styles.actionLabel, { color: colors.textMuted }]}>Archive</AppText>
              </TouchableOpacity>
            )}
            {isMine && (
              <TouchableOpacity onPress={() => { setShowActions(false); onDelete(wish); }} style={styles.actionItem} activeOpacity={0.8}>
                <Trash2 color="#FF5A5F" size={15} strokeWidth={2} />
                <AppText style={[styles.actionLabel, { color: '#FF5A5F' }]}>Delete</AppText>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── GrantedCard ──────────────────────────────────────────────────────────────

function GrantedCard({ wish, isMine }: { wish: WishWithReactions; isMine: boolean }) {
  const { colors } = useTheme();
  const [imgUri, setImgUri] = useState<string | null>(null);
  const [memImgUri, setMemImgUri] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (wish.image_storage_path && wish.image_storage_bucket) {
      supabase.storage.from(wish.image_storage_bucket).createSignedUrl(wish.image_storage_path, 3600)
        .then(({ data, error }) => {
          if (error) {
            logDebugEvent('WISH IMAGE SIGN ERROR', { path: wish.image_storage_path, error: error.message });
            return;
          }
          if (data?.signedUrl) setImgUri(data.signedUrl);
        });
    }
    if (wish.fulfilled_image_path) {
      supabase.storage.from('vault').createSignedUrl(wish.fulfilled_image_path, 3600)
        .then(({ data, error }) => {
          if (error) {
            logDebugEvent('WISH MEMORY IMAGE SIGN ERROR', { path: wish.fulfilled_image_path, error: error.message });
            return;
          }
          if (data?.signedUrl) setMemImgUri(data.signedUrl);
        });
    }
  }, [wish]);

  return (
    <View style={[styles.grantedCard, { backgroundColor: colors.card, borderColor: 'rgba(240,169,106,0.30)' }]}>
      <View style={styles.grantedHeader}>
        <Animated.Text style={[styles.grantedHeart, { transform: [{ scale: pulseAnim }] }]}>❤️</Animated.Text>
        <View style={{ flex: 1 }}>
          <AppText style={[styles.grantedLabel, { color: WISH_GOLD }]}>Wish Granted</AppText>
          <AppText style={[styles.grantedTitle, { color: colors.text }]}>{wish.title}</AppText>
        </View>
        {wish.category ? (
          <AppText style={styles.grantedEmoji}>{getCategoryEmoji(wish.category)}</AppText>
        ) : null}
      </View>
      {memImgUri && (
        <Image source={{ uri: memImgUri }} style={styles.grantedMemImg} resizeMode="cover" />
      )}
      {wish.fulfilled_note ? (
        <AppText style={[styles.grantedNote, { color: colors.textSecondary }]}>"{wish.fulfilled_note}"</AppText>
      ) : null}
      <AppText style={[styles.grantedDate, { color: colors.textMuted }]}>
        {isMine ? 'Your wish' : "Partner's wish"} · {wish.fulfilled_at ? timeAgo(wish.fulfilled_at) : ''}
      </AppText>
    </View>
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
    if (!couple?.id || !user) return;
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('Photo library permission is required to add an image.');
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

      const mime = asset.mimeType ?? 'image/jpeg';
      logDebugEvent('WISH IMAGE PICK', {
        localUri: asset.uri,
        mimeType: mime,
        fileSize: asset.fileSize ?? null,
      });
      logDebugEvent('WISH LAST IMAGE PICK', { at: new Date().toISOString(), mime });

      setUploading(true);
      setError('');

      const storagePath = `${couple.id}/${user.id}/wish_${Date.now()}.jpg`;
      logDebugEvent('WISH IMAGE UPLOAD START', { storagePath });
      logDebugEvent('WISH LAST UPLOAD PATH', { path: storagePath });

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('vault')
        .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: false });

      if (uploadError) {
        logDebugEvent('WISH IMAGE UPLOAD ERROR', {
          storagePath,
          error: uploadError.message,
          statusCode: (uploadError as any).statusCode ?? null,
        });
        logDebugEvent('WISH LAST UPLOAD ERROR', { error: uploadError.message });
        throw uploadError;
      }

      // Generate a signed URL immediately so the preview survives a restart
      const { data: signedData, error: signError } = await supabase.storage
        .from('vault')
        .createSignedUrl(storagePath, 3600);

      if (signError || !signedData?.signedUrl) {
        logDebugEvent('WISH IMAGE SIGN ERROR', { storagePath, error: signError?.message ?? 'no signedUrl' });
        // Still persist the path — the card will re-sign on load
        setImgPath(storagePath);
        setImgUri(null);
      } else {
        logDebugEvent('WISH IMAGE UPLOAD SUCCESS', { storagePath, signedUrl: signedData.signedUrl.slice(0, 60) });
        logDebugEvent('WISH LAST UPLOAD ERROR', { error: null });
        setImgPath(storagePath);
        setImgUri(signedData.signedUrl);
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Unknown error';
      logDebugEvent('WISH IMAGE UPLOAD ERROR', { error: msg });
      logDebugEvent('WISH LAST UPLOAD ERROR', { error: msg });
      setError('Image upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
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
        image_storage_bucket: imgPath ? 'vault' : null,
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
      } else {
        const { data, error: insertError } = await supabase
          .from('wishes').insert(payload).select().single();
        if (insertError) throw insertError;
        result = data;
        logDebugEvent('WISH SAVE SUCCESS', { wishId: result.id, hasImage: !!imgPath, status: payload.status });
        logDebugEvent('WISH LAST CREATED ID', { id: result.id });
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
      onSave({ ...result, reactions: initial?.reactions ?? [] });
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
            <TouchableOpacity onPress={pickImage} style={styles.imgPicker} activeOpacity={0.75} disabled={uploading}>
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
        setError('Photo library permission is required to add a memory photo.');
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

      const resp = await fetch(asset.uri);
      const blob = await resp.blob();
      const { error: upErr } = await supabase.storage.from('vault').upload(path, blob, { contentType: 'image/jpeg' });
      if (upErr) {
        logDebugEvent('WISH MEMORY IMAGE UPLOAD ERROR', { path, error: upErr.message });
        throw upErr;
      }

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
  const { user, couple } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>(couple?.user_b_id ? 'shared' : 'mine');
  const [wishes, setWishes] = useState<WishWithReactions[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingWish, setEditingWish] = useState<WishWithReactions | null>(null);
  const [fulfillWish, setFulfillWish] = useState<WishWithReactions | null>(null);
  const tabIndicator = useRef(new Animated.Value(0)).current;

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

      setWishes(wishData.map(w => ({ ...w, reactions: reactionMap[w.id] ?? [] })));
    } finally {
      setLoading(false);
    }
  }, [couple?.id]);

  useEffect(() => {
    if (!couple?.id) { setLoading(false); return; }
    loadWishes();
    const ch = supabase.channel(`wish_tab_${couple.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishes', filter: `couple_id=eq.${couple.id}` }, loadWishes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wish_reactions' }, loadWishes)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id, loadWishes]);

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
  // Solo users: "Mine" shows all their non-fulfilled wishes (including status='shared')
  // Paired users: "Mine" shows only drafts; shared wishes go to "Ours"
  const myWishes = hasPartner
    ? wishes.filter(w => w.created_by_user_id === user?.id && w.status === 'draft')
    : wishes.filter(w => w.created_by_user_id === user?.id && w.status !== 'fulfilled');
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
      <View style={[styles.tabBar, { borderColor: colors.borderSubtle }]}>
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
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
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
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
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
            displayedWishes.map(w =>
              activeTab === 'granted' ? (
                <GrantedCard key={w.id} wish={w} isMine={w.created_by_user_id === user?.id} />
              ) : (
                <WishCard
                  key={w.id}
                  wish={w}
                  isMine={w.created_by_user_id === user?.id}
                  userId={user?.id ?? ''}
                  onReact={handleReact}
                  onFulfill={setFulfillWish}
                  onEdit={w => { setEditingWish(w); setShowForm(true); }}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                />
              )
            )
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
    </AppShell>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Tab bar
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, marginHorizontal: Spacing.screen, position: 'relative' },
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
  scrollContent: { paddingHorizontal: Spacing.screen, paddingTop: Spacing.md, gap: 6 },

  // Wish card
  wishCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  wishCardImg: { width: '100%', height: 100 },
  wishCardBody: { padding: Spacing.sm, gap: 4 },
  wishCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  wishCardMeta: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  categoryBadgeText: { fontSize: 11, fontFamily: 'Inter-Medium', color: WISH_ACCENT, letterSpacing: 0.2 },
  wishAge: { fontSize: 11, fontFamily: 'Inter-Regular' },
  moreBtn: { padding: 4, marginLeft: 4 },
  dotRow: { flexDirection: 'row', gap: 3 },
  dot: { width: 3.5, height: 3.5, borderRadius: 2 },
  wishTitle: { fontSize: 14, fontFamily: 'Inter-SemiBold', lineHeight: 20 },
  wishDesc: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 16 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  linkText: { fontSize: 12, fontFamily: 'Inter-Regular', flex: 1 },

  // Reactions
  reactionBar: { flexDirection: 'row', gap: 4, marginTop: 2, flexWrap: 'wrap' },
  reactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2 },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 11, fontFamily: 'Inter-SemiBold' },

  // Actions menu
  actionsMenu: { borderRadius: Radius.md, borderWidth: 1, marginTop: 4, overflow: 'hidden' },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  actionLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },

  // Granted card
  grantedCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', padding: Spacing.card, gap: 10 },
  grantedHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grantedHeart: { fontSize: 28 },
  grantedLabel: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 0.8 },
  grantedTitle: { fontSize: FontSize.md, fontFamily: 'Inter-SemiBold', marginTop: 2 },
  grantedEmoji: { fontSize: 22 },
  grantedMemImg: { width: '100%', height: 160, borderRadius: Radius.md },
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
