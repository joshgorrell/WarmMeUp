import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
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

interface Stats {
  coupleCount: number | null;
  userCount: number | null;
  interactionCount: number | null;
  diceCount: number | null;
  dareCount: number | null;
  tellMeCount: number | null;
  wishCount: number | null;
}

type DiagCheck = { name: string; status: 'pending' | 'pass' | 'fail'; detail?: string };

export default function AdminDashboard() {
  const router = useRouter();
  const { colors } = useTheme();
  const { profile, user } = useAuth();

  const [stats, setStats] = useState<Stats>({
    coupleCount: null,
    userCount: null,
    interactionCount: null,
    diceCount: null,
    dareCount: null,
    tellMeCount: null,
    wishCount: null,
  });
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

  useFocusEffect(useCallback(() => {
    console.log('[ADMIN LOAD START] user:', user?.id, 'is_admin:', profile?.is_admin, 'is_super_admin:', profile?.is_super_admin);
    fetchStats();
    fetchDebugMode();
  }, []));

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

  const fetchStats = async () => {
    if (!mountedRef.current) return;
    setStatsError(null);
    // Only show full spinner on first load (all counts null). On re-focus keep existing numbers visible.
    const isFirstLoad = stats.coupleCount === null && stats.userCount === null;
    if (isFirstLoad) setLoading(true);
    try {
      const [couples, profiles, interactions, dice, dares, tellMe, wishes] = await Promise.all([
        supabase.from('couples').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('interactions').select('id', { count: 'exact', head: true }),
        supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('type', 'dice'),
        supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('type', 'dare'),
        supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('type', 'tell_me'),
        supabase.from('wishes').select('id', { count: 'exact', head: true }),
      ]);

      if (!mountedRef.current) return;

      const firstError = [couples, profiles, interactions, dice, dares, tellMe, wishes].find(r => r.error);
      if (firstError?.error) {
        console.error('[ADMIN COUNTS ERROR]', firstError.error.message, firstError.error.code);
        setStatsError(firstError.error.message);
      } else {
        console.log('[ADMIN LOAD SUCCESS] couples:', couples.count, 'users:', profiles.count);
      }

      setStats({
        coupleCount: couples.error ? null : (couples.count ?? 0),
        userCount: profiles.error ? null : (profiles.count ?? 0),
        interactionCount: interactions.error ? null : (interactions.count ?? 0),
        diceCount: dice.error ? null : (dice.count ?? 0),
        dareCount: dares.error ? null : (dares.count ?? 0),
        tellMeCount: tellMe.error ? null : (tellMe.count ?? 0),
        wishCount: wishes.error ? null : (wishes.count ?? 0),
      });
    } catch (err: any) {
      console.error('[ADMIN LOAD ERROR]', err?.message);
      if (mountedRef.current) setStatsError(err?.message ?? 'Failed to load stats');
    } finally {
      if (mountedRef.current) setLoading(false);
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

  const statVal = (v: number | null) => {
    if (v === null) return loading ? '—' : '!';
    return String(v);
  };

  const statColor = (v: number | null, base: string) =>
    v === null ? colors.danger : base;

  const navItems = [
    {
      label: 'Prompt Management',
      sub: 'Add, edit, or remove dice, dare & tell me prompts',
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
    <AppShell scrollable={false}>
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

        {/* Stats row */}
        <View style={styles.statsRow}>
          {loading ? (
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle, flex: 1 }]}>
              <ActivityIndicator color={colors.textMuted} size="small" />
            </View>
          ) : (
            <>
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: stats.coupleCount === null ? 'rgba(255,90,90,0.35)' : colors.borderSubtle }]}>
                <AppText style={[styles.statNum, { color: statColor(stats.coupleCount, colors.text) }]}>{statVal(stats.coupleCount)}</AppText>
                <AppText style={[styles.statLabel, { color: colors.textMuted }]}>Couples</AppText>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: stats.userCount === null ? 'rgba(255,90,90,0.35)' : colors.borderSubtle }]}>
                <AppText style={[styles.statNum, { color: statColor(stats.userCount, colors.text) }]}>{statVal(stats.userCount)}</AppText>
                <AppText style={[styles.statLabel, { color: colors.textMuted }]}>Users</AppText>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: stats.interactionCount === null ? 'rgba(255,90,90,0.35)' : colors.borderSubtle }]}>
                <AppText style={[styles.statNum, { color: statColor(stats.interactionCount, colors.text) }]}>{statVal(stats.interactionCount)}</AppText>
                <AppText style={[styles.statLabel, { color: colors.textMuted }]}>Interactions</AppText>
              </View>
            </>
          )}
        </View>

        {/* Interaction breakdown */}
        <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
          <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>INTERACTION BREAKDOWN</AppText>
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownItem}>
              <AppText style={[styles.breakdownNum, { color: statColor(stats.diceCount, '#FFB347') }]}>{statVal(stats.diceCount)}</AppText>
              <AppText style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Dice</AppText>
            </View>
            <View style={[styles.breakdownDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.breakdownItem}>
              <AppText style={[styles.breakdownNum, { color: statColor(stats.dareCount, '#FF2E8A') }]}>{statVal(stats.dareCount)}</AppText>
              <AppText style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Dares</AppText>
            </View>
            <View style={[styles.breakdownDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.breakdownItem}>
              <AppText style={[styles.breakdownNum, { color: statColor(stats.tellMeCount, '#FF8A3D') }]}>{statVal(stats.tellMeCount)}</AppText>
              <AppText style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Tell Me</AppText>
            </View>
            <View style={[styles.breakdownDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.breakdownItem}>
              <AppText style={[styles.breakdownNum, { color: statColor(stats.wishCount, '#E8637A') }]}>{statVal(stats.wishCount)}</AppText>
              <AppText style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Wishes</AppText>
            </View>
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
