import React, { useState, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Zap, MessageCircle, Star, Vault, Trophy, Flame, Clock, EyeOff } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { MonthlyScore } from '@/lib/types';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import { FontSize, Spacing, Radius } from '@/constants/theme';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function BraveMeter({ completed, skipped, label, color, countOnly }: { completed: number; skipped: number; label: string; color: string; countOnly?: boolean }) {
  const total = completed + skipped;
  const ratio = countOnly ? (completed > 0 ? 1 : 0) : (total === 0 ? 0 : completed / total);
  const countLabel = countOnly
    ? `${completed} shared`
    : `${completed} done · ${skipped} skipped`;
  return (
    <View style={bm.wrap}>
      <View style={bm.labelRow}>
        <AppText style={[bm.label, { color: '#fff' }]}>{label}</AppText>
        <AppText style={[bm.counts, { color: 'rgba(255,255,255,0.6)' }]}>{countLabel}</AppText>
      </View>
      <View style={[bm.track, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
        {ratio > 0 && (
          <View style={[bm.fill, { width: `${Math.round(ratio * 100)}%` as any, backgroundColor: color }]} />
        )}
      </View>
      {!countOnly && total > 0 && (
        <AppText style={[bm.pct, { color: 'rgba(255,255,255,0.5)' }]}>
          {Math.round(ratio * 100)}% brave
        </AppText>
      )}
    </View>
  );
}

const bm = StyleSheet.create({
  wrap: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  counts: { fontSize: 11, fontFamily: 'Inter-Regular' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  pct: { fontSize: 11, fontFamily: 'Inter-Regular', textAlign: 'right' },
});

function sumMonthlyScores(rows: MonthlyScore[]): MonthlyScore | null {
  if (rows.length === 0) return null;
  return rows.reduce<MonthlyScore>((acc, r) => ({
    ...acc,
    points: acc.points + r.points,
    dares_accepted: acc.dares_accepted + r.dares_accepted,
    dares_completed: acc.dares_completed + r.dares_completed,
    dares_skipped: acc.dares_skipped + r.dares_skipped,
    dice_accepted: acc.dice_accepted + r.dice_accepted,
    dice_completed: acc.dice_completed + r.dice_completed,
    dice_skipped: acc.dice_skipped + r.dice_skipped,
    asks_sent: acc.asks_sent + r.asks_sent,
    asks_replied: acc.asks_replied + r.asks_replied,
    chat_messages_sent: acc.chat_messages_sent + r.chat_messages_sent,
    media_sent: acc.media_sent + r.media_sent,
    vault_uploads: acc.vault_uploads + r.vault_uploads,
  }), { ...rows[0], points: 0, dares_accepted: 0, dares_completed: 0, dares_skipped: 0, dice_accepted: 0, dice_completed: 0, dice_skipped: 0, asks_sent: 0, asks_replied: 0, chat_messages_sent: 0, media_sent: 0, vault_uploads: 0 });
}

export default function MyStatsScreen() {
  const router = useRouter();
  const { user, couple, profile, partnerProfile } = useAuth();
  const { colors } = useTheme();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [myStats, setMyStats] = useState<MonthlyScore | null>(null);
  const [partnerStats, setPartnerStats] = useState<MonthlyScore | null>(null);
  const [currentMonthPoints, setCurrentMonthPoints] = useState<{ me: number; partner: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [allTime, setAllTime] = useState(false);
  const [streak, setStreak] = useState(0);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const buildStatsFromEvents = useCallback((events: { reason: string; points: number }[], uid: string): MonthlyScore => {
    const s: MonthlyScore = {
      id: '', couple_id: couple?.id ?? '', user_id: uid,
      year, month, points: events.reduce((a, e) => a + (e.points ?? 0), 0),
      dares_accepted: 0, dares_completed: 0, dares_skipped: 0,
      dice_accepted: 0, dice_completed: 0, dice_skipped: 0,
      asks_sent: 0, asks_replied: 0,
      chat_messages_sent: 0, media_sent: 0, vault_uploads: 0,
      created_at: '',
    };
    for (const e of events) {
      const r = e.reason ?? '';
      if (r.includes('Dare accepted')) s.dares_accepted++;
      else if (r.includes('Dare completed')) s.dares_completed++;
      else if (r.includes('Dare') && r.includes('participation')) s.dares_skipped++;
      else if (r.includes('Dice') && r.includes('accepted')) s.dice_accepted++;
      else if (r.includes('Dice completed')) s.dice_completed++;
      else if (r.includes('Dice') && r.includes('participation')) s.dice_skipped++;
      else if (r.includes('Ask') && r.includes('sent')) s.asks_sent++;
      else if (r.includes('Ask') && r.includes('replied')) s.asks_replied++;
      else if (r === 'Chat message') s.chat_messages_sent++;
      else if (r === 'Chat media') s.media_sent++;
      else if (r.includes('Vault')) s.vault_uploads++;
    }
    return s;
  }, [couple?.id, year, month]);

  const loadStreak = useCallback(async () => {
    if (!couple?.id) return;
    const { data } = await supabase
      .from('interactions')
      .select('created_at')
      .eq('couple_id', couple.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!data || data.length === 0) { setStreak(0); return; }
    const activeDays = new Set(data.map((r: { created_at: string }) => new Date(r.created_at).toDateString()));
    let days = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (activeDays.has(cursor.toDateString())) {
      days++;
      cursor.setDate(cursor.getDate() - 1);
    }
    setStreak(days);
  }, [couple?.id]);

  const loadAllTime = useCallback(async () => {
    if (!couple?.id || !user) return;
    setLoading(true);

    const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [myArchiveRes, partnerArchiveRes, myEventsRes, partnerEventsRes, myScoreRes, partnerScoreRes] = await Promise.all([
      supabase.from('monthly_scores').select('*').eq('couple_id', couple.id).eq('user_id', user.id),
      partnerId ? supabase.from('monthly_scores').select('*').eq('couple_id', couple.id).eq('user_id', partnerId) : Promise.resolve({ data: [] }),
      supabase.from('point_events').select('reason, points').eq('couple_id', couple.id).eq('user_id', user.id).gte('created_at', periodStart),
      partnerId ? supabase.from('point_events').select('reason, points').eq('couple_id', couple.id).eq('user_id', partnerId).gte('created_at', periodStart) : Promise.resolve({ data: [] }),
      supabase.from('scores').select('points').eq('couple_id', couple.id).eq('user_id', user.id).maybeSingle(),
      partnerId ? supabase.from('scores').select('points').eq('couple_id', couple.id).eq('user_id', partnerId).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    const myCurrentStats = buildStatsFromEvents(myEventsRes.data ?? [], user.id);
    const partnerCurrentStats = buildStatsFromEvents((partnerEventsRes as any).data ?? [], partnerId ?? '');

    const myArchived: MonthlyScore[] = myArchiveRes.data ?? [];
    const partnerArchived: MonthlyScore[] = (partnerArchiveRes as any).data ?? [];

    const myAllRows = [...myArchived, myCurrentStats];
    const partnerAllRows = [...partnerArchived, partnerCurrentStats];

    setMyStats(sumMonthlyScores(myAllRows));
    setPartnerStats(sumMonthlyScores(partnerAllRows));
    setCurrentMonthPoints({
      me: (myScoreRes.data?.points ?? 0) + (sumMonthlyScores(myArchived)?.points ?? 0),
      partner: ((partnerScoreRes as any).data?.points ?? 0) + (sumMonthlyScores(partnerArchived)?.points ?? 0),
    });

    await loadStreak();
    setLoading(false);
  }, [couple?.id, user, buildStatsFromEvents, loadStreak]);

  const load = useCallback(async () => {
    if (!couple?.id || !user) return;
    setLoading(true);

    const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;

    if (isCurrentMonth) {
      const periodStart = new Date(year, month - 1, 1).toISOString();

      const [myScoreRes, partnerScoreRes, myEventsRes, partnerEventsRes] = await Promise.all([
        supabase.from('scores').select('points').eq('couple_id', couple.id).eq('user_id', user.id).maybeSingle(),
        partnerId ? supabase.from('scores').select('points').eq('couple_id', couple.id).eq('user_id', partnerId).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('point_events').select('reason, points').eq('couple_id', couple.id).eq('user_id', user.id).gte('created_at', periodStart),
        partnerId ? supabase.from('point_events').select('reason, points').eq('couple_id', couple.id).eq('user_id', partnerId).gte('created_at', periodStart) : Promise.resolve({ data: [] }),
      ]);

      setCurrentMonthPoints({
        me: myScoreRes.data?.points ?? 0,
        partner: (partnerScoreRes as any).data?.points ?? 0,
      });

      setMyStats(buildStatsFromEvents(myEventsRes.data ?? [], user.id));
      setPartnerStats(buildStatsFromEvents((partnerEventsRes as any).data ?? [], partnerId ?? ''));
    } else {
      const [myRes, partnerRes] = await Promise.all([
        supabase.from('monthly_scores').select('*').eq('couple_id', couple.id).eq('user_id', user.id).eq('year', year).eq('month', month).maybeSingle(),
        partnerId ? supabase.from('monthly_scores').select('*').eq('couple_id', couple.id).eq('user_id', partnerId).eq('year', year).eq('month', month).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setMyStats(myRes.data);
      setPartnerStats((partnerRes as any).data);
      setCurrentMonthPoints(null);
    }

    await loadStreak();
    setLoading(false);
  }, [couple?.id, user, year, month, isCurrentMonth, buildStatsFromEvents, loadStreak]);

  useEffect(() => {
    if (allTime) {
      loadAllTime();
    } else {
      load();
    }
  }, [allTime, load, loadAllTime]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    const isNext = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
    if (isNext) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };
  const isAtPresent = year === now.getFullYear() && month === now.getMonth() + 1;

  const myPts = allTime
    ? (myStats?.points ?? 0)
    : isCurrentMonth ? (currentMonthPoints?.me ?? 0) : (myStats?.points ?? 0);
  const partnerPts = allTime
    ? (partnerStats?.points ?? 0)
    : isCurrentMonth ? (currentMonthPoints?.partner ?? 0) : (partnerStats?.points ?? 0);
  const totalPts = myPts + partnerPts;

  const categories = [
    {
      label: 'Dares', icon: <Zap color="#FF2E8A" size={18} strokeWidth={2} />,
      bg: 'rgba(255,46,138,0.12)', border: 'rgba(255,46,138,0.25)',
      myVal: (myStats?.dares_accepted ?? 0) + (myStats?.dares_completed ?? 0),
      partnerVal: (partnerStats?.dares_accepted ?? 0) + (partnerStats?.dares_completed ?? 0),
      extra: `${myStats?.dares_skipped ?? 0} skipped`,
    },
    {
      label: 'Dice Rolls', icon: <Star color="#FFB347" size={18} strokeWidth={2} />,
      bg: 'rgba(255,179,71,0.12)', border: 'rgba(255,179,71,0.25)',
      myVal: (myStats?.dice_accepted ?? 0) + (myStats?.dice_completed ?? 0),
      partnerVal: (partnerStats?.dice_accepted ?? 0) + (partnerStats?.dice_completed ?? 0),
      extra: `${myStats?.dice_skipped ?? 0} skipped`,
    },
    {
      label: 'Ask', icon: <MessageCircle color="#FF8A3D" size={18} strokeWidth={2} />,
      bg: 'rgba(255,138,61,0.12)', border: 'rgba(255,138,61,0.25)',
      myVal: (myStats?.asks_sent ?? 0) + (myStats?.asks_replied ?? 0),
      partnerVal: (partnerStats?.asks_sent ?? 0) + (partnerStats?.asks_replied ?? 0),
      extra: `${myStats?.asks_sent ?? 0} asked · ${myStats?.asks_replied ?? 0} replied`,
    },
    {
      label: 'Chat', icon: <MessageCircle color="#69A7FF" size={18} strokeWidth={2} />,
      bg: 'rgba(105,167,255,0.12)', border: 'rgba(105,167,255,0.25)',
      myVal: myStats?.chat_messages_sent ?? 0,
      partnerVal: partnerStats?.chat_messages_sent ?? 0,
      extra: `${myStats?.media_sent ?? 0} media sent`,
    },
    {
      label: 'Vault Uploads', icon: <Vault color="#A78BFA" size={18} strokeWidth={2} />,
      bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)',
      myVal: myStats?.vault_uploads ?? 0,
      partnerVal: partnerStats?.vault_uploads ?? 0,
      extra: '',
    },
  ];

  const myName = profile?.display_name ?? 'You';
  const partnerName = partnerProfile?.display_name ?? 'Partner';

  return (
    <AppShell>
      <ScreenHeader title="My Stats" onBack={() => router.back()} />

      {/* Month selector */}
      <View style={[styles.monthNav, { borderBottomColor: colors.borderSubtle }]}>
        <TouchableOpacity
          onPress={prevMonth}
          style={[styles.navBtn, { opacity: allTime ? 0.3 : 1 }]}
          activeOpacity={0.7}
          disabled={allTime}
        >
          <ChevronLeft color={colors.textSecondary} size={22} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.monthCenter}>
          {allTime ? (
            <AppText style={[styles.monthLabel, { color: colors.text }]}>All Time</AppText>
          ) : (
            <AppText style={[styles.monthLabel, { color: colors.text }]}>
              {MONTH_NAMES[month - 1]} {year}
              {isCurrentMonth ? <AppText style={[styles.currentBadge, { color: colors.accentPink ?? '#FF2E8A' }]}> · Current</AppText> : null}
            </AppText>
          )}
        </View>
        <View style={styles.navRight}>
          <TouchableOpacity
            onPress={() => setAllTime(v => !v)}
            style={[styles.allTimeBtn, allTime && { backgroundColor: 'rgba(255,90,61,0.15)', borderColor: 'rgba(255,90,61,0.35)' }]}
            activeOpacity={0.7}
          >
            <Clock color={allTime ? '#FF5A3D' : colors.textMuted} size={17} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={nextMonth}
            style={[styles.navBtn, { opacity: (isAtPresent || allTime) ? 0.3 : 1 }]}
            activeOpacity={0.7}
            disabled={isAtPresent || allTime}
          >
            <ChevronRight color={colors.textSecondary} size={22} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#FF5A3D" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {!(couple?.points_enabled ?? true) && (
            <View style={[styles.hiddenBanner, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.borderSubtle }]}>
              <EyeOff color={colors.textMuted} size={16} strokeWidth={1.75} />
              <AppText style={[styles.hiddenBannerText, { color: colors.textMuted }]}>
                Points are hidden — scores shown below are still being tracked in the background.
              </AppText>
            </View>
          )}

          {/* Points VS card */}
          <LinearGradient colors={['rgba(255,179,71,0.15)', 'rgba(255,46,138,0.10)']} style={[styles.vsCard, { borderColor: colors.borderSubtle }]}>
            <View style={styles.vsInner}>
              <View style={styles.vsSide}>
                <View style={[styles.vsAvatar, { backgroundColor: 'rgba(255,90,61,0.20)' }]}>
                  <AppText style={[styles.vsAvatarText, { color: '#FF5A3D' }]}>{myName.charAt(0).toUpperCase()}</AppText>
                </View>
                <AppText style={[styles.vsName, { color: colors.textSecondary }]}>{myName}</AppText>
                <AppText style={[styles.vsPts, { color: colors.text }]}>{myPts}</AppText>
                <AppText style={[styles.vsPtsLabel, { color: colors.textMuted }]}>pts</AppText>
              </View>
              <View style={styles.vsCenter}>
                <Trophy color="#FFB347" size={22} strokeWidth={2} />
                <AppText style={[styles.vsVS, { color: colors.textMuted }]}>VS</AppText>
              </View>
              <View style={styles.vsSide}>
                <View style={[styles.vsAvatar, { backgroundColor: 'rgba(255,138,61,0.20)' }]}>
                  <AppText style={[styles.vsAvatarText, { color: '#FF8A3D' }]}>{partnerName.charAt(0).toUpperCase()}</AppText>
                </View>
                <AppText style={[styles.vsName, { color: colors.textSecondary }]}>{partnerName}</AppText>
                <AppText style={[styles.vsPts, { color: colors.text }]}>{partnerPts}</AppText>
                <AppText style={[styles.vsPtsLabel, { color: colors.textMuted }]}>pts</AppText>
              </View>
            </View>
            {totalPts > 0 && (
              <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.10)' }]}>
                <View style={[styles.progressFill, { width: `${Math.round((myPts / totalPts) * 100)}%` as any, backgroundColor: '#FF5A3D' }]} />
              </View>
            )}
            {(couple?.streaks_enabled ?? true) && (
              <View style={styles.streakRow}>
                <Flame color="#FF5A5F" size={13} strokeWidth={2} />
                <AppText style={[styles.streakValue, { color: colors.text }]}>{streak}</AppText>
                <AppText style={[styles.streakLabel, { color: colors.textMuted }]}>day streak</AppText>
              </View>
            )}
          </LinearGradient>

          {/* Brave Meter */}
          <View style={[styles.braveSection, { backgroundColor: 'rgba(255,45,45,0.08)', borderColor: 'rgba(255,90,95,0.25)' }]}>
            <View style={styles.braveSectionHeader}>
              <Flame color="#FF5A5F" size={18} strokeWidth={2} />
              <AppText style={[styles.braveSectionTitle, { color: colors.text }]}>Brave Meter</AppText>
            </View>
            <BraveMeter
              completed={(myStats?.dares_completed ?? 0)}
              skipped={(myStats?.dares_skipped ?? 0)}
              label="Dares"
              color="#FF2E8A"
            />
            <View style={[styles.braveDivider, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
            <BraveMeter
              completed={(myStats?.dice_completed ?? 0)}
              skipped={(myStats?.dice_skipped ?? 0)}
              label="Dice Challenges"
              color="#FFB347"
            />
            <View style={[styles.braveDivider, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
            <BraveMeter
              completed={(myStats?.vault_uploads ?? 0)}
              skipped={0}
              label="Vault Uploads"
              color="#33D17A"
              countOnly
            />
          </View>

          {/* Category breakdown */}
          <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR BREAKDOWN</AppText>
          {categories.map(cat => (
            <View key={cat.label} style={[styles.catCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={[styles.catIcon, { backgroundColor: cat.bg, borderColor: cat.border }]}>
                {cat.icon}
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={[styles.catLabel, { color: colors.text }]}>{cat.label}</AppText>
                {cat.extra ? <AppText style={[styles.catExtra, { color: colors.textMuted }]}>{cat.extra}</AppText> : null}
              </View>
              <View style={styles.catValues}>
                <View style={styles.catVal}>
                  <AppText style={[styles.catNum, { color: colors.text }]}>{cat.myVal}</AppText>
                  <AppText style={[styles.catValLabel, { color: colors.textMuted }]}>{myName.split(' ')[0]}</AppText>
                </View>
                <View style={[styles.catDivider, { backgroundColor: colors.borderSubtle }]} />
                <View style={styles.catVal}>
                  <AppText style={[styles.catNum, { color: colors.text }]}>{cat.partnerVal}</AppText>
                  <AppText style={[styles.catValLabel, { color: colors.textMuted }]}>{partnerName.split(' ')[0]}</AppText>
                </View>
              </View>
            </View>
          ))}

          {!myStats && !isCurrentMonth && !allTime && (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <AppText style={[styles.emptyTitle, { color: colors.text }]}>No data for this month</AppText>
              <AppText style={[styles.emptySub, { color: colors.textSecondary }]}>Stats are saved at the end of each month.</AppText>
            </View>
          )}
        </ScrollView>
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.screen, paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  monthCenter: { flex: 1, alignItems: 'center' },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  navBtn: { padding: 6 },
  allTimeBtn: { padding: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: 'transparent' },
  monthLabel: { fontSize: FontSize.body, fontFamily: 'Inter-Bold' },
  currentBadge: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 60, paddingTop: Spacing.md },
  vsCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, marginBottom: Spacing.lg, gap: Spacing.md },
  vsInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  vsSide: { flex: 1, alignItems: 'center', gap: 4 },
  vsAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  vsAvatarText: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold' },
  vsName: { fontSize: 11, fontFamily: 'Inter-Medium', letterSpacing: 0.3 },
  vsPts: { fontSize: 36, fontFamily: 'Inter-Bold', lineHeight: 42 },
  vsPtsLabel: { fontSize: 11, fontFamily: 'Inter-Medium', marginTop: -2 },
  vsCenter: { alignItems: 'center', gap: 4 },
  vsVS: { fontSize: 11, fontFamily: 'Inter-Bold', letterSpacing: 1 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  streakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 2 },
  streakValue: { fontSize: 13, fontFamily: 'Inter-Bold' },
  streakLabel: { fontSize: 12, fontFamily: 'Inter-Regular' },
  braveSection: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, gap: Spacing.md, marginBottom: Spacing.lg },
  braveSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  braveSectionTitle: { fontSize: FontSize.body, fontFamily: 'Inter-Bold' },
  braveDivider: { height: 1 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2, marginBottom: Spacing.sm },
  catCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm },
  catIcon: { width: 40, height: 40, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  catLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  catExtra: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  catValues: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  catVal: { alignItems: 'center', gap: 2, minWidth: 36 },
  catNum: { fontSize: FontSize.body, fontFamily: 'Inter-Bold' },
  catValLabel: { fontSize: 10, fontFamily: 'Inter-Medium' },
  catDivider: { width: 1, height: 28 },
  emptyCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg },
  emptyTitle: { fontSize: FontSize.body, fontFamily: 'Inter-Bold', textAlign: 'center' },
  emptySub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20 },
  hiddenBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  hiddenBannerText: { flex: 1, fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 17 },
});
