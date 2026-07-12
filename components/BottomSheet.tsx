import React from 'react';
import {
  View, Modal, TouchableOpacity, Pressable, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import AppText from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Radius, Spacing } from '@/constants/theme';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  scrollable?: boolean;
}

export default function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  scrollable = false,
}: BottomSheetProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const bg = isDark ? '#111018' : colors.bg3;

  const inner = (
    <View
      style={[styles.sheet, { backgroundColor: bg }]}
    >
      <View style={styles.handle} />

      <View style={styles.header}>
        <View style={styles.headerText}>
          {title && <AppText style={[styles.title, { color: colors.text }]}>{title}</AppText>}
          {subtitle && <AppText style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</AppText>}
        </View>
        <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: colors.borderSubtle }]}>
          <X color={colors.textSecondary} size={18} />
        </TouchableOpacity>
      </View>

      {scrollable ? (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ paddingBottom: insets.bottom + 20 }}>{children}</View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        {inner}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    maxHeight: '85%',
    flexShrink: 1,
  },
  scrollView: {
    flexShrink: 1,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerText: { flex: 1, gap: 4 },
  title: {
    fontSize: FontSize.h2,
    fontFamily: 'Inter-Bold',
  },
  subtitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
});
