import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Mail, RefreshCw, Check } from 'lucide-react-native';
import AppText from '@/components/AppText';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import Toggle from '@/components/Toggle';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';

interface FeedbackEntry {
  id: string;
  user_email: string | null;
  content: string;
  created_at: string;
}

export default function FeedbackAdminScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [enabled, setEnabled] = useState(false);
  const [enabledLoading, setEnabledLoading] = useState(true);
  const [emails, setEmails] = useState('');
  const [emailsLoading, setEmailsLoading] = useState(true);
  const [savingEmails, setSavingEmails] = useState(false);
  const [emailsSaved, setEmailsSaved] = useState(false);

  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const [{ data: enData }, { data: emData }] = await Promise.all([
        supabase.from('app_config').select('value').eq('key', 'feedback_enabled').maybeSingle(),
        supabase.from('app_config').select('value').eq('key', 'feedback_emails').maybeSingle(),
      ]);
      if (mountedRef.current) {
        setEnabled(enData?.value === true);
        setEnabledLoading(false);
        const arr = Array.isArray(emData?.value) ? (emData!.value as string[]) : [];
        setEmails(arr.join(', '));
        setEmailsLoading(false);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load config');
        setEnabledLoading(false);
        setEmailsLoading(false);
      }
    } finally {
      if (mountedRef.current) {
        setEnabledLoading(false);
        setEmailsLoading(false);
      }
    }
  }, []);

  const loadFeedback = useCallback(async () => {
    try {
      if (mountedRef.current) {
        setFeedbackLoading(true);
        setError(null);
      }
      const { data, error: err } = await supabase
        .from('user_feedback')
        .select('id, user_email, content, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!mountedRef.current) return;
      if (err) {
        setError(err.message);
      } else {
        setFeedback(data ?? []);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load feedback');
      }
    } finally {
      if (mountedRef.current) {
        setFeedbackLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadFeedback();
  }, [loadConfig, loadFeedback]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadConfig(), loadFeedback()]);
    setRefreshing(false);
  };

  const toggleEnabled = async (next: boolean) => {
    const prev = enabled;
    if (mountedRef.current) setEnabled(next);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase
        .from('app_config')
        .update({ value: next, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
        .eq('key', 'feedback_enabled');
      if (err) throw err;
    } catch (e) {
      if (mountedRef.current) {
        setEnabled(prev);
        setError(e instanceof Error ? e.message : 'Failed to toggle feedback');
      }
    }
  };

  const saveEmails = async () => {
    try {
      if (mountedRef.current) {
        setSavingEmails(true);
        setEmailsSaved(false);
      }
      const parsed = emails
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e.includes('@') && e.length > 3);
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase
        .from('app_config')
        .update({ value: parsed, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
        .eq('key', 'feedback_emails');
      if (!mountedRef.current) return;
      if (err) {
        setError(err.message);
      } else {
        setEmails(parsed.join(', '));
        setEmailsSaved(true);
        setTimeout(() => { if (mountedRef.current) setEmailsSaved(false); }, 2500);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to save emails');
      }
    } finally {
      if (mountedRef.current) {
        setSavingEmails(false);
      }
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <AppShell scrollable={false} noTopPadding>
      <ScreenHeader title="Feedback" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
        }
      >
        {/* Configuration section */}
        <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>CONFIGURATION</AppText>

        <View style={[styles.configCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
          {/* Enable/disable toggle */}
          <View style={styles.configRow}>
            <View style={{ flex: 1 }}>
              <AppText style={[styles.configLabel, { color: colors.text }]}>Feedback Feature</AppText>
              <AppText style={[styles.configSub, { color: colors.textMuted }]}>
                Show a "Send Feedback" option in user Settings
              </AppText>
            </View>
            {enabledLoading ? (
              <ActivityIndicator color={colors.textMuted} size="small" />
            ) : (
              <Toggle value={enabled} onChange={toggleEnabled} />
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Email recipients */}
          <View style={styles.configRow}>
            <View style={{ flex: 1 }}>
              <AppText style={[styles.configLabel, { color: colors.text }]}>Notification Emails</AppText>
              <AppText style={[styles.configSub, { color: colors.textMuted }]}>
                Comma-separated addresses that receive feedback submissions
              </AppText>
            </View>
          </View>
          {emailsLoading ? (
            <ActivityIndicator color={colors.textMuted} size="small" style={styles.emailLoading} />
          ) : (
            <>
              <TextInput
                style={[styles.emailInput, { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: colors.bg2 }]}
                value={emails}
                onChangeText={setEmails}
                placeholder="admin@example.com, support@example.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                multiline
              />
              <TouchableOpacity
                style={[styles.saveBtn, { opacity: savingEmails ? 0.5 : 1 }]}
                onPress={saveEmails}
                disabled={savingEmails}
                activeOpacity={0.85}
              >
                {savingEmails ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : emailsSaved ? (
                  <View style={styles.saveBtnInner}>
                    <Check color="#fff" size={15} strokeWidth={2.5} />
                    <AppText style={styles.saveBtnText}>Saved</AppText>
                  </View>
                ) : (
                  <AppText style={styles.saveBtnText}>Save Emails</AppText>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Feedback inbox */}
        <AppText style={[styles.sectionLabel, { color: colors.textMuted, marginTop: Spacing.lg }]}>
          FEEDBACK INBOX {feedback.length > 0 ? `(${feedback.length})` : ''}
        </AppText>

        {error && (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,60,60,0.08)', borderColor: 'rgba(255,60,60,0.25)' }]}>
            <AppText style={[styles.errorText, { color: colors.danger }]}>{error}</AppText>
          </View>
        )}

        {feedbackLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : feedback.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Mail color={colors.textMuted} size={32} strokeWidth={1.5} />
            <AppText style={[styles.emptyText, { color: colors.textMuted }]}>
              No feedback submitted yet.
            </AppText>
          </View>
        ) : (
          <View style={styles.feedbackList}>
            {feedback.map((item) => (
              <View
                key={item.id}
                style={[styles.feedbackCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}
              >
                <View style={styles.feedbackHeader}>
                  <AppText style={[styles.feedbackEmail, { color: colors.text }]} numberOfLines={1}>
                    {item.user_email ?? 'Unknown user'}
                  </AppText>
                  <AppText style={[styles.feedbackDate, { color: colors.textMuted }]}>
                    {formatDate(item.created_at)}
                  </AppText>
                </View>
                <AppText style={[styles.feedbackContent, { color: colors.textSecondary }]}>
                  {item.content}
                </AppText>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  configCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
    gap: Spacing.sm,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  configLabel: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  configSub: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    lineHeight: 16,
  },
  divider: {
    height: 1,
    marginVertical: 2,
  },
  emailLoading: {
    paddingVertical: Spacing.md,
  alignSelf: 'center',
  },
  emailInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    minHeight: 48,
    lineHeight: 22,
  },
  saveBtn: {
    borderRadius: Radius.pill,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    marginTop: 4,
  },
  saveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Bold',
  },
  errorBanner: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  feedbackList: {
    gap: Spacing.sm,
  },
  feedbackCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
    gap: Spacing.sm,
  },
  feedbackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  feedbackEmail: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    flex: 1,
  },
  feedbackDate: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    flexShrink: 0,
  },
  feedbackContent: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 21,
  },
});
