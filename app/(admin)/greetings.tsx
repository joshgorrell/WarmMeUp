import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Pencil, Trash2, X } from 'lucide-react-native';
import AppText from '@/components/AppText';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import Toggle from '@/components/Toggle';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';

interface GreetingSubtitle {
  id: string;
  text: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

type ModalMode = 'add' | 'edit';

export default function GreetingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [phrases, setPhrases] = useState<GreetingSubtitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [editTarget, setEditTarget] = useState<GreetingSubtitle | null>(null);
  const [draftText, setDraftText] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<GreetingSubtitle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPhrases = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('greeting_subtitles')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (err) {
      setError(err.message);
    } else {
      setPhrases(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadPhrases(); }, [loadPhrases]);

  const openAdd = () => {
    setModalMode('add');
    setEditTarget(null);
    setDraftText('');
    setModalError(null);
    setModalVisible(true);
  };

  const openEdit = (phrase: GreetingSubtitle) => {
    setModalMode('edit');
    setEditTarget(phrase);
    setDraftText(phrase.text);
    setModalError(null);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditTarget(null);
    setDraftText('');
    setModalError(null);
  };

  const handleSave = async () => {
    const text = draftText.trim();
    if (!text) { setModalError('Phrase text is required.'); return; }
    setSaving(true);
    setModalError(null);

    if (modalMode === 'add') {
      const nextOrder = phrases.length > 0 ? Math.max(...phrases.map(p => p.sort_order)) + 1 : 1;
      const { error: err } = await supabase
        .from('greeting_subtitles')
        .insert({ text, is_active: true, sort_order: nextOrder });
      if (err) { setModalError(err.message); setSaving(false); return; }
    } else if (editTarget) {
      const { error: err } = await supabase
        .from('greeting_subtitles')
        .update({ text })
        .eq('id', editTarget.id);
      if (err) { setModalError(err.message); setSaving(false); return; }
    }

    setSaving(false);
    closeModal();
    loadPhrases();
  };

