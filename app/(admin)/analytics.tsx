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
import { RefreshCw, Heart, TriangleAlert as AlertTriangle, Moon, ShieldCheck } from 'lucide-react-native';

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
  totalUsers: number;
  activeToday: number;
  onTrial: number;
  paid: number;
  freeAccess: number;
}

interface HealthData {
  distribution: { healthy: number; at_risk: number; inactive: number };
  total: number;
}

interface ChatData {
  totalMessages: number;
  activeCouples: number;
  pctChattedThisWeek: number;
  privacyProtected: boolean;
}

interface TrialData {
  trialsStarted: number;
  trialsConverted: number;
  conversionRate: number;
}

interface CancellationData {
  totalSurveys: number;
  topReasons: Array<{ reason: string; count: number }>;
}

const EMPTY_OVERVIEW: OverviewData = {
  totalCouples: 0, totalUsers: 0,
  activeToday: 0, onTrial: 0, paid: 0, freeAccess: 0,
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

  const healthIcon = (status: string) =>
    status === 'healthy' ? <Heart color="#33D17A" size={16} /> :
    status === 'at_risk' ? <AlertTriangle color="#FFB347" size={16} /> :
    <Moon color="#FF5A5F" size={16} />;

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
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,90,90,0.10)', borderColor: 'rgba(255,90,90,0.30)' }]}>
            <AlertTriangle color={colors.danger} size={15} strokeWidth={2.2} />
            <AppText style={[styles.errorText, { color: colors.danger }]}>{error}</AppText>
          </View>
        )}

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
              {statCard('Total Users', overview.totalUsers, '#FFB347')}
              {statCard('Total Couples', overview.totalCouples, '#FF2E8A')}
              {statCard('Active Today', overview.activeToday, '#33D17A')}
              {statCard('On Trial', overview.onTrial, '#FFB347')}
              {statCard('Free Access', overview.freeAccess, '#69A7FF')}
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
                  <View key={key} style={[styles.healthPill, { borderColor: `${color}40` }]}>
                    {healthIcon(key)}
                    <AppText style={[styles.healthPillNum, { color }]}>
                      {health?.distribution[key as keyof typeof health.distribution] ?? 0}
                    </AppText>
                    <AppText style={[styles.healthPillLabel, { color: colors.textMuted }]}>{label}</AppText>
                  </View>
                ))}
              </View>
            </View>

            {/* Engagement */}
            {sectionLabel('ENGAGEMENT')}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={styles.privacyBadge}>
                <ShieldCheck color="#33D17A" size={12} strokeWidth={2.2} />
                <AppText style={styles.privacyText}>Privacy Protected — message content never accessed</AppText>
              </View>
              <View style={styles.statGrid}>
                {statCard('Total Messages', chat?.totalMessages ?? 0, '#69A7FF')}
                {statCard('Active Couples', chat?.activeCouples ?? 0, '#FF2E8A')}
                {statCard('% Active This Week', `${chat?.pctChattedThisWeek ?? 0}%`, '#33D17A')}
              </View>
            </View>

            {/* Revenue */}
            {sectionLabel('REVENUE')}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={styles.statGrid}>
                {statCard('Trials Started', trials?.trialsStarted ?? 0, '#FFB347')}
                {statCard('Conversion Rate', `${trials?.conversionRate ?? 0}%`, '#FF2E8A')}
                {statCard('Paid', overview.paid, '#33D17A')}
                {statCard('Cancelled', cancellations?.totalSurveys ?? 0, '#FF5A5F')}
              </View>
              {cancellations?.topReasons && cancellations.topReasons.length > 0 && (
                <>
                  <AppText style={[styles.subLabel, { color: colors.textSecondary }]}>Top Cancellation Reasons</AppText>
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
});
