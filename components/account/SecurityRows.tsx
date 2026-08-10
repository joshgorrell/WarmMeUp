import React, { useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity,
} from 'react-native';
import {
  Check, ChevronRight, ShieldOff, ScanFace, FingerprintPattern as Fingerprint,
} from 'lucide-react-native';
import AppText from '@/components/AppText';
import BottomSheet from '@/components/BottomSheet';
import { FontSize, Spacing, Radius } from '@/constants/theme';

export type UnlockMethod = 'none' | 'biometric';

const slm = StyleSheet.create({
  wrap: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, borderBottomWidth: 1 },
  label: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', marginBottom: 2 },
  sub: { fontSize: 11, fontFamily: 'Inter-Regular', marginBottom: Spacing.sm },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipSelected: { backgroundColor: 'rgba(255,46,138,0.08)' },
  chipDisabled: { opacity: 0.4 },
  chipLabel: { fontSize: 11, fontFamily: 'Inter-Medium', textAlign: 'center' },
  dropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
  },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  dropOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: Spacing.sm,
  },
  dropOptionLabel: { fontSize: FontSize.body, fontFamily: 'Inter-Medium' },
});

const LOCK_TIMEOUT_OPTIONS: { label: string; value: number }[] = [
  { label: 'Immediately', value: 0 },
  { label: '1 minute', value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '15 minutes', value: 900 },
  { label: '1 hour', value: 3600 },
  { label: 'Never', value: -1 },
];

