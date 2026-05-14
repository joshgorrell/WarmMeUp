import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Users, X, Check, TriangleAlert as AlertTriangle, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';

interface CoupleRow {
  id: string;
  user_a_id: string;
  user_b_id: string | null;
  invite_code: string;
  active: boolean;
  admin_notes: string;
  created_at: string;
  user_a_name: string;
  user_b_name: string | null;
}

export default function CouplesAdmin() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [couples, setCouples] = useState<CoupleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CoupleRow | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCouples = useCallback(async () => {
    setLoading(true);
    const { data: coupleData } = await supabase
      .from('couples')
      .select('*')
      .order('created_at', { ascending: false });

    if (!coupleData) { setLoading(false); return; }

    const userIds = coupleData.flatMap(c =>
      [c.user_a_id, c.user_b_id].filter(Boolean) as string[]
    );
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);

    const nameMap = Object.fromEntries((profileData ?? []).map(p => [p.id, p.display_name]));

    const enriched: CoupleRow[] = coupleData.map(c => ({
      ...c,
      admin_notes: c.admin_notes ?? '',
      user_a_name: nameMap[c.user_a_id] ?? 'Unknown',
      user_b_name: c.user_b_id ? (nameMap[c.user_b_id] ?? 'Unknown') : null,
    }));

    setCouples(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCouples(); }, []);

  const openDetail = (couple: CoupleRow) => {
    setSelected(couple);
    setNotes(couple.admin_notes ?? '');
  };

  const handleSaveNotes = async () => {
    if (!selected) return;
    setSaving(true);
    await supabase.from('couples').update({ admin_notes: notes }).eq('id', selected.id);
    setSaving(false);
    setSelected(prev => prev ? { ...prev, admin_notes: notes } : null);
    setCouples(prev => prev.map(c => c.id === selected.id ? { ...c, admin_notes: notes } : c));
  };

  const handleToggleActive = (couple: CoupleRow) => {
    const action = couple.active ? 'deactivate' : 'reactivate';
    Alert.alert(
      `${action.charAt(0).toUpperCase() + action.slice(1)} Couple`,
      `Are you sure you want to ${action} this couple? ${couple.active ? 'They will lose access to the app.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action.charAt(0).toUpperCase() + action.slice(1),
          style: couple.active ? 'destructive' : 'default',
          onPress: async () => {
            await supabase.from('couples').update({ active: !couple.active }).eq('id', couple.id);
            setCouples(prev => prev.map(c => c.id === couple.id ? { ...c, active: !c.active } : c));
            setSelected(prev => prev && prev.id === couple.id ? { ...prev, active: !prev.active } : prev);
          },
        },
      ]
    );
  };

  return (
    <AppShell scrollable={false}>
      <ScreenHeader title="Couples & Users" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#FF2E8A" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {couples.length === 0 && (
            <View style={styles.emptyWrap}>
              <Users color={colors.textMuted} size={36} strokeWidth={1.5} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No couples registered yet.</Text>
            </View>
          )}
          {couples.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[styles.coupleRow, { backgroundColor: colors.card, borderColor: c.active ? colors.borderSubtle : 'rgba(255,90,95,0.25)' }]}
              onPress={() => openDetail(c)}
              activeOpacity={0.8}
            >
              <View style={[styles.avatarPair, { backgroundColor: c.active ? 'rgba(255,46,138,0.10)' : 'rgba(255,90,95,0.10)' }]}>
                <Text style={styles.avatarEmoji}>{c.active ? '❤️' : '🔒'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.coupleName, { color: colors.text }]}>
                  {c.user_a_name}{c.user_b_name ? ` & ${c.user_b_name}` : ' (unpaired)'}
                </Text>
                <View style={styles.metaRow}>
                  <View style={[styles.statusBadge, { backgroundColor: c.active ? 'rgba(51,209,122,0.12)' : 'rgba(255,90,95,0.12)' }]}>
                    <Text style={[styles.statusText, { color: c.active ? '#33D17A' : colors.danger }]}>
                      {c.active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  <Text style={[styles.dateText, { color: colors.textMuted }]}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              <ChevronRight color={colors.textMuted} size={16} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Detail Modal */}
      <Modal visible={!!selected} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: isDark ? '#0F0F17' : '#FFF8F3', borderColor: colors.borderSubtle }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Couple Details</Text>
              <TouchableOpacity onPress={() => setSelected(null)} activeOpacity={0.7}>
                <X color={colors.textMuted} size={22} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Names */}
                <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted }]}>USERS</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{selected.user_a_name}</Text>
                  {selected.user_b_name && (
                    <Text style={[styles.detailValue, { color: colors.text }]}>{selected.user_b_name}</Text>
                  )}
                </View>

                {/* Invite code */}
                <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted }]}>INVITE CODE</Text>
                  <Text style={[styles.codeText, { color: colors.text }]}>{selected.invite_code}</Text>
                </View>

                {/* Created */}
                <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted }]}>PAIRED ON</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {new Date(selected.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </Text>
                </View>

                {/* Notes */}
                <Text style={[styles.notesLabel, { color: colors.textMuted }]}>ADMIN NOTES</Text>
                <TextInput
                  style={[styles.notesInput, { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Add internal notes about this couple…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.saveNotesBtn, { borderColor: colors.borderSubtle }]}
                  onPress={handleSaveNotes}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.textSecondary} size="small" />
                  ) : (
                    <>
                      <Check color={colors.textSecondary} size={16} strokeWidth={2} />
                      <Text style={[styles.saveNotesBtnText, { color: colors.textSecondary }]}>Save Notes</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Toggle active */}
                <TouchableOpacity
                  style={[
                    styles.dangerBtn,
                    {
                      backgroundColor: selected.active ? 'rgba(255,90,95,0.08)' : 'rgba(51,209,122,0.08)',
                      borderColor: selected.active ? 'rgba(255,90,95,0.30)' : 'rgba(51,209,122,0.30)',
                    },
                  ]}
                  onPress={() => handleToggleActive(selected)}
                  activeOpacity={0.8}
                >
                  {selected.active ? (
                    <AlertTriangle color={colors.danger} size={18} strokeWidth={2} />
                  ) : (
                    <RefreshCw color="#33D17A" size={18} strokeWidth={2} />
                  )}
                  <Text style={[styles.dangerBtnText, { color: selected.active ? colors.danger : '#33D17A' }]}>
                    {selected.active ? 'Deactivate Couple' : 'Reactivate Couple'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing.screen, paddingBottom: 60, gap: Spacing.sm },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  emptyText: { fontSize: FontSize.body, fontFamily: 'Inter-Regular' },
  coupleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
  },
  avatarPair: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 20 },
  coupleName: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusBadge: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 10, fontFamily: 'Inter-Bold' },
  dateText: { fontSize: 11, fontFamily: 'Inter-Regular' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    maxHeight: '85%',
    gap: Spacing.md,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  modalTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold' },
  detailBlock: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm, gap: 4 },
  detailLabel: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1 },
  detailValue: { fontSize: FontSize.body, fontFamily: 'Inter-Medium' },
  codeText: { fontSize: 18, fontFamily: 'Inter-Bold', letterSpacing: 4 },
  notesLabel: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1, marginBottom: 6 },
  notesInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.sm,
  },
  saveNotesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    height: 44,
    marginBottom: Spacing.lg,
  },
  saveNotesBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    height: 52,
    marginBottom: Spacing.md,
  },
  dangerBtnText: { fontSize: FontSize.body, fontFamily: 'Inter-Bold' },
});
