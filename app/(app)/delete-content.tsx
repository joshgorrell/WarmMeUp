import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MessageSquare, Dice6, Swords, Star, Image as ImageIcon, Bell, Trophy, Flame, Check, TriangleAlert as AlertTriangle } from 'lucide-react-native';
import AppText from '@/components/AppText';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { clearLocalImageCache } from '@/lib/mediaCache';

// ─── Types ────────────────────────────────────────────────────────

type CategoryKey = 'chat' | 'dice' | 'dare' | 'wish' | 'vault' | 'activity' | 'points';

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  chat: 'Chat Messages',
  dice: 'Dice History',
  dare: 'Dare History',
  wish: 'Wish Items',
  vault: 'Vault Photos & Videos',
  activity: 'Activity Feed',
  points: 'Points',
};

async function notifyPartnerOfDeletion(
  coupleId: string,
  actorUserId: string,
  partnerUserId: string,
  categories: string[],
) {
  await supabase.from('activity_events').insert({
    couple_id: coupleId,
    actor_user_id: actorUserId,
    target_user_id: partnerUserId,
    event_type: 'content_deleted',
    metadata: { categories },
  });
}

interface Category {
  key: CategoryKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
}

interface Counts {
  chat: number;
  dice: number;
  dare: number;
  wish: number;
  vault: number;
  activity: number;
  points: number;
}

// ─── Storage folder deletion helper ──────────────────────────────

async function deleteStorageFolder(bucket: string, coupleId: string) {
  const PAGE = 100;

  async function deleteAllInPath(prefix: string) {
    let offset = 0;
    while (true) {
      const { data: entries, error } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: PAGE, offset });
      if (error || !entries?.length) break;

      // Separate files from sub-folders.  Supabase returns id === null for
      // folders and a non-null id for actual file objects.
      const files = entries.filter(e => e.id != null);
      const folders = entries.filter(e => e.id == null);

      if (files.length) {
        const paths = files.map(f => `${prefix}/${f.name}`);
        await supabase.storage.from(bucket).remove(paths);
      }

      // Recurse into sub-folders so deeply nested files are also cleared.
      for (const folder of folders) {
        await deleteAllInPath(`${prefix}/${folder.name}`);
      }

      // Do NOT advance offset after deleting — deletion shifts remaining
      // entries down, so always re-list from 0 until fewer than PAGE remain.
      if (entries.length < PAGE) break;
      // If everything we listed was a folder (no files deleted), advance to
      // avoid an infinite loop on folders we can't delete via the API.
      if (files.length === 0) offset += PAGE;
    }
  }

  try {
    await deleteAllInPath(coupleId);
  } catch {}
}

// ─── Individual deletion functions ───────────────────────────────

async function deleteChatHistory(coupleId: string) {
  await supabase.from('chat_messages').delete().eq('couple_id', coupleId);
  await supabase.from('media_reactions').delete().eq('couple_id', coupleId);
  await deleteStorageFolder('chat_media', coupleId);
}

async function deleteDiceHistory(coupleId: string) {
  await supabase.from('interactions').delete().eq('couple_id', coupleId).eq('type', 'dice');
}

async function deleteDareHistory(coupleId: string) {
  await supabase.from('interactions').delete().eq('couple_id', coupleId).in('type', ['dare', 'tell_me']);
}

async function deleteWishHistory(coupleId: string) {
  await supabase.from('wishes').delete().eq('couple_id', coupleId);
  await supabase.from('interactions').delete().eq('couple_id', coupleId).eq('type', 'wish');
}

async function deleteVaultHistory(coupleId: string) {
  await supabase.from('vault_items').delete().eq('couple_id', coupleId);
  await deleteStorageFolder('vault', coupleId);
}

async function deleteActivityHistory(coupleId: string) {
  await supabase.from('activity_events').delete().eq('couple_id', coupleId);
  await supabase.from('activity_views').delete().eq('couple_id', coupleId);
}

async function deletePoints(coupleId: string) {
  await supabase.from('cash_in_events').delete().eq('couple_id', coupleId);
  await supabase.from('point_events').delete().eq('couple_id', coupleId);
  await supabase.from('monthly_scores').delete().eq('couple_id', coupleId);
  await supabase.from('scores').update({ points: 0 }).eq('couple_id', coupleId);
}

