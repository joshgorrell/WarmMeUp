import React, { useState, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, Zap, MessageCircle, Star, Vault, Heart, Flame, Clock, EyeOff, Bug } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { MonthlyScore, PointEvent } from '@/lib/types';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import { FontSize, Spacing, Radius } from '@/constants/theme';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// Per-category point sums for the current month (derived from raw point_events).
// Historical months only have counts stored in monthly_scores, so pts fields are null.
interface CategoryPoints {
  pts_dares: number | null;
  pts_dice: number | null;
  pts_wish: number | null;
  pts_chat: number | null;
  pts_vault: number | null;
}

interface StatsResult {
  monthly: MonthlyScore;
  catPts: CategoryPoints;
}

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
    wishes_sent: acc.wishes_sent + r.wishes_sent,
    wishes_fulfilled: acc.wishes_fulfilled + r.wishes_fulfilled,
    chat_messages_sent: acc.chat_messages_sent + r.chat_messages_sent,
    media_sent: acc.media_sent + r.media_sent,
    vault_uploads: acc.vault_uploads + r.vault_uploads,
  }), {
    ...rows[0],
    points: 0,
    dares_accepted: 0, dares_completed: 0, dares_skipped: 0,
    dice_accepted: 0, dice_completed: 0, dice_skipped: 0,
    asks_sent: 0, asks_replied: 0,
    wishes_sent: 0, wishes_fulfilled: 0,
    chat_messages_sent: 0, media_sent: 0, vault_uploads: 0,
  });
}

// Builds a MonthlyScore (counts) AND per-category point sums from raw point_events.
// This is used for the current month where we have actual event records.
// The .points field on MonthlyScore is the true sum of all awarded points.
// Category point sums guarantee: pts_dares + pts_dice + pts_wish + pts_chat + pts_vault === monthly.points
function buildStatsFromEvents(
  events: Pick<PointEvent, 'reason' | 'points'>[],
  uid: string,
  coupleId: string,
  year: number,
  month: number,
): StatsResult {
  const monthly: MonthlyScore = {
    id: '', couple_id: coupleId, user_id: uid,
    year, month, points: 0,
    dares_accepted: 0, dares_completed: 0, dares_skipped: 0,
    dice_accepted: 0, dice_completed: 0, dice_skipped: 0,
    asks_sent: 0, asks_replied: 0,
    wishes_sent: 0, wishes_fulfilled: 0,
    chat_messages_sent: 0, media_sent: 0, vault_uploads: 0,
    created_at: '',
  };
  const catPts: CategoryPoints = {
    pts_dares: 0,
    pts_dice: 0,
    pts_wish: 0,
    pts_chat: 0,
    pts_vault: 0,
  };

  for (const e of events) {
    const r = e.reason ?? '';
    const p = e.points ?? 0;
    monthly.points += p;

    if (r.includes('Dare accepted')) { monthly.dares_accepted++; catPts.pts_dares! += p; }
    else if (r.includes('Dare completed')) { monthly.dares_completed++; catPts.pts_dares! += p; }
    else if (r.includes('Dare') && r.includes('participation')) { monthly.dares_skipped++; catPts.pts_dares! += p; }
    else if (r.includes('Dice') && r.includes('accepted')) { monthly.dice_accepted++; catPts.pts_dice! += p; }
    else if (r.includes('Dice completed')) { monthly.dice_completed++; catPts.pts_dice! += p; }
    else if (r.includes('Dice') && r.includes('participation')) { monthly.dice_skipped++; catPts.pts_dice! += p; }
    else if (r.includes('Dice') && r.includes('self-roll')) { catPts.pts_dice! += p; }
    else if (r.includes('Ask') && r.includes('sent')) { monthly.asks_sent++; catPts.pts_wish! += p; }
    else if (r.includes('Ask') && r.includes('replied')) { monthly.asks_replied++; catPts.pts_wish! += p; }
    else if (r === 'Wish shared') { monthly.wishes_sent++; catPts.pts_wish! += p; }
    else if (r === 'Wish granted') { monthly.wishes_fulfilled++; catPts.pts_wish! += p; }
    else if (r === 'Chat message') { monthly.chat_messages_sent++; catPts.pts_chat! += p; }
    else if (r === 'Chat media') { monthly.media_sent++; catPts.pts_chat! += p; }
    else if (r.includes('Vault')) { monthly.vault_uploads++; catPts.pts_vault! += p; }
    // Uncategorised events still add to monthly.points via the top-of-loop increment
  }

  return { monthly, catPts };
}

