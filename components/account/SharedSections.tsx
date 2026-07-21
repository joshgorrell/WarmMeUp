import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight, CircleQuestionMark } from 'lucide-react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import Toggle from '@/components/Toggle';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';

// ─── Section wrapper ──────────────────────────────────────────────
export function Section({ title, note, onInfo, children }: { title: string; note?: string; onInfo?: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <AppText style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</AppText>
        {onInfo && (
          <TouchableOpacity onPress={onInfo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
            <CircleQuestionMark color="rgba(255,46,138,0.7)" size={14} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
        {note && (
          <View style={[styles.ownerNote, { borderBottomColor: colors.borderSubtle }]}>
            <AppText style={[styles.ownerNoteText, { color: colors.textMuted }]}>{note}</AppText>
          </View>
        )}
        {children}
      </View>
    </View>
  );
}

// ─── Settings row ─────────────────────────────────────────────────
export function SettingsRow({
  label, sub, toggle, value, onChange, onPress, onInfo, danger, last, accent, disabled,
}: {
  label: string; sub?: string; toggle?: boolean; value?: boolean;
  onChange?: (v: boolean) => void; onPress?: () => void; onInfo?: () => void;
  danger?: boolean; last?: boolean; accent?: boolean; disabled?: boolean;
}) {
  const { colors } = useTheme();
  const labelColor = danger ? colors.danger : accent ? '#FF2E8A' : colors.text;
  const chevronColor = danger ? colors.danger : accent ? '#FF2E8A' : colors.textMuted;
  const content = (
    <View style={[styles.row, { borderBottomColor: last ? 'transparent' : colors.borderSubtle, borderBottomWidth: last ? 0 : 1 }]}>
      <View style={styles.rowLeft}>
        <View style={styles.rowLabelRow}>
          <AppText style={[styles.rowLabel, { color: labelColor }]}>{label}</AppText>
          {onInfo && (
            <TouchableOpacity onPress={onInfo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
              <CircleQuestionMark color="rgba(255,46,138,0.7)" size={14} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
        {sub && <AppText style={[styles.rowSub, { color: colors.textMuted }]}>{sub}</AppText>}
      </View>
      {toggle
        ? <Toggle value={value ?? false} onChange={onChange ?? (() => {})} disabled={disabled} />
        : <ChevronRight color={chevronColor} size={16} />
      }
    </View>
  );
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity>;
  return content;
}

// ─── Inline password/text field ───────────────────────────────────
export function InlineField({
  label, value, onChange, secure, placeholder, last,
}: {
  label: string; value: string; onChange: (v: string) => void;
  secure?: boolean; placeholder?: string; last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.inlineFieldRow, { borderBottomColor: last ? 'transparent' : colors.borderSubtle, borderBottomWidth: last ? 0 : 1 }]}>
      <AppText style={[styles.inlineFieldLabel, { color: colors.textMuted }]}>{label}</AppText>
      <AppTextInput
        style={[styles.inlineFieldInput, { color: colors.text }]}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        placeholder={placeholder ?? ''}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.lg },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2 },
  sectionCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  ownerNote: { paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1 },
  ownerNoteText: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 17, fontStyle: 'italic' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 15,
  },
  rowLeft: { flex: 1, gap: 2, marginRight: Spacing.md },
  rowLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
  rowSub: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 16 },
  inlineFieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12,
  },
  inlineFieldLabel: { fontSize: FontSize.xs, fontFamily: 'Inter-Medium', width: 114 },
  inlineFieldInput: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'right' },
});
