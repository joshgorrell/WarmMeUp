import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import BottomSheet from '@/components/BottomSheet';
import { Calendar, ChevronDown } from 'lucide-react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoupleStats {
  couple_id: string;
  user_a_name: string;
  user_b_name: string | null;
  dice: number;
  dare: number;
  tell_me: number;
  chat: number;
  dare_skipped: number;
  dice_skipped: number;
  total: number;
}

interface UserScore {
  user_id: string;
  display_name: string;
  points: number;
}

interface DateRange {
  from: string | null; // YYYY-MM-DD
  to: string | null;
}

interface MonthYear { year: number; month: number }

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
}
function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function startOfYearISO(): string { return `${new Date().getFullYear()}-01-01`; }

function monthYearToISOStart(my: MonthYear): string {
  return `${my.year}-${String(my.month).padStart(2, '0')}-01`;
}
function monthYearToISOEnd(my: MonthYear): string {
  const last = new Date(my.year, my.month, 0).getDate();
  return `${my.year}-${String(my.month).padStart(2, '0')}-${last}`;
}
function isoToMonthYear(iso: string): MonthYear {
  const [y, m] = iso.split('-');
  return { year: parseInt(y, 10), month: parseInt(m, 10) };
}
function monthYearLabel(my: MonthYear): string {
  return `${MONTH_NAMES[my.month - 1].slice(0, 3)} ${my.year}`;
}

function buildMonthList(): MonthYear[] {
  const list: MonthYear[] = [];
  const now = new Date();
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return list;
}

// ─── Presets ──────────────────────────────────────────────────────────────────

type PresetKey = 'all' | 'this_month' | 'last_30' | 'last_90' | 'last_180' | 'this_year' | 'custom';

const PRESETS: { key: PresetKey; label: string; range: () => DateRange }[] = [
  { key: 'all',        label: 'All Time',   range: () => ({ from: null,              to: null }) },
  { key: 'this_month', label: 'This Month', range: () => ({ from: startOfMonthISO(), to: todayISO() }) },
  { key: 'last_30',    label: 'Last 30d',   range: () => ({ from: daysAgoISO(30),    to: todayISO() }) },
  { key: 'last_90',    label: 'Last 3 Mo',  range: () => ({ from: daysAgoISO(90),    to: todayISO() }) },
  { key: 'last_180',   label: 'Last 6 Mo',  range: () => ({ from: daysAgoISO(180),   to: todayISO() }) },
  { key: 'this_year',  label: 'This Year',  range: () => ({ from: startOfYearISO(),  to: todayISO() }) },
  { key: 'custom',     label: 'Custom',     range: () => ({ from: null,              to: null }) },
];

const MONTH_LIST = buildMonthList();

// ─── Component ────────────────────────────────────────────────────────────────

