import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import AppText from '@/components/AppText';
import { ChevronRight, Clock, Sun, Infinity as InfinityIcon } from 'lucide-react-native';
import BottomSheet from './BottomSheet';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing } from '@/constants/theme';

interface StealthBypassSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (hours: number) => void;
}

const OPTIONS = [
  { label: '1 Hour', Icon: Clock, hours: 1 },
  { label: '2 Hours', Icon: Clock, hours: 2 },
  { label: 'All Day', Icon: Sun, hours: 24 },
  { label: 'Until I Turn It Back On', Icon: InfinityIcon, hours: 87600 },
];

export default function StealthBypassSheet({ visible, onClose, onSelect }: StealthBypassSheetProps) {
  const { colors } = useTheme();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Privacy Mode"
      subtitle="Temporarily open Warm Me Up directly, bypassing the Weather Lock Screen."
    >
      <View>
        {OPTIONS.map(({ label, Icon, hours }) => (
          <TouchableOpacity
            key={label}
            style={[styles.row, { borderBottomColor: colors.borderSubtle }]}
            onPress={() => onSelect(hours)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Disable Privacy Mode for ${label}`}
          >
            <View style={styles.rowLeft}>
              <Icon color={colors.textSecondary} size={18} strokeWidth={2} />
              <AppText style={[styles.rowText, { color: colors.text }]}>{label}</AppText>
            </View>
            <ChevronRight color={colors.textMuted} size={16} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity onPress={onClose} style={styles.cancel} activeOpacity={0.7}>
          <AppText style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</AppText>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    minHeight: 52,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  rowText: { fontSize: FontSize.body, fontFamily: 'Inter-Medium' },
  cancel: { alignItems: 'center', paddingVertical: 18, marginTop: 4 },
  cancelText: { fontSize: FontSize.body, fontFamily: 'Inter-Medium' },
});
