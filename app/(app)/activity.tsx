import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import AppText from '@/components/AppText';
import { useRouter, usePathname } from 'expo-router';
import { ArrowLeft, Zap, Lock, MessageCircle, Dice6, Camera, Sparkles, ChevronRight, CheckCheck, Trash2 } from 'lucide-react-native';
import { logDebugEvent } from '@/lib/debugLog';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Interaction, ChatMessage } from '@/lib/types';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import WarmupLogo from '@/components/WarmupLogo';
import WarmupWordmark from '@/components/WarmupWordmark';
import { markViewed as markViewedUtil, markAllViewed as markAllViewedUtil } from '@/lib/activity';

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
  route: string;
  routeParams?: Record<string, string>;
  thumbUri?: string | null;
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
  const pathname = usePathname();
  const { user, partnerProfile, couple, profile } = useAuth();
  const { colors } = useTheme();
  const [allItems, setAllItems] = useState<ActivityItem[]>([]);
  const [viewedSet, setViewedSet] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  const items = filter === 'all'
    ? allItems
    : allItems.filter(i => i._type === filter);

  const unreadCount = items.filter(i => !viewedSet.has(`${i.sourceTable}:${i.sourceId}`)).length;

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => load(), 300);
  }, []);

  useEffect(() => {
    if (!couple?.id || !user?.id) return;
    load();
    const ch = supabase.channel(`activity_screen_${couple.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interactions', filter: `couple_id=eq.${couple.id}` }, debouncedReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `couple_id=eq.${couple.id}` }, debouncedReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_events', filter: `couple_id=eq.${couple.id}` }, debouncedReload)
      .subscribe();
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      supabase.removeChannel(ch);
    };
  }, [couple?.id, user?.id, debouncedReload]);

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
    if (isMountedRef.current) setViewedSet(viewed);

    const mapped: ActivityItem[] = [];
    const partnerName = partnerProfile?.display_name ?? 'Partner';

    (interactions ?? []).forEach((i: Interaction) => {
      const isMine = i.sender_id === user.id;
      let label = '';
      let icon: React.ReactNode;
      let color = '#FF2E8A';
      let type: FilterTab = 'dare';
      let route = '/(app)/(tabs)';
      let routeParams: Record<string, string> | undefined;

      switch (i.type) {
        case 'dice':
          type = 'dice';
          label = isMine ? 'You rolled the dice' : `${partnerName} rolled the dice`;
          icon = <Dice6 color="#FFB347" size={18} strokeWidth={2} />;
          color = '#FFB347';
          route = '/(app)/(tabs)/dice';
          if (!isMine) routeParams = { dice_id: i.id };
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
          route = '/(app)/(tabs)/dare';
          if (!isMine) routeParams = { dare_id: i.id };
          break;
        case 'tell_me':
          type = 'wish';
          label = i.status === 'answered'
            ? (isMine ? `${partnerName} answered your Wish` : 'You answered the Wish')
            : (isMine ? 'You sent a Wish' : `${partnerName} sent you a Wish`);
          icon = <Sparkles color="#F0A96A" size={18} strokeWidth={2} />;
          color = '#F0A96A';
          route = '/(app)/(tabs)/wish';
          routeParams = { wish_id: i.id };
          break;
        case 'media':
          type = 'dare';
          label = isMine ? 'New Vault item added' : `${partnerName} added to the Vault`;
          icon = <Lock color="#FF2E8A" size={18} strokeWidth={2} />;
          color = '#FF2E8A';
          route = '/(app)/(tabs)/vault';
          routeParams = { vault_item_id: (i as any).vault_item_id ?? i.id };
          break;
        default:
          type = 'dare';
          label = 'Activity';
          icon = <Zap color="#FF2E8A" size={18} strokeWidth={2} />;
          route = '/(app)/(tabs)';
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
        route,
        routeParams,
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
        route: '/(app)/(tabs)/note',
        routeParams: { message_id: msg.id },
      });
    });

    // Collect screenshot events that need thumbnail resolution so we can
    // batch the signed-URL calls after the synchronous forEach.
    const screenshotThumbRefs: { idx: number; bucket: string; path: string }[] = [];

    (activityEvts ?? []).forEach((ev: any) => {
      const isMine = ev.actor_user_id === user.id;

      if (ev.event_type === 'screenshot_detected') {
        const screen = ev.source_screen ?? 'vault';
        const routeMap: Record<string, string> = { vault: '/(app)/(tabs)/vault', chat: '/(app)/(tabs)/note', wish: '/(app)/(tabs)/wish' };
        const subMap: Record<string, string> = { vault: 'Vault', chat: 'Chat', wish: 'Wish List' };

        const meta = ev.metadata;
        const hasThumbMeta = !!(meta?.storage_path && meta?.storage_bucket);

        mapped.push({
          id: `privacy_${ev.id}`,
          sourceTable: 'activity_events',
          sourceId: ev.id,
          _type: 'privacy',
          label: `${partnerName} screenshotted your content`,
          sub: subMap[screen] ?? 'Vault',
          time: timeAgo(ev.created_at),
          icon: <Camera color="#FF8A3D" size={18} strokeWidth={2} />,
          color: '#FF8A3D',
          _rawTime: ev.created_at,
          route: routeMap[screen] ?? '/(app)/(tabs)/vault',
          routeParams: ev.vault_item_id ? { vault_item_id: ev.vault_item_id } : undefined,
          thumbUri: null,
        });

        if (hasThumbMeta) {
          screenshotThumbRefs.push({
            idx: mapped.length - 1,
            bucket: meta.storage_bucket as string,
            path: meta.storage_path as string,
          });
        }
        return;
      }

      if (ev.event_type === 'media_reaction') {
        const emoji = ev.metadata?.emoji ?? '❤️';
        const mediaType = ev.metadata?.media_type ?? 'photo';
        const sourceTable = ev.metadata?.source_table;
        const label = isMine
          ? `You reacted ${emoji} to a ${mediaType}`
          : `${partnerName} reacted ${emoji} to your ${mediaType}`;
        const reactionRoute = sourceTable === 'vault_items' ? '/(app)/(tabs)/vault' : '/(app)/(tabs)/note';
        const reactionParams: Record<string, string> = {};
        if (sourceTable === 'vault_items' && ev.vault_item_id) {
          reactionParams.vault_item_id = ev.vault_item_id;
        } else if (sourceTable === 'chat_messages' && ev.metadata?.source_id) {
          reactionParams.message_id = ev.metadata.source_id;
        }
        mapped.push({
          id: `reaction_${ev.id}`,
          sourceTable: 'activity_events',
          sourceId: ev.id,
          _type: sourceTable === 'vault_items' ? 'dare' : 'chat',
          label,
          sub: '',
          time: timeAgo(ev.created_at),
          icon: <AppText style={{ fontSize: 18, lineHeight: 22 }}>{emoji}</AppText>,
          color: '#FF2E8A',
          _rawTime: ev.created_at,
          route: reactionRoute,
          routeParams: Object.keys(reactionParams).length ? reactionParams : undefined,
        });
        return;
      }

      let label = '';
      let sub = '';
      let wishRoute = '/(app)/(tabs)/wish';
      let wishParams: Record<string, string> | undefined;
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
        case 'content_deleted': {
          const cats: string[] = ev.metadata?.categories ?? [];
          const isAll = cats.includes('all');
          if (isAll) {
            label = isMine ? 'You cleared all shared content' : `${partnerName} cleared all shared content`;
            sub = 'All history deleted';
          } else {
            const names = cats.map((c: string) => {
              const map: Record<string, string> = {
                chat: 'Chat', dice: 'Dice', dare: 'Dare', wish: 'Wish',
                vault: 'Vault', activity: 'Activity', points: 'Points',
              };
              return map[c] ?? c;
            });
            label = isMine
              ? `You deleted: ${names.join(', ')}`
              : `${partnerName} deleted: ${names.join(', ')}`;
            sub = 'Content removed';
          }
          mapped.push({
            id: `content_deleted_${ev.id}`,
            sourceTable: 'activity_events',
            sourceId: ev.id,
            _type: 'all' as FilterTab,
            label,
            sub,
            time: timeAgo(ev.created_at),
            icon: <Trash2 color="#FF6B6B" size={18} strokeWidth={2} />,
            color: '#FF6B6B',
            _rawTime: ev.created_at,
            route: '/(app)/(tabs)',
          });
          return;
        }
        default:
          return;
      }
      if (ev.wish_id) wishParams = { wish_id: ev.wish_id };

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
        route: wishRoute,
        routeParams: wishParams,
      });
    });

    // Resolve live thumbnails for screenshot events in parallel. These are
    // pointers to the original files — no copies. If content was burned or
    // deleted, the signed URL fails silently and the row keeps thumbUri null,
    // so the feed falls back to the camera icon.
    if (screenshotThumbRefs.length) {
      const results = await Promise.all(
        screenshotThumbRefs.map(ref =>
          supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 60 * 60),
        ),
      );
      results.forEach((res, i) => {
        const ref = screenshotThumbRefs[i];
        if (res.data?.signedUrl && mapped[ref.idx]) {
          mapped[ref.idx].thumbUri = res.data.signedUrl;
        }
      });
    }

    mapped.sort((a, b) => b._rawTime.localeCompare(a._rawTime));
    if (isMountedRef.current) setAllItems(mapped);
  };

  const handleItemPress = async (item: ActivityItem) => {
    if (!couple?.id || !user?.id) return;
    const key = `${item.sourceTable}:${item.sourceId}`;
    if (!viewedSet.has(key)) {
      setViewedSet(prev => new Set([...prev, key]));
      markViewedUtil(item, couple.id, user.id);
    }

    // For vault/media items we navigate to the vault-viewer Stack screen directly.
    // This keeps the back stack as: (tabs) → activity → vault-viewer, so back
    // navigation always works. Using replace('/(app)/(tabs)/vault') puts a second
    // (tabs) instance on the (app) Stack which causes an ErrorBoundary crash on back.
    if (item.route === '/(app)/(tabs)/vault' && item.routeParams?.vault_item_id) {
      const vaultItemId = item.routeParams.vault_item_id;
      const { data: vaultItem } = await supabase
        .from('vault_items')
        .select('*')
        .eq('id', vaultItemId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!vaultItem) return;
      const bucket = vaultItem.storage_bucket ?? 'vault';
      const path = vaultItem.storage_path ?? vaultItem.file_path;
      if (!path) return;
      const { data: urlData } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
      if (!urlData?.signedUrl) return;
      const uploaderName = vaultItem.uploaded_by_user_id === user.id
        ? (profile?.display_name ?? 'You')
        : (partnerProfile?.display_name ?? 'Partner');
      router.push({
        pathname: '/(app)/vault-viewer',
        params: {
          id: vaultItem.id,
          storagePath: path,
          storageBucket: bucket,
          mediaType: vaultItem.media_type,
          allowScreenshot: vaultItem.allow_screenshot ? '1' : '0',
          allowSave: vaultItem.allow_save ? '1' : '0',
          allowShare: vaultItem.allow_share ? '1' : '0',
          createdAt: vaultItem.created_at,
          uploaderName,
          thumbUri: urlData.signedUrl,
        },
      });
      return;
    }

    // Pop activity off the (app) Stack first, then switch to the target tab.
    // router.navigate() alone can push a second (tabs) instance on the Stack
    // instead of returning to the existing one, leaving state:
    //   (tabs)[index] → activity → (tabs)[dare]
    // router.replace() in the header then crashes the ErrorBoundary.
    // Calling back() first guarantees a clean Stack before the tab switch.
    router.back();
    if (item.routeParams) {
      router.navigate({ pathname: item.route as any, params: item.routeParams });
    } else {
      router.navigate(item.route as any);
    }
  };

  const handleMarkAllRead = async () => {
    if (!couple?.id || !user?.id) return;
    const unread = items.filter(i => !viewedSet.has(`${i.sourceTable}:${i.sourceId}`));
    if (!unread.length) return;
    const newSet = new Set(viewedSet);
    unread.forEach(i => newSet.add(`${i.sourceTable}:${i.sourceId}`));
    setViewedSet(newSet);
    await markAllViewedUtil(unread, couple.id, user.id);
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
          <TouchableOpacity
            onPress={() => {
              logDebugEvent('HEADER_HOME_PRESSED', {
                currentRoute: pathname,
                targetRoute: '/(app)/(tabs)',
                method: 'back',
              });
              router.back();
            }}
            activeOpacity={0.7}
            style={styles.brand}
          >
            <WarmupLogo size={28} />
            <WarmupWordmark size={13} />
          </TouchableOpacity>
        <View style={styles.headerRight}>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <CheckCheck color={colors.textMuted} size={18} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
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
              <TouchableOpacity
                key={item.id}
                onPress={() => handleItemPress(item)}
                activeOpacity={0.7}
                style={[styles.row, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}
              >
                <View style={styles.unreadIndicatorWrap}>
                  {isUnread && <View style={styles.unreadDot} />}
                </View>
                {item.thumbUri ? (
                  <ExpoImage
                    source={{ uri: item.thumbUri }}
                    style={styles.thumbWrap}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                  />
                ) : (
                  <View style={[styles.iconWrap, { backgroundColor: `${item.color}18` }]}>
                    {item.icon}
                  </View>
                )}
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
                <ChevronRight color={colors.textMuted} size={14} strokeWidth={2} />
              </TouchableOpacity>
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
    width: 44,
    height: 44,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 40 },
  filterScroll: { marginTop: Spacing.lg, marginBottom: Spacing.lg },
  filterContent: { gap: Spacing.sm, paddingRight: Spacing.screen },
  filterTab: { borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, minWidth: 60, alignItems: 'center' },
  filterTabText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
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
  thumbWrap: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
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