export default function StatsAdmin() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const [coupleStats, setCoupleStats] = useState<CoupleStats[]>([]);
  const [topScores, setTopScores] = useState<UserScore[]>([]);
  const [totals, setTotals] = useState({ dice: 0, dare: 0, tell_me: 0, chat: 0, dare_skipped: 0, dice_skipped: 0 });
  const [loading, setLoading] = useState(true);

  const [activePreset, setActivePreset] = useState<PresetKey>('all');
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<MonthYear>(MONTH_LIST[5]);
  const [customTo, setCustomTo]     = useState<MonthYear>(MONTH_LIST[0]);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchStats = useCallback(async (range: DateRange) => {
    setLoading(true);

    const fromTs = range.from ? `${range.from}T00:00:00.000Z` : null;
    const toTs   = range.to   ? `${range.to}T23:59:59.999Z`   : null;

    let intQ = supabase.from('interactions').select('couple_id, type, status');
    if (fromTs) intQ = intQ.gte('created_at', fromTs);
    if (toTs)   intQ = intQ.lte('created_at', toTs);

    let chatQ = supabase.from('chat_messages').select('couple_id');
    if (fromTs) chatQ = chatQ.gte('created_at', fromTs);
    if (toTs)   chatQ = chatQ.lte('created_at', toTs);

    let monthlyQ = supabase.from('monthly_scores').select('couple_id, user_id, dares_skipped, dice_skipped, year, month');
    if (range.from) {
      const f = isoToMonthYear(range.from);
      monthlyQ = monthlyQ.or(`year.gt.${f.year},and(year.eq.${f.year},month.gte.${f.month})`);
    }
    if (range.to) {
      const t = isoToMonthYear(range.to);
      monthlyQ = monthlyQ.or(`year.lt.${t.year},and(year.eq.${t.year},month.lte.${t.month})`);
    }

    const [couplesRes, interactionsRes, scoresRes, profilesRes, chatRes, monthlyRes] = await Promise.all([
      supabase.from('couples').select('id, user_a_id, user_b_id'),
      intQ,
      supabase.from('scores').select('user_id, points').order('points', { ascending: false }).limit(10),
      supabase.from('profiles').select('id, display_name'),
      chatQ,
      monthlyQ,
    ]);

    const couples      = couplesRes.data      ?? [];
    const interactions = interactionsRes.data  ?? [];
    const scores       = scoresRes.data        ?? [];
    const profiles     = profilesRes.data      ?? [];
    const chatMessages = chatRes.data          ?? [];
    const monthly      = monthlyRes.data       ?? [];

    const nameMap = Object.fromEntries(profiles.map(p => [p.id, p.display_name]));

    const statsMap: Record<string, { dice: number; dare: number; tell_me: number }> = {};
    for (const i of interactions) {
      if (!statsMap[i.couple_id]) statsMap[i.couple_id] = { dice: 0, dare: 0, tell_me: 0 };
      if (i.type === 'dice')         statsMap[i.couple_id].dice++;
      else if (i.type === 'dare')    statsMap[i.couple_id].dare++;
      else if (i.type === 'tell_me') statsMap[i.couple_id].tell_me++;
    }

    const chatMap: Record<string, number> = {};
    for (const m of chatMessages) {
      chatMap[m.couple_id] = (chatMap[m.couple_id] ?? 0) + 1;
    }

    const skipMap: Record<string, { dare_skipped: number; dice_skipped: number }> = {};
    for (const m of monthly) {
      if (!skipMap[m.couple_id]) skipMap[m.couple_id] = { dare_skipped: 0, dice_skipped: 0 };
      skipMap[m.couple_id].dare_skipped += m.dares_skipped ?? 0;
      skipMap[m.couple_id].dice_skipped += m.dice_skipped ?? 0;
    }

    const builtStats: CoupleStats[] = couples.map(c => {
      const s  = statsMap[c.id] ?? { dice: 0, dare: 0, tell_me: 0 };
      const sk = skipMap[c.id]  ?? { dare_skipped: 0, dice_skipped: 0 };
      const chat = chatMap[c.id] ?? 0;
      return {
        couple_id: c.id,
        user_a_name: nameMap[c.user_a_id] ?? 'Unknown',
        user_b_name: c.user_b_id ? (nameMap[c.user_b_id] ?? 'Unknown') : null,
        dice: s.dice, dare: s.dare, tell_me: s.tell_me, chat,
        dare_skipped: sk.dare_skipped, dice_skipped: sk.dice_skipped,
        total: s.dice + s.dare + s.tell_me + chat,
      };
    });
    builtStats.sort((a, b) => b.total - a.total);

    const overallSkip = monthly.reduce((acc, m) => ({
      dare_skipped: acc.dare_skipped + (m.dares_skipped ?? 0),
      dice_skipped: acc.dice_skipped + (m.dice_skipped ?? 0),
    }), { dare_skipped: 0, dice_skipped: 0 });

    const overall = interactions.reduce(
      (acc, i) => {
        if (i.type === 'dice')         acc.dice++;
        else if (i.type === 'dare')    acc.dare++;
        else if (i.type === 'tell_me') acc.tell_me++;
        return acc;
      },
      { dice: 0, dare: 0, tell_me: 0, chat: chatMessages.length, ...overallSkip },
    );

    const enrichedScores: UserScore[] = scores.map(s => ({
      ...s,
      display_name: nameMap[s.user_id] ?? 'Unknown',
    }));

    setCoupleStats(builtStats);
    setTotals(overall);
    setTopScores(enrichedScores);
    setLoading(false);
  }, []);

  useEffect(() => { fetchStats(dateRange); }, [dateRange]);

  // ── Preset / custom handlers ──────────────────────────────────────────────────

  function selectPreset(key: PresetKey) {
    if (key === 'custom') { setCustomOpen(true); return; }
    const preset = PRESETS.find(p => p.key === key)!;
    setActivePreset(key);
    setDateRange(preset.range());
  }

  function applyCustomRange() {
    setActivePreset('custom');
    setDateRange({ from: monthYearToISOStart(customFrom), to: monthYearToISOEnd(customTo) });
    setCustomOpen(false);
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const customRangeLabel = activePreset === 'custom' && dateRange.from && dateRange.to
    ? `${monthYearLabel(isoToMonthYear(dateRange.from))} – ${monthYearLabel(isoToMonthYear(dateRange.to))}`
    : 'Custom';

  const sublabel =
    activePreset === 'all'    ? 'Showing all-time data' :
    activePreset === 'custom' ? customRangeLabel :
    `Showing: ${PRESETS.find(p => p.key === activePreset)?.label}`;

  const statItems = [
    { label: 'Dice Rolls',    value: totals.dice,         color: '#FFB347' },
    { label: 'Dares Sent',    value: totals.dare,         color: '#FF2E8A' },
    { label: "Ask's Sent",    value: totals.tell_me,      color: '#FF8A3D' },
    { label: 'Chat Msgs',     value: totals.chat,         color: '#69A7FF' },
    { label: 'Dares Skipped', value: totals.dare_skipped, color: '#FF5A5F' },
    { label: 'Dice Skipped',  value: totals.dice_skipped, color: '#FF5A5F' },
  ];

  const pillActiveBg     = isDark ? 'rgba(255,46,138,0.18)' : 'rgba(232,25,110,0.12)';
  const pillActiveBorder = '#FF2E8A';
  const pillIdleBg       = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(26,17,20,0.06)';

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <ScreenHeader title="Interaction Stats" onBack={() => router.back()} />

      {/* Preset pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillScroll}
        style={styles.pillRow}
      >
        {PRESETS.map(p => {
          const isActive = activePreset === p.key;
          const label = p.key === 'custom' && activePreset === 'custom' ? customRangeLabel : p.label;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => selectPreset(p.key)}
              activeOpacity={0.7}
              style={[
                styles.pill,
                {
                  backgroundColor: isActive ? pillActiveBg : pillIdleBg,
                  borderColor: isActive ? pillActiveBorder : colors.borderSubtle,
                },
              ]}
            >
              {p.key === 'custom' && (
                <Calendar size={11} color={isActive ? '#FF2E8A' : colors.textMuted} strokeWidth={2.5} />
              )}
              <Text style={[styles.pillText, { color: isActive ? '#FF2E8A' : colors.textSecondary }]}>
                {label}
              </Text>
              {p.key === 'custom' && (
                <ChevronDown size={11} color={isActive ? '#FF2E8A' : colors.textMuted} strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sub-label */}
      <Text style={[styles.sublabel, { color: colors.textMuted }]}>{sublabel}</Text>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#69A7FF" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Global totals */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>GLOBAL TOTALS</Text>
          <View style={styles.statGrid}>
            {statItems.map(item => (
              <View key={item.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                <Text style={[styles.statNum, { color: item.color }]}>{item.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{item.label}</Text>
              </View>
            ))}
          </View>

          {/* Not Brave Enough */}
          <View style={[styles.braveCard, { backgroundColor: colors.card, borderColor: 'rgba(255,90,95,0.25)' }]}>
            <Text style={[styles.braveTitle, { color: colors.text }]}>Not Brave Enough</Text>
            <View style={styles.braveRow}>
              <View style={styles.braveStat}>
                <Text style={[styles.braveNum, { color: '#FF5A5F' }]}>{totals.dare_skipped}</Text>
                <Text style={[styles.braveLabel, { color: colors.textMuted }]}>Dares skipped</Text>
              </View>
              <View style={[styles.braveDivider, { backgroundColor: colors.borderSubtle }]} />
              <View style={styles.braveStat}>
                <Text style={[styles.braveNum, { color: '#FF5A5F' }]}>{totals.dice_skipped}</Text>
                <Text style={[styles.braveLabel, { color: colors.textMuted }]}>Dice skipped</Text>
              </View>
            </View>
          </View>

          {/* Top scores */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>TOP SCORES</Text>
          <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            {topScores.length === 0 && (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No scores yet.</Text>
            )}
            {topScores.map((s, idx) => (
              <View
                key={s.user_id}
                style={[styles.tableRow, idx < topScores.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }]}
              >
                <Text style={[styles.rankText, { color: idx < 3 ? '#FFB347' : colors.textMuted }]}>#{idx + 1}</Text>
                <Text style={[styles.rowName, { color: colors.text, flex: 1 }]}>{s.display_name}</Text>
                <Text style={[styles.rowValue, { color: '#FFB347' }]}>{s.points} pts</Text>
              </View>
            ))}
          </View>

          {/* Per-couple breakdown */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>PER-COUPLE BREAKDOWN</Text>
          {coupleStats.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.textMuted, marginBottom: Spacing.lg }]}>No data yet.</Text>
          )}
          {coupleStats.map(cs => (
            <View key={cs.couple_id} style={[styles.coupleCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <Text style={[styles.coupleName, { color: colors.text }]}>
                {cs.user_a_name}{cs.user_b_name ? ` & ${cs.user_b_name}` : ''}
              </Text>
              <View style={styles.miniStatRow}>
                <View style={styles.miniStat}>
                  <Text style={[styles.miniNum, { color: '#FFB347' }]}>{cs.dice}</Text>
                  <Text style={[styles.miniLabel, { color: colors.textMuted }]}>Dice</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={[styles.miniNum, { color: '#FF2E8A' }]}>{cs.dare}</Text>
                  <Text style={[styles.miniLabel, { color: colors.textMuted }]}>Dare</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={[styles.miniNum, { color: '#FF8A3D' }]}>{cs.tell_me}</Text>
                  <Text style={[styles.miniLabel, { color: colors.textMuted }]}>Ask</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={[styles.miniNum, { color: '#69A7FF' }]}>{cs.chat}</Text>
                  <Text style={[styles.miniLabel, { color: colors.textMuted }]}>Chat</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={[styles.miniNum, { color: '#FF5A5F' }]}>{cs.dare_skipped + cs.dice_skipped}</Text>
                  <Text style={[styles.miniLabel, { color: colors.textMuted }]}>Skipped</Text>
                </View>
                <View style={[styles.miniStat, styles.totalStat, { borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.miniNum, { color: colors.text }]}>{cs.total}</Text>
                  <Text style={[styles.miniLabel, { color: colors.textMuted }]}>Total</Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Custom date range sheet */}
      <BottomSheet
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Custom Date Range"
        subtitle="Pick a start and end month."
        scrollable={false}
      >
        <View style={styles.pickerRow}>
          {/* From */}
          <View style={styles.pickerCol}>
            <Text style={[styles.pickerHeading, { color: colors.textMuted }]}>FROM</Text>
            <ScrollView
              style={[styles.pickerScroll, { borderColor: colors.borderSubtle }]}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 4 }}
            >
              {MONTH_LIST.slice().reverse().map(my => {
                const active = my.year === customFrom.year && my.month === customFrom.month;
                return (
                  <TouchableOpacity
                    key={`f-${my.year}-${my.month}`}
                    onPress={() => setCustomFrom(my)}
                    activeOpacity={0.7}
                    style={[
                      styles.pickerItem,
                      active && { backgroundColor: isDark ? 'rgba(255,46,138,0.18)' : 'rgba(232,25,110,0.10)' },
                    ]}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      { color: active ? '#FF2E8A' : colors.textSecondary },
                      active && { fontFamily: 'Inter-SemiBold' },
                    ]}>
                      {monthYearLabel(my)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={[styles.pickerDivider, { backgroundColor: colors.borderSubtle }]} />

          {/* To */}
          <View style={styles.pickerCol}>
            <Text style={[styles.pickerHeading, { color: colors.textMuted }]}>TO</Text>
            <ScrollView
              style={[styles.pickerScroll, { borderColor: colors.borderSubtle }]}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 4 }}
            >
              {MONTH_LIST.slice().reverse().map(my => {
                const active = my.year === customTo.year && my.month === customTo.month;
                return (
                  <TouchableOpacity
                    key={`t-${my.year}-${my.month}`}
                    onPress={() => setCustomTo(my)}
                    activeOpacity={0.7}
                    style={[
                      styles.pickerItem,
                      active && { backgroundColor: isDark ? 'rgba(255,46,138,0.18)' : 'rgba(232,25,110,0.10)' },
                    ]}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      { color: active ? '#FF2E8A' : colors.textSecondary },
                      active && { fontFamily: 'Inter-SemiBold' },
                    ]}>
                      {monthYearLabel(my)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        <TouchableOpacity
          onPress={applyCustomRange}
          activeOpacity={0.85}
          style={styles.applyBtn}
        >
          <Text style={styles.applyBtnText}>
            Apply: {monthYearLabel(customFrom)} – {monthYearLabel(customTo)}
          </Text>
        </TouchableOpacity>
      </BottomSheet>
    </AppShell>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 60 },

  // Preset pill bar
  pillRow: { flexShrink: 0 },
  pillScroll: { paddingHorizontal: Spacing.screen, paddingVertical: Spacing.sm, gap: Spacing.sm },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.pill, borderWidth: 1,
  },
  pillText: { fontSize: 12, fontFamily: 'Inter-Medium' },
  sublabel: { fontSize: 11, fontFamily: 'Inter-Regular', paddingHorizontal: Spacing.screen, marginBottom: 2 },

  // Section / cards
  sectionLabel: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2, marginBottom: Spacing.sm, marginTop: Spacing.md },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: { width: '48%', borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 32, fontFamily: 'Inter-Bold' },
  statLabel: { fontSize: 12, fontFamily: 'Inter-Medium' },

  braveCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, marginBottom: Spacing.md, gap: Spacing.sm },
  braveTitle: { fontSize: FontSize.sm, fontFamily: 'Inter-Bold', letterSpacing: 0.3 },
  braveRow: { flexDirection: 'row', alignItems: 'center' },
  braveStat: { flex: 1, alignItems: 'center', gap: 2 },
  braveDivider: { width: 1, height: 36 },
  braveNum: { fontSize: 28, fontFamily: 'Inter-Bold' },
  braveLabel: { fontSize: 12, fontFamily: 'Inter-Medium' },

  tableCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.md },
  tableRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  rankText: { fontSize: FontSize.sm, fontFamily: 'Inter-Bold', width: 28 },
  rowName: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
  rowValue: { fontSize: FontSize.sm, fontFamily: 'Inter-Bold' },
  emptyText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', padding: Spacing.md },

  coupleCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, marginBottom: Spacing.sm, gap: Spacing.sm },
  coupleName: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  miniStatRow: { flexDirection: 'row', gap: Spacing.sm },
  miniStat: { flex: 1, alignItems: 'center', gap: 2 },
  totalStat: { borderLeftWidth: 1, paddingLeft: Spacing.sm },
  miniNum: { fontSize: FontSize.body, fontFamily: 'Inter-Bold' },
  miniLabel: { fontSize: 10, fontFamily: 'Inter-Medium' },

  // Custom date picker
  pickerRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  pickerCol: { flex: 1, gap: 6 },
  pickerHeading: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1.1, textAlign: 'center' },
  pickerScroll: { height: 196, borderRadius: Radius.md, borderWidth: 1 },
  pickerDivider: { width: 1, marginTop: 22 },
  pickerItem: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: Radius.sm },
  pickerItemText: { fontSize: 13, fontFamily: 'Inter-Regular', textAlign: 'center' },
  applyBtn: {
    backgroundColor: '#FF2E8A', borderRadius: Radius.lg,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  applyBtnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
});
