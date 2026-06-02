import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Zap, Lock, MessageCircle, Dice6, Star, ChevronRight, Heart, Camera, Sparkles } from 'lucide-react-native';
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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
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
  label: string;
  sub: string;
  time: string;
  icon: React.ReactNode;
  color: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const { pendingTab } = useLocalSearchParams<{ pendingTab?: string }>();
  const { user, profile, partnerProfile, couple, justPairedPartnerName, clearJustPaired } = useAuth();
  const { colors } = useTheme();
  const [myScore, setMyScore] = useState(0);
  const [partnerScore, setPartnerScore] = useState(0);
  const [activeInteraction, setActiveInteraction] = useState<Interaction | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const hasPartner = !!couple?.user_b_id;
  const greetingSub = useGreeting();

  // When User A's partner joins via realtime, show the celebration screen.
  useEffect(() => {
    if (justPairedPartnerName === null) return;
    clearJustPaired();
    router.push({
      pathname: '/(auth)/paired-celebration',
      params: { partnerName: justPairedPartnerName },
    });
  }, [justPairedPartnerName]);

  // Honour pending notification deep-link passed from transition.tsx.
  // We navigate here instead of in transition to avoid push-on-top-of-replace races.
  useEffect(() => {
    if (!pendingTab) return;
    router.push(pendingTab as any);
  }, []);

  useEffect(() => {
    if (!couple?.id || !user) return;
    loadAll();

    const channel = supabase
      .channel(`home_${couple.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `couple_id=eq.${couple.id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions', filter: `couple_id=eq.${couple.id}` }, loadAll)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_events', filter: `couple_id=eq.${couple.id}` }, loadAll)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [couple?.id, user]);

  const loadAll = async () => {
    if (!couple?.id || !user) return;
    await Promise.all([loadScores(), loadActiveInteraction(), loadRecentActivity()]);
  };

  const loadScores = async () => {
    if (!couple?.id || !user) return;
    const { data } = await supabase.from('scores').select('*').eq('couple_id', couple.id);
    if (data) {
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
      .in('type', ['dice', 'dare', 'wish', 'tell_me'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveInteraction(data);
  };

  const loadRecentActivity = async () => {
    if (!couple?.id || !user) return;
    const partnerName = partnerProfile?.display_name ?? 'Partner';
    const [{ data: interactions }, { data: activityEvts }] = await Promise.all([
      supabase.from('interactions').select('*').eq('couple_id', couple.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('activity_events').select('*').eq('couple_id', couple.id).order('created_at', { ascending: false }).limit(20),
    ]);

    const items: Array<ActivityItem & { _rawTime: string }> = [];

    (interactions ?? []).forEach((i: Interaction) => {
      const isMine = i.sender_id === user.id;
      let label = '';
      let icon: React.ReactNode;
      let color = '#FF2E8A';

      switch (i.type as string) {
        case 'chat':
          label = isMine ? 'You sent a chat' : `${partnerName} sent a chat`;
          icon = <MessageCircle color="#4DA6FF" size={16} strokeWidth={2} />;
          color = '#4DA6FF';
          break;
        case 'dice':
          label = isMine ? 'You rolled the dice' : `${partnerName} rolled the dice`;
          icon = <Dice6 color="#FFB347" size={16} strokeWidth={2} />;
          color = '#FFB347';
          break;
        case 'dare':
          label = i.status === 'accepted'
            ? (isMine ? `${partnerName} accepted your dare` : 'You accepted the dare')
            : (isMine ? 'You sent a Dare' : `${partnerName} sent you a Dare`);
          icon = <Zap color="#FF2E8A" size={16} strokeWidth={2} />;
          color = '#FF2E8A';
          break;
        case 'wish':
        case 'tell_me':
          label = i.status === 'answered'
            ? (isMine ? `${partnerName} answered your Wish` : 'You answered the Wish')
            : (isMine ? 'You sent a Wish' : `${partnerName} sent you a Wish`);
          icon = <Star color="#FF8A3D" size={16} strokeWidth={2} />;
          color = '#FF8A3D';
          break;
        case 'media':
          label = isMine ? 'You added to Vault' : `${partnerName} added to Vault`;
          icon = <Lock color="#FF2E8A" size={16} strokeWidth={2} />;
          color = '#FF2E8A';
          break;
        default:
          return;
      }

      items.push({
        id: i.id,
        label,
        sub: i.content_text ? `"${i.content_text.slice(0, 50)}${i.content_text.length > 50 ? '…' : ''}"` : '',
        time: timeAgo(i.created_at),
        icon,
        color,
        _rawTime: i.created_at,
      });
    });

    (activityEvts ?? []).forEach((ev: any) => {
      const isMine = ev.actor_user_id === user.id;

      if (ev.event_type === 'screenshot_detected') {
        items.push({
          id: `privacy_${ev.id}`,
          label: `${partnerName} screenshotted your content`,
          sub: ev.vault_item_id ? 'Vault item' : '',
          time: timeAgo(ev.created_at),
          icon: <Camera color="#FF8A3D" size={16} strokeWidth={2} />,
          color: '#FF8A3D',
          _rawTime: ev.created_at,
        });
        return;
      }

      let label = '';
      switch (ev.event_type) {
        case 'wish_created':
          label = isMine ? 'You created a new wish' : `${partnerName} created a new wish`;
          break;
        case 'wish_updated':
          label = isMine ? 'You updated a wish' : `${partnerName} updated a wish`;
          break;
        case 'wish_image_added':
          label = isMine ? 'You added a photo to a wish' : `${partnerName} added a photo to a wish`;
          break;
        case 'wish_completed':
          label = isMine ? 'You granted a wish' : `${partnerName} granted a wish`;
          break;
        default:
          return;
      }

      items.push({
        id: `activity_${ev.id}`,
        label,
        sub: '',
        time: timeAgo(ev.created_at),
        icon: <Sparkles color="#F0A96A" size={16} strokeWidth={2} />,
        color: '#F0A96A',
        _rawTime: ev.created_at,
      });
    });

    items.sort((a, b) => b._rawTime.localeCompare(a._rawTime));

    setRecentActivity(items.slice(0, 5));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const myName = profile?.display_name ?? 'You';
  const partnerName = partnerProfile?.display_name ?? 'Partner';
  const total = myScore + partnerScore;
  const myPct = total > 0 ? myScore / total : 0.5;
  const pointsEnabled = (couple?.points_enabled ?? true) && hasPartner;

  return (
    <AppShell scrollable={false}>
      <BrandHeader
        avatarName={profile?.display_name}
        avatarUri={profile?.avatar_url}
        onAvatarPress={() => router.push('/(app)/account')}
      />
      <View style={styles.body}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, !pointsEnabled && styles.scrollNoScore]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF2E8A" />}
        >

          {/* Greeting */}
          <View style={styles.greeting}>
            <AppText style={[styles.greetingTitle, { color: colors.text }]}>
              {getGreeting()}{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}
            </AppText>
            <AppText style={[styles.greetingSub, { color: colors.textSecondary }]}>
              {greetingSub}
            </AppText>
          </View>

          {/* Current Moment */}
          {activeInteraction && (
            <>
              <CurrentMomentCard
                interaction={activeInteraction}
                onSeeAll={() => router.push('/(app)/activity')}
              />
              <View style={{ height: Spacing.lg }} />
            </>
          )}

          {/* Recent Activity */}
          <View style={styles.activitySection}>
            <View style={styles.sectionRow}>
              <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>RECENT ACTIVITY</AppText>
              <TouchableOpacity onPress={() => router.push('/(app)/activity')} activeOpacity={0.7} style={styles.seeAll}>
                <AppText style={[styles.seeAllText, { color: '#FF2E8A' }]}>See all</AppText>
                <ChevronRight color="#FF2E8A" size={13} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            {recentActivity.length > 0 ? (
              <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                {recentActivity.map((item, i) => (
                  <View
                    key={item.id}
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
                  </View>
                ))}
              </View>
            ) : (
              <View style={[styles.activityEmpty, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                <AppText style={[styles.activityEmptyText, { color: colors.textMuted }]}>Start a moment with your partner. Send a chat, roll the dice, send a dare, or create a wish.</AppText>
              </View>
            )}
          </View>

        </ScrollView>

        {/* Score bar — pinned to bottom, hidden when points disabled */}
        {pointsEnabled && (
          <View style={styles.scoreWrap}>
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
  scroll: {
    paddingHorizontal: Spacing.screen,
    paddingBottom: Spacing.md,
  },
  scrollNoScore: {
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
    paddingHorizontal: Spacing.screen,
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
