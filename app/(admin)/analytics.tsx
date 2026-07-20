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
import { RefreshCw, Heart, TriangleAlert as AlertTriangle, Moon, ShieldCheck, MessageCircle, Sparkles } from 'lucide-react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

type RangeKey = '7d' | '30d' | '90d' | 'all';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: 'all', label: 'All Time' },
];

interface OverviewData {
  totalCouples: number;
  pairedCouples: number;
  soloCouples: number;
  totalUsers: number;
  activeToday: number;
  activeThisWeek: number;
  activeThisMonth: number;
  onTrial: number;
  paid: number;
  complimentary: number;
  avgDaysTogether: number;
  avgDailyActivity: number;
}

interface HealthData {
  distribution: { healthy: number; at_risk: number; inactive: number };
  couples: Array<{
    couple_id: string;
    status: string;
    last_activity_at: string | null;
    days_since_activity: number | null;
    partner_a_active: boolean;
    partner_b_active: boolean;
    shared_activity_7d: number;
  }>;
  total: number;
}

interface ChatData {
  totalMessages: number;
  messagesToday: number;
  messagesThisWeek: number;
  messagesThisMonth: number;
  activeCouples: number;
  avgPerCouplePerDay: number;
  engagementBuckets: Record<string, number>;
  mostActiveCoupleId: string | null;
  mostActiveCoupleMessages: number;
  mostActiveDay: string;
  pctChattedToday: number;
  pctChattedThisWeek: number;
  privacyProtected: boolean;
}

interface TrialData {
  trialsStarted: number;
  trialsConverted: number;
  trialsExpired: number;
  conversionRate: number;
  avgDaysUntilSubscription: number;
  avgDaysUntilPartnerJoined: number;
}

interface CancellationData {
  totalSurveys: number;
  byType: Record<string, number>;
  topReasons: Array<{ reason: string; count: number }>;
  byWouldReturn: Record<string, number>;
  mostRequestedFeature: string | null;
  mostCommonNeverUsed: string | null;
  avgSubscriptionLength: number;
  avgTrialLength: number;
}

const EMPTY_OVERVIEW: OverviewData = {
  totalCouples: 0, pairedCouples: 0, soloCouples: 0, totalUsers: 0,
  activeToday: 0, activeThisWeek: 0, activeThisMonth: 0,
  onTrial: 0, paid: 0, complimentary: 0, avgDaysTogether: 0, avgDailyActivity: 0,
};

