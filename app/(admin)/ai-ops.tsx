import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import {
  Bot, CircleCheck as CheckCircle2, CircleX as XCircle, TriangleAlert as AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp, Play, CircleDot as Circle, ShieldCheck,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

interface AiIssue {
  id: string;
  title: string;
  body: string | null;
  severity: 'low' | 'medium' | 'high';
  source_loop_type: string | null;
  created_at: string;
  status: 'open' | 'resolved' | 'dismissed' | 'pending_review';
}

interface LoopSetting {
  loop_type: string;
  enabled: boolean;
  last_triggered_at: string | null;
}

interface DailyBrief {
  headline: string | null;
  narrative: string | null;
  top_issue: string | null;
  stats: Record<string, number | string>;
}

interface SignupHealth {
  all_passed: boolean;
  checks: Record<string, { pass: boolean; detail: string }>;
}

function severityColor(severity: string) {
  if (severity === 'high') return '#FF5A3D';
  if (severity === 'medium') return '#FFB347';
  return '#33D17A';
}

function formatRelative(iso: string | null) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

function LoopRow({
  label, loopType, setting, onRun, running,
}: {
  label: string;
  loopType: string;
  setting: LoopSetting | undefined;
  onRun: (type: string) => void;
  running: boolean;
}) {
  const { colors } = useTheme();
  const lastRun = setting?.last_triggered_at ?? null;
  return (
    <View style={styles.loopRow}>
      <View style={{ flex: 1 }}>
        <AppText style={[styles.loopLabel, { color: colors.text }]}>{label}</AppText>
        <AppText style={[styles.loopSub, { color: colors.textMuted }]}>
          Last run: {formatRelative(lastRun)}
        </AppText>
      </View>
      <TouchableOpacity
        style={[styles.runBtn, { borderColor: 'rgba(74,144,226,0.35)', backgroundColor: 'rgba(74,144,226,0.08)' }]}
        onPress={() => onRun(loopType)}
        disabled={running}
        activeOpacity={0.8}
      >
        {running
          ? <ActivityIndicator size="small" color="#4A90E2" />
          : <Play color="#4A90E2" size={13} strokeWidth={2.2} fill="#4A90E2" />
        }
        <AppText style={[styles.runBtnText, { color: '#4A90E2' }]}>Run</AppText>
      </TouchableOpacity>
    </View>
  );
}

export default function AiOpsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const mountedRef = useRef(true);

  const [openIssues, setOpenIssues] = useState<AiIssue[]>([]);
  const [pendingIssues, setPendingIssues] = useState<AiIssue[]>([]);
  const [settings, setSettings] = useState<LoopSetting[]>([]);
  const [signupHealth, setSignupHealth] = useState<SignupHealth | null>(null);
  const [dailyBrief, setDailyBrief] = useState<DailyBrief | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [runningLoop, setRunningLoop] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSuccess, setRunSuccess] = useState<string | null>(null);

  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
  }, []));

  const loadData = async () => {
    if (!mountedRef.current) return;
    setLoadingData(true);
    setError(null);
    try {
      const [
        { data: issues },
        { data: pending },
        { data: loopSettings },
        { data: alertRow },
        { data: lastBriefRun },
      ] = await Promise.all([
        supabase
          .from('ai_issues')
          .select('id, title, body, severity, source_loop_type, created_at, status')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('ai_issues')
          .select('id, title, body, severity, source_loop_type, created_at, status')
          .eq('status', 'pending_review')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('ai_loop_settings').select('loop_type, enabled, last_triggered_at'),
        supabase.from('app_config').select('value').eq('key', 'aiops_signup_alert').maybeSingle(),
        supabase
          .from('ai_loop_runs')
          .select('findings, completed_at')
          .eq('loop_type', 'daily_brief')
          .eq('status', 'success')
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!mountedRef.current) return;
      setOpenIssues((issues ?? []) as AiIssue[]);
      setPendingIssues((pending ?? []) as AiIssue[]);
      setSettings((loopSettings ?? []) as LoopSetting[]);

      if (alertRow?.value) {
        setSignupHealth({ all_passed: false, checks: {} });
      } else {
        // Check the last successful signup monitor run
        const { data: lastMonitor } = await supabase
          .from('ai_loop_runs')
          .select('findings, completed_at')
          .eq('loop_type', 'signup_monitor')
          .eq('status', 'success')
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastMonitor?.findings) {
          const f = lastMonitor.findings as any;
          setSignupHealth({ all_passed: f.all_passed ?? true, checks: f.checks ?? {} });
        }
      }

      if (lastBriefRun?.findings) {
        const f = lastBriefRun.findings as any;
        setDailyBrief({
          headline: f.headline ?? null,
          narrative: f.narrative ?? null,
          top_issue: f.top_issue ?? null,
          stats: f.stats ?? {},
        });
      }
    } catch (e: any) {
      if (mountedRef.current) setError(e?.message ?? 'Failed to load');
    } finally {
      if (mountedRef.current) setLoadingData(false);
    }
  };

  const runLoop = async (loopType: string) => {
    setRunningLoop(loopType);
    setRunError(null);
    setRunSuccess(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const fnSlug =
        loopType === 'signup_monitor' ? 'ai-ops-signup-monitor' :
        loopType === 'bug_analyzer' ? 'ai-ops-bug-analyzer' :
        loopType === 'security_anomaly_monitor' ? 'ai-ops-security-monitor' :
        'ai-ops-daily-brief';

      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnSlug}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          Apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({}),
      });

      const json = await res.json() as any;
      if (!res.ok || json?.error) throw new Error(json?.error ?? `HTTP ${res.status}`);

      const label =
        loopType === 'signup_monitor' ? 'Signup monitor complete' :
        loopType === 'bug_analyzer' ? `Bug analyzer complete — ${json.issues_created ?? 0} new issue(s)` :
        loopType === 'security_anomaly_monitor' ? `Security monitor complete — ${json.issues_created ?? 0} new issue(s)` :
        'Daily brief generated';
      setRunSuccess(label);
      await loadData();
    } catch (e: any) {
      if (mountedRef.current) setRunError(e?.message ?? 'Run failed');
    } finally {
      if (mountedRef.current) setRunningLoop(null);
    }
  };

  const resolveIssue = async (id: string, newStatus: 'resolved' | 'dismissed') => {
    setResolvingId(id);
    try {
      const { error } = await supabase.from('ai_issues').update({
        status: newStatus,
        resolved_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      if (mountedRef.current) {
        setOpenIssues(prev => prev.filter(i => i.id !== id));
        setPendingIssues(prev => prev.filter(i => i.id !== id));
      }
    } catch (e: any) {
      if (mountedRef.current) setRunError(e?.message ?? 'Failed to resolve issue');
    } finally {
      if (mountedRef.current) setResolvingId(null);
    }
  };

  const approveIssue = async (id: string) => {
    setApprovingId(id);
    try {
      const { data: approved, error } = await supabase.from('ai_issues').update({
        status: 'open',
      }).eq('id', id).eq('status', 'pending_review').select('id, title, body, severity, source_loop_type, created_at, status').maybeSingle();
      if (error) throw error;
      if (mountedRef.current) {
        setPendingIssues(prev => prev.filter(i => i.id !== id));
        if (approved) {
          setOpenIssues(prev => [approved as AiIssue, ...prev]);
        }
      }
    } catch (e: any) {
      if (mountedRef.current) setRunError(e?.message ?? 'Failed to approve issue');
    } finally {
      if (mountedRef.current) setApprovingId(null);
    }
  };

  const getSetting = (type: string) => settings.find(s => s.loop_type === type);

  const healthPassed = signupHealth?.all_passed ?? null;
  const failedChecks = signupHealth
    ? Object.entries(signupHealth.checks).filter(([, v]) => !v.pass)
    : [];

  return (
    <AppShell scrollable={false} noTopPadding>
      <ScreenHeader
        title="AI Ops"
        onBack={() => router.back()}
        rightSlot={
          <TouchableOpacity onPress={loadData} disabled={loadingData} activeOpacity={0.7}>
            <RefreshCw
              color={loadingData ? colors.textMuted : colors.textSecondary}
              size={18}
              strokeWidth={2}
            />
          </TouchableOpacity>
        }
      />

      {loadingData && openIssues.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Error banner */}
          {error ? (
            <View style={[styles.alertBanner, { backgroundColor: 'rgba(255,90,61,0.10)', borderColor: 'rgba(255,90,61,0.30)' }]}>
              <AlertTriangle color="#FF5A3D" size={15} strokeWidth={2.2} />
              <AppText style={[styles.alertText, { color: '#FF5A3D' }]}>{error}</AppText>
            </View>
          ) : null}

          {/* Run feedback */}
          {runError ? (
            <View style={[styles.alertBanner, { backgroundColor: 'rgba(255,90,61,0.10)', borderColor: 'rgba(255,90,61,0.30)' }]}>
              <AlertTriangle color="#FF5A3D" size={15} strokeWidth={2.2} />
              <AppText style={[styles.alertText, { color: '#FF5A3D' }]}>{runError}</AppText>
            </View>
          ) : null}
          {runSuccess ? (
            <View style={[styles.alertBanner, { backgroundColor: 'rgba(51,209,122,0.10)', borderColor: 'rgba(51,209,122,0.30)' }]}>
              <CheckCircle2 color="#33D17A" size={15} strokeWidth={2.2} />
              <AppText style={[styles.alertText, { color: '#33D17A' }]}>{runSuccess}</AppText>
            </View>
          ) : null}

          {/* ── Section: System Health ── */}
          <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>SYSTEM HEALTH</AppText>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <View style={styles.healthRow}>
              {healthPassed === null ? (
                <Circle color={colors.textMuted} size={16} strokeWidth={2} />
              ) : healthPassed ? (
                <CheckCircle2 color="#33D17A" size={16} strokeWidth={2.2} />
              ) : (
                <XCircle color="#FF5A3D" size={16} strokeWidth={2.2} />
              )}
              <View style={{ flex: 1 }}>
                <AppText style={[styles.healthLabel, { color: colors.text }]}>
                  Signup Pipeline
                </AppText>
                <AppText style={[styles.healthSub, { color: healthPassed === false ? '#FF5A3D' : colors.textMuted }]}>
                  {healthPassed === null
                    ? 'Not yet checked — run signup monitor below'
                    : healthPassed
                      ? 'All checks passing'
                      : `${failedChecks.length} check${failedChecks.length !== 1 ? 's' : ''} failing`}
                </AppText>
                {failedChecks.map(([key, val]) => (
                  <AppText key={key} style={[styles.healthDetail, { color: '#FF5A3D' }]}>
                    {key}: {val.detail}
                  </AppText>
                ))}
              </View>
            </View>
          </View>

          {/* ── Section: Daily Brief ── */}
          <AppText style={[styles.sectionLabel, { color: colors.textMuted, marginTop: Spacing.lg }]}>DAILY BRIEF</AppText>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            {dailyBrief ? (
              <>
                {dailyBrief.headline ? (
                  <AppText style={[styles.briefHeadline, { color: colors.text }]}>
                    {dailyBrief.headline}
                  </AppText>
                ) : null}
                {dailyBrief.narrative ? (
                  <AppText style={[styles.briefNarrative, { color: colors.textSecondary }]}>
                    {dailyBrief.narrative}
                  </AppText>
                ) : null}
                {dailyBrief.top_issue ? (
                  <View style={[styles.topIssuePill, { backgroundColor: 'rgba(255,179,71,0.12)', borderColor: 'rgba(255,179,71,0.30)' }]}>
                    <AlertTriangle color="#FFB347" size={13} strokeWidth={2.2} />
                    <AppText style={[styles.topIssueText, { color: '#FFB347' }]}>
                      {dailyBrief.top_issue}
                    </AppText>
                  </View>
                ) : null}
                {/* Stats grid */}
                {dailyBrief.stats && Object.keys(dailyBrief.stats).length > 0 ? (
                  <View style={styles.statsGrid}>
                    {[
                      { key: 'new_users_24h', label: 'New Users' },
                      { key: 'interactions_24h', label: 'Interactions' },
                      { key: 'new_trials_24h', label: 'Trials' },
                      { key: 'new_paid_24h', label: 'Paid' },
                      { key: 'new_cancellations_24h', label: 'Cancels' },
                      { key: 'open_issues_count', label: 'Open Issues' },
                    ].map(({ key, label }) => {
                      const val = dailyBrief.stats[key];
                      if (val === undefined) return null;
                      return (
                        <View key={key} style={[styles.statChip, { backgroundColor: colors.bg1, borderColor: colors.borderSubtle }]}>
                          <AppText style={[styles.statChipNum, { color: colors.text }]}>{String(val)}</AppText>
                          <AppText style={[styles.statChipLabel, { color: colors.textMuted }]}>{label}</AppText>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </>
            ) : (
              <AppText style={[styles.emptyText, { color: colors.textMuted }]}>
                No brief yet — run Daily Brief below to generate one.
              </AppText>
            )}
          </View>

          {/* ── Section: Pending Review ── */}
          {pendingIssues.length > 0 ? (
            <>
              <AppText style={[styles.sectionLabel, { color: '#FFB347', marginTop: Spacing.lg }]}>
                PENDING REVIEW ({pendingIssues.length})
              </AppText>
              {pendingIssues.map(issue => {
                const isExpanded = expandedIssue === issue.id;
                const isApproving = approvingId === issue.id;
                const isResolving = resolvingId === issue.id;
                const sColor = severityColor(issue.severity);
                return (
                  <View key={issue.id} style={[styles.issueCard, { backgroundColor: colors.card, borderColor: 'rgba(255,179,71,0.35)' }]}>
                    <TouchableOpacity
                      onPress={() => setExpandedIssue(isExpanded ? null : issue.id)}
                      activeOpacity={0.85}
                      style={styles.issueHeader}
                    >
                      <View style={[styles.severityDot, { backgroundColor: sColor }]} />
                      <View style={{ flex: 1 }}>
                        <AppText style={[styles.issueTitle, { color: colors.text }]} numberOfLines={isExpanded ? 0 : 2}>
                          {issue.title}
                        </AppText>
                        <AppText style={[styles.issueMeta, { color: colors.textMuted }]}>
                          {issue.severity.toUpperCase()} · {formatRelative(issue.created_at)}
                          {issue.source_loop_type ? ` · ${issue.source_loop_type.replace('_', ' ')}` : ''}
                        </AppText>
                      </View>
                      {isExpanded
                        ? <ChevronUp color={colors.textMuted} size={16} />
                        : <ChevronDown color={colors.textMuted} size={16} />
                      }
                    </TouchableOpacity>

                    {isExpanded && (
                      <>
                        {issue.body ? (
                          <AppText style={[styles.issueBody, { color: colors.textSecondary }]}>
                            {issue.body}
                          </AppText>
                        ) : null}
                        <View style={styles.issueActions}>
                          <TouchableOpacity
                            style={[styles.issueActionBtn, { borderColor: 'rgba(74,144,226,0.35)', backgroundColor: 'rgba(74,144,226,0.08)' }]}
                            onPress={() => approveIssue(issue.id)}
                            disabled={isApproving}
                            activeOpacity={0.8}
                          >
                            {isApproving
                              ? <ActivityIndicator size="small" color="#4A90E2" />
                              : <ShieldCheck color="#4A90E2" size={14} strokeWidth={2.2} />
                            }
                            <AppText style={[styles.issueActionText, { color: '#4A90E2' }]}>Approve</AppText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.issueActionBtn, { borderColor: colors.borderSubtle, backgroundColor: 'transparent' }]}
                            onPress={() => resolveIssue(issue.id, 'dismissed')}
                            disabled={isResolving}
                            activeOpacity={0.8}
                          >
                            <AppText style={[styles.issueActionText, { color: colors.textMuted }]}>Dismiss</AppText>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                );
              })}
            </>
          ) : null}

          {/* ── Section: Open Issues ── */}
          <AppText style={[styles.sectionLabel, { color: colors.textMuted, marginTop: Spacing.lg }]}>
            OPEN ISSUES {openIssues.length > 0 ? `(${openIssues.length})` : ''}
          </AppText>
          {openIssues.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <AppText style={[styles.emptyText, { color: colors.textMuted }]}>No open issues.</AppText>
            </View>
          ) : (
            openIssues.map(issue => {
              const isExpanded = expandedIssue === issue.id;
              const isResolving = resolvingId === issue.id;
              const sColor = severityColor(issue.severity);
              return (
                <View key={issue.id} style={[styles.issueCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <TouchableOpacity
                    onPress={() => setExpandedIssue(isExpanded ? null : issue.id)}
                    activeOpacity={0.85}
                    style={styles.issueHeader}
                  >
                    <View style={[styles.severityDot, { backgroundColor: sColor }]} />
                    <View style={{ flex: 1 }}>
                      <AppText style={[styles.issueTitle, { color: colors.text }]} numberOfLines={isExpanded ? 0 : 2}>
                        {issue.title}
                      </AppText>
                      <AppText style={[styles.issueMeta, { color: colors.textMuted }]}>
                        {issue.severity.toUpperCase()} · {formatRelative(issue.created_at)}
                        {issue.source_loop_type ? ` · ${issue.source_loop_type.replace('_', ' ')}` : ''}
                      </AppText>
                    </View>
                    {isExpanded
                      ? <ChevronUp color={colors.textMuted} size={16} />
                      : <ChevronDown color={colors.textMuted} size={16} />
                    }
                  </TouchableOpacity>

                  {isExpanded && (
                    <>
                      {issue.body ? (
                        <AppText style={[styles.issueBody, { color: colors.textSecondary }]}>
                          {issue.body}
                        </AppText>
                      ) : null}
                      <View style={styles.issueActions}>
                        <TouchableOpacity
                          style={[styles.issueActionBtn, { borderColor: 'rgba(51,209,122,0.35)', backgroundColor: 'rgba(51,209,122,0.08)' }]}
                          onPress={() => resolveIssue(issue.id, 'resolved')}
                          disabled={isResolving}
                          activeOpacity={0.8}
                        >
                          {isResolving
                            ? <ActivityIndicator size="small" color="#33D17A" />
                            : <CheckCircle2 color="#33D17A" size={14} strokeWidth={2.2} />
                          }
                          <AppText style={[styles.issueActionText, { color: '#33D17A' }]}>Resolve</AppText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.issueActionBtn, { borderColor: colors.borderSubtle, backgroundColor: 'transparent' }]}
                          onPress={() => resolveIssue(issue.id, 'dismissed')}
                          disabled={isResolving}
                          activeOpacity={0.8}
                        >
                          <AppText style={[styles.issueActionText, { color: colors.textMuted }]}>Dismiss</AppText>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              );
            })
          )}

          {/* ── Section: Loop Settings ── */}
          <AppText style={[styles.sectionLabel, { color: colors.textMuted, marginTop: Spacing.lg }]}>LOOPS</AppText>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle, gap: 0, padding: 0, overflow: 'hidden' }]}>
            {[
              { type: 'daily_brief', label: 'Daily Product Brief' },
              { type: 'signup_monitor', label: 'Signup Monitor' },
              { type: 'bug_analyzer', label: 'Bug Analyzer' },
              { type: 'security_anomaly_monitor', label: 'Security Anomaly Monitor' },
            ].map(({ type, label }, i) => (
              <React.Fragment key={type}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />}
                <LoopRow
                  label={label}
                  loopType={type}
                  setting={getSetting(type)}
                  onRun={runLoop}
                  running={runningLoop === type}
                />
              </React.Fragment>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  alertText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  healthRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  healthLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', marginBottom: 2 },
  healthSub: { fontSize: 12, fontFamily: 'Inter-Regular' },
  healthDetail: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  briefHeadline: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold', lineHeight: 22 },
  briefNarrative: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 20 },
  topIssuePill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  topIssueText: { flex: 1, fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 18 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statChip: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 64,
  },
  statChipNum: { fontSize: 18, fontFamily: 'Inter-Bold' },
  statChipLabel: { fontSize: 10, fontFamily: 'Inter-Medium', marginTop: 1 },
  emptyText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', paddingVertical: Spacing.sm },
  issueCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  issueHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: Spacing.card,
  },
  severityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  issueTitle: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', lineHeight: 20, marginBottom: 2 },
  issueMeta: { fontSize: 11, fontFamily: 'Inter-Regular' },
  issueBody: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    paddingHorizontal: Spacing.card,
    paddingBottom: Spacing.sm,
  },
  issueActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.card,
    paddingBottom: Spacing.card,
  },
  issueActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingVertical: 8,
  },
  issueActionText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },
  loopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.card,
  },
  loopLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', marginBottom: 2 },
  loopSub: { fontSize: 11, fontFamily: 'Inter-Regular' },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexShrink: 0,
    minWidth: 64,
    justifyContent: 'center',
  },
  runBtnText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },
  divider: { height: 1, marginHorizontal: Spacing.card },
});