export function RequireUnlockRow({
  current,
  bioAvailable,
  hasHardware,
  biometricLabel,
  colors,
  onSelect,
}: {
  current: UnlockMethod;
  bioAvailable: boolean;
  hasHardware: boolean;
  biometricLabel: string;
  colors: any;
  onSelect: (method: UnlockMethod) => void;
}) {
  const BiometricIcon = biometricLabel === 'Touch ID' ? Fingerprint : ScanFace;

  type Option = { key: UnlockMethod; label: string; icon: React.ReactNode; disabled?: boolean };
  const options: Option[] = [
    {
      key: 'none',
      label: 'Off',
      icon: <ShieldOff color={current === 'none' ? '#FF2E8A' : colors.textMuted} size={16} strokeWidth={1.8} />,
    },
    {
      key: 'biometric',
      label: biometricLabel,
      icon: <BiometricIcon color={hasHardware ? '#FF8A3D' : colors.textDisabled} size={16} strokeWidth={1.8} />,
      disabled: !hasHardware,
    },
  ];

  return (
    <View style={[slm.wrap, { borderBottomColor: colors.borderSubtle }]}>
      <AppText style={[slm.label, { color: colors.text }]}>App Lock</AppText>
      <AppText style={[slm.sub, { color: colors.textMuted }]}>Require biometrics to open Warm Me Up</AppText>
      <View style={slm.row}>
        {options.map((opt) => {
          const sel = current === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                slm.chip,
                sel && slm.chipSelected,
                opt.disabled && slm.chipDisabled,
                { borderColor: sel ? 'rgba(255,46,138,0.5)' : colors.borderSubtle },
              ]}
              onPress={() => !opt.disabled && onSelect(opt.key)}
              activeOpacity={opt.disabled ? 1 : 0.72}
              disabled={opt.disabled}
            >
              {opt.icon}
              <AppText style={[slm.chipLabel, { color: opt.disabled ? colors.textDisabled : sel ? '#fff' : colors.textSecondary }]}>
                {opt.label}
              </AppText>
              {!opt.disabled && !bioAvailable && opt.key === 'biometric' && (
                <AppText style={{ fontSize: 9, fontFamily: 'Inter-Regular', color: colors.textMuted, textAlign: 'center', marginTop: 1 }}>
                  Tap to set up
                </AppText>
              )}
              {sel && <Check color="#FF2E8A" size={10} strokeWidth={2.5} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function RequireUnlockAfterRow({
  current, colors, onSelect,
}: {
  current: number | null;
  colors: any;
  onSelect: (seconds: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const effectiveCurrent = current === null ? 0 : current;
  const selected = LOCK_TIMEOUT_OPTIONS.find(o => o.value === effectiveCurrent) ?? LOCK_TIMEOUT_OPTIONS[0];
  return (
    <>
      <TouchableOpacity
        style={[slm.dropRow, { borderBottomColor: colors.borderSubtle }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <AppText style={[slm.label, { color: colors.text }]}>Require Unlock After</AppText>
          <AppText style={[slm.sub, { color: colors.textMuted, marginBottom: 0 }]}>How long before the app re-locks</AppText>
        </View>
        <View style={slm.valueWrap}>
          <AppText style={[slm.value, { color: colors.textSecondary }]}>{selected.label}</AppText>
          <ChevronRight color={colors.textMuted} size={16} strokeWidth={2} />
        </View>
      </TouchableOpacity>
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Require Unlock After"
        subtitle="How long before the app re-locks"
      >
        {LOCK_TIMEOUT_OPTIONS.map((opt, i) => {
          const sel = effectiveCurrent === opt.value;
          const last = i === LOCK_TIMEOUT_OPTIONS.length - 1;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[slm.dropOption, !last && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }]}
              onPress={() => { onSelect(opt.value); setOpen(false); }}
              activeOpacity={0.7}
            >
              <AppText style={[slm.dropOptionLabel, { color: sel ? '#FF2E8A' : colors.text }]}>{opt.label}</AppText>
              {sel && <Check color="#FF2E8A" size={16} strokeWidth={2.5} />}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>
    </>
  );
}

export function VaultProtectionRow({
  isAdditional,
  bioAvailable,
  hasHardware,
  biometricLabel,
  colors,
  onSelect,
}: {
  isAdditional: boolean;
  bioAvailable: boolean;
  hasHardware: boolean;
  biometricLabel: string;
  colors: any;
  onSelect: (additional: boolean) => void;
}) {
  const BiometricIcon = biometricLabel === 'Touch ID' ? Fingerprint : ScanFace;

  type VaultOpt = { key: boolean; label: string; sub: string; icon: React.ReactNode; disabled?: boolean };
  const opts: VaultOpt[] = [
    {
      key: false,
      label: 'No',
      sub: 'No extra step for Vault',
      icon: <ShieldOff color={!isAdditional ? '#FF2E8A' : colors.textMuted} size={15} strokeWidth={1.8} />,
    },
    {
      key: true,
      label: biometricLabel,
      sub: 'Biometric step to open Vault',
      icon: <BiometricIcon color={hasHardware ? '#FF8A3D' : colors.textDisabled} size={15} strokeWidth={1.8} />,
      disabled: !hasHardware,
    },
  ];

  return (
    <View style={[slm.wrap, { borderBottomColor: colors.borderSubtle }]}>
      <AppText style={[slm.label, { color: colors.text }]}>Vault Protection</AppText>
      <AppText style={[slm.sub, { color: colors.textMuted }]}>Require biometrics each time you open the Vault</AppText>
      <View style={[slm.row, { gap: 10 }]}>
        {opts.map((opt) => {
          const sel = isAdditional === opt.key;
          return (
            <TouchableOpacity
              key={String(opt.key)}
              style={[
                slm.chip,
                sel && slm.chipSelected,
                opt.disabled && slm.chipDisabled,
                { borderColor: sel ? 'rgba(255,46,138,0.5)' : colors.borderSubtle, flex: 1, paddingVertical: 12, gap: 5 },
              ]}
              onPress={() => !opt.disabled && onSelect(opt.key)}
              activeOpacity={opt.disabled ? 1 : 0.72}
              disabled={opt.disabled}
            >
              {opt.icon}
              <AppText style={[slm.chipLabel, { color: opt.disabled ? colors.textDisabled : sel ? '#fff' : colors.textSecondary, fontSize: 12 }]}>{opt.label}</AppText>
              <AppText style={[slm.chipLabel, { color: sel ? 'rgba(255,255,255,0.55)' : colors.textMuted, fontSize: 10 }]}>{opt.sub}</AppText>
              {sel && <Check color="#FF2E8A" size={10} strokeWidth={2.5} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Chat font size selector ──────────────────────────────────────
const CHAT_FONT_OPTIONS: { label: string; value: number }[] = [
  { label: 'Small', value: 0.85 },
  { label: 'Standard', value: 1.0 },
  { label: 'Large', value: 1.2 },
];

const cfs = StyleSheet.create({
  wrap: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.md },
  label: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', marginBottom: 2 },
  sub: { fontSize: 11, fontFamily: 'Inter-Regular', marginBottom: Spacing.sm },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 9,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipSelected: { backgroundColor: 'rgba(255,90,61,0.08)' },
  chipLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
});

export function ChatFontSizeRow({ current, colors, onSelect }: { current: number; colors: any; onSelect: (scale: number) => void }) {
  return (
    <View style={cfs.wrap}>
      <AppText style={[cfs.label, { color: colors.text }]}>Chat Text Size</AppText>
      <AppText style={[cfs.sub, { color: colors.textMuted }]}>How large message text appears in Chat</AppText>
      <View style={cfs.row}>
        {CHAT_FONT_OPTIONS.map((opt) => {
          const sel = Math.abs(current - opt.value) < 0.01;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[cfs.chip, sel && cfs.chipSelected, { borderColor: sel ? 'rgba(255,90,61,0.5)' : colors.borderSubtle }]}
              onPress={() => onSelect(opt.value)}
              activeOpacity={0.72}
            >
              <AppText style={[cfs.chipLabel, { color: sel ? '#fff' : colors.textSecondary }]}>{opt.label}</AppText>
              {sel && <Check color="#FF5A3D" size={12} strokeWidth={2.5} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