export default function AnalyticsDashboard() {
  const router = useRouter();
  const { colors } = useTheme();
  const mountedRef = useRef(true);

  const [range, setRange] = useState<RangeKey>('30d');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewData>(EMPTY_OVERVIEW);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [chat, setChat] = useState<ChatData | null>(null);
  const [trials, setTrials] = useState<TrialData | null>(null);
  const [cancellations, setCancellations] = useState<CancellationData | null>(null);
  const [healthFilter, setHealthFilter] = useState<string | null>(null);

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

      const [ovRes, healthRes, chatRes, trialsRes, cancelRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/functions/v1/analytics-overview?range=${range}`, { headers }),
        fetch(`${SUPABASE_URL}/functions/v1/analytics-couple-health`, { headers }),
        fetch(`${SUPABASE_URL}/functions/v1/analytics-chat`, { headers }),
        fetch(`${SUPABASE_URL}/functions/v1/analytics-trials`, { headers }),
        fetch(`${SUPABASE_URL}/functions/v1/analytics-cancellations`, { headers }),
      ]);

      const [ovJson, healthJson, chatJson, trialsJson, cancelJson] = await Promise.all([
        ovRes.json(), healthRes.json(), chatRes.json(), trialsRes.json(), cancelRes.json(),
      ]);

      if (ovJson?.error) throw new Error(ovJson.error);
      if (healthJson?.error) throw new Error(healthJson.error);
      if (chatJson?.error) throw new Error(chatJson.error);
      if (trialsJson?.error) throw new Error(trialsJson.error);
      if (cancelJson?.error) throw new Error(cancelJson.error);

      if (mountedRef.current) {
        setOverview(ovJson ?? EMPTY_OVERVIEW);
        setHealth(healthJson ?? null);
        setChat(chatJson ?? null);
        setTrials(trialsJson ?? null);
        setCancellations(cancelJson ?? null);
      }
    } catch (e: any) {
      if (mountedRef.current) setError(e?.message ?? 'Failed to load analytics');
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

  const statCard = (label: string, value: string | number, color: string) => (
    <View key={label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
      <AppText style={[styles.statNum, { color }]}>{String(value)}</AppText>
      <AppText style={[styles.statLabel, { color: colors.textMuted }]}>{label}</AppText>
    </View>
  );

  const sectionLabel = (text: string) => (
    <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>{text}</AppText>
  );

  const healthColor = (status: string) =>
    status === 'healthy' ? '#33D17A' : status === 'at_risk' ? '#FFB347' : '#FF5A5F';
  const healthIcon = (status: string) =>
    status === 'healthy' ? <Heart color="#33D17A" size={16} /> :
    status === 'at_risk' ? <AlertTriangle color="#FFB347" size={16} /> :
    <Moon color="#FF5A5F" size={16} />;

  const filteredCouples = healthFilter
    ? health?.couples.filter(c => c.status === healthFilter) ?? []
    : health?.couples ?? [];

  return (
    <AppShell scrollable={false} noTopPadding>
      <ScreenHeader
        title="Couple Analytics"
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
        {/* Error */}
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,90,90,0.10)', borderColor: 'rgba(255,90,90,0.30)' }]}>
            <AlertTriangle color={colors.danger} size={15} strokeWidth={2.2} />
            <AppText style={[styles.errorText, { color: colors.danger }]}>{error}</AppText>
          </View>
        )}

        {/* Date range picker */}
        <View style={styles.rangeRow}>
          {RANGES.map(r => {
            const active = range === r.key;
            return (
              <TouchableOpacity
                key={r.key}
                style={[
                  styles.rangeChip,
                  {
                    backgroundColor: active ? 'rgba(255,90,61,0.12)' : colors.card,
                    borderColor: active ? 'rgba(255,90,61,0.40)' : colors.borderSubtle,
                  },
                ]}
                onPress={() => setRange(r.key)}
                activeOpacity={0.7}
              >
                <AppText style={[styles.rangeText, { color: active ? '#FF5A3D' : colors.textMuted }]}>
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
            {/* Overview */}
            {sectionLabel('OVERVIEW')}
            <View style={styles.statGrid}>
              {statCard('Total Couples', overview.totalCouples, '#FF2E8A')}
              {statCard('Paired', overview.pairedCouples, '#33D17A')}
              {statCard('Solo', overview.soloCouples, '#69A7FF')}
              {statCard('Total Users', overview.totalUsers, '#FFB347')}
              {statCard('Active Today', overview.activeToday, '#33D17A')}
              {statCard('Active Week', overview.activeThisWeek, '#69A7FF')}
              {statCard('Active Month', overview.activeThisMonth, '#FF8A3D')}
              {statCard('On Trial', overview.onTrial, '#FFB347')}
              {statCard('Paid', overview.paid, '#33D17A')}
              {statCard('Complimentary', overview.complimentary, '#69A7FF')}
              {statCard('Avg Days Together', overview.avgDaysTogether, '#FF2E8A')}
              {statCard('Avg Daily Activity', overview.avgDailyActivity, '#FF8A3D')}
            </View>

            {/* Couple Health */}
            {sectionLabel('COUPLE HEALTH SCORE')}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={styles.healthSummaryRow}>
                {[
                  { key: 'healthy', label: 'Healthy', color: '#33D17A' },
                  { key: 'at_risk', label: 'At Risk', color: '#FFB347' },
                  { key: 'inactive', label: 'Inactive', color: '#FF5A5F' },
                ].map(({ key, label, color }) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.healthPill,
                      {
                        backgroundColor: healthFilter === key ? `${color}20` : 'transparent',
                        borderColor: healthFilter === key ? `${color}60` : colors.borderSubtle,
                      },
                    ]}
                    onPress={() => setHealthFilter(healthFilter === key ? null : key)}
                    activeOpacity={0.7}
                  >
                    {healthIcon(key)}
                    <AppText style={[styles.healthPillNum, { color }]}>{health?.distribution[key as keyof typeof health.distribution] ?? 0}</AppText>
                    <AppText style={[styles.healthPillLabel, { color: colors.textMuted }]}>{label}</AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Chat Metrics */}
            {sectionLabel('CHAT METRICS')}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={styles.privacyBadge}>
                <ShieldCheck color="#33D17A" size={12} strokeWidth={2.2} />
                <AppText style={styles.privacyText}>Privacy Protected — message content never accessed</AppText>
              </View>
              <View style={styles.statGrid}>
                {statCard('Total Messages', chat?.totalMessages ?? 0, '#69A7FF')}
                {statCard('Today', chat?.messagesToday ?? 0, '#33D17A')}
                {statCard('This Week', chat?.messagesThisWeek ?? 0, '#FFB347')}
                {statCard('This Month', chat?.messagesThisMonth ?? 0, '#FF8A3D')}
                {statCard('Active Couples', chat?.activeCouples ?? 0, '#FF2E8A')}
                {statCard('Avg/Couple/Day', chat?.avgPerCouplePerDay ?? 0, '#69A7FF')}
                {statCard('% Chatted Today', `${chat?.pctChattedToday ?? 0}%`, '#33D17A')}
                {statCard('% Chatted Week', `${chat?.pctChattedThisWeek ?? 0}%`, '#FFB347')}
              </View>
              {/* Engagement buckets */}
              <AppText style={[styles.subLabel, { color: colors.textSecondary }]}>Engagement Distribution</AppText>
              <View style={styles.bucketRow}>
                {Object.entries(chat?.engagementBuckets ?? {}).map(([bucket, count]) => (
                  <View key={bucket} style={[styles.bucket, { backgroundColor: colors.bg1, borderColor: colors.borderSubtle }]}>
                    <AppText style={[styles.bucketNum, { color: colors.text }]}>{count}</AppText>
                    <AppText style={[styles.bucketLabel, { color: colors.textMuted }]}>{bucket}</AppText>
                  </View>
                ))}
              </View>
              <View style={styles.highlightRow}>
                <View style={styles.highlightItem}>
                  <MessageCircle color="#69A7FF" size={14} />
                  <AppText style={[styles.highlightText, { color: colors.textSecondary }]}>
                    Most active day: {chat?.mostActiveDay ?? '—'}
                  </AppText>
                </View>
              </View>
            </View>

            {/* Trial Metrics */}
            {sectionLabel('TRIAL METRICS')}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={styles.statGrid}>
                {statCard('Trials Started', trials?.trialsStarted ?? 0, '#FFB347')}
                {statCard('Converted', trials?.trialsConverted ?? 0, '#33D17A')}
                {statCard('Expired', trials?.trialsExpired ?? 0, '#FF5A5F')}
                {statCard('Conversion Rate', `${trials?.conversionRate ?? 0}%`, '#FF2E8A')}
                {statCard('Avg Days to Sub', trials?.avgDaysUntilSubscription ?? 0, '#69A7FF')}
                {statCard('Avg Days to Partner', trials?.avgDaysUntilPartnerJoined ?? 0, '#FF8A3D')}
              </View>
            </View>

            {/* Cancellation Insights */}
            {sectionLabel('CANCELLATION INSIGHTS')}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={styles.statGrid}>
                {statCard('Total Surveys', cancellations?.totalSurveys ?? 0, '#FF5A5F')}
                {statCard('Avg Sub Length', `${cancellations?.avgSubscriptionLength ?? 0}d`, '#69A7FF')}
                {statCard('Avg Trial Length', `${cancellations?.avgTrialLength ?? 0}d`, '#FFB347')}
              </View>
              {cancellations?.topReasons && cancellations.topReasons.length > 0 && (
                <>
                  <AppText style={[styles.subLabel, { color: colors.textSecondary }]}>Top Reasons</AppText>
                  {cancellations.topReasons.slice(0, 5).map(({ reason, count }) => (
                    <View key={reason} style={styles.barRow}>
                      <AppText style={[styles.barLabel, { color: colors.textSecondary }]}>
                        {reason.replace(/_/g, ' ')}
                      </AppText>
                      <View style={[styles.barBg, { backgroundColor: colors.borderSubtle }]}>
                        <View style={[styles.barFill, {
                          width: `${Math.min(100, (count / (cancellations.topReasons[0]?.count || 1)) * 100)}%`,
                          backgroundColor: '#FF5A5F',
                        }]} />
                      </View>
                      <AppText style={[styles.barCount, { color: colors.textMuted }]}>{count}</AppText>
                    </View>
                  ))}
                </>
              )}
              {cancellations?.mostRequestedFeature && (
                <View style={styles.highlightRow}>
                  <Sparkles color="#FFB347" size={14} />
                  <AppText style={[styles.highlightText, { color: colors.textSecondary }]}>
                    Most requested: {cancellations.mostRequestedFeature}
                  </AppText>
                </View>
              )}
            </View>

            {/* Couple Health List */}
            {health && healthFilter && filteredCouples.length > 0 && (
              <>
                {sectionLabel(`${healthFilter.toUpperCase()} COUPLES (${filteredCouples.length})`)}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle, gap: 0, padding: 0, overflow: 'hidden' }]}>
                  {filteredCouples.slice(0, 20).map((c, i) => (
                    <React.Fragment key={c.couple_id}>
                      {i > 0 && <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />}
                      <View style={styles.coupleRow}>
                        {healthIcon(c.status)}
                        <View style={{ flex: 1 }}>
                          <AppText style={[styles.coupleId, { color: colors.text }]} numberOfLines={1}>
                            {c.couple_id.slice(0, 8)}…
                          </AppText>
                          <AppText style={[styles.coupleMeta, { color: colors.textMuted }]}>
                            {c.days_since_activity !== null ? `${c.days_since_activity}d since activity` : 'No activity'}
                            {' · '}7d: {c.shared_activity_7d} events
                          </AppText>
                        </View>
                      </View>
                    </React.Fragment>
                  ))}
                  {filteredCouples.length > 20 && (
                    <AppText style={[styles.moreText, { color: colors.textMuted }]}>
                      +{filteredCouples.length - 20} more…
                    </AppText>
                  )}
                </View>
              </>
            )}

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
  rangeRow: { flexDirection: 'row', gap: 6, marginBottom: Spacing.md },
  rangeChip: {
    flex: 1, borderRadius: Radius.pill, borderWidth: 1.5,
    paddingVertical: 8, alignItems: 'center',
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
    alignItems: 'center', gap: 3, minHeight: 68, justifyContent: 'center',
  },
  statNum: { fontSize: 22, fontFamily: 'Inter-Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter-Medium', letterSpacing: 0.3, textAlign: 'center' },
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
  subLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', marginTop: Spacing.sm },
  bucketRow: { flexDirection: 'row', gap: 4 },
  bucket: {
    flex: 1, borderRadius: Radius.md, borderWidth: 1,
    paddingVertical: 10, alignItems: 'center', gap: 2,
  },
  bucketNum: { fontSize: 18, fontFamily: 'Inter-Bold' },
  bucketLabel: { fontSize: 9, fontFamily: 'Inter-Medium' },
  highlightRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.xs },
  highlightItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  highlightText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  healthSummaryRow: { flexDirection: 'row', gap: 8 },
  healthPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: Radius.md, borderWidth: 1.5, paddingVertical: 12,
  },
  healthPillNum: { fontSize: 20, fontFamily: 'Inter-Bold' },
  healthPillLabel: { fontSize: FontSize.xs, fontFamily: 'Inter-Medium' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  barLabel: { fontSize: FontSize.xs, fontFamily: 'Inter-Medium', width: 100, textTransform: 'capitalize' },
  barBg: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barCount: { fontSize: FontSize.xs, fontFamily: 'Inter-Bold', width: 24, textAlign: 'right' },
  divider: { height: 1, marginHorizontal: Spacing.card },
  coupleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.card },
  coupleId: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  coupleMeta: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  moreText: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', textAlign: 'center', paddingVertical: 10 },
});