async function burnItAll(coupleId: string) {
  await supabase.from('chat_messages').delete().eq('couple_id', coupleId);
  await supabase.from('media_reactions').delete().eq('couple_id', coupleId);
  await supabase.from('interactions').delete().eq('couple_id', coupleId);
  await supabase.from('wishes').delete().eq('couple_id', coupleId);
  await supabase.from('vault_items').delete().eq('couple_id', coupleId);
  await supabase.from('activity_events').delete().eq('couple_id', coupleId);
  await supabase.from('activity_views').delete().eq('couple_id', coupleId);
  await supabase.from('cash_in_events').delete().eq('couple_id', coupleId);
  await supabase.from('point_events').delete().eq('couple_id', coupleId);
  await supabase.from('monthly_scores').delete().eq('couple_id', coupleId);
  await supabase.from('scores').update({ points: 0 }).eq('couple_id', coupleId);
  await deleteStorageFolder('chat_media', coupleId);
  await deleteStorageFolder('vault', coupleId);
}

// ─── Main screen ─────────────────────────────────────────────────

export default function DeleteContentScreen() {
  const router = useRouter();
  const { couple, user, partnerProfile } = useAuth();
  const { colors } = useTheme();

  const [selected, setSelected] = useState<Set<CategoryKey>>(new Set());
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(true);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDone, setDeleteDone] = useState(false);

  const [burnOpen, setBurnOpen] = useState(false);
  const [burnInput, setBurnInput] = useState('');
  const [burning, setBurning] = useState(false);
  const [burnDone, setBurnDone] = useState(false);

  const CATEGORIES: Category[] = [
    {
      key: 'chat',
      label: 'Chat Messages',
      description: 'Delete all chat conversations and message history.',
      icon: <MessageSquare color="#69A7FF" size={18} strokeWidth={2} />,
      accentColor: '#69A7FF',
    },
    {
      key: 'dice',
      label: 'Dice History',
      description: 'Delete all dice rolls and dice activity.',
      icon: <Dice6 color="#FFB347" size={18} strokeWidth={2} />,
      accentColor: '#FFB347',
    },
    {
      key: 'dare',
      label: 'Dare History',
      description: 'Delete all dare activity and dare completions.',
      icon: <Swords color="#FF5A3D" size={18} strokeWidth={2} />,
      accentColor: '#FF5A3D',
    },
    {
      key: 'wish',
      label: 'Wish Items',
      description: 'Delete all wishes and wish history.',
      icon: <Star color="#FF2E8A" size={18} strokeWidth={2} />,
      accentColor: '#FF2E8A',
    },
    {
      key: 'vault',
      label: 'Vault Photos & Videos',
      description: 'Delete all uploaded photos and videos.',
      icon: <ImageIcon color="#33D17A" size={18} strokeWidth={2} />,
      accentColor: '#33D17A',
    },
    {
      key: 'activity',
      label: 'Activity Feed & Notifications',
      description: 'Delete all activity feed records, recent activity cards, and related events.',
      icon: <Bell color="#C77DFF" size={18} strokeWidth={2} />,
      accentColor: '#C77DFF',
    },
    {
      key: 'points',
      label: 'Points',
      description: 'Reset points, scores, and game progress. Your Weekly Streak is not affected.',
      icon: <Trophy color="#FFD700" size={18} strokeWidth={2} />,
      accentColor: '#FFD700',
    },
  ];

  const loadCounts = useCallback(async () => {
    if (!couple?.id) return;
    setLoadingCounts(true);
    try {
      const [chat, dice, dare, wish, vault, activity] = await Promise.all([
        supabase.from('chat_messages').select('id', { count: 'exact', head: true }).eq('couple_id', couple.id),
        supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('couple_id', couple.id).eq('type', 'dice'),
        supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('couple_id', couple.id).in('type', ['dare', 'tell_me']),
        supabase.from('wishes').select('id', { count: 'exact', head: true }).eq('couple_id', couple.id),
        supabase.from('vault_items').select('id', { count: 'exact', head: true }).eq('couple_id', couple.id),
        supabase.from('activity_events').select('id', { count: 'exact', head: true }).eq('couple_id', couple.id),
      ]);
      setCounts({
        chat: chat.count ?? 0,
        dice: dice.count ?? 0,
        dare: dare.count ?? 0,
        wish: wish.count ?? 0,
        vault: vault.count ?? 0,
        activity: activity.count ?? 0,
        points: 0,
      });
    } finally {
      setLoadingCounts(false);
    }
  }, [couple?.id]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const toggle = (key: CategoryKey) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const successScale = useRef(new Animated.Value(0)).current;

  const animateSuccess = useCallback(() => {
    successScale.setValue(0);
    Animated.spring(successScale, {
      toValue: 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [successScale]);

  const redirectHome = useCallback(() => {
    setTimeout(() => {
      try { router.dismissAll(); } catch {}
      router.replace('/(app)/(tabs)');
    }, 1500);
  }, [router]);

  const handleDeleteSelected = async () => {
    if (!couple?.id || selected.size === 0) return;
    setDeleting(true);
    try {
      if (selected.has('chat')) await deleteChatHistory(couple.id);
      if (selected.has('dice')) await deleteDiceHistory(couple.id);
      if (selected.has('dare')) await deleteDareHistory(couple.id);
      if (selected.has('wish')) await deleteWishHistory(couple.id);
      if (selected.has('vault')) await deleteVaultHistory(couple.id);
      if (selected.has('activity')) await deleteActivityHistory(couple.id);
      if (selected.has('points')) await deletePoints(couple.id);
      // If any media-bearing category was deleted, purge local image cache so
      // previously-viewed photos can't be recovered from the device.
      if (selected.has('chat') || selected.has('vault')) {
        await clearLocalImageCache();
      }
      if (user?.id && partnerProfile?.id) {
        await notifyPartnerOfDeletion(couple.id, user.id, partnerProfile.id, [...selected]);
      }
      setSelected(new Set());
      setDeleteDone(true);
      animateSuccess();
      redirectHome();
      await loadCounts();
    } finally {
      setDeleting(false);
    }
  };

  const handleBurnItAll = async () => {
    if (!couple?.id) return;
    setBurning(true);
    try {
      await burnItAll(couple.id);
      await clearLocalImageCache();
      if (user?.id && partnerProfile?.id) {
        await notifyPartnerOfDeletion(couple.id, user.id, partnerProfile.id, ['all']);
      }
      setBurnDone(true);
      animateSuccess();
      redirectHome();
      setCounts({ chat: 0, dice: 0, dare: 0, wish: 0, vault: 0, activity: 0, points: 0 });
      setSelected(new Set());
    } finally {
      setBurning(false);
    }
  };

  const countLabel = (key: CategoryKey): string => {
    if (!counts) return '–';
    if (key === 'points') return 'Score data';
    const n = counts[key];
    return n === 1 ? '1 item' : `${n} items`;
  };

  return (
    <AppShell scrollable={false} noTopPadding constrainContent>
      <ScreenHeader title="Delete & Reset" onBack={() => router.back()} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <AppText style={[styles.subtitle, { color: colors.textSecondary }]}>
          Choose exactly what you want to permanently remove or reset. Changes apply to both partners.
        </AppText>

        {/* ── Category checkboxes ── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
          {CATEGORIES.map((cat, idx) => {
            const isSelected = selected.has(cat.key);
            const isLast = idx === CATEGORIES.length - 1;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.categoryRow,
                  !isLast && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
                  isSelected && { backgroundColor: 'rgba(255,255,255,0.02)' },
                ]}
                onPress={() => toggle(cat.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.catIcon, { backgroundColor: `${cat.accentColor}18` }]}>
                  {cat.icon}
                </View>
                <View style={styles.catText}>
                  <AppText style={[styles.catLabel, { color: colors.text }]}>{cat.label}</AppText>
                  <AppText style={[styles.catDesc, { color: colors.textMuted }]}>{cat.description}</AppText>
                  {counts !== null && (
                    <AppText style={[styles.catCount, { color: cat.accentColor }]}>
                      {countLabel(cat.key)}
                    </AppText>
                  )}
                </View>
                <View style={[
                  styles.checkbox,
                  {
                    borderColor: isSelected ? cat.accentColor : colors.borderSubtle,
                    backgroundColor: isSelected ? `${cat.accentColor}22` : 'transparent',
                  },
                ]}>
                  {isSelected && <Check color={cat.accentColor} size={14} strokeWidth={2.5} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Delete Selected button ── */}
        <TouchableOpacity
          style={[
            styles.deleteBtn,
            selected.size === 0 && styles.deleteBtnDisabled,
          ]}
          onPress={() => setConfirmOpen(true)}
          disabled={selected.size === 0}
          activeOpacity={0.8}
        >
          <AppText style={[styles.deleteBtnText, selected.size === 0 && { opacity: 0.4 }]}>
            Delete Selected Content
            {selected.size > 0 ? ` (${selected.size})` : ''}
          </AppText>
        </TouchableOpacity>

        {/* ── Burn It All section ── */}
        <View style={[styles.burnCard, { borderColor: 'rgba(255,59,48,0.3)', backgroundColor: 'rgba(255,59,48,0.05)' }]}>
          <View style={styles.burnHeader}>
            <Flame color="#FF3B30" size={22} strokeWidth={2} />
            <AppText style={[styles.burnTitle, { color: '#FF3B30' }]}>Burn It All</AppText>
          </View>
          <AppText style={[styles.burnDesc, { color: colors.textSecondary }]}>
            Permanently removes ALL relationship content and resets game data for both partners. Your Weekly Streak history is preserved.
          </AppText>
          <View style={[styles.burnList, { borderColor: 'rgba(255,59,48,0.15)' }]}>
            {[
              'Chat Messages', 'Dice History', 'Dare History', 'Wish Items',
              'Vault Photos & Videos', 'Activity Feed', 'Points',
              'Relationship Statistics',
            ].map(item => (
              <View key={item} style={styles.burnListRow}>
                <View style={styles.burnDot} />
                <AppText style={[styles.burnListItem, { color: colors.textSecondary }]}>{item}</AppText>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.burnBtn}
            onPress={() => { setBurnInput(''); setBurnOpen(true); }}
            activeOpacity={0.8}
          >
            <Flame color="#fff" size={16} strokeWidth={2} />
            <AppText style={styles.burnBtnText}>Burn It All</AppText>
          </TouchableOpacity>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ── Delete Selected confirmation modal ── */}
      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!deleting) { setConfirmOpen(false); setDeleteDone(false); } }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { borderColor: 'rgba(255,59,48,0.18)' }]}>
            {!deleteDone ? (
              <>
                <View style={[styles.modalIcon, { backgroundColor: 'rgba(255,59,48,0.10)' }]}>
                  <AlertTriangle color="#FF3B30" size={28} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.modalTitle, { color: colors.text }]}>Delete Selected Content?</AppText>
                <AppText style={[styles.modalBody, { color: colors.textSecondary }]}>
                  This action cannot be undone.{'\n'}Only the selected content categories will be removed.
                </AppText>
                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={[styles.modalCancelBtn, { borderColor: colors.borderSubtle }]}
                    onPress={() => { Keyboard.dismiss(); setConfirmOpen(false); }}
                    disabled={deleting}
                    activeOpacity={0.7}
                  >
                    <AppText style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => { Keyboard.dismiss(); handleDeleteSelected(); }}
                    disabled={deleting}
                    activeOpacity={0.8}
                  >
                    {deleting
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <AppText style={styles.modalDeleteText}>Delete</AppText>
                    }
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Animated.View style={[styles.modalIcon, { backgroundColor: 'rgba(51,209,122,0.12)', transform: [{ scale: successScale }] }]}>
                  <Check color="#33D17A" size={28} strokeWidth={2} />
                </Animated.View>
                <AppText style={[styles.modalTitle, { color: colors.text }]}>Done</AppText>
                <AppText style={[styles.modalBody, { color: colors.textSecondary }]}>
                  Selected content has been permanently deleted.{'\n'}Taking you home...
                </AppText>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Burn It All confirmation modal ── */}
      <Modal
        visible={burnOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!burning) { setBurnOpen(false); setBurnDone(false); setBurnInput(''); } }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { borderColor: 'rgba(255,59,48,0.30)' }]}>
            {!burnDone ? (
              <>
                <View style={[styles.modalIcon, { backgroundColor: 'rgba(255,59,48,0.12)' }]}>
                  <Flame color="#FF3B30" size={28} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.modalTitle, { color: '#FF3B30' }]}>Burn It All?</AppText>
                <AppText style={[styles.modalBody, { color: colors.textSecondary }]}>
                  This will permanently delete ALL relationship content for both partners. Your Weekly Streak history is preserved. This cannot be undone.
                </AppText>
                <AppText style={[styles.burnPrompt, { color: colors.textMuted }]}>
                  Type <AppText style={{ color: '#FF3B30', fontFamily: 'Inter-Bold' }}>BURN IT ALL</AppText> to confirm
                </AppText>
                <TextInput
                  style={[
                    styles.burnInput,
                    {
                      color: colors.text,
                      borderColor: burnInput === 'BURN IT ALL' ? '#FF3B30' : colors.borderSubtle,
                      backgroundColor: colors.bg1,
                    },
                  ]}
                  value={burnInput}
                  onChangeText={setBurnInput}
                  placeholder="BURN IT ALL"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!burning}
                />
                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={[styles.modalCancelBtn, { borderColor: colors.borderSubtle }]}
                    onPress={() => { Keyboard.dismiss(); setBurnOpen(false); setBurnInput(''); }}
                    disabled={burning}
                    activeOpacity={0.7}
                  >
                    <AppText style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.burnConfirmBtn, burnInput !== 'BURN IT ALL' && styles.burnConfirmBtnDisabled]}
                    onPress={() => { Keyboard.dismiss(); handleBurnItAll(); }}
                    disabled={burning || burnInput !== 'BURN IT ALL'}
                    activeOpacity={0.8}
                  >
                    {burning
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <AppText style={styles.burnConfirmText}>Burn It All</AppText>
                    }
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Animated.View style={[styles.modalIcon, { backgroundColor: 'rgba(51,209,122,0.12)', transform: [{ scale: successScale }] }]}>
                  <Check color="#33D17A" size={28} strokeWidth={2} />
                </Animated.View>
                <AppText style={[styles.modalTitle, { color: colors.text }]}>All Clear</AppText>
                <AppText style={[styles.modalBody, { color: colors.textSecondary }]}>
                  Relationship content has been permanently deleted. Your Weekly Streak history is preserved.{'\n'}Taking you home...
                </AppText>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.md,
    paddingBottom: 40,
  },
  scrollView: {
    flex: 1,
  },
  subtitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    gap: Spacing.md,
  },
  catIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  catText: {
    flex: 1,
    gap: 2,
  },
  catLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  catDesc: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    lineHeight: 16,
  },
  catCount: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deleteBtn: {
    borderRadius: Radius.pill,
    backgroundColor: '#FF3B30',
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  deleteBtnDisabled: {
    backgroundColor: 'rgba(255,59,48,0.25)',
  },
  deleteBtnText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  burnCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  burnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  burnTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
  },
  burnDesc: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  burnList: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    gap: 6,
  },
  burnListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  burnDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,59,48,0.5)',
  },
  burnListItem: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
  },
  burnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.pill,
    backgroundColor: '#FF3B30',
    paddingVertical: 14,
    marginTop: 4,
  },
  burnBtnText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    backgroundColor: '#1A1520',
  },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  modalBody: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  modalDeleteBtn: {
    flex: 1,
    borderRadius: Radius.pill,
    backgroundColor: '#FF3B30',
    paddingVertical: 13,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  modalDeleteText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  burnPrompt: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  burnInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
    letterSpacing: 1,
  },
  burnConfirmBtn: {
    flex: 1,
    borderRadius: Radius.pill,
    backgroundColor: '#FF3B30',
    paddingVertical: 13,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  burnConfirmBtnDisabled: {
    backgroundColor: 'rgba(255,59,48,0.3)',
  },
  burnConfirmText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
});
