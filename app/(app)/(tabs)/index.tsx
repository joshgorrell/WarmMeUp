import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert,
  Animated, Platform, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Zap, Lock, MessageCircle, Dice6, Star, ChevronRight, Heart, Camera, Sparkles, CheckCheck, Flame, Send, Clock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Interaction } from '@/lib/types';
import { Spacing, Radius, FontSize, Gradient } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import BrandHeader from '@/components/BrandHeader';
import CurrentMomentCard from '@/components/CurrentMomentCard';
import { REACTION_EMOJIS } from '@/components/MediaActionRow';

import HomeMiniCard from '@/components/HomeMiniCard';
import Avatar from '@/components/Avatar';
import { useGreeting } from '@/hooks/useGreeting';
import { useTrialExpiryCheck } from '@/hooks/useTrialExpiryCheck';
import { useEntitlementExpiryCheck } from '@/hooks/useEntitlementExpiryCheck';
import { useLayout } from '@/hooks/useLayout';
import { markViewed as markViewedUtil, markAllViewed as markAllViewedUtil } from '@/lib/activity';
import { reversePoints, awardPoints, getPointValue } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';

const CHAT_ACTIVITY_PREFIX = '__WMU_ACTIVITY__:';

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
  const { user, profile, partnerProfile, couple, justPairedPartnerName, clearJustPaired, scoreResetAt, subscriptionInfo } = useAuth();
  const { colors } = useTheme();
  const { isTabletOrLarger, contentPadding } = useLayout();
  const [myScore, setMyScore] = useState(0);
  const [partnerScore, setPartnerScore] = useState(0);
  const [activeInteraction, setActiveInteraction] = useState<Interaction | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const interactionsRef = useRef<Interaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [streak, setStreak] = useState(0);
  const [sendingLove, setSendingLove] = useState(false);
  const [loveSent, setLoveSent] = useState(false);
  const [loveSentEmoji, setLoveSentEmoji] = useState('❤️');
  const [showLovePicker, setShowLovePicker] = useState(false);
  const [loveBurstEmoji, setLoveBurstEmoji] = useState<string | null>(null);
  const [togetherMode, setTogetherMode] = useState<'total' | 'months' | 'days' | 'hours'>('total');
  const burstScale = useRef(new Animated.Value(0.3));
  const burstOpacity = useRef(new Animated.Value(0));
  const burstY = useRef(new Animated.Value(0));
  const [loading, setLoading] = useState(true);
  const hasPartner = !!couple?.user_b_id;
  const greetingSub = useGreeting();
  const trialExpiry = useTrialExpiryCheck();
  const entitlementExpiry = useEntitlementExpiryCheck();
  const isMountedRef = useRef(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => loadAll(), 300);
  }, []);

  const setupChannelRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!couple?.id || !user) return;
    loadAll().then(() => { if (isMountedRef.current) setLoading(false); });

    // Remove ALL stale home channels for this couple, not just the one in the ref.
    // This prevents "already subscribed" crashes when rapid couple refreshes create
    // orphaned channels that the Supabase client still tracks internally.
    const prefix = `home_${couple.id}`;
    supabase.getChannels().forEach((ch) => {
      if (ch.topic.startsWith(prefix)) supabase.removeChannel(ch);
    });
    if (channelRef.current) channelRef.current = null;

    const setupChannel = (attempt: number) => {
      try {
        const channel = supabase
          .channel(`home_${couple.id}_${Date.now()}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `couple_id=eq.${couple.id}` }, debouncedReload)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions', filter: `couple_id=eq.${couple.id}` }, debouncedReload)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `couple_id=eq.${couple.id}` }, debouncedReload)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_events', filter: `couple_id=eq.${couple.id}` }, debouncedReload)
          .subscribe();
        channelRef.current = channel;
      } catch {
        // Supabase Realtime can throw when .on() is called on a channel the
        // client considers already subscribed (race during rapid couple refreshes).
        // Retry once after a short delay so the live-update channel is still established.
        if (attempt < 2 && isMountedRef.current) {
          setupChannelRef.current = setTimeout(() => setupChannel(attempt + 1), 300);
        }
      }
    };
    setupChannel(0);

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      if (setupChannelRef.current) clearTimeout(setupChannelRef.current);
      supabase.getChannels().forEach((ch) => {
        if (ch.topic.startsWith(prefix)) supabase.removeChannel(ch);
      });
      if (channelRef.current) channelRef.current = null;
    };
  }, [couple?.id, user?.id]);

  // Reload scores when returning to the Home tab so stale state is never shown.
  // Throttle: skip if data was loaded within the last 5 seconds to avoid
  // redundant 4-query reloads when bouncing between Home and sub-screens.
  const lastLoadedAtRef = useRef(0);
  useFocusEffect(useCallback(() => {
    if (couple?.id && user) {
      const now = Date.now();
      if (now - lastLoadedAtRef.current < 5000) return;
      lastLoadedAtRef.current = now;
      loadAll().then(() => { if (isMountedRef.current) setLoading(false); });
    }
  }, [couple?.id, user]));

  // Reload immediately when Reset Points completes (scoreResetAt increments in AuthContext).
  useEffect(() => {
    if (scoreResetAt === 0) return;
    if (couple?.id && user) loadAll();
  }, [scoreResetAt]);

  const loadAll = async () => {
    if (!couple?.id || !user) return;
    lastLoadedAtRef.current = Date.now();
    await Promise.all([loadScores(), loadActiveInteraction(), loadRecentActivity(), loadStreak()]);
  };

  const loadStreak = async () => {
    if (!couple?.id) return;
    if (!(couple?.streaks_enabled ?? true)) { setStreak(0); return; }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const { data } = await supabase.rpc('get_day_streak', { p_couple_id: couple.id, p_tz: tz });
    if (isMountedRef.current) setStreak(typeof data === 'number' ? data : 0);
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
      .neq('rolled_for', 'self')
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

    interactionsRef.current = (interactions ?? []) as Interaction[];

    const viewedSet = new Set<string>(
      (viewedRows ?? []).map((v: any) => `${v.source_table}:${v.source_id}`)
    );

    const ACTIVE_STATUSES = ['sent', 'seen', 'accepted', 'pending_verification'];
    const isActiveInteraction = (i: Interaction) =>
      (i.type === 'dice' || i.type === 'dare') &&
      i.rolled_for !== 'self' &&
      ACTIVE_STATUSES.includes(i.status) &&
      i.expires_at &&
      new Date(i.expires_at) > new Date();

    const items: Array<ActivityItem & { _rawTime: string }> = [];

    (interactions ?? []).forEach((i: Interaction) => {
      const isActionable = isActiveInteraction(i);
      if (!isActionable && viewedSet.has(`interactions:${i.id}`)) return;

      let label = '';
      let icon: React.ReactNode;
      let color = '#FF2E8A';
      let route = '/(app)/(tabs)';
      let routeParams: Record<string, string> | undefined;

      switch (i.type as string) {
        case 'dice':
          if (i.rolled_for === 'self') return;
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
      // Internal Chat activity-card transport rows are represented by the
      // interaction/activity feed and must never surface as raw Home text.
      if (typeof m.content_text === 'string' && m.content_text.startsWith(CHAT_ACTIVITY_PREFIX)) return;
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
        const screen = ev.source_screen ?? 'vault';
        const routeMap: Record<string, string> = { vault: '/(app)/(tabs)/vault', chat: '/(app)/(tabs)/note', wish: '/(app)/(tabs)/wish' };
        const subMap: Record<string, string> = { vault: 'Vault', chat: 'Chat', wish: 'Wish List' };
        const meta = ev.metadata;
        const screenshotParams: Record<string, string> = {};
        if (ev.vault_item_id) screenshotParams.vault_item_id = ev.vault_item_id;
        else if (meta?.chat_message_id) screenshotParams.message_id = meta.chat_message_id;
        items.push({
          id: `privacy_${ev.id}`,
          sourceTable: 'activity_events',
          sourceId: ev.id,
          label: `${partnerName} screenshotted your content`,
          sub: subMap[screen] ?? 'Vault',
          time: timeAgo(ev.created_at),
          icon: <Camera color="#FF8A3D" size={16} strokeWidth={2} />,
          color: '#FF8A3D',
          route: routeMap[screen] ?? '/(app)/(tabs)/vault',
          routeParams: Object.keys(screenshotParams).length ? screenshotParams : undefined,
          _rawTime: ev.created_at,
        });
        return;
      }

      if (ev.event_type === 'send_love') {
        const emoji = ev.metadata?.emoji ?? '❤️';
        items.push({
          id: `love_${ev.id}`,
          sourceTable: 'activity_events',
          sourceId: ev.id,
          label: `${partnerName} sent you ${emoji}`,
          sub: 'Send love',
          time: timeAgo(ev.created_at),
          icon: <AppText style={{ fontSize: 16, lineHeight: 20 }}>{emoji}</AppText>,
          color: '#FF2E8A',
          route: '/(app)/(tabs)/note',
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
    const ACTIVE_STATUSES = ['sent', 'seen', 'accepted', 'pending_verification'];
    const itemsToMark = recentActivity.filter(i => {
      if (i.sourceTable !== 'interactions') return true;
      const raw = (interactionsRef.current ?? []).find(r => r.id === i.sourceId);
      if (!raw) return true;
      const isActive = (raw.type === 'dice' || raw.type === 'dare') &&
        raw.rolled_for !== 'self' &&
        ACTIVE_STATUSES.includes(raw.status) &&
        raw.expires_at &&
        new Date(raw.expires_at) > new Date();
      return !isActive;
    });
    const surviving = recentActivity.filter(i => !itemsToMark.includes(i));
    setRecentActivity(surviving);
    if (itemsToMark.length > 0) {
      await markAllViewedUtil(itemsToMark, couple.id, user.id);
    }
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

  const handleSendLove = async (emoji: string) => {
    if (!couple?.id || !user?.id || !hasPartner || sendingLove) return;
    setShowLovePicker(false);
    setSendingLove(true);
    setLoveSentEmoji(emoji);
    try {
      const pts = await getPointValue('send_love');
      if (pts > 0) {
        await awardPoints(couple.id, user.id, pts, 'send_love');
      }
      await supabase.from('chat_messages').insert({
        couple_id: couple.id,
        sender_id: user.id,
        content_text: emoji,
      });
      await supabase.from('activity_events').insert({
        couple_id: couple.id,
        actor_user_id: user.id,
        target_user_id: partnerProfile?.id,
        event_type: 'send_love',
        metadata: { emoji },
      });
      await notifyPartner({
        event_type: 'send_love',
        couple_id: couple.id,
        target_route: '/(app)/(tabs)/note',
        partnerUserId: partnerProfile?.id,
        emoji,
      });
      setLoveSent(true);
      setLoveBurstEmoji(emoji);
      burstScale.current.setValue(0.3);
      burstOpacity.current.setValue(0);
      burstY.current.setValue(0);
      Animated.parallel([
        Animated.sequence([
          Animated.spring(burstScale.current, { toValue: 1.3, tension: 60, friction: 7, useNativeDriver: true }),
          Animated.spring(burstScale.current, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(burstOpacity.current, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(burstOpacity.current, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(burstOpacity.current, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
        Animated.timing(burstY.current, { toValue: -50, duration: 850, useNativeDriver: true }),
      ]).start(() => {
        setLoveBurstEmoji(null);
        router.push('/(app)/(tabs)/note');
      });
      setTimeout(() => setLoveSent(false), 2500);
      loadStreak();
    } catch {
      // silently fail — not critical
    }
    setSendingLove(false);
  };

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
  const streaksEnabled = (couple?.streaks_enabled ?? true) && hasPartner;
  const hPad = contentPadding;

  // Anniversary labels
  const anniversaryDate = couple?.anniversary_date ? new Date(couple.anniversary_date) : null;
  const togetherDisplay = (() => {
    if (!anniversaryDate) return { value: '—', label: 'Together' };
    const now = new Date();
    const diffMs = now.getTime() - anniversaryDate.getTime();
    if (diffMs < 0) return { value: '—', label: 'Together' };
    const totalDays = Math.floor(diffMs / 86400000);
    const totalHours = Math.floor(diffMs / 3600000);
    const years = now.getFullYear() - anniversaryDate.getFullYear();
    const totalMonths = years * 12 + (now.getMonth() - anniversaryDate.getMonth());

    switch (togetherMode) {
      case 'months':
        return { value: `${totalMonths}mo`, label: 'Months' };
      case 'days':
        return { value: totalDays.toLocaleString(), label: 'Days' };
      case 'hours':
        return { value: totalHours.toLocaleString(), label: 'Hours' };
      default: {
        let label: string;
        if (totalMonths === 0) {
          label = `${totalDays}d`;
        } else if (years < 1) {
          label = `${totalMonths}mo`;
        } else {
          const remMonths = totalMonths % 12;
          label = remMonths === 0 ? `${years}y` : `${years}y ${remMonths}m`;
        }
        return { value: label, label: 'Together' };
      }
    }
  })();

  const cycleTogetherMode = useCallback(() => {
    setTogetherMode(prev =>
      prev === 'total' ? 'months' :
      prev === 'months' ? 'days' :
      prev === 'days' ? 'hours' : 'total'
    );
  }, []);

  // Action zone cards
  // Ambient zone — streak, time together, send love
  const ambientZone = (
    <View style={styles.ambientZone}>
      <HomeMiniCard
        icon={<Flame color="#FF5A3D" size={16} strokeWidth={2} />}
        label="Day streak"
        value={streaksEnabled ? String(streak) : '—'}
        onPress={() => router.push('/(app)/my-stats')}
      />
      <HomeMiniCard
        icon={<Heart color="#FF2E8A" size={16} strokeWidth={2} />}
        label={togetherDisplay.label}
        value={togetherDisplay.value}
        onPress={cycleTogetherMode}
      />
      <View style={styles.loveCardWrap}>
        <HomeMiniCard
          icon={loveSent ? <CheckCheck color="#33D17A" size={16} strokeWidth={2} /> : <Send color="#FFB347" size={16} strokeWidth={2} />}
          label={loveSent ? `${loveSentEmoji} Sent!` : 'Send love'}
          value={loveSent ? loveSentEmoji : 'Tap'}
          onPress={() => { if (hasPartner) setShowLovePicker(true); }}
        />
        {loveBurstEmoji && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.loveBurst,
              {
                transform: [{ scale: burstScale.current }, { translateY: burstY.current }],
                opacity: burstOpacity.current,
              },
            ]}
          >
            <Text style={styles.loveBurstEmoji}>{loveBurstEmoji}</Text>
          </Animated.View>
        )}
      </View>
    </View>
  );

  // Greeting text only (phone layout places activity between this and the zones)
  const greetingText = (
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

  // Full greeting block with ambient zone (tablet layout)
  const greetingBlock = (
    <>
      {greetingText}
      {ambientZone}
    </>
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
          <AppText style={[styles.scorePts, { color: colors.text }]}>{myScore} ⚡</AppText>
          <View style={styles.scoreVs}>
            <Heart color="#FF2E8A" size={20} fill="rgba(255,46,138,0.22)" strokeWidth={1.5} />
            <AppText style={styles.scoreHeartNum}>{total}</AppText>
          </View>
          <AppText style={[styles.scorePts, { color: colors.text }]}>{partnerScore} ⚡</AppText>
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
      {activeInteraction && user && (
        <CurrentMomentCard
          interaction={activeInteraction}
          currentUserId={user.id}
          partnerName={partnerProfile?.display_name ?? partnerProfile?.first_name ?? undefined}
          onSeeAll={() => router.push('/(app)/activity')}
          onDismiss={handleDismissInteraction}
        />
      )}
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
      ) : !activeInteraction ? (
        <View style={[styles.activityEmpty, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
          <AppText style={[styles.activityEmptyTitle, { color: colors.text }]}>You're all caught up!</AppText>
          <AppText style={[styles.activityEmptyText, { color: colors.textMuted }]}>Send a chat, roll the dice, send a dare, or create a wish.</AppText>
        </View>
      ) : null}
    </View>
  );

  if (loading && !greetingText) {
    return (
      <AppShell scrollable={false}>
        <BrandHeader
          avatarName={profile?.display_name}
          avatarUri={profile?.avatar_url}
          onAvatarPress={() => router.push('/(app)/account')}
        />
        <View style={styles.body}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#FF2E8A" />
          </View>
        </View>
      </AppShell>
    );
  }

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
              contentContainerStyle={[styles.scroll, { paddingHorizontal: hPad }]}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF2E8A" />}
            >
              {greetingText}
              {activitySection}
            </ScrollView>
            <View style={[styles.ambientZonePinned, { paddingHorizontal: hPad }]}>
              {ambientZone}
            </View>
            {scoreBar}
          </>
        )}
      </View>

      {/* Trial expired with pending partner request */}
      <Modal
        visible={trialExpiry.visible}
        transparent
        animationType="fade"
        onRequestClose={trialExpiry.dismiss}
      >
        <Pressable style={trialExpiryStyles.overlay} onPress={trialExpiry.dismiss}>
          <View style={[trialExpiryStyles.card, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true} onResponderRelease={(e) => e.stopPropagation()}>
            <View style={trialExpiryStyles.iconWrap}>
              <Heart color="#FF2E8A" size={32} strokeWidth={2} />
            </View>
            <AppText style={[trialExpiryStyles.title, { color: colors.text }]}>
              Your free trial has ended
            </AppText>
            <AppText style={[trialExpiryStyles.body, { color: colors.textSecondary }]}>
              {trialExpiry.partnerName ?? 'Your partner'} is waiting for you to confirm their connection. Subscribe now to accept their request and unlock everything.
              {subscriptionInfo.trialExpiresAt && (
                <>\n\nYour free trial ended on {new Date(subscriptionInfo.trialExpiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.</>
              )}
              {subscriptionInfo.trialGraceEndsAt && new Date(subscriptionInfo.trialGraceEndsAt) > new Date() && (
                <> You have until {new Date(subscriptionInfo.trialGraceEndsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} to subscribe before losing access.</>
              )}
            </AppText>
            <TouchableOpacity
              style={trialExpiryStyles.subscribeBtn}
              activeOpacity={0.85}
              onPress={() => {
                trialExpiry.dismiss();
                router.push('/(auth)/subscription');
              }}
            >
              <Text style={trialExpiryStyles.subscribeBtnText}>Subscribe Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={trialExpiry.dismiss}
              activeOpacity={0.7}
              style={trialExpiryStyles.laterBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppText style={[trialExpiryStyles.laterText, { color: colors.textMuted }]}>Maybe later</AppText>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Entitlement grant expiring soon */}
      <Modal
        visible={entitlementExpiry.visible}
        transparent
        animationType="fade"
        onRequestClose={entitlementExpiry.dismiss}
      >
        <Pressable style={trialExpiryStyles.overlay} onPress={entitlementExpiry.dismiss}>
          <View style={[trialExpiryStyles.card, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true} onResponderRelease={(e) => e.stopPropagation()}>
            <View style={trialExpiryStyles.iconWrap}>
              <Clock color="#FFB347" size={32} strokeWidth={2} />
            </View>
            <AppText style={[trialExpiryStyles.title, { color: colors.text }]}>
              Your complimentary access ends soon
            </AppText>
            <AppText style={[trialExpiryStyles.body, { color: colors.textSecondary }]}>
              {entitlementExpiry.expiresAt
                ? `Your complimentary access expires on ${new Date(entitlementExpiry.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. Subscribe now to keep your access uninterrupted.`
                : 'Your complimentary access is ending soon. Subscribe now to keep your access uninterrupted.'}
              {'\n\n'}All your messages, vault items, streaks, and points are saved and will reappear the moment you subscribe.
            </AppText>
            <TouchableOpacity
              style={trialExpiryStyles.subscribeBtn}
              activeOpacity={0.85}
              onPress={() => {
                entitlementExpiry.dismiss();
                router.push({ pathname: '/(auth)/subscription', params: { reason: 'expiring_entitlement' } });
              }}
            >
              <Text style={trialExpiryStyles.subscribeBtnText}>Subscribe Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={entitlementExpiry.dismiss}
              activeOpacity={0.7}
              style={trialExpiryStyles.laterBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppText style={[trialExpiryStyles.laterText, { color: colors.textMuted }]}>Maybe later</AppText>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Send love compact emoji picker */}
      <Modal
        visible={showLovePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLovePicker(false)}
      >
        <Pressable style={lovePickerStyles.overlay} onPress={() => setShowLovePicker(false)}>
          <View
            style={lovePickerStyles.card}
            onStartShouldSetResponder={() => true}
            onResponderRelease={(e) => e.stopPropagation()}
          >
            {REACTION_EMOJIS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={lovePickerStyles.emojiBtn}
                onPress={() => handleSendLove(emoji)}
                activeOpacity={0.65}
                hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
              >
                <Text style={lovePickerStyles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
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
  ambientZone: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  ambientZonePinned: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
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
    paddingHorizontal: 2,
    alignItems: 'center',
    gap: 1,
  },
  scoreHeartNum: {
    fontSize: 9,
    fontFamily: 'Inter-Bold',
    color: '#FF2E8A',
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
  loveCardWrap: {
    flex: 1,
    position: 'relative',
  },
  loveBurst: {
    position: 'absolute',
    top: -8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  loveBurstEmoji: {
    fontSize: 36,
    lineHeight: 44,
  },
});

const lovePickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(16,14,24,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
    maxWidth: '92%',
  },
  emojiBtn: {
    flex: 1,
    minWidth: 0,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  emojiText: {
    fontSize: 22,
    lineHeight: 28,
  },
});

const trialExpiryStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,46,138,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    lineHeight: 26,
  },
  body: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
  subscribeBtn: {
    backgroundColor: '#FF2E8A',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
  },
  subscribeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  laterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 2,
  },
  laterText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
