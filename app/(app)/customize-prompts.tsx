import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Plus, Pencil, Trash2, ChevronLeft, Dices, Zap, X as XIcon } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import WarmTextInput from '@/components/WarmTextInput';
import PrimaryButton from '@/components/PrimaryButton';
import SecondaryButton from '@/components/SecondaryButton';

type Tab = 'dice' | 'dare' | 'decline';

const TABS: { key: Tab; label: string; table: string; color: string }[] = [
  { key: 'dice', label: 'Dice', table: 'dice_prompts', color: '#FFB347' },
  { key: 'dare', label: 'Dare', table: 'dare_prompts', color: '#FF2E8A' },
  { key: 'decline', label: 'Declines', table: 'decline_prompts', color: '#FF5A3D' },
];

interface Prompt {
  id: string;
  text: string;
  is_default: boolean;
  couple_id: string | null;
  created_by_user_id: string | null;
}

export default function CustomizePromptsScreen() {
  const router = useRouter();
  const { user, couple } = useAuth();
  const { colors } = useTheme();

  const [activeTab, setActiveTab] = useState<Tab>('dice');
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [draftText, setDraftText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const currentTab = TABS.find(t => t.key === activeTab)!;
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadPrompts = useCallback(async () => {
    if (!couple?.id) return;
    setLoading(true);
    setError('');
    try {
      const [promptsResult, hiddenResult] = await Promise.all([
        supabase
          .from(currentTab.table)
          .select('id, text, is_default, couple_id, created_by_user_id')
          .or(`is_default.eq.true,couple_id.eq.${couple.id}`)
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
        supabase
          .from('couple_hidden_prompts')
          .select('prompt_id')
          .eq('couple_id', couple.id)
          .eq('prompt_table', currentTab.table),
      ]);

      if (promptsResult.error) throw promptsResult.error;
      if (hiddenResult.error) throw hiddenResult.error;

      const hidden = new Set((hiddenResult.data ?? []).map(r => r.prompt_id as string));
      setHiddenIds(hidden);
      setPrompts((promptsResult.data ?? []) as Prompt[]);
    } catch {
      setError('Failed to load prompts.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, couple?.id]);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  // Realtime: subscribe to all prompt table changes for this couple
  useEffect(() => {
    if (!couple?.id) return;

    const channelName = `customize-prompts-${couple.id}-${activeTab}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: currentTab.table,
          filter: `couple_id=eq.${couple.id}`,
        },
        () => { loadPrompts(); }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'couple_hidden_prompts',
          filter: `couple_id=eq.${couple.id}`,
        },
        () => { loadPrompts(); }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, [couple?.id, activeTab, currentTab.table, loadPrompts]);

  // Focus refresh: reload when screen comes back into view
  useFocusEffect(
    useCallback(() => {
      loadPrompts();
    }, [loadPrompts])
  );

  const visiblePrompts = prompts.filter(p =>
    p.is_default ? !hiddenIds.has(p.id) : p.couple_id === couple?.id
  );

  const openAdd = () => {
    setEditingPrompt(null);
    setDraftText('');
    setError('');
    setModalVisible(true);
  };

  const openEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setDraftText(prompt.text);
    setError('');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!draftText.trim() || !couple?.id || !user) return;
    setSaving(true);
    setError('');
    try {
      if (editingPrompt) {
        if (editingPrompt.is_default) {
          // Create a personal copy and suppress the original default
          const row: Record<string, unknown> = {
            text: draftText.trim(),
            couple_id: couple.id,
            created_by_user_id: user.id,
            is_default: false,
            is_active: true,
          };
          if (currentTab.table === 'dice_prompts') row.category = 'custom';

          const [insertResult, hideResult] = await Promise.all([
            supabase.from(currentTab.table).insert(row),
            supabase.from('couple_hidden_prompts').upsert(
              { couple_id: couple.id, prompt_table: currentTab.table, prompt_id: editingPrompt.id },
              { onConflict: 'couple_id,prompt_table,prompt_id' }
            ),
          ]);
          if (insertResult.error) throw insertResult.error;
          if (hideResult.error) throw hideResult.error;
        } else {
          const { error: updateErr } = await supabase
            .from(currentTab.table)
            .update({ text: draftText.trim() })
            .eq('id', editingPrompt.id);
          if (updateErr) throw updateErr;
        }
      } else {
        const row: Record<string, unknown> = {
          text: draftText.trim(),
          couple_id: couple.id,
          created_by_user_id: user.id,
          is_default: false,
          is_active: true,
        };
        if (currentTab.table === 'dice_prompts') row.category = 'custom';
        const { error: insertErr } = await supabase.from(currentTab.table).insert(row);
        if (insertErr) throw insertErr;
      }
      setModalVisible(false);
      await loadPrompts();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (prompt: Prompt) => {
    if (!couple?.id) return;
    setDeleting(prompt.id);
    try {
      if (prompt.is_default) {
        const { error: hideErr } = await supabase
          .from('couple_hidden_prompts')
          .upsert(
            { couple_id: couple.id, prompt_table: currentTab.table, prompt_id: prompt.id },
            { onConflict: 'couple_id,prompt_table,prompt_id' }
          );
        if (hideErr) throw hideErr;
      } else {
        const { error: deleteErr } = await supabase
          .from(currentTab.table)
          .delete()
          .eq('id', prompt.id);
        if (deleteErr) throw deleteErr;
      }
      await loadPrompts();
    } catch {
      setError('Failed to delete prompt.');
    } finally {
      setDeleting(null);
    }
  };

  const tabIcon = (key: Tab, color: string, size = 15) => {
    switch (key) {
      case 'dice': return <Dices color={color} size={size} strokeWidth={2} />;
      case 'dare': return <Zap color={color} size={size} strokeWidth={2} />;
      case 'decline': return <XIcon color={color} size={size} strokeWidth={2} />;
    }
  };

  return (
    <AppShell scrollable={false}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft color={colors.text} size={24} strokeWidth={2} />
        </TouchableOpacity>
        <AppText style={[styles.headerTitle, { color: colors.text }]}>Customize Prompts</AppText>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.borderSubtle }]}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, active && { borderBottomColor: tab.color, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.75}
            >
              {tabIcon(tab.key, active ? tab.color : colors.textMuted)}
              <AppText style={[styles.tabLabel, { color: active ? tab.color : colors.textMuted }]}>
                {tab.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={currentTab.color} />
          </View>
        ) : (
          <>
            {error ? (
              <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,90,95,0.08)', borderColor: 'rgba(255,90,95,0.25)' }]}>
                <AppText style={{ color: colors.danger, fontSize: FontSize.sm, fontFamily: 'Inter-Medium', textAlign: 'center' }}>{error}</AppText>
              </View>
            ) : null}

            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>ALL PROMPTS</AppText>
                <AppText style={[styles.sectionHint, { color: colors.textMuted }]}>
                  Edit or hide any prompt. Custom prompts are shared with your partner.
                </AppText>
              </View>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: `${currentTab.color}18`, borderColor: `${currentTab.color}50` }]}
                onPress={openAdd}
                activeOpacity={0.75}
              >
                <Plus color={currentTab.color} size={14} strokeWidth={2.5} />
                <AppText style={[styles.addBtnText, { color: currentTab.color }]}>Add</AppText>
              </TouchableOpacity>
            </View>

            {!couple?.id ? (
              <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                <AppText style={[styles.emptyText, { color: colors.textMuted }]}>
                  Connect with your partner to customize prompts.
                </AppText>
              </View>
            ) : visiblePrompts.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                {tabIcon(activeTab, colors.textMuted, 28)}
                <AppText style={[styles.emptyTitle, { color: colors.text }]}>No prompts</AppText>
                <AppText style={[styles.emptyHint, { color: colors.textMuted }]}>
                  Tap Add to create prompts just for the two of you.
                </AppText>
              </View>
            ) : (
              <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                {visiblePrompts.map((p, i) => (
                  <View
                    key={p.id}
                    style={[
                      styles.promptRow,
                      i < visiblePrompts.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
                    ]}
                  >
                    <View style={styles.promptLeft}>
                      {p.is_default && (
                        <View style={[styles.defaultDot, { backgroundColor: currentTab.color }]} />
                      )}
                      <AppText
                        style={[
                          styles.promptText,
                          { color: p.is_default ? colors.textSecondary : colors.text },
                        ]}
                        numberOfLines={2}
                      >
                        {p.text}
                      </AppText>
                    </View>
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        onPress={() => openEdit(p)}
                        style={[styles.iconBtn, { backgroundColor: 'rgba(255,255,255,0.07)' }]}
                        activeOpacity={0.7}
                      >
                        <Pencil color={colors.textSecondary} size={15} strokeWidth={2} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(p)}
                        style={[styles.iconBtn, { backgroundColor: 'rgba(255,90,95,0.08)' }]}
                        activeOpacity={0.7}
                        disabled={deleting === p.id}
                      >
                        {deleting === p.id
                          ? <ActivityIndicator size="small" color={colors.danger} />
                          : <Trash2 color={colors.danger} size={15} strokeWidth={2} />
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Add / Edit Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.borderSubtle }]}>
            <AppText style={[styles.modalTitle, { color: colors.text }]}>
              {editingPrompt ? 'Edit Prompt' : `New ${currentTab.label} Prompt`}
            </AppText>
            <AppText style={[styles.modalHint, { color: colors.textMuted }]}>
              {editingPrompt?.is_default
                ? 'Your edited version will replace this prompt for your account only.'
                : `This will appear in your ${currentTab.label.toLowerCase()} prompt pool.`}
            </AppText>
            <WarmTextInput
              value={draftText}
              onChangeText={setDraftText}
              placeholder="Write your prompt…"
              multiline
              minHeight={90}
              charLimit={300}
              autoFocus
              containerStyle={{ marginBottom: Spacing.md }}
            />
            {error ? (
              <AppText style={[styles.modalError, { color: colors.danger }]}>{error}</AppText>
            ) : null}
            <PrimaryButton
              label={editingPrompt ? 'Save Changes' : 'Add Prompt'}
              onPress={handleSave}
              loading={saving}
              disabled={!draftText.trim()}
            />
            <SecondaryButton
              label="Cancel"
              onPress={() => setModalVisible(false)}
              style={{ marginTop: Spacing.sm }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.screen,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold' },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 60, paddingTop: Spacing.lg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2, marginBottom: 4 },
  sectionHint: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 18 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: Radius.pill, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 6,
    marginTop: 2,
  },
  addBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  listCard: { borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.xl, overflow: 'hidden' },
  promptRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md,
  },
  promptLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  defaultDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  promptText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Medium', lineHeight: 20 },
  rowActions: { flexDirection: 'row', gap: Spacing.sm },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', padding: Spacing.md, textAlign: 'center' },
  emptyCard: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.xl,
    alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl,
  },
  emptyTitle: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold', marginTop: 4 },
  emptyHint: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20 },
  errorBanner: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderRadius: Radius.xl, borderWidth: 1,
    padding: Spacing.card, margin: Spacing.md, marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  modalTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold' },
  modalHint: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 20 },
  modalError: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
});
