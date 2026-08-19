import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '@/components/AppText';
import { supabase } from '@/lib/supabase';

type TabKey = 'users' | 'couples' | 'subscribers' | 'trials';

type ProfileRow = {
  id: string;
  display_name: string | null;
  is_admin: boolean | null;
  is_super_admin: boolean | null;
  created_at: string | null;
};

type CoupleRow = {
  id: string;
  user_a_id: string;
  user_b_id: string | null;
  invite_code: string | null;
  active: boolean | null;
  created_at: string | null;
};

type SubscriptionRow = {
  user_id: string;
  plan: string | null;
  status: string | null;
  started_at: string | null;
  expires_at: string | null;
  trial_started_at: string | null;
};

type SelectedUser = {
  profile: ProfileRow;
  couple: CoupleRow | null;
  partnerName: string | null;
  subscription: SubscriptionRow | null;
};

const safeName = (profile?: ProfileRow | null) => {
  const value = profile?.display_name?.trim();
  return value || 'Unnamed user';
};

const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
};

export default function UsersDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWideScreen = width >= 720;
  const [activeTab, setActiveTab] = useState<TabKey>('users');
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [couples, setCouples] = useState<CoupleRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [profilesResult, couplesResult, subscriptionsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, is_admin, is_super_admin, created_at')
          .order('created_at', { ascending: true }),
        supabase
          .from('couples')
          .select('id, user_a_id, user_b_id, invite_code, active, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('subscriptions')
          .select('user_id, plan, status, started_at, expires_at, trial_started_at')
          .order('started_at', { ascending: false }),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (couplesResult.error) throw couplesResult.error;
      if (subscriptionsResult.error) throw subscriptionsResult.error;

      setProfiles((profilesResult.data ?? []) as ProfileRow[]);
      setCouples((couplesResult.data ?? []) as CoupleRow[]);
      setSubscriptions((subscriptionsResult.data ?? []) as SubscriptionRow[]);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load users dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const profileById = useMemo(() => {
    const map: Record<string, ProfileRow> = {};
    profiles.forEach(profile => { map[profile.id] = profile; });
    return map;
  }, [profiles]);

  const subscriptionByUser = useMemo(() => {
    const map: Record<string, SubscriptionRow> = {};
    subscriptions.forEach(subscription => {
      if (!map[subscription.user_id]) map[subscription.user_id] = subscription;
    });
    return map;
  }, [subscriptions]);

  const coupleByUser = useMemo(() => {
    const map: Record<string, CoupleRow> = {};
    couples.forEach(couple => {
      if (couple.user_a_id) map[couple.user_a_id] = couple;
      if (couple.user_b_id) map[couple.user_b_id] = couple;
    });
    return map;
  }, [couples]);

  const pairedCouples = useMemo(() => couples.filter(c => !!c.user_b_id), [couples]);
  const paidSubscriptions = useMemo(
    () => subscriptions.filter(s => s.plan !== 'trial' && s.status === 'active'),
    [subscriptions],
  );
  const trialSubscriptions = useMemo(
    () => subscriptions.filter(s => s.plan === 'trial' && s.status === 'active'),
    [subscriptions],
  );

  const openUser = (profile: ProfileRow) => {
    const couple = coupleByUser[profile.id] ?? null;
    let partnerName: string | null = null;
    if (couple) {
      const partnerId = couple.user_a_id === profile.id ? couple.user_b_id : couple.user_a_id;
      partnerName = partnerId ? safeName(profileById[partnerId]) : null;
    }
    setSelectedUser({
      profile,
      couple,
      partnerName,
      subscription: subscriptionByUser[profile.id] ?? null,
    });
  };

  const q = search.trim().toLowerCase();

  const filteredProfiles = useMemo(
    () => profiles.filter(p => !q || safeName(p).toLowerCase().includes(q)),
    [profiles, q],
  );

  const filteredCouples = useMemo(
    () => pairedCouples.filter(c => {
      const a = safeName(profileById[c.user_a_id]).toLowerCase();
      const b = safeName(c.user_b_id ? profileById[c.user_b_id] : null).toLowerCase();
      return !q || a.includes(q) || b.includes(q);
    }),
    [pairedCouples, profileById, q],
  );

  const filteredPaid = useMemo(
    () => paidSubscriptions.filter(s => !q || safeName(profileById[s.user_id]).toLowerCase().includes(q)),
    [paidSubscriptions, profileById, q],
  );

  const filteredTrials = useMemo(
    () => trialSubscriptions.filter(s => !q || safeName(profileById[s.user_id]).toLowerCase().includes(q)),
    [trialSubscriptions, profileById, q],
  );

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'users', label: 'Users', count: profiles.length },
    { key: 'couples', label: 'Couples', count: pairedCouples.length },
    { key: 'subscribers', label: 'Paid', count: paidSubscriptions.length },
    { key: 'trials', label: 'Trials', count: trialSubscriptions.length },
  ];

  const roleLabel = (profile: ProfileRow) =>
    profile.is_super_admin ? 'Super Admin' : profile.is_admin ? 'Admin' : 'User';

  const renderUserRow = (profile: ProfileRow) => {
    const couple = coupleByUser[profile.id];
    const sub = subscriptionByUser[profile.id];
    const partnerId = couple
      ? (couple.user_a_id === profile.id ? couple.user_b_id : couple.user_a_id)
      : null;
    const partner = partnerId ? safeName(profileById[partnerId]) : null;

    return (
      <TouchableOpacity key={profile.id} style={styles.rowCard} onPress={() => openUser(profile)} activeOpacity={0.8}>
        <View style={styles.rowTop}>
          <AppText style={styles.rowTitle}>{safeName(profile)}</AppText>
          <AppText style={styles.chevron}>›</AppText>
        </View>
        <View style={styles.metaWrap}>
          <Badge text={roleLabel(profile)} />
          <Badge text={partner ? `w/ ${partner}` : 'Solo'} />
          {sub ? <Badge text={`${sub.plan ?? 'Plan'} · ${sub.status ?? 'unknown'}`} /> : <Badge text="No subscription" />}
        </View>
      </TouchableOpacity>
    );
  };

  if (selectedUser) {
    const { profile, couple, partnerName, subscription } = selectedUser;
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={[styles.content, isWideScreen && styles.contentWide, { paddingTop: Math.max(insets.top + 20, 32) }]}>
          <TouchableOpacity onPress={() => setSelectedUser(null)} style={styles.backLink}>
            <AppText style={styles.backLinkText}>‹ Users Dashboard</AppText>
          </TouchableOpacity>

          <AppText style={styles.title}>{safeName(profile)}</AppText>
          <AppText style={styles.subtitle}>Account details</AppText>

          <DetailCard label="ROLE" value={roleLabel(profile)} />
          <DetailCard label="USER ID" value={profile.id} mono />
          <DetailCard label="CREATED" value={fmtDate(profile.created_at)} />
          <DetailCard label="PARTNER" value={partnerName ?? 'Not paired'} />
          <DetailCard label="COUPLE STATUS" value={couple ? (couple.active === false ? 'Inactive' : 'Active') : 'No couple record'} />
          <DetailCard label="INVITE CODE" value={couple?.invite_code || '—'} mono />
          <DetailCard
            label="SUBSCRIPTION"
            value={subscription ? `${subscription.plan ?? 'Unknown plan'} · ${subscription.status ?? 'unknown'}` : 'None'}
          />
          <DetailCard label="SUBSCRIPTION START" value={fmtDate(subscription?.started_at)} />
          <DetailCard label="EXPIRES" value={fmtDate(subscription?.expires_at)} />

          <AppText style={styles.note}>
            This rebuilt dashboard is intentionally read-only while we confirm stability. Admin actions can be added back safely after this version is verified.
          </AppText>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, isWideScreen && styles.contentWide, { paddingTop: Math.max(insets.top + 20, 32) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#FF2E8A" />}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <AppText style={styles.backLinkText}>‹ Admin</AppText>
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <AppText style={styles.title} numberOfLines={1} ellipsizeMode="tail">Users Dashboard</AppText>
            <AppText style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">Users, couples and subscriptions</AppText>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={() => loadData(true)} activeOpacity={0.8}>
            <AppText style={styles.refreshText}>Refresh</AppText>
          </TouchableOpacity>
        </View>

        <View style={styles.tabBar}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => { setActiveTab(tab.key); setSearch(''); }}
              activeOpacity={0.8}
            >
              <AppText style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</AppText>
              <View style={[styles.countBadge, activeTab === tab.key && styles.countBadgeActive]}>
                <AppText style={[styles.countText, activeTab === tab.key && styles.countTextActive]}>{tab.count}</AppText>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${activeTab}…`}
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />

        {error ? (
          <View style={styles.errorCard}>
            <AppText style={styles.errorTitle}>Could not load dashboard</AppText>
            <AppText style={styles.errorText} selectable>{error}</AppText>
          </View>
        ) : loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#FF2E8A" />
            <AppText style={styles.loadingText}>Loading users…</AppText>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {activeTab === 'users' && filteredProfiles.map(renderUserRow)}

            {activeTab === 'couples' && filteredCouples.map(couple => (
              <View key={couple.id} style={styles.rowCard}>
                <AppText style={styles.rowTitle}>
                  {safeName(profileById[couple.user_a_id])} & {safeName(couple.user_b_id ? profileById[couple.user_b_id] : null)}
                </AppText>
                <View style={styles.metaWrap}>
                  <Badge text={couple.active === false ? 'Inactive' : 'Active'} />
                  <Badge text={`Since ${fmtDate(couple.created_at)}`} />
                </View>
              </View>
            ))}

            {activeTab === 'subscribers' && filteredPaid.map((sub, index) => (
              <TouchableOpacity
                key={`${sub.user_id}-${sub.started_at ?? index}`}
                style={styles.rowCard}
                onPress={() => profileById[sub.user_id] && openUser(profileById[sub.user_id])}
                activeOpacity={0.8}
              >
                <View style={styles.rowTop}>
                  <AppText style={styles.rowTitle}>{safeName(profileById[sub.user_id])}</AppText>
                  <AppText style={styles.chevron}>›</AppText>
                </View>
                <View style={styles.metaWrap}>
                  <Badge text={sub.plan ?? 'Unknown plan'} />
                  <Badge text={sub.status ?? 'Unknown status'} />
                </View>
              </TouchableOpacity>
            ))}

            {activeTab === 'trials' && filteredTrials.map((sub, index) => (
              <TouchableOpacity
                key={`${sub.user_id}-${sub.started_at ?? index}`}
                style={styles.rowCard}
                onPress={() => profileById[sub.user_id] && openUser(profileById[sub.user_id])}
                activeOpacity={0.8}
              >
                <View style={styles.rowTop}>
                  <AppText style={styles.rowTitle}>{safeName(profileById[sub.user_id])}</AppText>
                  <AppText style={styles.chevron}>›</AppText>
                </View>
                <View style={styles.metaWrap}>
                  <Badge text="Trial" />
                  <Badge text={`Started ${fmtDate(sub.trial_started_at ?? sub.started_at)}`} />
                  <Badge text={`Ends ${fmtDate(sub.expires_at)}`} />
                </View>
              </TouchableOpacity>
            ))}

            {((activeTab === 'users' && filteredProfiles.length === 0) ||
              (activeTab === 'couples' && filteredCouples.length === 0) ||
              (activeTab === 'subscribers' && filteredPaid.length === 0) ||
              (activeTab === 'trials' && filteredTrials.length === 0)) && (
              <View style={styles.emptyCard}>
                <AppText style={styles.emptyText}>No matching records.</AppText>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge}>
      <AppText style={styles.badgeText}>{text}</AppText>
    </View>
  );
}

function DetailCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.detailCard}>
      <AppText style={styles.detailLabel}>{label}</AppText>
      <AppText style={[styles.detailValue, mono && styles.mono]} selectable>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07070A' },
  content: { width: '100%', paddingHorizontal: 18, paddingBottom: 88 },
  contentWide: { alignSelf: 'center', maxWidth: 920, paddingHorizontal: 28 },
  backLink: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 14, marginBottom: 8 },
  backLinkText: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontFamily: 'Inter-SemiBold' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: '#FFFFFF', fontSize: 24, fontFamily: 'Inter-Bold' },
  subtitle: { color: 'rgba(255,255,255,0.52)', fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 4 },
  refreshButton: { flexShrink: 0, minHeight: 44, justifyContent: 'center', backgroundColor: '#171720', borderRadius: 22, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  refreshText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter-SemiBold' },
  tabBar: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: { flex: 1, minWidth: 64, minHeight: 58, borderRadius: 14, backgroundColor: '#111119', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabActive: { borderColor: 'rgba(255,46,138,0.50)', backgroundColor: 'rgba(255,46,138,0.10)' },
  tabText: { color: 'rgba(255,255,255,0.50)', fontSize: 11, fontFamily: 'Inter-SemiBold' },
  tabTextActive: { color: '#FF2E8A' },
  countBadge: { minWidth: 22, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center' },
  countBadgeActive: { backgroundColor: 'rgba(255,46,138,0.18)' },
  countText: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontFamily: 'Inter-Bold' },
  countTextActive: { color: '#FF2E8A' },
  search: { color: '#FFFFFF', minHeight: 48, backgroundColor: '#111119', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 14 },
  listWrap: { gap: 10 },
  rowCard: { width: '100%', backgroundColor: '#111119', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 16, padding: 15, gap: 9 },

  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { flex: 1, minWidth: 0, color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-SemiBold' },
  chevron: { color: 'rgba(255,255,255,0.35)', fontSize: 24, lineHeight: 24 },
  metaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.065)', paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: 'rgba(255,255,255,0.60)', fontSize: 10, fontFamily: 'Inter-SemiBold' },
  loadingWrap: { paddingVertical: 50, alignItems: 'center', gap: 12 },
  loadingText: { color: 'rgba(255,255,255,0.50)', fontSize: 13 },
  errorCard: { backgroundColor: 'rgba(255,90,90,0.08)', borderColor: 'rgba(255,90,90,0.28)', borderWidth: 1, borderRadius: 16, padding: 16, gap: 7 },
  errorTitle: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-SemiBold' },
  errorText: { color: '#FF7777', fontSize: 12, lineHeight: 18 },
  emptyCard: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },
  detailCard: { backgroundColor: '#111119', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 16, padding: 15, gap: 6, marginTop: 10 },
  detailLabel: { color: 'rgba(255,255,255,0.38)', fontSize: 10, fontFamily: 'Inter-Bold', letterSpacing: 0.7 },
  detailValue: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter-Regular' },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  note: { color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 18, marginTop: 18, textAlign: 'center' },
});
