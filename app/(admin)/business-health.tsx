import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import {
  RefreshCw, ShieldCheck, TrendingUp, TrendingDown, Users, Heart,
  DollarSign, Repeat, Target, Activity, TriangleAlert as AlertTriangle,
  BarChart3, Flame, Eye, Zap, MessageCircle, Gift, Dice5, Sparkles,
} from 'lucide-react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

type RangeKey = 'current_month' | 'previous_month' | 'last_30d' | 'last_90d' | 'lifetime';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'current_month', label: 'This Month' },
  { key: 'previous_month', label: 'Last Month' },
  { key: 'last_30d', label: 'Last 30 Days' },
  { key: 'last_90d', label: 'Last 90 Days' },
  { key: 'lifetime', label: 'Lifetime' },
];

interface BusinessHealthData {
  range: string;
  payingCouples: number;
  activeCouplesWeek: number;
  activeCouplesMonth: number;
  totalUsers: number;
  totalPairedCouples: number;
  mrr: number;
  arr: number;
  mrrGrowth: number;
  prevMrr: number;
  newPayingCouples: number;
  trialConversionRate: number;
  trialsStarted: number;
  trialsConverted: number;
  monthlyChurn: number;
  annualChurn: number;
  cancellations: number;
  arppu: number;
  ltv: number;
  coupleActivationRate: number;
  inviteAcceptanceRate: number;
  monthlyHistory: Array<{
    month: string;
    mrr: number;
    payingCouples: number;
    newPaying: number;
    cancellations: number;
    trialsStarted: number;
    trialsConverted: number;
  }>;
  funnel: {
    signups: number;
    partnerInvited: number;
    partnerJoined: number;
    coupleActivated: number;
    trialStarted: number;
    paid: number;
    retainedD30: number;
    retainedD90: number;
    cancelled: number;
  };
}

interface CohortData {
  cohorts: Array<{
    cohortMonth: string;
    cohortSize: number;
    retention: { [key: string]: { retained: number; rate: number } };
  }>;
  checkpoints: string[];
}

interface EngagementData {
  range: string;
  totals: {
    chatMessages: number;
    chatMedia: number;
    burnTimerUsed: number;
    daresSent: number;
    daresAccepted: number;
    daresCompleted: number;
    diceSent: number;
    diceAccepted: number;
    diceCompleted: number;
    asksSent: number;
    asksReplied: number;
    vaultUploads: number;
    wishesCreated: number;
    blurEnabled: number;
    stealthModeEnabled: number;
  };
  activeCouples: number;
  diversityBuckets: { "1": number; "2": number; "3": number; "4+": number };
  activeDaysBuckets: { "1": number; "2-3": number; "4+": number };
  privacyProtected: boolean;
}

interface ChurnData {
  range: string;
  summary: {
    totalCancellations: number;
    churnRate: number;
    payingAtStart: number;
    avgTenureDays: number;
    monthlyCount: number;
    annualCount: number;
    wouldReturnCount: number;
    topReasons: Array<{ reason: string; count: number }>;
  };
}

