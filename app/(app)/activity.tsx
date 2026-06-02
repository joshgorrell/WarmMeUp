import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { ArrowLeft, Zap, Lock, MessageCircle, Dice6, Camera, Sparkles } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Interaction, ChatMessage } from '@/lib/types';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import WarmupLogo from '@/components/WarmupLogo';
import WarmupWordmark from '@/components/WarmupWordmark';

type FilterTab = 'all' | 'chat' | 'dare' | 'dice' | 'wish' | 'privacy';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'chat', label: 'Chat' },
  { key: 'dare', label: 'Dare' },
  { key: 'dice', label: 'Dice' },
  { key: 'wish', label: 'Wish' },
];

type ActivityItem = {
  id: string;
  sourceTable: 'interactions' | 'chat_messages' | 'activity_events';
  sourceId: string;
  _type: FilterTab;
  label: string;
  sub: string;
  time: string;
  icon: React.ReactNode;
  color: string;
  points?: number;
  _rawTime: string;
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
  const { user, partnerProfile, couple } = useAuth();
  const { colors } = useTheme();
  const [allItems, setAllItems] = useState<ActivityItem[]>([]);
  const [viewedSet, setViewedSet] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);

  const items = filter === 'all'
    ? allItems
    : allItems.filter(i => i._type === filter);

  useEffect(() => {
    if (!couple?.id || !user?.id) return;
    load();
    const ch = supabase.channel(`activity_screen_${couple.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interactions', filter: `couple_id=eq.${couple.id}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `couple_id=eq.${couple.id}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_events', filter: `couple_id=eq.${couple.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id, user?.id]);

  const load = async () => {
    if (!couple?.id || !user) return;
    const [{ data: interactions }, { data: chats }, { data: activityEvts }, { data: viewedRows }] = await Promise.all([
      supabase.from('interactions').select('*').eq('couple_id', couple.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('chat_messages').select('*').eq('couple_id', couple.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
      supabase.from('activity_events').select('*').eq('couple_id', couple.id).eq('target_user_id', user.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('activity_views').select('source_table, source_id').eq('couple_id', couple.id).eq('user_id', user.id),
    ]);

    const viewed = new Set<string>(
      (viewedRows ?? []).map((v: any) => `${v.source_table}:${v.source_id}`)
    );
    setViewedSet(viewed);

    const mapped: ActivityItem[] = [];
    const partnerName = partnerProfile?.display_name ?? 'Partner';

    (interactions ?? []).forEach((i: Interaction) => {
      const isMine = i.sender_id === user.id;
      let label = '';
      let icon: React.ReactNode;
      let color = '#FF2E8A';
      let type: FilterTab = 'dare';

      switch (i.type) {
        case 'dice':
          type = 'dice';
          label = isMine ? 'You rolled the dice' : `${partnerName} rolled the dice`;
          icon = <Dice6 color="#FFB347" size={18} strokeWidth={2} />;
          color = '#FFB347';
          break;
        case 'dare':
          type = 'dare';
          if (i.status === 'accepted') {
            label = isMine ? `${partnerName} accepted your dare` : 'You accepted the dare';
          } else if (i.status === 'rejected') {
            if (isMine && i.decline_reason) {
              label = `${partnerName} declined: ${i.decline_reason}`;
            } else if (isMine) {
              label = `${partnerName} declined your dare`;
            } else {
              label = 'You declined the dare';
            }
          } else {
            label = isMine ? 'You sent a Dare' : `${partnerName} sent you a Dare`;
          }
          icon = <Zap color="#FF2E8A" size={18} strokeWidth={2} />;
          color = '#FF2E8A';
          break;
        case 'tell_me':
          type = 'wish';
          label = i.status === 'answered'
            ? (isMine ? `${partnerName} answered your Wish` : 'You answered the Wish')
            : (isMine ? 'You sent a Wish' : `${partnerName} sent you a Wish`);
          icon = <Sparkles color="#F0A96A" size={18} strokeWidth={2} />;
          color = '#F0A96A';
          break;
        case 'media':
          type = 'dare';
          label = isMine ? 'New Vault item added' : `${partnerName} added to the Vault`;
          icon = <Lock color="#FF2E8A" size={18} strokeWidth={2} />;
          color = '#FF2E8A';
          break;
        default:
          type = 'dare';
          label = 'Activity';
          icon = <Zap color="#FF2E8A" size={18} strokeWidth={2} />;
      }

      mapped.push({
        id: i.id,
        sourceTable: 'interactions',
        sourceId: i.id,
        _type: type,
        label,
        sub: i.content_text ? `"${i.content_text.slice(0, 60)}${i.content_text.length > 60 ? '…' : ''}"` : '',
        time: timeAgo(i.created_at),
        icon,
        color,
        points: i.points_awarded > 0 ? i.points_awarded : undefined,
        _rawTime: i.created_at,
      });
    });

    (chats ?? []).forEach((msg: ChatMessage) => {
      const isMine = msg.sender_id === user.id;
      const isMedia = !!msg.media_storage_path;
      mapped.push({
        id: msg.id,
        sourceTable: 'chat_messages',
        sourceId: msg.id,
        _type: 'chat',
        label: isMine ? 'You sent a message' : `${partnerName} sent you a message`,
        sub: isMedia
          ? (msg.media_type === 'video' ? 'Shared a video' : 'Shared a photo')
          : msg.content_text
            ? `"${msg.content_text.slice(0, 60)}${msg.content_text.length > 60 ? '…' : ''}"`
            : '',
        time: timeAgo(msg.created_at),
        icon: <MessageCircle color="#4FC3F7" size={18} strokeWidth={2} />,
        color: '#4FC3F7',
        _rawTime: msg.created_at,
      });
    });

    (activityEvts ?? []).forEach((ev: any) => {
      const isMine = ev.actor_user_id === user.id;

      if (ev.event_type === 'screenshot_detected') {
        mapped.push({
          id: `privacy_${ev.id}`,
          sourceTable: 'activity_events',
          sourceId: ev.id,
          _type: 'privacy',
          label: `${partnerName} screenshotted your content`,
          sub: ev.vault_item_id ? 'Vault item' : '',
          time: timeAgo(ev.created_at),
          icon: <Camera color="#FF8A3D" size={18} strokeWidth={2} />,
          color: '#FF8A3D',
          _rawTime: ev.created_at,
        });
        return;
      }

      let label = '';
      let sub = '';
      switch (ev.event_type) {
        case 'wish_created':
          label = isMine ? 'You created a new wish' : `${partnerName} created a new wish`;
          break;
        case 'wish_updated':
          label = isMine ? 'You updated a wish' : `${partnerName} updated a wish`;
          break;
        case 'wish_image_added':
          label = isMine ? 'You added a photo to a wish' : `${partnerName} added a photo to a wish`;
          sub = 'Wish';
          break;
        case 'wish_completed':
          label = isMine ? 'You granted a wish' : `${partnerName} granted a wish`;
          sub = 'Wish completed';
          break;
        default:
          return;
      }

      mapped.push({
        id: `activity_${ev.id}`,
        sourceTable: 'activity_events',
        sourceId: ev.id,
        _type: 'wish',
        label,
        sub,
        time: timeAgo(ev.created_at),
        icon: <Sparkles color="#F0A96A" size={18} strokeWidth={2} />,
        color: '#F0A96A',
        _rawTime: ev.created_at,
      });
    });

    mapped.sort((a, b) => b._rawTime.localeCompare(a._rawTime));
    setAllItems(mapped);
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <AppShell scrollable={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: colors.borderSubtle }]}
        >
          <ArrowLeft color={colors.text} size={20} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.brand}>
          <WarmupLogo size={28} />
          <WarmupWordmark size={13} />
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF2E8A" />}
      >
        {/* Filter pills */}
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
                  borderColor: filter === tab.key ? 'rgba(255,46,138,0.45)' : 'rgba(255,255,255,0.14)',
                },
              ]}
              onPress={() => setFilter(tab.key)}
              activeOpacity={0.75}
            >
              <AppText style={[styles.filterTabText, { color: filter === tab.key ? '#FF2E8A' : colors.textSecondary }]}>
                {tab.label}
              </AppText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Sparkles color="#FFB347" size={48} strokeWidth={1.5} />
            <AppText style={[styles.emptyTitle, { color: colors.text }]}>Nothing yet</AppText>
            <AppText style={[styles.emptySub, { color: colors.textSecondary }]}>
              Start a moment with your partner. Send a chat, roll the dice, send a dare, or create a wish.
            </AppText>
          </View>
        ) : (
          items.map(item => {
            const isUnread = !viewedSet.has(`${item.sourceTable}:${item.sourceId}`);
            return (
              <View key={item.id} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                <View style={styles.unreadIndicatorWrap}>
                  {isUnread && <View style={styles.unreadDot} />}
                </View>
                <View style={[styles.iconWrap, { backgroundColor: `${item.color}18` }]}>
                  {item.icon}
                </View>
                <View style={styles.rowText}>
                  <AppText style={[styles.rowLabel, { color: colors.text }]}>{item.label}</AppText>
                  {item.sub ? <AppText style={[styles.rowSub, { color: colors.textSecondary }]}>{item.sub}</AppText> : null}
                </View>
                <View style={styles.rowRight}>
                  <AppText style={[styles.rowTime, { color: colors.textMuted }]}>{item.time}</AppText>
                  {item.points ? (
                    <View style={[styles.pointsPill, { backgroundColor: 'rgba(255,179,71,0.12)', borderColor: 'rgba(255,179,71,0.30)' }]}>
                      <AppText style={styles.pointsText}>+{item.points}</AppText>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  brand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerRight: {
    width: 42,
    flexShrink: 0,
  },
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 40 },
  filterScroll: { marginTop: Spacing.lg, marginBottom: Spacing.lg },
  filterContent: { gap: Spacing.sm, paddingRight: Spacing.screen },
  filterTab: { borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, minWidth: 60, alignItems: 'center' },
  filterTabText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  unreadIndicatorWrap: {
    width: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF2E8A',
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', lineHeight: 20 },
  rowSub: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', marginTop: 2, lineHeight: 16 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowTime: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular' },
  pointsPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  pointsText: { color: '#FFB347', fontSize: 10, fontFamily: 'Inter-Bold' },
  empty: { alignItems: 'center', paddingTop: 48, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.xl, fontFamily: 'Inter-Bold' },
  emptySub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 22, maxWidth: 280 },
});
