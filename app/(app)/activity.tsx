import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Zap, Lock, Trophy, MessageCircle, Dice6 } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Interaction, CashInEvent } from '@/lib/types';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';

type FilterTab = 'all' | 'dare' | 'tell_me' | 'dice' | 'cash';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'dare', label: 'Dares' },
  { key: 'tell_me', label: 'Tell Me' },
  { key: 'dice', label: 'Dice' },
  { key: 'cash', label: 'Cash In' },
];

type ActivityItem = {
  id: string;
  _type: FilterTab;
  label: string;
  sub: string;
  time: string;
  icon: React.ReactNode;
  color: string;
  points?: number;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function ActivityScreen() {
  const router = useRouter();
  const { user, profile, partnerProfile, couple } = useAuth();
  const { colors } = useTheme();
  const [allItems, setAllItems] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);

  const items = filter === 'all'
    ? allItems
    : allItems.filter(i => (i as any)._type === filter);

  useEffect(() => {
    if (!couple?.id) return;
    load();
    const ch = supabase.channel(`activity_screen_${couple.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interactions', filter: `couple_id=eq.${couple.id}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cash_in_events', filter: `couple_id=eq.${couple.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id]);

  const load = async () => {
    if (!couple?.id || !user) return;
    const [{ data: interactions }, { data: cashIns }] = await Promise.all([
      supabase.from('interactions').select('*').eq('couple_id', couple.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('cash_in_events').select('*').eq('couple_id', couple.id).order('created_at', { ascending: false }).limit(10),
    ]);

    const mapped: ActivityItem[] = [];
    const partnerName = partnerProfile?.display_name ?? 'Partner';

    (interactions ?? []).forEach((i: Interaction) => {
      const isMine = i.sender_id === user.id;
      let label = '';
      let icon: React.ReactNode;
      let color = '#FF2E8A';

      switch (i.type) {
        case 'dice':
          label = isMine ? 'You rolled the dice' : `${partnerName} rolled the dice`;
          icon = <Dice6 color="#FFB347" size={18} strokeWidth={2} />;
          color = '#FFB347';
          break;
        case 'dare':
          if (i.status === 'accepted') {
            label = isMine ? `${partnerName} accepted your dare` : 'You accepted the dare';
          } else if (i.status === 'rejected') {
            label = isMine ? `${partnerName} said no way` : 'You passed on the dare';
          } else {
            label = isMine ? 'You sent a Dare' : `${partnerName} sent you a Dare`;
          }
          icon = <Zap color="#FF2E8A" size={18} strokeWidth={2} />;
          color = '#FF2E8A';
          break;
        case 'tell_me':
          label = i.status === 'answered'
            ? (isMine ? `${partnerName} answered your Tell Me` : 'You answered Tell Me')
            : (isMine ? 'You sent a Tell Me' : `${partnerName} asked you to Tell Me`);
          icon = <MessageCircle color="#FF8A3D" size={18} strokeWidth={2} />;
          color = '#FF8A3D';
          break;
        case 'media':
          label = isMine ? 'New Vault item added' : `${partnerName} added to the Vault`;
          icon = <Lock color="#FF2E8A" size={18} strokeWidth={2} />;
          color = '#FF2E8A';
          break;
        default:
          label = 'Activity';
          icon = <Zap color="#FF2E8A" size={18} strokeWidth={2} />;
      }

      mapped.push({
        id: i.id,
        _type: i.type as FilterTab,
        label,
        sub: i.content_text ? `"${i.content_text.slice(0, 60)}${i.content_text.length > 60 ? '…' : ''}"` : '',
        time: timeAgo(i.created_at),
        icon,
        color,
        points: i.points_awarded > 0 ? i.points_awarded : undefined,
      });
    });

    (cashIns ?? []).forEach((ev: CashInEvent) => {
      const isMine = ev.winner_user_id === user.id;
      mapped.push({
        id: ev.id,
        _type: 'cash',
        label: isMine ? `Cash In — ${ev.winner_choice === 'give' ? 'Give' : 'Receive'}` : `${partnerName} Cashed In`,
        sub: `${ev.winner_points} vs ${ev.loser_points} points`,
        time: timeAgo(ev.created_at),
        icon: <Trophy color="#FFB347" size={18} strokeWidth={2} />,
        color: '#FFB347',
      });
    });

    setAllItems(mapped);
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <AppShell scrollable={false}>
      <ScreenHeader title="Activity" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF2E8A" />}
      >
        {/* Filter tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContent}
        >
          {FILTER_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.filterTab,
                {
                  backgroundColor: filter === tab.key ? 'rgba(255,46,138,0.12)' : colors.card,
                  borderColor: filter === tab.key ? 'rgba(255,46,138,0.45)' : colors.borderSubtle,
                },
              ]}
              onPress={() => setFilter(tab.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterTabText, { color: filter === tab.key ? '#FF2E8A' : colors.textSecondary }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>✨</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing yet</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Start a moment with your partner. Roll the dice, send a dare, or drop a note.
            </Text>
          </View>
        ) : (
          items.map(item => (
            <View key={item.id} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={[styles.iconWrap, { backgroundColor: `${item.color}18` }]}>
                {item.icon}
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>{item.label}</Text>
                {item.sub ? <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{item.sub}</Text> : null}
              </View>
              <View style={styles.rowRight}>
                <Text style={[styles.rowTime, { color: colors.textMuted }]}>{item.time}</Text>
                {item.points && (
                  <View style={[styles.pointsPill, { backgroundColor: 'rgba(255,179,71,0.12)', borderColor: 'rgba(255,179,71,0.30)' }]}>
                    <Text style={styles.pointsText}>+{item.points}</Text>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 40 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', lineHeight: 20 },
  rowSub: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', marginTop: 2, lineHeight: 16 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowTime: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular' },
  pointsPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  pointsText: { color: '#FFB347', fontSize: 10, fontFamily: 'Inter-Bold' },
  filterScroll: { marginBottom: Spacing.lg },
  filterContent: { gap: Spacing.sm, paddingRight: Spacing.screen },
  filterTab: { borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  filterTabText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  empty: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: FontSize.xl, fontFamily: 'Inter-Bold' },
  emptySub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 22, maxWidth: 280 },
});