const EMPTY_HEALTH: BusinessHealthData = {
  range: 'current_month', payingCouples: 0, activeCouplesWeek: 0, activeCouplesMonth: 0,
  totalUsers: 0, totalPairedCouples: 0, mrr: 0, arr: 0, mrrGrowth: 0, prevMrr: 0,
  newPayingCouples: 0, trialConversionRate: 0, trialsStarted: 0, trialsConverted: 0,
  monthlyChurn: 0, annualChurn: 0, cancellations: 0, arppu: 0, ltv: 0,
  coupleActivationRate: 0, inviteAcceptanceRate: 0, monthlyHistory: [],
  funnel: { signups: 0, partnerInvited: 0, partnerJoined: 0, coupleActivated: 0, trialStarted: 0, paid: 0, retainedD30: 0, retainedD90: 0, cancelled: 0 },
};

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtDelta(curr: number, prev: number): { text: string; positive: boolean } {
  if (prev === 0) return { text: curr > 0 ? '+100%' : '—', positive: curr > 0 };
  const delta = ((curr - prev) / prev) * 100;
  return { text: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`, positive: delta >= 0 };
}

function retentionColor(rate: number): string {
  if (rate >= 70) return '#33D17A';
  if (rate >= 50) return '#FFB347';
  if (rate >= 30) return '#FF8A3D';
  return '#FF5A5F';
}

export default function BusinessHealthDashboard() {
  const router = useRouter();
  const { colors } = useTheme();
  const mountedRef = useRef(true);

  const [range, setRange] = useState<RangeKey>('current_month');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [health, setHealth] = useState<BusinessHealthData>(EMPTY_HEALTH);
  const [cohorts, setCohorts] = useState<CohortData | null>(null);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [churn, setChurn] = useState<ChurnData | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        Apikey: SUPABASE_ANON_KEY,
      };

      const fetchSafe = async (url: string): Promise<any | null> => {
        try {
          const res = await fetch(url, { headers });
          const json = await res.json();
          if (json?.error) throw new Error(json.error);
          return json;
        } catch {
          return null;
        }
      };

      const [healthJson, cohortsJson, engagementJson, churnJson] = await Promise.all([
        fetchSafe(`${SUPABASE_URL}/functions/v1/analytics-business-health?range=${range}`),
        fetchSafe(`${SUPABASE_URL}/functions/v1/analytics-cohorts`),
        fetchSafe(`${SUPABASE_URL}/functions/v1/analytics-engagement?range=${range === 'previous_month' ? 'last_30d' : range}`),
        fetchSafe(`${SUPABASE_URL}/functions/v1/analytics-churn?range=${range}`),
      ]);

      if (mountedRef.current) {
        setHealth(healthJson ?? EMPTY_HEALTH);
        setCohorts(cohortsJson ?? null);
        setEngagement(engagementJson ?? null);
        setChurn(churnJson ?? null);
      }
    } catch (e: any) {
      if (mountedRef.current) setError(e?.message ?? 'Failed to load business health data');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [range]);

  useFocusEffect(useCallback(() => {
    fetchAll();
  }, [fetchAll]));

  const statCard = (label: string, value: string | number, color: string, delta?: { text: string; positive: boolean }) => (
    <View key={label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
      <AppText style={[styles.statNum, { color }]}>{String(value)}</AppText>
      <AppText style={[styles.statLabel, { color: colors.textMuted }]}>{label}</AppText>
      {delta && (
        <View style={[styles.deltaRow, { backgroundColor: delta.positive ? 'rgba(51,209,122,0.10)' : 'rgba(255,90,95,0.10)' }]}>
          {delta.positive
            ? <TrendingUp color="#33D17A" size={10} strokeWidth={2.5} />
            : <TrendingDown color="#FF5A5F" size={10} strokeWidth={2.5} />}
          <AppText style={[styles.deltaText, { color: delta.positive ? '#33D17A' : '#FF5A5F' }]}>{delta.text}</AppText>
        </View>
      )}
    </View>
  );

  const sectionLabel = (text: string) => (
    <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>{text}</AppText>
  );

  const mrrDelta = fmtDelta(health.mrr, health.prevMrr);

  const funnelSteps = [
    { label: 'Signups', value: health.funnel.signups, icon: <Users color="#69A7FF" size={14} /> },
    { label: 'Partner Invited', value: health.funnel.partnerInvited, icon: <Heart color="#FF2E8A" size={14} /> },
    { label: 'Partner Joined', value: health.funnel.partnerJoined, icon: <Users color="#FF8A3D" size={14} /> },
    { label: 'Couple Activated', value: health.funnel.coupleActivated, icon: <Activity color="#33D17A" size={14} /> },
    { label: 'Trial Started', value: health.funnel.trialStarted, icon: <Zap color="#FFB347" size={14} /> },
    { label: 'Paid', value: health.funnel.paid, icon: <DollarSign color="#33D17A" size={14} /> },
    { label: 'Retained D30', value: health.funnel.retainedD30, icon: <Target color="#69A7FF" size={14} /> },
    { label: 'Retained D90', value: health.funnel.retainedD90, icon: <Target color="#4A90E2" size={14} /> },
    { label: 'Cancelled', value: health.funnel.cancelled, icon: <AlertTriangle color="#FF5A5F" size={14} /> },
  ];

  const engagementStats = engagement ? [
    { label: 'Chat Messages', value: engagement.totals.chatMessages, icon: <MessageCircle color="#69A7FF" size={14} /> },
    { label: 'Chat Media', value: engagement.totals.chatMedia, icon: <MessageCircle color="#69A7FF" size={14} /> },
    { label: 'Vault Uploads', value: engagement.totals.vaultUploads, icon: <ShieldCheck color="#33D17A" size={14} /> },
    { label: 'Dares Sent', value: engagement.totals.daresSent, icon: <Flame color="#FF5A3D" size={14} /> },
    { label: 'Dares Completed', value: engagement.totals.daresCompleted, icon: <Flame color="#33D17A" size={14} /> },
    { label: 'Dice Sent', value: engagement.totals.diceSent, icon: <Dice5 color="#FFB347" size={14} /> },
    { label: 'Dice Completed', value: engagement.totals.diceCompleted, icon: <Dice5 color="#33D17A" size={14} /> },
    { label: 'Wishes Created', value: engagement.totals.wishesCreated, icon: <Gift color="#FF2E8A" size={14} /> },
    { label: 'Burn Timer Used', value: engagement.totals.burnTimerUsed, icon: <Flame color="#FF8A3D" size={14} /> },
    { label: 'Blur Enabled', value: engagement.totals.blurEnabled, icon: <Eye color="#69A7FF" size={14} /> },
    { label: 'Stealth Mode', value: engagement.totals.stealthModeEnabled, icon: <Sparkles color="#FFB347" size={14} /> },
    { label: 'Active Couples', value: engagement.activeCouples, icon: <Heart color="#FF2E8A" size={14} /> },
  ] : [];

  return (
    <AppShell scrollable={false} noTopPadding>
      <ScreenHeader
        title="Business Health"
        onBack={() => router.back()}
        rightSlot={
          <TouchableOpacity onPress={() => fetchAll(true)} disabled={refreshing} activeOpacity={0.7}>
            <RefreshCw color={refreshing ? colors.textMuted : colors.textSecondary} size={18} strokeWidth={2} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(true)} tintColor={colors.textMuted} />}
      >
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,90,90,0.10)', borderColor: 'rgba(255,90,90,0.30)' }]}>
            <AlertTriangle color={colors.danger} size={15} strokeWidth={2.2} />
            <AppText style={[styles.errorText, { color: colors.danger }]}>{error}</AppText>
          </View>
        )}

        {/* Date Range Selector */}
        <View style={styles.rangeRow}>
          {RANGES.map(r => {
            const active = range === r.key;
            return (
              <TouchableOpacity
                key={r.key}
                style={[
                  styles.rangeChip,
                  {
                    backgroundColor: active ? 'rgba(51,209,122,0.12)' : colors.card,
                    borderColor: active ? 'rgba(51,209,122,0.40)' : colors.borderSubtle,
                  },
                ]}
                onPress={() => setRange(r.key)}
                activeOpacity={0.7}
              >
                <AppText style={[styles.rangeText, { color: active ? '#33D17A' : colors.textMuted }]}>
                  {r.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.textMuted} size="large" />
          </View>
        ) : (
          <>
            {/* EXECUTIVE SUMMARY */}
            {sectionLabel('EXECUTIVE SUMMARY')}
            <View style={styles.statGrid}>
              {statCard('Paying Couples', health.payingCouples, '#33D17A')}
              {statCard('Active (Week)', health.activeCouplesWeek, '#FF2E8A')}
              {statCard('Active (Month)', health.activeCouplesMonth, '#FF8A3D')}
              {statCard('Total Users', health.totalUsers, '#69A7FF')}
              {statCard('MRR', fmtMoney(health.mrr), '#33D17A', mrrDelta)}
              {statCard('ARR', fmtMoney(health.arr), '#33D17A')}
              {statCard('New Paying', health.newPayingCouples, '#FFB347')}
              {statCard('Trial Conv.', fmtPct(health.trialConversionRate), '#FF2E8A')}
              {statCard('Monthly Churn', fmtPct(health.monthlyChurn), '#FF5A5F')}
              {statCard('Annual Churn', fmtPct(health.annualChurn), '#FF5A5F')}
              {statCard('ARPPU', fmtMoney(health.arppu), '#69A7FF')}
              {statCard('Est. LTV', fmtMoney(health.ltv), '#33D17A')}
              {statCard('Activation Rate', fmtPct(health.coupleActivationRate), '#FF8A3D')}
              {statCard('Invite Accept', fmtPct(health.inviteAcceptanceRate), '#FF2E8A')}
            </View>

            {/* REVENUE & VALUATION TRENDS */}
            {sectionLabel('REVENUE & VALUATION TRENDS')}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              {health.monthlyHistory.length === 0 ? (
                <AppText style={[styles.emptyText, { color: colors.textMuted }]}>
                  No historical data yet. Trends will appear as subscription events accumulate.
                </AppText>
              ) : (
                <>
                  <AppText style={[styles.subLabel, { color: colors.textSecondary }]}>MRR by Month</AppText>
                  {health.monthlyHistory.slice(-12).map(({ month, mrr, payingCouples }) => {
                    const maxMrr = Math.max(...health.monthlyHistory.map(m => m.mrr), 1);
                    return (
                      <View key={month} style={styles.barRow}>
                        <AppText style={[styles.barLabel, { color: colors.textSecondary }]}>{month}</AppText>
                        <View style={[styles.barBg, { backgroundColor: colors.borderSubtle }]}>
                          <View style={[styles.barFill, {
                            width: `${Math.min(100, (mrr / maxMrr) * 100)}%`,
                            backgroundColor: '#33D17A',
                          }]} />
                        </View>
                        <AppText style={[styles.barCount, { color: colors.textMuted }]}>
                          {fmtMoney(mrr)} ({payingCouples})
                        </AppText>
                      </View>
                    );
                  })}

                  <AppText style={[styles.subLabel, { color: colors.textSecondary, marginTop: Spacing.md }]}>
                    New Paying Couples & Cancellations by Month
                  </AppText>
                  {health.monthlyHistory.slice(-12).map(({ month, newPaying, cancellations }) => (
                    <View key={month} style={styles.barRow}>
                      <AppText style={[styles.barLabel, { color: colors.textSecondary }]}>{month}</AppText>
                      <View style={styles.twinBarContainer}>
                        <View style={[styles.barBg, { backgroundColor: colors.borderSubtle, flex: 1 }]}>
                          <View style={[styles.barFill, {
                            width: `${Math.min(100, (newPaying / Math.max(...health.monthlyHistory.map(m => m.newPaying), 1)) * 100)}%`,
                            backgroundColor: '#33D17A',
                          }]} />
                        </View>
                        <View style={[styles.barBg, { backgroundColor: colors.borderSubtle, flex: 1 }]}>
                          <View style={[styles.barFill, {
                            width: `${Math.min(100, (cancellations / Math.max(...health.monthlyHistory.map(m => m.cancellations), 1)) * 100)}%`,
                            backgroundColor: '#FF5A5F',
                          }]} />
                        </View>
                      </View>
                      <AppText style={[styles.barCount, { color: colors.textMuted }]}>
                        +{newPaying} / -{cancellations}
                      </AppText>
                    </View>
                  ))}
                </>
              )}
            </View>

            {/* COUPLE RETENTION & COHORTS */}
            {sectionLabel('COUPLE RETENTION & COHORTS')}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              {!cohorts || cohorts.cohorts.length === 0 ? (
                <AppText style={[styles.emptyText, { color: colors.textMuted }]}>
                  No cohort data yet. Retention will appear as couples activate and usage accumulates.
                </AppText>
              ) : (
                <>
                  <View style={[styles.cohortHeaderRow, { borderColor: colors.borderSubtle }]}>
                    <AppText style={[styles.cohortHeaderCell, { color: colors.textMuted }]}>Cohort</AppText>
                    <AppText style={[styles.cohortHeaderCell, { color: colors.textMuted }]}>Size</AppText>
                    {cohorts.checkpoints.map(cp => (
                      <AppText key={cp} style={[styles.cohortHeaderCell, { color: colors.textMuted }]}>{cp}</AppText>
                    ))}
                  </View>
                  {cohorts.cohorts.map(cohort => (
                    <View key={cohort.cohortMonth} style={[styles.cohortRow, { borderColor: colors.borderSubtle }]}>
                      <AppText style={[styles.cohortCell, { color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }]}>
                        {cohort.cohortMonth}
                      </AppText>
                      <AppText style={[styles.cohortCell, { color: colors.textMuted }]}>{cohort.cohortSize}</AppText>
                      {cohorts.checkpoints.map(cp => {
                        const r = cohort.retention[cp];
                        const rate = r?.rate ?? 0;
                        return (
                          <View key={cp} style={[styles.cohortCellView, { backgroundColor: rate > 0 ? `${retentionColor(rate)}15` : 'transparent' }]}>
                            <AppText style={[styles.cohortRate, { color: retentionColor(rate) }]}>
                              {rate > 0 ? `${rate}%` : '—'}
                            </AppText>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </>
              )}
            </View>

            {/* ENGAGEMENT */}
            {sectionLabel('ENGAGEMENT')}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={styles.privacyBadge}>
                <ShieldCheck color="#33D17A" size={12} strokeWidth={2.2} />
                <AppText style={styles.privacyText}>Privacy Protected — counts only, no content accessed</AppText>
              </View>
              {engagementStats.length === 0 ? (
                <AppText style={[styles.emptyText, { color: colors.textMuted }]}>
                  No engagement data for this period yet.
                </AppText>
              ) : (
                <>
                  <View style={styles.engagementGrid}>
                    {engagementStats.map(({ label, value, icon }) => (
                      <View key={label} style={[styles.engagementItem, { backgroundColor: colors.borderSubtle }]}>
                        {icon}
                        <AppText style={[styles.engagementNum, { color: colors.text }]}>{value}</AppText>
                        <AppText style={[styles.engagementLabel, { color: colors.textMuted }]}>{label}</AppText>
                      </View>
                    ))}
                  </View>

                  <AppText style={[styles.subLabel, { color: colors.textSecondary, marginTop: Spacing.md }]}>Feature Diversity</AppText>
                  <View style={styles.distributionRow}>
                    {Object.entries(engagement?.diversityBuckets || {}).map(([key, count]) => (
                      <View key={key} style={[styles.distItem, { backgroundColor: colors.borderSubtle }]}>
                        <AppText style={[styles.distNum, { color: colors.text }]}>{count}</AppText>
                        <AppText style={[styles.distLabel, { color: colors.textMuted }]}>{key} feature{key === '4+' ? 's' : ''}</AppText>
                      </View>
                    ))}
                  </View>

                  <AppText style={[styles.subLabel, { color: colors.textSecondary, marginTop: Spacing.sm }]}>Active Days / Week</AppText>
                  <View style={styles.distributionRow}>
                    {Object.entries(engagement?.activeDaysBuckets || {}).map(([key, count]) => (
                      <View key={key} style={[styles.distItem, { backgroundColor: colors.borderSubtle }]}>
                        <AppText style={[styles.distNum, { color: colors.text }]}>{count}</AppText>
                        <AppText style={[styles.distLabel, { color: colors.textMuted }]}>{key} day{key === '4+' ? 's' : ''}</AppText>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* SUBSCRIPTION FUNNEL */}
            {sectionLabel('SUBSCRIPTION FUNNEL')}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              {funnelSteps.map((step, i) => {
                const prevValue = i > 0 ? funnelSteps[i - 1].value : 0;
                const convRate = prevValue > 0 ? Math.round((step.value / prevValue) * 1000) / 10 : 0;
                return (
                  <View key={step.label} style={styles.funnelStep}>
                    <View style={styles.funnelIconWrap}>{step.icon}</View>
                    <View style={styles.funnelLabelWrap}>
                      <AppText style={[styles.funnelLabel, { color: colors.text }]}>{step.label}</AppText>
                      {i > 0 && prevValue > 0 && (
                        <AppText style={[styles.funnelConv, { color: convRate >= 50 ? '#33D17A' : convRate >= 25 ? '#FFB347' : '#FF5A5F' }]}>
                          {fmtPct(convRate)} from previous
                        </AppText>
                      )}
                    </View>
                    <AppText style={[styles.funnelValue, { color: colors.textSecondary }]}>{step.value}</AppText>
                  </View>
                );
              })}
            </View>

            {/* CHURN INTELLIGENCE */}
            {sectionLabel('CHURN INTELLIGENCE')}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              {!churn || churn.summary.totalCancellations === 0 ? (
                <AppText style={[styles.emptyText, { color: colors.textMuted }]}>
                  No cancellations recorded for this period.
                </AppText>
              ) : (
                <>
                  <View style={styles.statGrid}>
                    {statCard('Cancellations', churn.summary.totalCancellations, '#FF5A5F')}
                    {statCard('Churn Rate', fmtPct(churn.summary.churnRate), '#FF5A5F')}
                    {statCard('Avg Tenure', `${churn.summary.avgTenureDays}d`, '#FFB347')}
                    {statCard('Would Return', churn.summary.wouldReturnCount, '#33D17A')}
                  </View>

                  <View style={styles.planBreakdownRow}>
                    <View style={[styles.planPill, { backgroundColor: 'rgba(105,167,255,0.10)', borderColor: 'rgba(105,167,255,0.25)' }]}>
                      <AppText style={[styles.planPillText, { color: '#69A7FF' }]}>Monthly: {churn.summary.monthlyCount}</AppText>
                    </View>
                    <View style={[styles.planPill, { backgroundColor: 'rgba(255,138,61,0.10)', borderColor: 'rgba(255,138,61,0.25)' }]}>
                      <AppText style={[styles.planPillText, { color: '#FF8A3D' }]}>Annual: {churn.summary.annualCount}</AppText>
                    </View>
                  </View>

                  {churn.summary.topReasons.length > 0 && (
                    <>
                      <AppText style={[styles.subLabel, { color: colors.textSecondary }]}>Top Cancellation Reasons</AppText>
                      {churn.summary.topReasons.slice(0, 5).map(({ reason, count }) => (
                        <View key={reason} style={styles.barRow}>
                          <AppText style={[styles.barLabel, { color: colors.textSecondary }]}>
                            {reason.replace(/_/g, ' ')}
                          </AppText>
                          <View style={[styles.barBg, { backgroundColor: colors.borderSubtle }]}>
                            <View style={[styles.barFill, {
                              width: `${Math.min(100, (count / (churn.summary.topReasons[0]?.count || 1)) * 100)}%`,
                              backgroundColor: '#FF5A5F',
                            }]} />
                          </View>
                          <AppText style={[styles.barCount, { color: colors.textMuted }]}>{count}</AppText>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}
            </View>

            {/* ACQUISITION PLACEHOLDER */}
            {sectionLabel('ACQUISITION & REFERRAL')}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={styles.privacyBadge}>
                <BarChart3 color="#FFB347" size={12} strokeWidth={2.2} />
                <AppText style={[styles.privacyText, { color: '#FFB347' }]}>Architecture Ready — Awaiting Attribution Data</AppText>
              </View>
              <AppText style={[styles.emptyText, { color: colors.textMuted }]}>
                Acquisition source tracking columns are in place on user profiles. Once attribution data
                flows from App Store Search Ads, Play Store install referrer, or campaign URLs, this section
                will show CAC, conversion, retention, and LTV by acquisition source.
              </AppText>
            </View>

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 40 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  errorBanner: {
    borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md,
    gap: 6, marginBottom: Spacing.md, flexDirection: 'row', alignItems: 'center',
  },
  errorText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', flex: 1 },
  rangeRow: { flexDirection: 'row', gap: 6, marginBottom: Spacing.md, flexWrap: 'wrap' },
  rangeChip: {
    borderRadius: Radius.pill, borderWidth: 1.5,
    paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center',
  },
  rangeText: { fontSize: FontSize.xs, fontFamily: 'Inter-SemiBold' },
  sectionLabel: {
    fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2,
    marginBottom: Spacing.sm, marginTop: Spacing.lg,
  },
  statGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  statCard: {
    flexBasis: '31%', flexGrow: 1, minWidth: 100,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2,
    alignItems: 'center', gap: 3, minHeight: 72, justifyContent: 'center',
  },
  statNum: { fontSize: 22, fontFamily: 'Inter-Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter-Medium', letterSpacing: 0.3, textAlign: 'center' },
  deltaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.pill, paddingHorizontal: 6, paddingVertical: 2,
    marginTop: 2,
  },
  deltaText: { fontSize: 9, fontFamily: 'Inter-Bold' },
  card: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card,
    marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  privacyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(51,209,122,0.08)',
    borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  privacyText: { fontSize: 10, fontFamily: 'Inter-Medium', color: '#33D17A' },
  subLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  emptyText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', paddingVertical: Spacing.md },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  barLabel: { fontSize: FontSize.xs, fontFamily: 'Inter-Medium', width: 80, textTransform: 'capitalize' },
  barBg: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barCount: { fontSize: FontSize.xs, fontFamily: 'Inter-Bold', width: 80, textAlign: 'right' },
  twinBarContainer: { flex: 1, flexDirection: 'row', gap: 4 },
  cohortHeaderRow: {
    flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 6, marginBottom: 6,
  },
  cohortHeaderCell: { flex: 1, fontSize: 10, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  cohortRow: {
    flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 8, alignItems: 'center',
  },
  cohortCell: { flex: 1, fontSize: FontSize.xs, fontFamily: 'Inter-Regular', textAlign: 'center' },
  cohortCellView: { flex: 1, borderRadius: Radius.sm, paddingVertical: 4, marginHorizontal: 2 },
  cohortRate: { fontSize: FontSize.xs, fontFamily: 'Inter-Bold', textAlign: 'center' },
  engagementGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  engagementItem: {
    flexBasis: '31%', flexGrow: 1, minWidth: 90,
    borderRadius: Radius.md, padding: Spacing.sm,
    alignItems: 'center', gap: 4, minHeight: 64, justifyContent: 'center',
  },
  engagementNum: { fontSize: 18, fontFamily: 'Inter-Bold' },
  engagementLabel: { fontSize: 9, fontFamily: 'Inter-Medium', textAlign: 'center' },
  distributionRow: { flexDirection: 'row', gap: 6 },
  distItem: {
    flex: 1, borderRadius: Radius.md, padding: Spacing.sm,
    alignItems: 'center', gap: 3,
  },
  distNum: { fontSize: 18, fontFamily: 'Inter-Bold' },
  distLabel: { fontSize: 10, fontFamily: 'Inter-Medium', textAlign: 'center' },
  funnelStep: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 0,
  },
  funnelIconWrap: { width: 28, alignItems: 'center', justifyContent: 'center' },
  funnelLabelWrap: { flex: 1 },
  funnelLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  funnelConv: { fontSize: 10, fontFamily: 'Inter-Medium', marginTop: 1 },
  funnelValue: { fontSize: 16, fontFamily: 'Inter-Bold', width: 50, textAlign: 'right' },
  planBreakdownRow: { flexDirection: 'row', gap: 8, marginTop: Spacing.sm },
  planPill: {
    borderRadius: Radius.pill, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6,
  },
  planPillText: { fontSize: FontSize.xs, fontFamily: 'Inter-SemiBold' },
});
