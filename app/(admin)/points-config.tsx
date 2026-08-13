import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useRouter } from 'expo-router';
import { Check, Save } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { invalidatePointConfigCache } from '@/lib/points';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import { PointConfig } from '@/lib/types';

const SECTIONS = [
  {
    title: 'DARE',
    keys: ['dare_accept', 'dare_complete'],
  },
  {
    title: 'DICE',
    keys: ['dice_accept', 'dice_complete'],
  },
  {
    title: 'ASK',
    keys: ['ask_sent', 'ask_replied'],
  },
  {
    title: 'WISH',
    keys: ['wish_sent', 'wish_fulfilled'],
  },
  {
    title: 'CHAT',
    keys: ['chat_message', 'chat_media'],
  },
  {
    title: 'VAULT',
    keys: ['vault_upload'],
  },
];

export default function PointsConfigAdmin() {
  const router = useRouter();
  const { colors } = useTheme();
  const [configs, setConfigs] = useState<PointConfig[]>([]);
  const [edited, setEdited] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.from('point_config').select('*').order('event_key');
      if (err) throw err;
      if (mountedRef.current) setConfigs(data ?? []);
    } catch (e: any) {
      if (mountedRef.current) setError(e?.message ?? 'Failed to load point config');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getValue = (key: string): number => {
    if (edited[key] !== undefined) return edited[key];
    return configs.find(c => c.event_key === key)?.points ?? 0;
  };

  const handleChange = (key: string, raw: string) => {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 0) {
      setEdited(prev => ({ ...prev, [key]: n }));
    } else if (raw === '') {
      setEdited(prev => ({ ...prev, [key]: 0 }));
    }
  };

  const handleSave = async (key: string) => {
    const pts = edited[key] ?? configs.find(c => c.event_key === key)?.points;
    if (pts === undefined) return;
    setSaving(key);
    setSaveError(null);
    try {
      const { error: err } = await supabase.from('point_config').update({ points: pts, updated_at: new Date().toISOString() }).eq('event_key', key);
      if (err) throw err;
      invalidatePointConfigCache();
      if (mountedRef.current) {
        setConfigs(prev => prev.map(c => c.event_key === key ? { ...c, points: pts! } : c));
        setEdited(prev => { const n = { ...prev }; delete n[key]; return n; });
        setSaved(key);
        setTimeout(() => { if (mountedRef.current) setSaved(null); }, 1800);
      }
    } catch (e: any) {
      if (mountedRef.current) setSaveError(e?.message ?? 'Failed to save');
    } finally {
      if (mountedRef.current) setSaving(null);
    }
  };

  const isDirty = (key: string) => edited[key] !== undefined;

  return (
    <AppShell scrollable={false} noTopPadding>
      <ScreenHeader title="Points Config" onBack={() => router.back()} />
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#FFB347" />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {error && (
            <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,90,90,0.10)', borderColor: 'rgba(255,90,90,0.30)' }]}>
              <AppText style={[styles.errorText, { color: colors.danger }]}>{error}</AppText>
            </View>
          )}
          {saveError && (
            <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,90,90,0.10)', borderColor: 'rgba(255,90,90,0.30)' }]}>
              <AppText style={[styles.errorText, { color: colors.danger }]}>{saveError}</AppText>
            </View>
          )}
          <View style={[styles.noticeBanner, { backgroundColor: 'rgba(255,179,71,0.08)', borderColor: 'rgba(255,179,71,0.25)' }]}>
            <AppText style={[styles.noticeText, { color: colors.textSecondary }]}>
              Changes apply to all new point events immediately. Existing earned points are not affected.
            </AppText>
          </View>

          {SECTIONS.map(section => (
            <View key={section.title} style={styles.section}>
              <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>{section.title}</AppText>
              <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                {section.keys.map((key, idx) => {
                  const cfg = configs.find(c => c.event_key === key);
                  if (!cfg) return null;
                  const dirty = isDirty(key);
                  const isSaving = saving === key;
                  const isSaved = saved === key;
                  return (
                    <View
                      key={key}
                      style={[
                        styles.configRow,
                        idx < section.keys.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <AppText style={[styles.configLabel, { color: colors.text }]}>{cfg.label}</AppText>
                        <AppText style={[styles.configKey, { color: colors.textMuted }]}>{key}</AppText>
                      </View>
                      <View style={styles.inputWrap}>
                        <AppTextInput
                          style={[
                            styles.ptsInput,
                            {
                              color: colors.text,
                              backgroundColor: dirty ? 'rgba(255,179,71,0.08)' : colors.bg2 ?? 'rgba(255,255,255,0.06)',
                              borderColor: dirty ? 'rgba(255,179,71,0.45)' : colors.borderSubtle,
                            },
                          ]}
                          value={String(getValue(key))}
                          onChangeText={v => handleChange(key, v)}
                          keyboardType="number-pad"
                          maxLength={4}
                          selectTextOnFocus
                        />
                        <AppText style={[styles.ptsLabel, { color: colors.textMuted }]}>pts</AppText>
                      </View>
                      {dirty && (
                        <TouchableOpacity
                          style={[styles.saveBtn, { backgroundColor: 'rgba(255,179,71,0.15)', borderColor: 'rgba(255,179,71,0.45)' }]}
                          onPress={() => handleSave(key)}
                          disabled={isSaving}
                          activeOpacity={0.8}
                        >
                          {isSaving
                            ? <ActivityIndicator color="#FFB347" size="small" />
                            : <Save color="#FFB347" size={16} strokeWidth={2} />
                          }
                        </TouchableOpacity>
                      )}
                      {isSaved && !dirty && (
                        <View style={[styles.savedIndicator, { backgroundColor: 'rgba(51,209,122,0.15)', borderColor: 'rgba(51,209,122,0.40)' }]}>
                          <Check color="#33D17A" size={16} strokeWidth={2.5} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
        </KeyboardAvoidingView>
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 60 },
  errorBanner: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm, gap: 4 },
  errorText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  noticeBanner: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.lg, marginTop: Spacing.sm },
  noticeText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 20, textAlign: 'center' },
  section: { marginBottom: Spacing.lg },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2, marginBottom: Spacing.sm },
  sectionCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  configRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  configLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  configKey: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ptsInput: {
    width: 64, height: 40, borderRadius: Radius.md, borderWidth: 1,
    textAlign: 'center', fontSize: FontSize.body, fontFamily: 'Inter-Bold',
    paddingHorizontal: 8,
  },
  ptsLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', width: 24 },
  saveBtn: {
    width: 44, height: 44, borderRadius: Radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  savedIndicator: {
    width: 44, height: 44, borderRadius: Radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
