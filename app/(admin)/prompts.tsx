import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Trash2, Pencil, X, Check, ChevronDown, ChevronUp, Tag } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { DicePrompt, DarePrompt, TellMePrompt } from '@/lib/types';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';

type Tab = 'dice' | 'dare' | 'tellme';
type AnyPrompt = DicePrompt | DarePrompt | TellMePrompt;

interface FaceLabel {
  id: string;
  label: string;
  color: string;
  sort_order: number;
}

const TABLE_MAP: Record<Tab, string> = {
  dice: 'dice_prompts',
  dare: 'dare_prompts',
  tellme: 'tell_me_prompts',
};

const TAB_LABELS: Record<Tab, string> = {
  dice: 'Dice',
  dare: 'Dare',
  tellme: 'Tell Me',
};

const TAB_COLORS: Record<Tab, string> = {
  dice: '#FFB347',
  dare: '#FF2E8A',
  tellme: '#FF8A3D',
};

const COLOR_PRESETS = [
  '#FF2E8A', '#FF5A3D', '#FFB347', '#FF3D4F',
  '#33D17A', '#3D9AFF', '#A259FF', '#FF9F0A',
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
];

export default function PromptsAdmin() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('dice');
  const [prompts, setPrompts] = useState<AnyPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<AnyPrompt | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftFaceLabel, setDraftFaceLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [faceLabels, setFaceLabels] = useState<FaceLabel[]>([]);
  const [labelsExpanded, setLabelsExpanded] = useState(false);
  const [labelModalVisible, setLabelModalVisible] = useState(false);
  const [editingLabel, setEditingLabel] = useState<FaceLabel | null>(null);
  const [draftLabelName, setDraftLabelName] = useState('');
  const [draftLabelColor, setDraftLabelColor] = useState('#FFB347');
  const [savingLabel, setSavingLabel] = useState(false);
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);
  const [deletingLabelId, setDeletingLabelId] = useState<string | null>(null);

  const accentColor = TAB_COLORS[activeTab];

  const fetchFaceLabels = useCallback(async () => {
    const { data } = await supabase
      .from('dice_face_labels')
      .select('*')
      .order('sort_order', { ascending: true });
    setFaceLabels(data ?? []);
  }, []);

  const fetchPrompts = useCallback(async (tab: Tab) => {
    setLoading(true);
    const { data } = await supabase
      .from(TABLE_MAP[tab])
      .select('*')
      .eq('is_default', true)
      .order('created_at', { ascending: true });
    setPrompts(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFaceLabels();
  }, []);

  useEffect(() => {
    fetchPrompts(activeTab);
  }, [activeTab]);

  const openCreate = () => {
    setEditingPrompt(null);
    setDraftText('');
    setDraftFaceLabel(null);
    setModalVisible(true);
  };

  const openEdit = (prompt: AnyPrompt) => {
    setEditingPrompt(prompt);
    setDraftText(prompt.text);
    setDraftFaceLabel((prompt as DicePrompt).face_label ?? null);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!draftText.trim()) return;
    setSaving(true);
    const table = TABLE_MAP[activeTab];
    const extraFields = activeTab === 'dice' ? { face_label: draftFaceLabel } : {};
    if (editingPrompt) {
      await supabase.from(table).update({ text: draftText.trim(), ...extraFields }).eq('id', editingPrompt.id);
    } else {
      await supabase.from(table).insert({
        text: draftText.trim(),
        is_default: true,
        is_active: true,
        couple_id: null,
        created_by_user_id: null,
        ...extraFields,
      });
    }
    setSaving(false);
    setModalVisible(false);
    fetchPrompts(activeTab);
  };

  const handleToggle = async (prompt: AnyPrompt) => {
    await supabase
      .from(TABLE_MAP[activeTab])
      .update({ is_active: !prompt.is_active })
      .eq('id', prompt.id);
    fetchPrompts(activeTab);
  };

  const handleDelete = (prompt: AnyPrompt) => {
    setDeletingPromptId(prompt.id);
  };

  const confirmDeletePrompt = async (prompt: AnyPrompt) => {
    const { error } = await supabase.from(TABLE_MAP[activeTab]).delete().eq('id', prompt.id);
    setDeletingPromptId(null);
    if (!error) fetchPrompts(activeTab);
  };

  const openCreateLabel = () => {
    setEditingLabel(null);
    setDraftLabelName('');
    setDraftLabelColor('#FFB347');
    setLabelModalVisible(true);
  };

  const openEditLabel = (label: FaceLabel) => {
    setEditingLabel(label);
    setDraftLabelName(label.label);
    setDraftLabelColor(label.color);
    setLabelModalVisible(true);
  };

  const handleSaveLabel = async () => {
    if (!draftLabelName.trim()) return;
    setSavingLabel(true);
    const nameUpper = draftLabelName.trim().toUpperCase();
    if (editingLabel) {
      await supabase
        .from('dice_face_labels')
        .update({ label: nameUpper, color: draftLabelColor })
        .eq('id', editingLabel.id);
    } else {
      const nextOrder = faceLabels.length > 0 ? Math.max(...faceLabels.map(l => l.sort_order)) + 1 : 1;
      await supabase.from('dice_face_labels').insert({
        label: nameUpper,
        color: draftLabelColor,
        sort_order: nextOrder,
      });
    }
    setSavingLabel(false);
    setLabelModalVisible(false);
    fetchFaceLabels();
  };

  const handleDeleteLabel = (label: FaceLabel) => {
    setDeletingLabelId(label.id);
  };

  const confirmDeleteLabel = async (label: FaceLabel) => {
    const { error } = await supabase.from('dice_face_labels').delete().eq('id', label.id);
    setDeletingLabelId(null);
    if (!error) fetchFaceLabels();
  };

  const faceLabelColorMap: Record<string, string> = {};
  faceLabels.forEach(l => { faceLabelColorMap[l.label] = l.color; });

  return (
    <AppShell scrollable={false}>
      <ScreenHeader title="Prompt Management" onBack={() => router.back()} />

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.borderSubtle }]}>
        {(Object.keys(TABLE_MAP) as Tab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && { borderBottomColor: TAB_COLORS[tab], borderBottomWidth: 2 },
            ]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? TAB_COLORS[tab] : colors.textMuted },
              ]}
            >
              {TAB_LABELS[tab]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={accentColor} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {/* Manage Labels section — only shown on Dice tab */}
          {activeTab === 'dice' && (
            <View style={[styles.labelsSection, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <TouchableOpacity
                style={styles.labelsSectionHeader}
                onPress={() => setLabelsExpanded(v => !v)}
                activeOpacity={0.75}
              >
                <View style={styles.labelsSectionLeft}>
                  <Tag color={accentColor} size={16} strokeWidth={2} />
                  <Text style={[styles.labelsSectionTitle, { color: colors.text }]}>Manage Face Labels</Text>
                </View>
                <View style={styles.labelChipsPreview}>
                  {faceLabels.slice(0, labelsExpanded ? 0 : 4).map(l => (
                    <View key={l.id} style={[styles.labelChipSmall, { backgroundColor: `${l.color}22`, borderColor: `${l.color}55` }]}>
                      <Text style={[styles.labelChipSmallText, { color: l.color }]}>{l.label}</Text>
                    </View>
                  ))}
                  {!labelsExpanded && faceLabels.length > 4 && (
                    <Text style={[styles.labelChipSmallText, { color: colors.textMuted }]}>+{faceLabels.length - 4}</Text>
                  )}
                </View>
                {labelsExpanded
                  ? <ChevronUp color={colors.textMuted} size={18} strokeWidth={2} />
                  : <ChevronDown color={colors.textMuted} size={18} strokeWidth={2} />
                }
              </TouchableOpacity>

              {labelsExpanded && (
                <View style={styles.labelsBody}>
                  <View style={styles.labelsList}>
                    {faceLabels.map(label => {
                      const confirmingLabel = deletingLabelId === label.id;
                      return (
                        <View
                          key={label.id}
                          style={[styles.labelRow, { borderColor: confirmingLabel ? colors.danger : `${label.color}40` }]}
                        >
                          {confirmingLabel ? (
                            <>
                              <Text style={[styles.labelRowName, { color: colors.danger, flex: 1 }]}>Delete label?</Text>
                              <View style={styles.labelRowActions}>
                                <TouchableOpacity
                                  onPress={() => setDeletingLabelId(null)}
                                  style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.06)' }]}
                                  activeOpacity={0.7}
                                >
                                  <X color={colors.textSecondary} size={14} strokeWidth={2} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => confirmDeleteLabel(label)}
                                  style={[styles.actionBtn, { backgroundColor: 'rgba(255,90,95,0.18)' }]}
                                  activeOpacity={0.7}
                                >
                                  <Check color={colors.danger} size={14} strokeWidth={2.5} />
                                </TouchableOpacity>
                              </View>
                            </>
                          ) : (
                            <>
                              <View style={[styles.labelColorSwatch, { backgroundColor: label.color }]} />
                              <Text style={[styles.labelRowName, { color: colors.text }]}>{label.label}</Text>
                              <View style={styles.labelRowActions}>
                                <TouchableOpacity
                                  onPress={() => openEditLabel(label)}
                                  style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.06)' }]}
                                  activeOpacity={0.7}
                                >
                                  <Pencil color={colors.textSecondary} size={14} strokeWidth={2} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => handleDeleteLabel(label)}
                                  style={[styles.actionBtn, { backgroundColor: 'rgba(255,90,95,0.08)' }]}
                                  activeOpacity={0.7}
                                >
                                  <Trash2 color={colors.danger} size={14} strokeWidth={2} />
                                </TouchableOpacity>
                              </View>
                            </>
                          )}
                        </View>
                      );
                    })}
                  </View>
                  <TouchableOpacity
                    style={[styles.addLabelBtn, { borderColor: accentColor }]}
                    onPress={openCreateLabel}
                    activeOpacity={0.8}
                  >
                    <Plus color={accentColor} size={15} strokeWidth={2.5} />
                    <Text style={[styles.addLabelBtnText, { color: accentColor }]}>Add Label</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {prompts.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No prompts yet. Tap + to add one.</Text>
            </View>
          )}
          {prompts.map(p => {
            const assignedLabel = activeTab === 'dice' ? (p as DicePrompt).face_label ?? null : null;
            const labelColor = assignedLabel ? (faceLabelColorMap[assignedLabel] ?? '#FFB347') : null;
            const confirming = deletingPromptId === p.id;
            return (
              <View
                key={p.id}
                style={[
                  styles.promptRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: confirming ? colors.danger : p.is_active ? colors.borderSubtle : 'rgba(255,90,95,0.20)',
                    opacity: p.is_active ? 1 : 0.55,
                  },
                ]}
              >
                {confirming ? (
                  <>
                    <Text style={[styles.promptText, { color: colors.danger, flex: 1 }]}>Delete this prompt?</Text>
                    <TouchableOpacity
                      onPress={() => setDeletingPromptId(null)}
                      style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.06)' }]}
                      activeOpacity={0.7}
                    >
                      <X color={colors.textSecondary} size={15} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => confirmDeletePrompt(p)}
                      style={[styles.actionBtn, { backgroundColor: 'rgba(255,90,95,0.18)' }]}
                      activeOpacity={0.7}
                    >
                      <Check color={colors.danger} size={15} strokeWidth={2.5} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[styles.promptText, { color: colors.text }]}>{p.text}</Text>
                      <View style={styles.promptMeta}>
                        {assignedLabel && labelColor ? (
                          <View style={[styles.labelBadge, { backgroundColor: `${labelColor}22`, borderColor: `${labelColor}55` }]}>
                            <Text style={[styles.labelBadgeText, { color: labelColor }]}>{assignedLabel}</Text>
                          </View>
                        ) : activeTab === 'dice' ? (
                          <View style={[styles.labelBadge, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.borderSubtle }]}>
                            <Text style={[styles.labelBadgeText, { color: colors.textMuted }]}>Any Face</Text>
                          </View>
                        ) : null}
                        <Text style={[styles.promptStatus, { color: p.is_active ? '#33D17A' : colors.danger }]}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={p.is_active}
                      onValueChange={() => handleToggle(p)}
                      trackColor={{ false: colors.borderSubtle, true: `${accentColor}55` }}
                      thumbColor={p.is_active ? accentColor : colors.textMuted}
                    />
                    <TouchableOpacity
                      onPress={() => openEdit(p)}
                      style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.06)' }]}
                      activeOpacity={0.7}
                    >
                      <Pencil color={colors.textSecondary} size={15} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(p)}
                      style={[styles.actionBtn, { backgroundColor: 'rgba(255,90,95,0.08)' }]}
                      activeOpacity={0.7}
                    >
                      <Trash2 color={colors.danger} size={15} strokeWidth={2} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: accentColor, bottom: insets.bottom + 24 }]}
        onPress={openCreate}
        activeOpacity={0.85}
      >
        <Plus color="#fff" size={24} strokeWidth={2.5} />
      </TouchableOpacity>

      {/* Prompt edit/create Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: isDark ? '#0F0F17' : '#FFF8F3', borderColor: colors.borderSubtle }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingPrompt ? 'Edit Prompt' : `New ${TAB_LABELS[activeTab]} Prompt`}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} activeOpacity={0.7}>
                <X color={colors.textMuted} size={22} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: colors.card },
              ]}
              value={draftText}
              onChangeText={setDraftText}
              placeholder="Enter prompt text…"
              placeholderTextColor={colors.textMuted}
              multiline
              autoFocus
              maxLength={300}
            />
            <Text style={[styles.charCount, { color: colors.textMuted }]}>{draftText.length}/300</Text>

            {/* Face label picker — only for dice prompts */}
            {activeTab === 'dice' && faceLabels.length > 0 && (
              <View style={styles.labelPickerSection}>
                <Text style={[styles.labelPickerTitle, { color: colors.textSecondary }]}>
                  Face Label
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.labelPickerRow}>
                  <TouchableOpacity
                    style={[
                      styles.labelChip,
                      {
                        backgroundColor: draftFaceLabel === null ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                        borderColor: draftFaceLabel === null ? colors.text : colors.borderSubtle,
                      },
                    ]}
                    onPress={() => setDraftFaceLabel(null)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.labelChipText, { color: draftFaceLabel === null ? colors.text : colors.textMuted }]}>
                      ANY
                    </Text>
                  </TouchableOpacity>
                  {faceLabels.map(l => {
                    const selected = draftFaceLabel === l.label;
                    return (
                      <TouchableOpacity
                        key={l.id}
                        style={[
                          styles.labelChip,
                          {
                            backgroundColor: selected ? `${l.color}28` : 'rgba(255,255,255,0.04)',
                            borderColor: selected ? l.color : colors.borderSubtle,
                          },
                        ]}
                        onPress={() => setDraftFaceLabel(l.label)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.labelChipDot, { backgroundColor: l.color, opacity: selected ? 1 : 0.45 }]} />
                        <Text style={[styles.labelChipText, { color: selected ? l.color : colors.textMuted }]}>
                          {l.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: draftText.trim() ? accentColor : colors.borderSubtle },
              ]}
              onPress={handleSave}
              disabled={!draftText.trim() || saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Check color="#fff" size={18} strokeWidth={2.5} />
                  <Text style={styles.saveBtnText}>Save Prompt</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Label edit/create Modal */}
      <Modal visible={labelModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: isDark ? '#0F0F17' : '#FFF8F3', borderColor: colors.borderSubtle }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingLabel ? 'Edit Label' : 'New Face Label'}
              </Text>
              <TouchableOpacity onPress={() => setLabelModalVisible(false)} activeOpacity={0.7}>
                <X color={colors.textMuted} size={22} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.labelPickerTitle, { color: colors.textSecondary }]}>Label Name</Text>
            <TextInput
              style={[
                styles.input,
                styles.inputShort,
                { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: colors.card },
              ]}
              value={draftLabelName}
              onChangeText={v => setDraftLabelName(v.toUpperCase())}
              placeholder="e.g. WILD"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              maxLength={12}
            />

            <Text style={[styles.labelPickerTitle, { color: colors.textSecondary, marginTop: 4 }]}>Accent Color</Text>
            <View style={styles.colorPreviewRow}>
              <View style={[styles.colorPreviewSwatch, { backgroundColor: draftLabelColor }]} />
              <TextInput
                style={[
                  styles.colorHexInput,
                  { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: colors.card },
                ]}
                value={draftLabelColor}
                onChangeText={v => setDraftLabelColor(v)}
                placeholder="#FFB347"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                maxLength={7}
              />
            </View>
            <View style={styles.colorPresetsGrid}>
              {COLOR_PRESETS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorPresetDot,
                    { backgroundColor: c },
                    draftLabelColor === c && styles.colorPresetDotSelected,
                  ]}
                  onPress={() => setDraftLabelColor(c)}
                  activeOpacity={0.8}
                />
              ))}
            </View>

            {draftLabelName.trim() ? (
              <View style={styles.labelPreviewRow}>
                <Text style={[styles.labelPickerTitle, { color: colors.textSecondary }]}>Preview</Text>
                <View style={[styles.labelBadge, { backgroundColor: `${draftLabelColor}22`, borderColor: `${draftLabelColor}55` }]}>
                  <Text style={[styles.labelBadgeText, { color: draftLabelColor }]}>{draftLabelName.trim().toUpperCase()}</Text>
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: draftLabelName.trim() ? '#FFB347' : colors.borderSubtle },
              ]}
              onPress={handleSaveLabel}
              disabled={!draftLabelName.trim() || savingLabel}
              activeOpacity={0.85}
            >
              {savingLabel ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Check color="#fff" size={18} strokeWidth={2.5} />
                  <Text style={styles.saveBtnText}>Save Label</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginHorizontal: Spacing.screen,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing.screen, paddingBottom: 120, gap: Spacing.sm },
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: FontSize.body, fontFamily: 'Inter-Regular' },

  labelsSection: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  labelsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  labelsSectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  labelsSectionTitle: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  labelChipsPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    justifyContent: 'flex-end',
    marginRight: 6,
    flexWrap: 'wrap',
  },
  labelChipSmall: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  labelChipSmallText: { fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 0.8 },
  labelsBody: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm },
  labelsList: { gap: 6 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
  },
  labelColorSwatch: { width: 14, height: 14, borderRadius: 7 },
  labelRowName: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Bold', letterSpacing: 1 },
  labelRowActions: { flexDirection: 'row', gap: 6 },
  addLabelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 10,
  },
  addLabelBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },

  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  promptText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', lineHeight: 20 },
  promptMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  promptStatus: { fontSize: 11, fontFamily: 'Inter-SemiBold' },
  labelBadge: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  labelBadgeText: { fontSize: 10, fontFamily: 'Inter-Bold', letterSpacing: 0.8 },

  actionBtn: { width: 34, height: 34, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    right: Spacing.screen,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold' },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputShort: { minHeight: 48 },
  charCount: { fontSize: 11, fontFamily: 'Inter-Regular', textAlign: 'right', marginTop: -8 },

  labelPickerSection: { gap: 8 },
  labelPickerTitle: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  labelPickerRow: { gap: 8, paddingVertical: 2 },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  labelChipDot: { width: 7, height: 7, borderRadius: 4 },
  labelChipText: { fontSize: 11, fontFamily: 'Inter-Bold', letterSpacing: 1 },

  colorPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  colorPreviewSwatch: { width: 36, height: 36, borderRadius: 10 },
  colorHexInput: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm,
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    height: 44,
  },
  colorPresetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorPresetDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorPresetDotSelected: {
    borderWidth: 3,
    borderColor: '#fff',
  },
  labelPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.pill,
    height: 52,
  },
  saveBtnText: { color: '#fff', fontSize: FontSize.body, fontFamily: 'Inter-Bold' },
});
