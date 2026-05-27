import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { FileSliders as Sliders, Users, ChartBar as BarChart2, ChevronRight, Activity, CircleCheck as CheckCircle2, CircleX as XCircle, Loader as Loader2, Star, UserCog, Bug, ShieldCheck, MessageSquare } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import Toggle from '@/components/Toggle';

interface Stats {
  coupleCount: number;
  userCount: number;
  interactionCount: number;
  diceCount: number;
  dareCount: number;
  tellMeCount: number;
  wishCount: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { colors } = useTheme();
  const [stats, setStats] = useState<Stats>({
    coupleCount: 0,
    userCount: 0,
    interactionCount: 0,
    diceCount: 0,
    dareCount: 0,
    tellMeCount: 0,
    wishCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [diag, setDiag] = useState<{ name: string; status: 'pending' | 'pass' | 'fail'; detail?: string }[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);
  const [debugToggleLoading, setDebugToggleLoading] = useState(false);

  useEffect(() => {
    console.log('[ADMIN LOAD START]');
    fetchStats();
    fetchDebugMode();
  }, []);

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
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('app_config')
      .update({ value: next, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
      .eq('key', 'debug_mode_enabled');
    setDebugToggleLoading(false);
  };

  const runDiagnostics = async () => {
    setDiagRunning(true);
    const checks: { name: string; status: 'pending' | 'pass' | 'fail'; detail?: string }[] = [
      { name: 'Read profile', status: 'pending' },
      { name: 'Write profile', status: 'pending' },
      { name: 'Read settings', status: 'pending' },
      { name: 'Write settings', status: 'pending' },
      { name: 'Storage upload + delete', status: 'pending' },
    ];
    setDiag([...checks]);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      checks.forEach(c => { c.status = 'fail'; c.detail = 'No auth session'; });
      setDiag([...checks]);
      setDiagRunning(false);
      return;
    }
    // 1. Read profile
    {
      const { data, error } = await supabase.from('profiles').select('id, display_name').eq('id', user.id).maybeSingle();
      checks[0] = error || !data
        ? { name: 'Read profile', status: 'fail', detail: error?.message ?? 'no row' }
        : { name: 'Read profile', status: 'pass', detail: data.display_name ?? '(no name)' };
      setDiag([...checks]);
    }
    // 2. Write profile (no-op update to existing display_name)
    {
      const { data, error } = await supabase.from('profiles')
        .update({ display_name: (await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()).data?.display_name ?? 'Admin' })
        .eq('id', user.id).select('id').maybeSingle();
      checks[1] = error || !data
        ? { name: 'Write profile', status: 'fail', detail: error?.message ?? 'blocked by RLS' }
        : { name: 'Write profile', status: 'pass' };
      setDiag([...checks]);
    }
    // 3. Read settings
    {
      const { data, error } = await supabase.from('user_settings').select('user_id').eq('user_id', user.id).maybeSingle();
      checks[2] = error
        ? { name: 'Read settings', status: 'fail', detail: error.message }
        : { name: 'Read settings', status: 'pass', detail: data ? 'row exists' : 'no row yet' };
      setDiag([...checks]);
    }
    // 4. Write settings (upsert)
    {
      const { data, error } = await supabase.from('user_settings').upsert(
        { user_id: user.id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      ).select('user_id').maybeSingle();
      checks[3] = error || !data
        ? { name: 'Write settings', status: 'fail', detail: error?.message ?? 'blocked by RLS' }
        : { name: 'Write settings', status: 'pass' };
      setDiag([...checks]);
    }
    // 5. Storage upload + delete
    {
      const path = `${user.id}/diag-${Date.now()}.txt`;
      const blob = new Blob(['ok'], { type: 'text/plain' });
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'text/plain', upsert: true });
      if (upErr) {
        checks[4] = { name: 'Storage upload + delete', status: 'fail', detail: upErr.message };
      } else {
        const { error: delErr } = await supabase.storage.from('avatars').remove([path]);
        checks[4] = delErr
          ? { name: 'Storage upload + delete', status: 'fail', detail: `delete: ${delErr.message}` }
          : { name: 'Storage upload + delete', status: 'pass' };
      }
      setDiag([...checks]);
    }
    setDiagRunning(false);
  };

  const fetchStats = async () => {
    const [couples, profiles, interactions, dice, dares, tellMe, wishes] = await Promise.all([
      supabase.from('couples').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('interactions').select('id', { count: 'exact', head: true }),
      supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('type', 'dice'),
      supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('type', 'dare'),
      supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('type', 'tell_me'),
      supabase.from('wishes').select('id', { count: 'exact', head: true }),
    ]);
    const hasError = [couples, profiles, interactions, dice, dares, tellMe, wishes].find(r => r.error);
    if (hasError?.error) {
      console.error('[ADMIN LOAD ERROR]', hasError.error.message);
    }
    setStats({
      coupleCount: couples.count ?? 0,
      userCount: profiles.count ?? 0,
      interactionCount: interactions.count ?? 0,
      diceCount: dice.count ?? 0,
      dareCount: dares.count ?? 0,
      tellMeCount: tellMe.count ?? 0,
      wishCount: wishes.count ?? 0,
    });
    setLoading(false);
  };

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
        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <AppText style={[styles.statNum, { color: colors.text }]}>{loading ? '—' : stats.coupleCount}</AppText>
            <AppText style={[styles.statLabel, { color: colors.textMuted }]}>Couples</AppText>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <AppText style={[styles.statNum, { color: colors.text }]}>{loading ? '—' : stats.userCount}</AppText>
            <AppText style={[styles.statLabel, { color: colors.textMuted }]}>Users</AppText>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <AppText style={[styles.statNum, { color: colors.text }]}>{loading ? '—' : stats.interactionCount}</AppText>
            <AppText style={[styles.statLabel, { color: colors.textMuted }]}>Interactions</AppText>
          </View>
        </View>

        {/* Interaction breakdown */}
        <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
          <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>INTERACTION BREAKDOWN</AppText>
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownItem}>
              <AppText style={[styles.breakdownNum, { color: '#FFB347' }]}>{loading ? '—' : stats.diceCount}</AppText>
              <AppText style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Dice</AppText>
            </View>
            <View style={[styles.breakdownDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.breakdownItem}>
              <AppText style={[styles.breakdownNum, { color: '#FF2E8A' }]}>{loading ? '—' : stats.dareCount}</AppText>
              <AppText style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Dares</AppText>
            </View>
            <View style={[styles.breakdownDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.breakdownItem}>
              <AppText style={[styles.breakdownNum, { color: '#FF8A3D' }]}>{loading ? '—' : stats.tellMeCount}</AppText>
              <AppText style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Tell Me</AppText>
            </View>
            <View style={[styles.breakdownDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.breakdownItem}>
              <AppText style={[styles.breakdownNum, { color: '#E8637A' }]}>{loading ? '—' : stats.wishCount}</AppText>
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
            <Activity color="#69A7FF" size={16} strokeWidth={2.2} />
            <AppText style={styles.diagBtnText}>{diagRunning ? 'Running checks…' : 'Run RLS & storage checks'}</AppText>
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
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
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
