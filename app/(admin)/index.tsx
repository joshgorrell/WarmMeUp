import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { logDebugEvent } from '@/lib/debugLog';
import {
  FileSliders as Sliders, Users, ChartBar as BarChart2, ChevronRight, Activity,
  CircleCheck as CheckCircle2, CircleX as XCircle, Loader as Loader2,
  Star, UserCog, Bug, ShieldCheck, MessageSquare, TriangleAlert as AlertTriangle,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import Toggle from '@/components/Toggle';

interface StatEntry {
  value: number | null;
  error: string | null;
  errorCode: string | null;
  loading: boolean;
}

interface Stats {
  coupleCount: StatEntry;
  userCount: StatEntry;
  interactionCount: StatEntry;
  diceCount: StatEntry;
  dareCount: StatEntry;
  tellMeCount: StatEntry;
  wishCount: StatEntry;
}

const LOADING_STAT: StatEntry = { value: null, error: null, errorCode: null, loading: true };
const initialStats = (): Stats => ({
  coupleCount: { ...LOADING_STAT },
  userCount: { ...LOADING_STAT },
  interactionCount: { ...LOADING_STAT },
  diceCount: { ...LOADING_STAT },
  dareCount: { ...LOADING_STAT },
  tellMeCount: { ...LOADING_STAT },
  wishCount: { ...LOADING_STAT },
});

type DiagCheck = { name: string; status: 'pending' | 'pass' | 'fail'; detail?: string };

export default function AdminDashboard() {
  const router = useRouter();
  const { colors } = useTheme();
  const { profile, user, loading: authLoading } = useAuth();

  const [stats, setStats] = useState<Stats>(initialStats());
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [diag, setDiag] = useState<DiagCheck[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);
  const [debugToggleLoading, setDebugToggleLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fire on focus only after auth is fully hydrated
  useFocusEffect(useCallback(() => {
    console.log('[ADMIN LOAD START] authLoading:', authLoading, 'user:', user?.id, 'is_admin:', profile?.is_admin, 'is_super_admin:', profile?.is_super_admin);
    if (!authLoading && user?.id) {
      fetchStats();
      fetchDebugMode();
    }
  }, [authLoading, user?.id]));

  // Also fire when auth finishes hydrating while the screen is already mounted
  useEffect(() => {
    if (!authLoading && user?.id) {
      fetchStats();
      fetchDebugMode();
    }
  }, [authLoading, user?.id]);

  const fetchDebugMode = async () => {
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'debug_mode_enabled')
      .maybeSingle();
    if (data) setDebugModeEnabled(data.value === true);
  };

  const toggleDebugMode = async (next: boolean) => {
    setDebugToggleLoading(true);
    setDebugModeEnabled(next);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    await supabase
      .from('app_config')
      .update({ value: next, updated_at: new Date().toISOString(), updated_by: authUser?.id ?? null })
      .eq('key', 'debug_mode_enabled');
    setDebugToggleLoading(false);
  };

  const fetchOneStat = async (
    key: keyof Stats,
    queryFn: () => PromiseLike<{ count: number | null; error: any }>,
  ) => {
    if (!mountedRef.current) return;
    console.log('[ADMIN QUERY START]', key);
    setStats(prev => ({ ...prev, [key]: { value: prev[key].value, error: null, errorCode: null, loading: true } }));

    // Race the query against a 15-second timeout so spinners never hang forever
    const timeoutPromise = new Promise<{ count: null; error: { message: string; code: string } }>(resolve =>
      setTimeout(() => resolve({ count: null, error: { message: 'Query timed out', code: 'TIMEOUT' } }), 15000)
    );

    try {
      const { count, error } = await Promise.race([queryFn(), timeoutPromise]);
      console.log('[ADMIN QUERY RESULT]', key, { count, error });
      if (!mountedRef.current) return;
      if (error) {
        logDebugEvent('ADMIN STATS ERROR', { stat: key, code: error.code, message: error.message, details: (error as any).details });
        setStats(prev => ({ ...prev, [key]: { value: null, error: error.message, errorCode: error.code ?? null, loading: false } }));
      } else {
        setStats(prev => ({ ...prev, [key]: { value: count ?? 0, error: null, errorCode: null, loading: false } }));
      }
    } catch (err: any) {
      console.log('[ADMIN QUERY RESULT]', key, { error: err?.message });
      if (!mountedRef.current) return;
      logDebugEvent('ADMIN STATS ERROR', { stat: key, message: err?.message });
      setStats(prev => ({ ...prev, [key]: { value: null, error: err?.message ?? 'Failed', errorCode: null, loading: false } }));
    }
  };

  const fetchStats = async () => {
    if (!mountedRef.current) return;
    setStatsError(null);
    setLoading(true);
    logDebugEvent('ADMIN STATS START', { userId: user?.id ?? null });

    // Fire all 7 queries independently — a failure in one doesn't kill the rest
    await Promise.allSettled([
      fetchOneStat('coupleCount', () => supabase.from('couples').select('id', { count: 'exact', head: true })),
      fetchOneStat('userCount', () => supabase.from('profiles').select('id', { count: 'exact', head: true })),
      fetchOneStat('interactionCount', () => supabase.from('interactions').select('id', { count: 'exact', head: true })),
      fetchOneStat('diceCount', () => supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('type', 'dice')),
      fetchOneStat('dareCount', () => supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('type', 'dare')),
      fetchOneStat('tellMeCount', () => supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('type', 'tell_me')),
      fetchOneStat('wishCount', () => supabase.from('wishes').select('id', { count: 'exact', head: true })),
    ]);

    if (mountedRef.current) {
      setLoading(false);
      console.log('[ADMIN LOAD COMPLETE]');
    }
  };

  const runDiagnostics = async () => {
    setDiagRunning(true);
    const checks: DiagCheck[] = [
      { name: 'Auth session', status: 'pending' },
      { name: 'Admin flags (is_admin / is_super_admin)', status: 'pending' },
      { name: 'Read all profiles', status: 'pending' },
      { name: 'Read all couples', status: 'pending' },
      { name: 'Read all subscriptions', status: 'pending' },
      { name: 'Read all admin_grants', status: 'pending' },
      { name: 'Read all wishes', status: 'pending' },
      { name: 'Email search RPC', status: 'pending' },
    ];
    setDiag([...checks]);

    const { data: { user: authUser } } = await supabase.auth.getUser();

    // 0. Auth session
    checks[0] = authUser
      ? { name: 'Auth session', status: 'pass', detail: authUser.id }
      : { name: 'Auth session', status: 'fail', detail: 'No auth session' };
    setDiag([...checks]);

    if (!authUser) {
      checks.forEach((c, i) => { if (i > 0) { c.status = 'fail'; c.detail = 'No auth session'; } });
      setDiag([...checks]);
      setDiagRunning(false);
      return;
    }

    // 1. Admin flags
    {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin, is_super_admin')
        .eq('id', authUser.id)
        .maybeSingle();
      checks[1] = error
        ? { name: 'Admin flags (is_admin / is_super_admin)', status: 'fail', detail: error.message }
        : { name: 'Admin flags (is_admin / is_super_admin)', status: data?.is_admin || data?.is_super_admin ? 'pass' : 'fail', detail: `is_admin=${data?.is_admin} is_super_admin=${data?.is_super_admin}` };
      setDiag([...checks]);
    }

    // 2. Read all profiles
    {
      const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
      checks[2] = error
        ? { name: 'Read all profiles', status: 'fail', detail: error.message }
        : { name: 'Read all profiles', status: 'pass', detail: `${count ?? 0} rows` };
      setDiag([...checks]);
    }

    // 3. Read all couples
    {
      const { count, error } = await supabase.from('couples').select('id', { count: 'exact', head: true });
      checks[3] = error
        ? { name: 'Read all couples', status: 'fail', detail: error.message }
        : { name: 'Read all couples', status: 'pass', detail: `${count ?? 0} rows` };
      setDiag([...checks]);
    }

    // 4. Read all subscriptions
    {
      const { count, error } = await supabase.from('subscriptions').select('user_id', { count: 'exact', head: true });
      checks[4] = error
        ? { name: 'Read all subscriptions', status: 'fail', detail: error.message }
        : { name: 'Read all subscriptions', status: 'pass', detail: `${count ?? 0} rows` };
      setDiag([...checks]);
    }

    // 5. Read all admin_grants
    {
      const { count, error } = await supabase.from('admin_grants').select('id', { count: 'exact', head: true });
      checks[5] = error
        ? { name: 'Read all admin_grants', status: 'fail', detail: error.message }
        : { name: 'Read all admin_grants', status: 'pass', detail: `${count ?? 0} rows` };
      setDiag([...checks]);
    }

    // 6. Read all wishes
    {
      const { count, error } = await supabase.from('wishes').select('id', { count: 'exact', head: true });
      checks[6] = error
        ? { name: 'Read all wishes', status: 'fail', detail: error.message }
        : { name: 'Read all wishes', status: 'pass', detail: `${count ?? 0} rows` };
      setDiag([...checks]);
    }

    // 7. Email search RPC (search for own email)
    {
      const ownEmail = authUser.email ?? '';
      if (!ownEmail) {
        checks[7] = { name: 'Email search RPC', status: 'fail', detail: 'No email on auth session' };
      } else {
        const { data, error } = await supabase.rpc('admin_search_user_by_email', { p_email: ownEmail });
        const found = Array.isArray(data) ? data[0] : data;
        checks[7] = error
          ? { name: 'Email search RPC', status: 'fail', detail: error.message }
          : found?.user_id === authUser.id
            ? { name: 'Email search RPC', status: 'pass', detail: `found ${found.display_name} (${found.user_id.slice(0, 8)}…)` }
            : { name: 'Email search RPC', status: 'fail', detail: found ? `wrong user: ${found.user_id}` : 'no result returned' };
      }
      setDiag([...checks]);
    }

    setDiagRunning(false);
  };

  const statVal = (entry: StatEntry) => {
    if (entry.loading) return '—';
    if (entry.error) return '!';
    return String(entry.value ?? 0);
  };

  const statColor = (entry: StatEntry, base: string) =>
    entry.error ? colors.danger : base;

  const navItems = [
    {
      label: 'Prompt Management',
      sub: 'Add, edit, or remove dice, dare & wish prompts',
      icon: <Sliders color="#FFB347" size={22} strokeWidth={2} />,
      color: '#FFB347',
      bg: 'rgba(255,179,71,0.10)',
      border: 'rgba(255,179,71,0.25)',
      route: '/(admin)/prompts',
    },
    {
      label: 'Couples & Users',
      sub: 'View all couples, manage accounts',
      icon: <Users color="#FF2E8A" size={22} strokeWidth={2} />,
      color: '#FF2E8A',
      bg: 'rgba(255,46,138,0.10)',
      border: 'rgba(255,46,138,0.25)',
      route: '/(admin)/couples',
    },
    {
      label: 'Interaction Stats',
      sub: 'Engagement data across all couples',
      icon: <BarChart2 color="#69A7FF" size={22} strokeWidth={2} />,
      color: '#69A7FF',
      bg: 'rgba(105,167,255,0.10)',
      border: 'rgba(105,167,255,0.25)',
      route: '/(admin)/stats',
    },
    {
      label: 'Points Config',
      sub: 'Set point values for each action',
      icon: <Star color="#33D17A" size={22} strokeWidth={2} />,
      color: '#33D17A',
      bg: 'rgba(51,209,122,0.10)',
      border: 'rgba(51,209,122,0.25)',
      route: '/(admin)/points-config',
    },
    {
      label: 'Manage Users',
      sub: 'Grant or revoke admin privileges',
      icon: <UserCog color="#60C8FF" size={22} strokeWidth={2} />,
      color: '#60C8FF',
      bg: 'rgba(96,200,255,0.10)',
      border: 'rgba(96,200,255,0.25)',
      route: '/(admin)/users',
    },
    {
      label: 'Entitlements',
      sub: 'Grant or revoke free premium access to users',
      icon: <ShieldCheck color="#33D17A" size={22} strokeWidth={2} />,
      color: '#33D17A',
      bg: 'rgba(51,209,122,0.10)',
      border: 'rgba(51,209,122,0.25)',
      route: '/(admin)/entitlements',
    },
    {
      label: 'Greeting Subtitles',
      sub: 'Manage the rotating phrases shown under the home screen greeting',
      icon: <MessageSquare color="#FFB347" size={22} strokeWidth={2} />,
      color: '#FFB347',
      bg: 'rgba(255,179,71,0.10)',
      border: 'rgba(255,179,71,0.25)',
      route: '/(admin)/greetings',
    },
  ];

  return (
    <AppShell scrollable={false} noTopPadding>
      <ScreenHeader
        onBack={() => router.back()}
        rightSlot={
          <View style={[styles.adminBadge, { backgroundColor: 'rgba(255,179,71,0.15)', borderColor: 'rgba(255,179,71,0.35)' }]}>
            <AppText style={styles.adminBadgeText}>ADMIN</AppText>
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Stats error banner */}
        {statsError ? (
          <TouchableOpacity
            style={[styles.errorBanner, { backgroundColor: 'rgba(255,90,90,0.10)', borderColor: 'rgba(255,90,90,0.30)' }]}
            onPress={fetchStats}
            activeOpacity={0.8}
          >
            <AlertTriangle color={colors.danger} size={15} strokeWidth={2.2} />
            <AppText style={[styles.errorBannerText, { color: colors.danger }]}>
              Stats failed to load — tap to retry
            </AppText>
            <AppText style={[styles.errorBannerDetail, { color: colors.danger }]}>{statsError}</AppText>
          </TouchableOpacity>
        ) : null}

        {/* Stats row — each card is independently tappable to retry */}
        <View style={styles.statsRow}>
          {(['coupleCount', 'userCount', 'interactionCount'] as const).map((key, i) => {
            const entry = stats[key];
            const labels = ['Couples', 'Users', 'Interactions'];
            const hasError = !!entry.error;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.statCard, { backgroundColor: colors.card, borderColor: hasError ? 'rgba(255,90,90,0.35)' : colors.borderSubtle }]}
                onPress={() => fetchOneStat(key, () => {
                  if (key === 'coupleCount') return supabase.from('couples').select('id', { count: 'exact', head: true });
                  if (key === 'userCount') return supabase.from('profiles').select('id', { count: 'exact', head: true });
                  return supabase.from('interactions').select('id', { count: 'exact', head: true });
                })}
                activeOpacity={hasError ? 0.7 : 1}
              >
                {entry.loading
                  ? <ActivityIndicator color={colors.textMuted} size="small" />
                  : <AppText style={[styles.statNum, { color: statColor(entry, colors.text) }]}>{statVal(entry)}</AppText>
                }
                <AppText style={[styles.statLabel, { color: hasError ? colors.danger : colors.textMuted }]}>{labels[i]}</AppText>
                {hasError && (
                  <>
                    {!!entry.errorCode && (
                      <AppText style={[styles.statError, { color: colors.danger, fontFamily: 'Inter-Bold' }]} selectable numberOfLines={1}>
                        {entry.errorCode}
                      </AppText>
                    )}
                    <AppText style={[styles.statError, { color: colors.danger }]} selectable numberOfLines={3}>{entry.error}</AppText>
                    <AppText style={[styles.statError, { color: 'rgba(255,90,90,0.55)' }]}>tap to retry</AppText>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Interaction breakdown — each item independently tappable to retry */}
        <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
          <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>INTERACTION BREAKDOWN</AppText>
          <View style={styles.breakdownRow}>
            {([
              { key: 'diceCount', label: 'Dice', color: '#FFB347', type: 'dice' },
              { key: 'dareCount', label: 'Dares', color: '#FF2E8A', type: 'dare' },
              { key: 'tellMeCount', label: 'Wish', color: '#FF8A3D', type: 'tell_me' },
              { key: 'wishCount', label: 'Wishes', color: '#E8637A', type: null },
            ] as const).map(({ key, label, color, type }, i) => {
              const entry = stats[key];
              return (
                <React.Fragment key={key}>
                  {i > 0 && <View style={[styles.breakdownDivider, { backgroundColor: colors.borderSubtle }]} />}
                  <TouchableOpacity
                    style={styles.breakdownItem}
                    onPress={() => fetchOneStat(key, () =>
                      type
                        ? supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('type', type)
                        : supabase.from('wishes').select('id', { count: 'exact', head: true })
                    )}
                    activeOpacity={entry.error ? 0.7 : 1}
                  >
                    {entry.loading
                      ? <ActivityIndicator color={color} size="small" />
                      : <AppText style={[styles.breakdownNum, { color: entry.error ? colors.danger : color }]}>{statVal(entry)}</AppText>
                    }
                    <AppText style={[styles.breakdownLabel, { color: entry.error ? colors.danger : colors.textSecondary }]}>{label}</AppText>
                    {!!entry.errorCode && (
                      <AppText style={[styles.statError, { color: colors.danger }]} selectable numberOfLines={1}>{entry.errorCode}</AppText>
                    )}
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {/* Navigation cards */}
        <AppText style={[styles.sectionLabel, { color: colors.textMuted, marginBottom: Spacing.sm }]}>MANAGE</AppText>
        {navItems.map(item => (
          <TouchableOpacity
            key={item.route}
            style={[styles.navCard, { backgroundColor: colors.card, borderColor: item.border }]}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.8}
          >
            <View style={[styles.navIcon, { backgroundColor: item.bg }]}>
              {item.icon}
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={[styles.navLabel, { color: colors.text }]}>{item.label}</AppText>
              <AppText style={[styles.navSub, { color: colors.textMuted }]}>{item.sub}</AppText>
            </View>
            <ChevronRight color={colors.textMuted} size={18} />
          </TouchableOpacity>
        ))}

        {/* Developer */}
        <AppText style={[styles.sectionLabel, { color: colors.textMuted, marginTop: Spacing.lg, marginBottom: Spacing.sm }]}>DEVELOPER</AppText>
        <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle, gap: 0 }]}>
          <View style={styles.devRow}>
            <View style={[styles.devIconWrap, { backgroundColor: 'rgba(96,200,255,0.10)' }]}>
              <Bug color="#60C8FF" size={20} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={[styles.devLabel, { color: colors.text }]}>Emergency Debug Access</AppText>
              <AppText style={[styles.devSub, { color: colors.textMuted }]}>5-tap on weather temp or splash logo opens diagnostics screen</AppText>
            </View>
            <Toggle
              value={debugModeEnabled}
              onChange={toggleDebugMode}
              disabled={debugToggleLoading}
            />
          </View>
        </View>

        {/* Diagnostics */}
        <AppText style={[styles.sectionLabel, { color: colors.textMuted, marginTop: Spacing.lg, marginBottom: Spacing.sm }]}>DIAGNOSTICS</AppText>
        <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle, gap: Spacing.sm }]}>
          <TouchableOpacity
            onPress={runDiagnostics}
            disabled={diagRunning}
            style={[styles.diagBtn, { borderColor: 'rgba(105,167,255,0.35)', backgroundColor: 'rgba(105,167,255,0.08)' }]}
            activeOpacity={0.8}
          >
            {diagRunning
              ? <ActivityIndicator size="small" color="#69A7FF" />
              : <Activity color="#69A7FF" size={16} strokeWidth={2.2} />}
            <AppText style={styles.diagBtnText}>{diagRunning ? 'Running checks…' : 'Run admin RLS checks'}</AppText>
          </TouchableOpacity>
          {diag.map(c => (
            <View key={c.name} style={styles.diagRow}>
              {c.status === 'pass' ? (
                <CheckCircle2 color="#33D17A" size={16} strokeWidth={2.2} />
              ) : c.status === 'fail' ? (
                <XCircle color={colors.danger} size={16} strokeWidth={2.2} />
              ) : (
                <Loader2 color={colors.textMuted} size={16} strokeWidth={2.2} />
              )}
              <View style={{ flex: 1 }}>
                <AppText style={[styles.diagName, { color: colors.text }]}>{c.name}</AppText>
                {c.detail ? (
                  <AppText style={[styles.diagDetail, { color: c.status === 'fail' ? colors.danger : colors.textMuted }]}>{c.detail}</AppText>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  adminBadge: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  adminBadgeText: { fontSize: 10, fontFamily: 'Inter-Bold', color: '#FFB347', letterSpacing: 1 },
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 40 },
  errorBanner: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 6,
    marginBottom: Spacing.md,
  },
  errorBannerText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  errorBannerDetail: { fontSize: 11, fontFamily: 'Inter-Regular', opacity: 0.8 },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
    minHeight: 72,
    justifyContent: 'center',
  },
  statNum: { fontSize: 28, fontFamily: 'Inter-Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter-Medium', letterSpacing: 0.5 },
  statError: { fontSize: 10, fontFamily: 'Inter-Regular', textAlign: 'center', marginTop: 1 },
  breakdownCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  breakdownRow: { flexDirection: 'row', alignItems: 'center' },
  breakdownItem: { flex: 1, alignItems: 'center', gap: 4 },
  breakdownDivider: { width: 1, height: 36 },
  breakdownNum: { fontSize: 24, fontFamily: 'Inter-Bold' },
  breakdownLabel: { fontSize: 12, fontFamily: 'Inter-Medium' },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2, marginBottom: Spacing.sm },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
    marginBottom: Spacing.sm,
  },
  navIcon: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold', marginBottom: 2 },
  navSub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  diagBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: Radius.pill, borderWidth: 1, paddingVertical: 10,
  },
  diagBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', color: '#69A7FF' },
  diagRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 4 },
  diagName: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
  diagDetail: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 1 },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.card,
  },
  devIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  devLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', marginBottom: 2 },
  devSub: { fontSize: 11, fontFamily: 'Inter-Regular', lineHeight: 16 },
});