interface DebugInfo {
  couple_id: string;
  points_month_start: string;
  points_month_end: string;
  points_total_source: string;
  my_event_count: number;
  partner_event_count: number;
  my_raw_events: Pick<PointEvent, 'reason' | 'points' | 'created_at'>[];
  partner_raw_events: Pick<PointEvent, 'reason' | 'points' | 'created_at'>[];
  my_cat_pts: CategoryPoints | null;
  partner_cat_pts: CategoryPoints | null;
}

export default function MyStatsScreen() {
  const router = useRouter();
  const { user, couple, profile, partnerProfile, scoreResetAt } = useAuth();
  const { colors } = useTheme();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [myStats, setMyStats] = useState<MonthlyScore | null>(null);
  const [partnerStats, setPartnerStats] = useState<MonthlyScore | null>(null);
  // Per-category point sums — only populated for current month (from point_events)
  const [myCatPts, setMyCatPts] = useState<CategoryPoints | null>(null);
  const [partnerCatPts, setPartnerCatPts] = useState<CategoryPoints | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allTime, setAllTime] = useState(false);
  const [streak, setStreak] = useState(0);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

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
    setRefreshing(true);

    const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const [myArchiveRes, partnerArchiveRes, myEventsRes, partnerEventsRes] = await Promise.all([
      supabase.from('monthly_scores').select('*').eq('couple_id', couple.id).eq('user_id', user.id),
      partnerId ? supabase.from('monthly_scores').select('*').eq('couple_id', couple.id).eq('user_id', partnerId) : Promise.resolve({ data: [] }),
      supabase.from('point_events').select('reason, points, created_at').eq('couple_id', couple.id).eq('user_id', user.id).gte('created_at', periodStart),
      partnerId ? supabase.from('point_events').select('reason, points, created_at').eq('couple_id', couple.id).eq('user_id', partnerId).gte('created_at', periodStart) : Promise.resolve({ data: [] }),
      loadStreak(),
    ]);

    const myEvts = myEventsRes.data ?? [];
    const partnerEvts = (partnerEventsRes as any).data ?? [];

    const myCurrent = buildStatsFromEvents(myEvts, user.id, couple.id, now.getFullYear(), now.getMonth() + 1);
    const partnerCurrent = buildStatsFromEvents(partnerEvts, partnerId ?? '', couple.id, now.getFullYear(), now.getMonth() + 1);

    const myArchived: MonthlyScore[] = myArchiveRes.data ?? [];
    const partnerArchived: MonthlyScore[] = (partnerArchiveRes as any).data ?? [];

    // For all-time, exclude the current month's monthly_scores row (if it exists prematurely)
    // to avoid double-counting — use point_events for current month instead
    const currentMonthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    const myArchivedPrior = myArchived.filter(r => `${r.year}-${r.month}` !== currentMonthKey);
    const partnerArchivedPrior = partnerArchived.filter(r => `${r.year}-${r.month}` !== currentMonthKey);

    const myAllRows = [...myArchivedPrior, myCurrent.monthly];
    const partnerAllRows = [...partnerArchivedPrior, partnerCurrent.monthly];

    setMyStats(sumMonthlyScores(myAllRows));
    setPartnerStats(sumMonthlyScores(partnerAllRows));
    // For all-time view, don't show per-category pts (mix of counts and points)
    setMyCatPts(null);
    setPartnerCatPts(null);

    setDebugInfo({
      couple_id: couple.id,
      points_month_start: periodStart,
      points_month_end: periodEnd,
      points_total_source: 'monthly_scores (archived) + point_events (current month)',
      my_event_count: myEvts.length,
      partner_event_count: partnerEvts.length,
      my_raw_events: myEvts,
      partner_raw_events: partnerEvts,
      my_cat_pts: myCurrent.catPts,
      partner_cat_pts: partnerCurrent.catPts,
    });

    setLoading(false);
    setRefreshing(false);
  }, [couple?.id, user, loadStreak]);

  const load = useCallback(async () => {
    if (!couple?.id || !user) return;
    setRefreshing(true);

    const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;

    if (isCurrentMonth) {
      const periodStart = new Date(year, month - 1, 1).toISOString();
      const periodEnd = new Date(year, month, 0, 23, 59, 59).toISOString();

      const [myEventsRes, partnerEventsRes] = await Promise.all([
        supabase.from('point_events').select('reason, points, created_at').eq('couple_id', couple.id).eq('user_id', user.id).gte('created_at', periodStart),
        partnerId ? supabase.from('point_events').select('reason, points, created_at').eq('couple_id', couple.id).eq('user_id', partnerId).gte('created_at', periodStart) : Promise.resolve({ data: [] }),
        loadStreak(),
      ]);

      const myEvts = myEventsRes.data ?? [];
      const partnerEvts = (partnerEventsRes as any).data ?? [];

      const myResult = buildStatsFromEvents(myEvts, user.id, couple.id, year, month);
      const partnerResult = buildStatsFromEvents(partnerEvts, partnerId ?? '', couple.id, year, month);

      // Top total comes directly from point_events sum — guaranteed to match category breakdown
      setMyStats(myResult.monthly);
      setPartnerStats(partnerResult.monthly);
      setMyCatPts(myResult.catPts);
      setPartnerCatPts(partnerResult.catPts);

      setDebugInfo({
        couple_id: couple.id,
        points_month_start: periodStart,
        points_month_end: periodEnd,
        points_total_source: 'point_events (current month sum)',
        my_event_count: myEvts.length,
        partner_event_count: partnerEvts.length,
        my_raw_events: myEvts,
        partner_raw_events: partnerEvts,
        my_cat_pts: myResult.catPts,
        partner_cat_pts: partnerResult.catPts,
      });
    } else {
      const [myRes, partnerRes] = await Promise.all([
        supabase.from('monthly_scores').select('*').eq('couple_id', couple.id).eq('user_id', user.id).eq('year', year).eq('month', month).maybeSingle(),
        partnerId ? supabase.from('monthly_scores').select('*').eq('couple_id', couple.id).eq('user_id', partnerId).eq('year', year).eq('month', month).maybeSingle() : Promise.resolve({ data: null }),
        loadStreak(),
      ]);
      setMyStats(myRes.data);
      setPartnerStats((partnerRes as any).data);
      // Historical months: no per-category point sums available (only counts in monthly_scores)
      setMyCatPts(null);
      setPartnerCatPts(null);

      setDebugInfo({
        couple_id: couple.id,
        points_month_start: new Date(year, month - 1, 1).toISOString(),
        points_month_end: new Date(year, month, 0, 23, 59, 59).toISOString(),
        points_total_source: 'monthly_scores (archived row)',
        my_event_count: 0,
        partner_event_count: 0,
        my_raw_events: [],
        partner_raw_events: [],
        my_cat_pts: null,
        partner_cat_pts: null,
      });
    }

    setLoading(false);
    setRefreshing(false);
  }, [couple?.id, user, year, month, isCurrentMonth, loadStreak]);

  useEffect(() => {
    if (allTime) {
      loadAllTime();
    } else {
      load();
    }
  }, [allTime, load, loadAllTime]);

  // Reload when the user navigates back to this screen.
  useFocusEffect(useCallback(() => {
    if (allTime) { loadAllTime(); } else { load(); }
  }, [allTime, load, loadAllTime]));

  // Reload immediately when Reset Points completes.
  useEffect(() => {
    if (scoreResetAt === 0) return;
    if (allTime) { loadAllTime(); } else { load(); }
  }, [scoreResetAt]);

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

  // For current month and all-time, top total comes from myStats.points (point_events sum).
  // For historical months, comes from monthly_scores.points.
  const myPts = myStats?.points ?? 0;
  const partnerPts = partnerStats?.points ?? 0;
  const totalPts = myPts + partnerPts;

  // Category breakdown values:
  // - Current month: show points earned per category (sums to top total)
  // - Historical/all-time: show interaction counts (pts fields are null)
  const showPts = myCatPts !== null;

  const categories = [
    {
      label: 'Dares',
      icon: <Zap color="#FF2E8A" size={18} strokeWidth={2} />,
      bg: 'rgba(255,46,138,0.12)', border: 'rgba(255,46,138,0.25)',
      myVal: showPts ? (myCatPts!.pts_dares ?? 0) : (myStats?.dares_accepted ?? 0) + (myStats?.dares_completed ?? 0),
      partnerVal: showPts ? (partnerCatPts?.pts_dares ?? 0) : (partnerStats?.dares_accepted ?? 0) + (partnerStats?.dares_completed ?? 0),
      unit: showPts ? '⚡' : 'done',
      extra: showPts
        ? `${(myStats?.dares_accepted ?? 0) + (myStats?.dares_completed ?? 0)} accepted/completed · ${myStats?.dares_skipped ?? 0} skipped`
        : `${myStats?.dares_skipped ?? 0} skipped`,
    },
    {
      label: 'Dice Rolls',
      icon: <Star color="#FFB347" size={18} strokeWidth={2} />,
      bg: 'rgba(255,179,71,0.12)', border: 'rgba(255,179,71,0.25)',
      myVal: showPts ? (myCatPts!.pts_dice ?? 0) : (myStats?.dice_accepted ?? 0) + (myStats?.dice_completed ?? 0),
      partnerVal: showPts ? (partnerCatPts?.pts_dice ?? 0) : (partnerStats?.dice_accepted ?? 0) + (partnerStats?.dice_completed ?? 0),
      unit: showPts ? '⚡' : 'done',
      extra: showPts
        ? `${(myStats?.dice_accepted ?? 0) + (myStats?.dice_completed ?? 0)} accepted/completed · ${myStats?.dice_skipped ?? 0} skipped`
        : `${myStats?.dice_skipped ?? 0} skipped`,
    },
    {
      label: 'Wishes & Asks',
      icon: <MessageCircle color="#FF8A3D" size={18} strokeWidth={2} />,
      bg: 'rgba(255,138,61,0.12)', border: 'rgba(255,138,61,0.25)',
      myVal: showPts ? (myCatPts!.pts_wish ?? 0) : (myStats?.wishes_sent ?? 0) + (myStats?.wishes_fulfilled ?? 0) + (myStats?.asks_sent ?? 0) + (myStats?.asks_replied ?? 0),
      partnerVal: showPts ? (partnerCatPts?.pts_wish ?? 0) : (partnerStats?.wishes_sent ?? 0) + (partnerStats?.wishes_fulfilled ?? 0) + (partnerStats?.asks_sent ?? 0) + (partnerStats?.asks_replied ?? 0),
      unit: showPts ? '⚡' : 'done',
      extra: showPts
        ? `${myStats?.wishes_sent ?? 0} wished · ${myStats?.wishes_fulfilled ?? 0} granted · ${myStats?.asks_sent ?? 0} asked`
        : `${myStats?.wishes_sent ?? 0} wished · ${myStats?.asks_sent ?? 0} asked`,
    },
    {
      label: 'Chat Messages',
      icon: <MessageCircle color="#69A7FF" size={18} strokeWidth={2} />,
      bg: 'rgba(105,167,255,0.12)', border: 'rgba(105,167,255,0.25)',
      myVal: showPts ? (myCatPts!.pts_chat ?? 0) : (myStats?.chat_messages_sent ?? 0) + (myStats?.media_sent ?? 0),
      partnerVal: showPts ? (partnerCatPts?.pts_chat ?? 0) : (partnerStats?.chat_messages_sent ?? 0) + (partnerStats?.media_sent ?? 0),
      unit: showPts ? '⚡' : 'sent',
      extra: showPts
        ? `${myStats?.chat_messages_sent ?? 0} messages · ${myStats?.media_sent ?? 0} media`
        : `${myStats?.media_sent ?? 0} media sent`,
    },
    {
      label: 'Vault Uploads',
      icon: <Vault color="#33D17A" size={18} strokeWidth={2} />,
      bg: 'rgba(51,209,122,0.12)', border: 'rgba(51,209,122,0.25)',
      myVal: showPts ? (myCatPts!.pts_vault ?? 0) : (myStats?.vault_uploads ?? 0),
      partnerVal: showPts ? (partnerCatPts?.pts_vault ?? 0) : (partnerStats?.vault_uploads ?? 0),
      unit: showPts ? '⚡' : 'uploads',
      extra: showPts ? `${myStats?.vault_uploads ?? 0} uploads` : '',
    },
  ];

  const myName = profile?.display_name ?? 'You';
  const partnerName = partnerProfile?.display_name ?? 'Partner';
  const myFirstName = profile?.first_name || myName.split(' ')[0];
  const partnerFirstName = partnerProfile?.first_name || partnerName.split(' ')[0];

  const isFirstLoad = loading && myStats === null && partnerStats === null;

  return (
    <AppShell noTopPadding>
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
          {refreshing && <ActivityIndicator size="small" color="#FF5A3D" style={{ marginRight: 4 }} />}
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

      {isFirstLoad ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#FF5A3D" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {!(couple?.points_enabled ?? true) && (
            <View style={[styles.hiddenBanner, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.borderSubtle }]}>
              <EyeOff color={colors.textMuted} size={16} strokeWidth={1.75} />
              <AppText style={[styles.hiddenBannerText, { color: colors.textMuted }]}>
                Sparks are hidden — scores shown below are still being tracked in the background.
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
                <AppText style={styles.vsSparksLabel}>Sparks ⚡</AppText>
              </View>
              <View style={styles.vsHeartWrap}>
                <Heart color="#FF2E8A" size={88} fill="rgba(255,46,138,0.22)" strokeWidth={1.5} />
                <View style={styles.vsHeartOverlay}>
                  <AppText style={styles.vsHeartScore}>{totalPts}</AppText>
                  <AppText style={styles.vsHeartLabel}>Together{'\n'}Sparks</AppText>
                </View>
              </View>
              <View style={[styles.vsSide, { alignItems: 'flex-end' }]}>
                <View style={[styles.vsAvatar, { backgroundColor: 'rgba(255,138,61,0.20)' }]}>
                  <AppText style={[styles.vsAvatarText, { color: '#FF8A3D' }]}>{partnerName.charAt(0).toUpperCase()}</AppText>
                </View>
                <AppText style={[styles.vsName, { color: colors.textSecondary }]}>{partnerName}</AppText>
                <AppText style={[styles.vsPts, { color: colors.text }]}>{partnerPts}</AppText>
                <AppText style={styles.vsSparksLabel}>Sparks ⚡</AppText>
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
          <View style={styles.sectionLabelRow}>
            <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR BREAKDOWN</AppText>
            {showPts && (
              <AppText style={[styles.sectionLabelSub, { color: colors.textMuted }]}>points earned</AppText>
            )}
          </View>
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
                  <AppText style={[styles.catValLabel, { color: colors.textMuted }]}>{myFirstName}</AppText>
                </View>
                <View style={[styles.catDivider, { backgroundColor: colors.borderSubtle }]} />
                <View style={styles.catVal}>
                  <AppText style={[styles.catNum, { color: colors.text }]}>{cat.partnerVal}</AppText>
                  <AppText style={[styles.catValLabel, { color: colors.textMuted }]}>{partnerFirstName}</AppText>
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

          {/* Debug panel */}
          {debugInfo && (
            <View style={styles.debugWrap}>
              <TouchableOpacity
                onPress={() => setShowDebug(v => !v)}
                style={[styles.debugToggle, { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)' }]}
                activeOpacity={0.7}
              >
                <Bug color="rgba(255,255,255,0.35)" size={14} strokeWidth={2} />
                <AppText style={styles.debugToggleText}>Debug Info</AppText>
                <AppText style={styles.debugToggleChevron}>{showDebug ? '▲' : '▼'}</AppText>
              </TouchableOpacity>
              {showDebug && (
                <View style={[styles.debugPanel, { borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                  <DebugRow label="couple_id" value={debugInfo.couple_id} />
                  <DebugRow label="points_month_start" value={debugInfo.points_month_start} />
                  <DebugRow label="points_month_end" value={debugInfo.points_month_end} />
                  <DebugRow label="points_total_source" value={debugInfo.points_total_source} />
                  <DebugRow label="my_event_count" value={String(debugInfo.my_event_count)} />
                  <DebugRow label="partner_event_count" value={String(debugInfo.partner_event_count)} />

                  {debugInfo.my_cat_pts && (
                    <>
                      <AppText style={styles.debugSection}>{myName} category pts</AppText>
                      <DebugRow label="  pts_dares" value={String(debugInfo.my_cat_pts.pts_dares)} />
                      <DebugRow label="  pts_dice" value={String(debugInfo.my_cat_pts.pts_dice)} />
                      <DebugRow label="  pts_wish" value={String(debugInfo.my_cat_pts.pts_wish)} />
                      <DebugRow label="  pts_chat" value={String(debugInfo.my_cat_pts.pts_chat)} />
                      <DebugRow label="  pts_vault" value={String(debugInfo.my_cat_pts.pts_vault)} />
                      <DebugRow
                        label="  sum"
                        value={String(
                          (debugInfo.my_cat_pts.pts_dares ?? 0) +
                          (debugInfo.my_cat_pts.pts_dice ?? 0) +
                          (debugInfo.my_cat_pts.pts_wish ?? 0) +
                          (debugInfo.my_cat_pts.pts_chat ?? 0) +
                          (debugInfo.my_cat_pts.pts_vault ?? 0)
                        )}
                      />
                    </>
                  )}

                  {debugInfo.partner_cat_pts && (
                    <>
                      <AppText style={styles.debugSection}>{partnerName} category pts</AppText>
                      <DebugRow label="  pts_dares" value={String(debugInfo.partner_cat_pts.pts_dares)} />
                      <DebugRow label="  pts_dice" value={String(debugInfo.partner_cat_pts.pts_dice)} />
                      <DebugRow label="  pts_wish" value={String(debugInfo.partner_cat_pts.pts_wish)} />
                      <DebugRow label="  pts_chat" value={String(debugInfo.partner_cat_pts.pts_chat)} />
                      <DebugRow label="  pts_vault" value={String(debugInfo.partner_cat_pts.pts_vault)} />
                      <DebugRow
                        label="  sum"
                        value={String(
                          (debugInfo.partner_cat_pts.pts_dares ?? 0) +
                          (debugInfo.partner_cat_pts.pts_dice ?? 0) +
                          (debugInfo.partner_cat_pts.pts_wish ?? 0) +
                          (debugInfo.partner_cat_pts.pts_chat ?? 0) +
                          (debugInfo.partner_cat_pts.pts_vault ?? 0)
                        )}
                      />
                    </>
                  )}

                  {debugInfo.my_raw_events.length > 0 && (
                    <>
                      <AppText style={styles.debugSection}>{myName} raw events</AppText>
                      {debugInfo.my_raw_events.map((ev, i) => (
                        <DebugRow
                          key={i}
                          label={`  [${i + 1}] ${ev.reason}`}
                          value={`+${ev.points} · ${new Date(ev.created_at ?? '').toLocaleDateString()}`}
                        />
                      ))}
                    </>
                  )}

                  {debugInfo.partner_raw_events.length > 0 && (
                    <>
                      <AppText style={styles.debugSection}>{partnerName} raw events</AppText>
                      {debugInfo.partner_raw_events.map((ev, i) => (
                        <DebugRow
                          key={i}
                          label={`  [${i + 1}] ${ev.reason}`}
                          value={`+${ev.points} · ${new Date(ev.created_at ?? '').toLocaleDateString()}`}
                        />
                      ))}
                    </>
                  )}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </AppShell>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.debugRow}>
      <AppText style={styles.debugKey} numberOfLines={1}>{label}</AppText>
      <AppText style={styles.debugVal} numberOfLines={2}>{value}</AppText>
    </View>
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
  vsSparksLabel: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#FF8A3D' },
  vsHeartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF2E8A',
    shadowRadius: 16,
    shadowOpacity: 0.65,
    shadowOffset: { width: 0, height: 0 },
  },
  vsHeartOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 6,
  },
  vsHeartScore: { fontSize: 24, fontFamily: 'Inter-Bold', color: '#fff', lineHeight: 28 },
  vsHeartLabel: { fontSize: 9, fontFamily: 'Inter-SemiBold', color: '#FF2E8A', textAlign: 'center', lineHeight: 12 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  streakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 2 },
  streakValue: { fontSize: 13, fontFamily: 'Inter-Bold' },
  streakLabel: { fontSize: 12, fontFamily: 'Inter-Regular' },
  braveSection: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, gap: Spacing.md, marginBottom: Spacing.lg },
  braveSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  braveSectionTitle: { fontSize: FontSize.body, fontFamily: 'Inter-Bold' },
  braveDivider: { height: 1 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2 },
  sectionLabelSub: { fontSize: 10, fontFamily: 'Inter-Regular', letterSpacing: 0.5 },
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
  // Debug panel
  debugWrap: { marginTop: Spacing.lg },
  debugToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.sm, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  debugToggleText: { fontSize: 11, fontFamily: 'Inter-Medium', color: 'rgba(255,255,255,0.35)' },
  debugToggleChevron: { fontSize: 9, color: 'rgba(255,255,255,0.25)', marginLeft: 2 },
  debugPanel: { marginTop: 6, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, gap: 3 },
  debugSection: { fontSize: 10, fontFamily: 'Inter-SemiBold', color: 'rgba(255,179,71,0.7)', marginTop: 6, letterSpacing: 0.5 },
  debugRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  debugKey: { fontSize: 10, fontFamily: 'Inter-Regular', color: 'rgba(255,255,255,0.4)', flex: 1 },
  debugVal: { fontSize: 10, fontFamily: 'Inter-Medium', color: 'rgba(255,255,255,0.65)', flexShrink: 0, maxWidth: '55%', textAlign: 'right' },
});