  const handleToggleActive = async (phrase: GreetingSubtitle) => {
    const next = !phrase.is_active;
    setPhrases(prev => prev.map(p => p.id === phrase.id ? { ...p, is_active: next } : p));
    const { error: err } = await supabase
      .from('greeting_subtitles')
      .update({ is_active: next })
      .eq('id', phrase.id);
    if (err) {
      // revert on failure
      setPhrases(prev => prev.map(p => p.id === phrase.id ? { ...p, is_active: phrase.is_active } : p));
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    const { error: err } = await supabase
      .from('greeting_subtitles')
      .delete()
      .eq('id', deleteConfirm.id);
    setDeleting(false);
    if (!err) {
      setPhrases(prev => prev.filter(p => p.id !== deleteConfirm.id));
      setDeleteConfirm(null);
      if (modalVisible && editTarget?.id === deleteConfirm.id) closeModal();
    }
  };

  const activeCount = phrases.filter(p => p.is_active).length;

  return (
    <AppShell scrollable={false}>
      <ScreenHeader onBack={() => router.back()} />

      <View style={styles.titleRow}>
        <View>
          <AppText style={[styles.title, { color: colors.text }]}>Greeting Subtitles</AppText>
          <AppText style={[styles.subtitle, { color: colors.textMuted }]}>
            {activeCount} of {phrases.length} active — shown randomly on the home screen
          </AppText>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: 'rgba(255,179,71,0.12)', borderColor: 'rgba(255,179,71,0.35)' }]}
          onPress={openAdd}
          activeOpacity={0.8}
        >
          <Plus color="#FFB347" size={18} strokeWidth={2.2} />
          <AppText style={styles.addBtnText}>Add</AppText>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,60,60,0.08)', borderColor: 'rgba(255,60,60,0.25)' }]}>
          <AppText style={[styles.errorText, { color: colors.danger }]}>{error}</AppText>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {phrases.length === 0 ? (
            <View style={styles.emptyWrap}>
              <AppText style={[styles.emptyText, { color: colors.textMuted }]}>No phrases yet. Tap Add to create one.</AppText>
            </View>
          ) : (
            phrases.map(phrase => (
              <View
                key={phrase.id}
                style={[
                  styles.row,
                  { backgroundColor: colors.card, borderColor: colors.borderSubtle },
                  !phrase.is_active && styles.rowInactive,
                ]}
              >
                <View style={styles.rowContent}>
                  <AppText
                    style={[
                      styles.rowText,
                      { color: phrase.is_active ? colors.text : colors.textMuted },
                    ]}
                    numberOfLines={3}
                  >
                    {phrase.text}
                  </AppText>
                  {!phrase.is_active && (
                    <AppText style={[styles.inactiveBadge, { color: colors.textMuted }]}>inactive</AppText>
                  )}
                </View>
                <View style={styles.rowActions}>
                  <Toggle
                    value={phrase.is_active}
                    onChange={() => handleToggleActive(phrase)}
                  />
                  <TouchableOpacity
                    style={[styles.editBtn, { backgroundColor: 'rgba(105,167,255,0.10)' }]}
                    onPress={() => openEdit(phrase)}
                    activeOpacity={0.8}
                  >
                    <Pencil color="#69A7FF" size={15} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <View style={styles.modalHeader}>
              <AppText style={[styles.modalTitle, { color: colors.text }]}>
                {modalMode === 'add' ? 'Add Phrase' : 'Edit Phrase'}
              </AppText>
              <TouchableOpacity onPress={closeModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color={colors.textMuted} size={20} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <TextInput
              value={draftText}
              onChangeText={setDraftText}
              placeholder="e.g. What's the mood tonight?"
              placeholderTextColor={colors.textMuted}
              style={[styles.modalInput, { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: colors.bg2 }]}
              multiline
              numberOfLines={3}
              maxLength={200}
              autoFocus
            />
            <AppText style={[styles.charCount, { color: colors.textMuted }]}>{draftText.length}/200</AppText>

            {modalError && (
              <AppText style={[styles.modalError, { color: colors.danger }]}>{modalError}</AppText>
            )}

            <View style={styles.modalActions}>
              {modalMode === 'edit' && editTarget && (
                <TouchableOpacity
                  style={[styles.deleteBtn, { borderColor: 'rgba(255,60,60,0.30)' }]}
                  onPress={() => { closeModal(); setDeleteConfirm(editTarget); }}
                  activeOpacity={0.8}
                >
                  <Trash2 color={colors.danger} size={16} strokeWidth={2} />
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={closeModal} style={styles.cancelBtn} activeOpacity={0.8}>
                <AppText style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={!draftText.trim() || saving}
                style={[styles.saveBtn, { backgroundColor: '#FFB347', opacity: (!draftText.trim() || saving) ? 0.5 : 1 }]}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <AppText style={styles.saveBtnText}>Save</AppText>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={!!deleteConfirm} transparent animationType="fade" onRequestClose={() => setDeleteConfirm(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <AppText style={[styles.modalTitle, { color: colors.text, marginBottom: Spacing.sm }]}>Delete Phrase?</AppText>
            <AppText style={[styles.deleteConfirmText, { color: colors.textSecondary }]} numberOfLines={4}>
              "{deleteConfirm?.text}"
            </AppText>
            <AppText style={[styles.deleteConfirmSub, { color: colors.textMuted }]}>
              This cannot be undone.
            </AppText>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setDeleteConfirm(null)} style={styles.cancelBtn} activeOpacity={0.8}>
                <AppText style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDelete}
                disabled={deleting}
                style={[styles.saveBtn, { backgroundColor: colors.danger, opacity: deleting ? 0.5 : 1 }]}
                activeOpacity={0.85}
              >
                {deleting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <AppText style={styles.saveBtnText}>Delete</AppText>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.screen,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  title: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold', marginBottom: 2 },
  subtitle: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexShrink: 0,
  },
  addBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', color: '#FFB347' },
  errorBanner: {
    marginHorizontal: Spacing.screen,
    marginBottom: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  errorText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing.screen, paddingTop: 4 },
  emptyWrap: { paddingTop: 40, alignItems: 'center' },
  emptyText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
    marginBottom: Spacing.sm,
  },
  rowInactive: { opacity: 0.55 },
  rowContent: { flex: 1, gap: 4 },
  rowText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 20 },
  inactiveBadge: { fontSize: 10, fontFamily: 'Inter-Medium', letterSpacing: 0.5, textTransform: 'uppercase' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.screen,
  },
  modalCard: {
    width: '100%',
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.card,
    gap: Spacing.md,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold' },
  modalInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, fontFamily: 'Inter-Regular', textAlign: 'right', marginTop: -8 },
  modalError: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 9 },
  cancelText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
  saveBtn: {
    borderRadius: Radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 9,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', color: '#fff' },
  deleteConfirmText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  deleteConfirmSub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
});
