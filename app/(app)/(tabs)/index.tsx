import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Zap, Lock, MessageCircle, Dice6, Star, ChevronRight, Heart, Camera, Sparkles, CheckCheck } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Interaction } from '@/lib/types';
import { Spacing, Radius, FontSize, Gradient } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import BrandHeader from '@/components/BrandHeader';
import CurrentMomentCard from '@/components/CurrentMomentCard';
import Avatar from '@/components/Avatar';
import { useGreeting } from '@/hooks/useGreeting';
import { useLayout } from '@/hooks/useLayout';
import { markViewed as markViewedUtil, markAllViewed as markAllViewedUtil } from '@/lib/activity';
import { reversePoints } from '@/lib/points';

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17) return 'Evening';
  return 'Late Night';
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

type ActivityItem = {
  id: string;
  sourceTable: 'interactions' | 'chat_messages' | 'activity_events';
  sourceId: string;
  label: string;
  sub: string;
  time: string;
  icon: React.ReactNode;
  color: string;
  route: string;
  routeParams?: Record<string, string>;
};

export default function HomeScreen() {
  const router = useRouter();
  const { pendingTab } = useLocalSearchParams<{ pendingTab?: string }>();
  const { user, profile, partnerProfile, couple, justPairedPartnerName, clearJustPaired, scoreResetAt } = useAuth();
  const { colors } = useTheme();
  const { isTabletOrLarger, contentPadding } = useLayout();
  const [myScore, setMyScore] = useState(0);
  const [partnerScore, setPartnerScore] = useState(0);
  const [activeInteraction, setActiveInteraction] = useState<Interaction | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const hasPartner = !!couple?.user_b_id;
  const greetingSub = useGreeting();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (justPairedPartnerName === null) return;
    clearJustPaired();
    router.push({
      pathname: '/(auth)/paired-celebration',
      params: { partnerName: justPairedPartnerName },
    });
  }, [justPairedPartnerName]);

  useEffect(() => {
    if (!pendingTab) return;
    router.push(pendingTab as any);
  }, []);

  useEffect(() => {
    if (!couple?.id || !user) return;
    loadAll();

    const channel = supabase
      .channel(`home_${couple.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `couple_id=eq.${couple.id}` }, (payload) => {
        console.log('[POINTS_REALTIME_EVENT]', payload);
        loadAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions', filter: `couple_id=eq.${couple.id}` }, loadAll)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `couple_id=eq.${couple.id}` }, loadAll)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_events', filter: `couple_id=eq.${couple.id}` }, loadAll)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_views', filter: `couple_id=eq.${couple.id}` }, loadAll)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [couple?.id, user]);

  // Reload scores when returning to the Home tab so stale state is never shown.
  useFocusEffect(useCallback(() => {
    if (couple?.id && user) loadAll();
  }, [couple?.id, user]));

  // Reload immediately when Reset Points completes (scoreResetAt increments in AuthContext).
  useEffect(() => {
    if (scoreResetAt === 0) return;
    if (couple?.id && user) loadAll();
  }, [scoreResetAt]);

  const loadAll = async () => {
    if (!couple?.id || !user) return;
    await Promise.all([loadScores(), loadActiveInteraction(), loadRecentActivity()]);
  };

  const loadScores = async () => {
    if (!couple?.id || !user) return;
    const { data } = await supabase.from('scores').select('*').eq('couple_id', couple.id);
    if (data && isMountedRef.current) {
      setMyScore(data.find(s => s.user_id === user.id)?.points ?? 0);
      setPartnerScore(data.find(s => s.user_id !== user.id)?.points ?? 0);
    }
  };

  const loadActiveInteraction = async () => {
    if (!couple?.id) return;
    const { data } = await supabase
      .from('interactions')
      .select('*')
      .eq('couple_id', couple.id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('type', ['dice', 'dare', 'wish', 'tell_me'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isMountedRef.current) setActiveInteraction(data);
  };

  const loadRecentActivity = async () => {
    if (!couple?.id || !user) return;
    const partnerName = partnerProfile?.display_name ?? 'Partner';

    const [{ data: interactions }, { data: chatMsgs }, { data: activityEvts }, { data: viewedRows }] = await Promise.all([
      // Only items where current user is the receiver
      supabase.from('interactions')
        .select('*')
        .eq('couple_id', couple.id)
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30),
      // Only messages sent by the partner
      supabase.from('chat_messages')
        .select('id, sender_id, content_text, created_at')
        .eq('couple_id', couple.id)
        .neq('sender_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(30),
      // activity_events already scoped to target_user_id
      supabase.from('activity_events')
        .select('*')
        .eq('couple_id', couple.id)
        .eq('target_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30),
      // What the current user has already viewed
      supabase.from('activity_views')
        .select('source_table, source_id')
        .eq('couple_id', couple.id)
        .eq('user_id', user.id),
    ]);

    const viewedSet = new Set<string>(
      (viewedRows ?? []).map((v: any) => `${v.source_table}:${v.source_id}`)
    );

    const items: Array<ActivityItem & { _rawTime: string }> = [];

    (interactions ?? []).forEach((i: Interaction) => {
      if (viewedSet.has(`interactions:${i.id}`)) return;

      let label = '';
      let icon: React.ReactNode;
      let color = '#FF2E8A';
      let route = '/(app)/(tabs)';
      let routeParams: Record<string, string> | undefined;

      switch (i.type as string) {
        case 'dice':
          label = `${partnerName} rolled the dice`;
          icon = <Dice6 color="#FFB347" size={16} strokeWidth={2} />;
          color = '#FFB347';
          route = '/(app)/(tabs)/dice';
          routeParams = { dice_id: i.id };
          break;
        case 'dare':
          label = i.status === 'accepted'
            ? `${partnerName} accepted your dare`
            : `${partnerName} sent you a Dare`;
          icon = <Zap color="#FF2E8A" size={16} strokeWidth={2} />;
          color = '#FF2E8A';
          route = '/(app)/(tabs)/dare';
          routeParams = { dare_id: i.id };
          break;
        case 'wish':
        case 'tell_me':
          label = i.status === 'answered'
            ? `${partnerName} answered your Wish`
            : `${partnerName} sent you a Wish`;
          icon = <Star color="#FF8A3D" size={16} strokeWidth={2} />;
          color = '#FF8A3D';
          route = '/(app)/(tabs)/wish';
          routeParams = { wish_id: i.id };
          break;
        case 'media':
          label = `${partnerName} added to Vault`;
          icon = <Lock color="#FF2E8A" size={16} strokeWidth={2} />;
          color = '#FF2E8A';
          route = '/(app)/(tabs)/vault';
          routeParams = { vault_item_id: (i as any).vault_item_id ?? i.id };
          break;
        default:
          return;
      }

      items.push({
        id: i.id,
        sourceTable: 'interactions',
        sourceId: i.id,
        label,
        sub: i.content_text ? `"${i.content_text.slice(0, 60)}${i.content_text.length > 60 ? '…' : ''}"` : '',
        time: timeAgo(i.created_at),
        icon,
        color,
        route,
        routeParams,
        _rawTime: i.created_at,
      });
    });

    (chatMsgs ?? []).forEach((m: any) => {
      if (viewedSet.has(`chat_messages:${m.id}`)) return;
      const preview = m.content_text
        ? `"${m.content_text.slice(0, 60)}${m.content_text.length > 60 ? '…' : ''}"`
        : '';
      items.push({
        id: `chat_${m.id}`,
        sourceTable: 'chat_messages',
        sourceId: m.id,
        label: `${partnerName} sent a chat`,
        sub: preview,
        time: timeAgo(m.created_at),
        icon: <MessageCircle color="#4DA6FF" size={16} strokeWidth={2} />,
        color: '#4DA6FF',
        route: '/(app)/(tabs)/note',
        routeParams: { message_id: m.id },
        _rawTime: m.created_at,
      });
    });

    (activityEvts ?? []).forEach((ev: any) => {
      if (viewedSet.has(`activity_events:${ev.id}`)) return;

      if (ev.event_type === 'screenshot_detected') {
        items.push({
          id: `privacy_${ev.id}`,
          sourceTable: 'activity_events',
          sourceId: ev.id,
          label: `${partnerName} screenshotted your content`,
          sub: ev.vault_item_id ? 'Vault item' : '',
          time: timeAgo(ev.created_at),
          icon: <Camera color="#FF8A3D" size={16} strokeWidth={2} />,
          color: '#FF8A3D',
          route: '/(app)/(tabs)/vault',
          _rawTime: ev.created_at,
        });
        return;
      }

      if (ev.event_type === 'media_reaction') {
        const emoji = ev.metadata?.emoji ?? '❤️';
        const sourceTable = ev.metadata?.source_table;
        const mediaType = ev.metadata?.media_type ?? 'photo';
        const route = sourceTable === 'vault_items' ? '/(app)/(tabs)/vault' : '/(app)/(tabs)/note';
        const reactionRouteParams: Record<string, string> = {};
        if (sourceTable === 'vault_items' && ev.vault_item_id) {
          reactionRouteParams.vault_item_id = ev.vault_item_id;
        } else if (sourceTable === 'chat_messages' && ev.metadata?.source_id) {
          reactionRouteParams.message_id = ev.metadata.source_id;
        }
        items.push({
          id: `reaction_${ev.id}`,
          sourceTable: 'activity_events',
          sourceId: ev.id,
          label: `${partnerName} reacted ${emoji} to your ${mediaType}`,
          sub: '',
          time: timeAgo(ev.created_at),
          icon: <AppText style={{ fontSize: 16, lineHeight: 20 }}>{emoji}</AppText>,
          color: '#FF2E8A',
          route,
          routeParams: Object.keys(reactionRouteParams).length ? reactionRouteParams : undefined,
          _rawTime: ev.created_at,
        });
        return;
      }

      let label = '';
      let routeParams: Record<string, string> | undefined;
      switch (ev.event_type) {
        case 'wish_created':
          label = `${partnerName} created a new wish`;
          break;
        case 'wish_updated':
          label = `${partnerName} updated a wish`;
          break;
        case 'wish_image_added':
          label = `${partnerName} added a photo to a wish`;
          break;
        case 'wish_completed':
          label = `${partnerName} granted a wish`;
          break;
        default:
          return;
      }

      if (ev.wish_id) {
        routeParams = { wish_id: ev.wish_id };
      }

      items.push({
        id: `activity_${ev.id}`,
        sourceTable: 'activity_events',
        sourceId: ev.id,
        label,
        sub: '',
        time: timeAgo(ev.created_at),
        icon: <Sparkles color="#F0A96A" size={16} strokeWidth={2} />,
        color: '#F0A96A',
        route: '/(app)/(tabs)/wish',
        routeParams,
        _rawTime: ev.created_at,
      });
    });

    items.sort((a, b) => b._rawTime.localeCompare(a._rawTime));
    if (isMountedRef.current) setRecentActivity(items.slice(0, 5));
  };

  const markViewed = useCallback(async (item: ActivityItem) => {
    if (!couple?.id || !user?.id) return;
    await markViewedUtil(item, couple.id, user.id);
  }, [couple?.id, user?.id]);

  const handleItemPress = useCallback(async (item: ActivityItem) => {
    setRecentActivity(prev => prev.filter(i => i.id !== item.id));
    await markViewed(item);
    if (item.routeParams) {
      router.navigate({ pathname: item.route as any, params: item.routeParams });
    } else {
      router.navigate(item.route as any);
    }
  }, [markViewed]);

  const handleMarkAllViewed = useCallback(async () => {
    if (!couple?.id || !user?.id || recentActivity.length === 0) return;
    setRecentActivity([]);
    await markAllViewedUtil(recentActivity, couple.id, user.id);
  }, [couple?.id, user?.id, recentActivity]);

  const handleDismissInteraction = useCallback(() => {
    if (!activeInteraction || !couple?.id || !user?.id) return;
    const isSelfRoll = activeInteraction.type === 'dice'
      && activeInteraction.sender_id === user.id
      && activeInteraction.receiver_id === user.id;

    const doDelete = async () => {
      setActiveInteraction(null);
      await supabase
        .from('interactions')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', activeInteraction.id);
      if (isSelfRoll) {
        await reversePoints(activeInteraction.id, couple.id, user.id);
      }
    };

    if (isSelfRoll) {
      Alert.alert(
        'Remove this roll?',
        'This will remove the roll and any points earned from it.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: doDelete },
        ]
      );
    } else {
      doDelete();
    }
  }, [activeInteraction, couple?.id, user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const myName = profile?.first_name || profile?.display_name || 'You';
  const partnerName = partnerProfile?.first_name || partnerProfile?.display_name || 'Partner';
  const total = myScore + partnerScore;
  const myPct = total > 0 ? myScore / total : 0.5;
  const pointsEnabled = (couple?.points_enabled ?? true) && hasPartner;
  const hPad = contentPadding;

  // Shared greeting block, used in both phone and tablet layouts
  const greetingBlock = (
    <View style={styles.greeting}>
      <AppText
        style={[styles.greetingTitle, { color: colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        ellipsizeMode="tail"
      >
        {getTimeGreeting()}{profile?.first_name ? `, ${profile.first_name}` : ''}
      </AppText>
      <AppText style={[styles.greetingSub, { color: colors.textSecondary }]}>
        {greetingSub}
      </AppText>
    </View>
  );

  // Score bar, pinned to bottom of left column on tablet
  const scoreBar = pointsEnabled ? (
    <View style={[styles.scoreWrap, { paddingHorizontal: hPad }]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push('/(app)/my-stats')}
        style={[styles.scoreCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}
      >
        <View style={styles.scoreRow}>
          <Avatar name={myName} uri={profile?.avatar_url} size="sm" bgColor="rgba(255,46,138,0.18)" />
          <AppText style={[styles.scoreName, { color: colors.textSecondary }]} numberOfLines={1}>{myName}</AppText>
          <AppText style={[styles.scorePts, { color: colors.text }]}>{myScore}</AppText>
          <View style={styles.scoreVs}>
            <Heart color="#FF2E8A" size={11} fill="rgba(255,46,138,0.20)" strokeWidth={2} />
          </View>
          <AppText style={[styles.scorePts, { color: colors.text }]}>{partnerScore}</AppText>
          <AppText style={[styles.scoreName, { color: colors.textSecondary, textAlign: 'right' }]} numberOfLines={1}>{partnerName}</AppText>
          <Avatar name={partnerName} uri={partnerProfile?.avatar_url} size="sm" bgColor="rgba(255,138,61,0.18)" />
        </View>
        <View style={[styles.barTrack, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
          <LinearGradient
            colors={Gradient.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.barFill, { width: `${myPct * 100}%` }]}
          />
        </View>
      </TouchableOpacity>
    </View>
  ) : null;

  // Activity section
  const activitySection = (
    <View style={styles.activitySection}>
      <View style={styles.sectionRow}>
        <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>RECENT ACTIVITY</AppText>
        <View style={styles.sectionActions}>
          {recentActivity.length > 0 && (
            <TouchableOpacity onPress={handleMarkAllViewed} activeOpacity={0.7} style={styles.markAllBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <CheckCheck color={colors.textMuted} size={13} strokeWidth={2} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.push('/(app)/activity')} activeOpacity={0.7} style={styles.seeAll}>
            <AppText style={[styles.seeAllText, { color: '#FF2E8A' }]}>See all</AppText>
            <ChevronRight color="#FF2E8A" size={13} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>
      {recentActivity.length > 0 ? (
        <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
          {recentActivity.map((item, i) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => handleItemPress(item)}
              activeOpacity={0.7}
              style={[
                styles.activityRow,
                {
                  borderBottomColor: colors.borderSubtle,
                  borderBottomWidth: i < recentActivity.length - 1 ? 1 : 0,
                },
              ]}
            >
              <View style={[styles.activityIcon, { backgroundColor: `${item.color}18` }]}>
                {item.icon}
              </View>
              <View style={styles.activityText}>
                <AppText style={[styles.activityLabel, { color: colors.text }]} numberOfLines={1}>{item.label}</AppText>
                {item.sub ? (
                  <AppText style={[styles.activitySub, { color: colors.textSecondary }]} numberOfLines={1}>{item.sub}</AppText>
                ) : null}
              </View>
              <AppText style={[styles.activityTime, { color: colors.textMuted }]}>{item.time}</AppText>
              <ChevronRight color={colors.textMuted} size={13} strokeWidth={2} />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={[styles.activityEmpty, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
          <AppText style={[styles.activityEmptyTitle, { color: colors.text }]}>You're all caught up!</AppText>
          <AppText style={[styles.activityEmptyText, { color: colors.textMuted }]}>Send a chat, roll the dice, send a dare, or create a wish.</AppText>
        </View>
      )}
    </View>
  );

  return (
    <AppShell scrollable={false}>
      <BrandHeader
        avatarName={profile?.display_name}
        avatarUri={profile?.avatar_url}
        onAvatarPress={() => router.push('/(app)/account')}
      />
      <View style={styles.body}>
        {isTabletOrLarger ? (
          // ── Tablet: 2-column layout ──────────────────────────────────────
          <View style={[styles.tabletRow, { paddingHorizontal: hPad, gap: hPad }]}>
            {/* Left column: greeting + current moment + score */}
            <View style={styles.tabletLeft}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.tabletLeftScroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF2E8A" />}
              >
                {greetingBlock}
                {activeInteraction && (
                  <>
                    <CurrentMomentCard
                      interaction={activeInteraction}
                      onSeeAll={() => router.push('/(app)/activity')}
                      onDismiss={handleDismissInteraction}
                    />
                    <View style={{ height: Spacing.lg }} />
                  </>
                )}
              </ScrollView>
              <View style={styles.tabletScorePin}>
                {scoreBar}
              </View>
            </View>
            {/* Right column: activity feed */}
            <View style={styles.tabletRight}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabletRightScroll}>
                {activitySection}
              </ScrollView>
            </View>
          </View>
        ) : (
          // ── Phone: single column ─────────────────────────────────────────
          <>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.scroll, !pointsEnabled && styles.scrollNoScore, { paddingHorizontal: hPad }]}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF2E8A" />}
            >
              {greetingBlock}
              {activeInteraction && (
                <>
                  <CurrentMomentCard
                    interaction={activeInteraction}
                    onSeeAll={() => router.push('/(app)/activity')}
                    onDismiss={handleDismissInteraction}
                  />
                  <View style={{ height: Spacing.lg }} />
                </>
              )}
              {activitySection}
            </ScrollView>
            {scoreBar}
          </>
        )}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    flexDirection: 'column',
  },
  // Phone layout
  scroll: {
    paddingBottom: Spacing.md,
  },
  scrollNoScore: {
    paddingBottom: Spacing.xl,
  },
  // Tablet layout
  tabletRow: {
    flex: 1,
    flexDirection: 'row',
    paddingTop: Spacing.md,
  },
  tabletLeft: {
    flex: 1,
    flexDirection: 'column',
  },
  tabletLeftScroll: {
    flexGrow: 1,
    paddingBottom: Spacing.md,
  },
  tabletScorePin: {
    paddingBottom: Spacing.md,
  },
  tabletRight: {
    flex: 1,
    flexDirection: 'column',
  },
  tabletRightScroll: {
    flexGrow: 1,
    paddingBottom: Spacing.xl,
  },
  greeting: {
    marginBottom: Spacing.lg,
    gap: 4,
  },
  greetingTitle: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    lineHeight: 32,
  },
  greetingSub: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1.2,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  markAllBtn: {
    padding: 8,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-SemiBold',
  },
  activitySection: {
    marginBottom: Spacing.sm,
  },
  scoreWrap: {
    paddingBottom: Spacing.md,
  },
  activityCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  activityEmpty: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    gap: 6,
  },
  activityEmptyTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  activityEmptyText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityText: {
    flex: 1,
    gap: 2,
  },
  activityLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 18,
  },
  activitySub: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    lineHeight: 15,
  },
  activityTime: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
  },
  scoreCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 8,
    marginTop: 0,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scorePts: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.5,
    minWidth: 28,
    textAlign: 'center',
  },
  scoreName: {
    flex: 1,
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Medium',
  },
  scoreVs: {
    paddingHorizontal: 4,
  },
  barTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
