import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { Heart, Trash2, ShieldCheck, ShieldOff, TriangleAlert as AlertTriangle } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type TabKey = 'users' | 'couples' | 'subscribers' | 'trials';

type ProfileRow = { id: string; display_name: string | null; is_admin: boolean | null; is_super_admin: boolean | null; created_at: string | null };
type CoupleRow = { id: string; user_a_id: string; user_b_id: string | null; invite_code: string | null; active: boolean | null; created_at: string | null };
type SubscriptionRow = { user_id: string; plan: string | null; status: string | null; started_at: string | null; expires_at: string | null; trial_started_at: string | null };
type EffectiveEntitlement = { label: string; source: 'super_admin' | 'admin' | 'self' | 'trial' | 'partner' | 'none'; isActive: boolean };
type SelectedUser = { profile: ProfileRow; couple: CoupleRow | null; partnerName: string | null; subscription: SubscriptionRow | null; entitlement: EffectiveEntitlement };

type UserGroup =
  | { kind: 'couple'; couple: CoupleRow; a: ProfileRow; b: ProfileRow }
  | { kind: 'solo'; profile: ProfileRow };

const safeName = (profile?: ProfileRow | null) => profile?.display_name?.trim() || 'Unnamed user';
const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
};

export default function UsersDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWideScreen = width >= 720;
  const { isSuperAdmin } = useAuth();
  const profilesRef = useRef<ProfileRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('users');
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [couples, setCouples] = useState<CoupleRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [roleToggleLoading, setRoleToggleLoading] = useState(false);
  const [roleToggleError, setRoleToggleError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [profilesResult, couplesResult, subscriptionsResult] = await Promise.all([
        supabase.from('profiles').select('id, display_name, is_admin, is_super_admin, created_at').order('created_at', { ascending: true }),
        supabase.from('couples').select('id, user_a_id, user_b_id, invite_code, active, created_at').order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('user_id, plan, status, started_at, expires_at, trial_started_at').order('started_at', { ascending: false }),
      ]);
      if (profilesResult.error) throw profilesResult.error;
      if (couplesResult.error) throw couplesResult.error;
      if (subscriptionsResult.error) throw subscriptionsResult.error;
      setProfiles((profilesResult.data ?? []) as ProfileRow[]);
      profilesRef.current = (profilesResult.data ?? []) as ProfileRow[];
      setCouples((couplesResult.data ?? []) as CoupleRow[]);
      setSubscriptions((subscriptionsResult.data ?? []) as SubscriptionRow[]);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load users dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const profileById = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p])) as Record<string, ProfileRow>, [profiles]);
  const subscriptionByUser = useMemo(() => {
    const map: Record<string, SubscriptionRow> = {};
    subscriptions.forEach(s => { if (!map[s.user_id]) map[s.user_id] = s; });
    return map;
  }, [subscriptions]);
  const coupleByUser = useMemo(() => {
    const map: Record<string, CoupleRow> = {};
    couples.forEach(c => { if (c.user_a_id) map[c.user_a_id] = c; if (c.user_b_id) map[c.user_b_id] = c; });
    return map;
  }, [couples]);
  const isSubActive = (sub: SubscriptionRow | null) => !!sub && sub.status === 'active' && (!sub.expires_at || new Date(sub.expires_at) >= new Date());

  const computeEntitlement = (profile: ProfileRow): EffectiveEntitlement => {
    if (profile.is_super_admin) return { label: 'Super Admin', source: 'super_admin', isActive: true };
    if (profile.is_admin) return { label: 'Admin', source: 'admin', isActive: true };
    const sub = subscriptionByUser[profile.id];
    if (isSubActive(sub) && (sub.plan === 'monthly' || sub.plan === 'yearly')) return { label: `${sub.plan} subscription`, source: 'self', isActive: true };
    if (isSubActive(sub) && sub.plan === 'trial') return { label: 'Trial (active)', source: 'trial', isActive: true };
    const couple = coupleByUser[profile.id];
    if (couple && couple.active !== false) {
      const partnerId = couple.user_a_id === profile.id ? couple.user_b_id : couple.user_a_id;
      if (partnerId) {
        const partnerProfile = profileById[partnerId];
        if (partnerProfile?.is_super_admin || partnerProfile?.is_admin) return { label: 'Covered by partner (admin)', source: 'partner', isActive: true };
        const partnerSub = subscriptionByUser[partnerId];
        if (isSubActive(partnerSub) && (partnerSub.plan === 'monthly' || partnerSub.plan === 'yearly')) return { label: 'Covered by partner', source: 'partner', isActive: true };
      }
    }
    if (sub?.plan === 'trial' && !isSubActive(sub)) return { label: 'Trial expired', source: 'none', isActive: false };
    return { label: 'No access', source: 'none', isActive: false };
  };

  const pairedCouples = useMemo(() => couples.filter(c => !!c.user_b_id && c.active !== false), [couples]);
  const paidSubscriptions = useMemo(() => subscriptions.filter(s => s.plan !== 'trial' && s.status === 'active'), [subscriptions]);
  const trialSubscriptions = useMemo(() => subscriptions.filter(s => s.plan === 'trial' && s.status === 'active'), [subscriptions]);

  const openUser = (profile: ProfileRow) => {
    const couple = coupleByUser[profile.id] ?? null;
    const partnerId = couple ? (couple.user_a_id === profile.id ? couple.user_b_id : couple.user_a_id) : null;
    setSelectedUser({ profile, couple, partnerName: partnerId ? safeName(profileById[partnerId]) : null, subscription: subscriptionByUser[profile.id] ?? null, entitlement: computeEntitlement(profile) });
  };

  const handleToggleAdmin = async (targetUserId: string, makeAdmin: boolean) => {
    setRoleToggleLoading(true); setRoleToggleError(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: makeAdmin })
        .eq('id', targetUserId);
      if (error) throw error;
      await loadData(true);
      const updatedProfile = profilesRef.current.find(p => p.id === targetUserId);
      if (updatedProfile) {
        const updated = { ...updatedProfile, is_admin: makeAdmin };
        const couple = coupleByUser[targetUserId] ?? null;
        const partnerId = couple ? (couple.user_a_id === targetUserId ? couple.user_b_id : couple.user_a_id) : null;
        setSelectedUser({ profile: updated, couple, partnerName: partnerId ? safeName(profileById[partnerId]) : null, subscription: subscriptionByUser[targetUserId] ?? null, entitlement: computeEntitlement(updated) });
      }
    } catch (err: any) {
      setRoleToggleError(err?.message ?? 'Failed to update role. Please try again.');
    } finally {
      setRoleToggleLoading(false);
    }
  };

  const handleDeleteUser = async (targetUserId: string) => {
    setDeleting(true); setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated. Please sign in again.');
      const { error: deleteErrorResult } = await supabase.functions.invoke('delete-account', { headers: { Authorization: `Bearer ${session.access_token}` }, body: { targetUserId } });
      if (deleteErrorResult) throw new Error(deleteErrorResult.message ?? 'Could not delete user. Please try again.');
      setDeleteModalOpen(false); setDeleteStep(1); setSelectedUser(null); await loadData(true);
    } catch (err: any) { setDeleteError(err?.message ?? 'Something went wrong. Please try again.'); }
    finally { setDeleting(false); }
  };

  const q = search.trim().toLowerCase();
  const filteredProfiles = useMemo(() => profiles.filter(p => !q || safeName(p).toLowerCase().includes(q)), [profiles, q]);
  const filteredCouples = useMemo(() => pairedCouples.filter(c => !q || safeName(profileById[c.user_a_id]).toLowerCase().includes(q) || safeName(c.user_b_id ? profileById[c.user_b_id] : null).toLowerCase().includes(q)), [pairedCouples, profileById, q]);
  const filteredPaid = useMemo(() => paidSubscriptions.filter(s => !q || safeName(profileById[s.user_id]).toLowerCase().includes(q)), [paidSubscriptions, profileById, q]);
  const filteredTrials = useMemo(() => trialSubscriptions.filter(s => !q || safeName(profileById[s.user_id]).toLowerCase().includes(q)), [trialSubscriptions, profileById, q]);

  const userGroups = useMemo<UserGroup[]>(() => {
    if (q) return filteredProfiles.map(profile => ({ kind: 'solo', profile }));
    const used = new Set<string>();
    const groups: UserGroup[] = [];
    profiles.forEach(profile => {
      if (used.has(profile.id)) return;
      const couple = coupleByUser[profile.id];
      const partnerId = couple && couple.active !== false ? (couple.user_a_id === profile.id ? couple.user_b_id : couple.user_a_id) : null;
      const partner = partnerId ? profileById[partnerId] : null;
      if (couple && partner) {
        groups.push({ kind: 'couple', couple, a: profile, b: partner });
        used.add(profile.id); used.add(partner.id);
      } else {
        groups.push({ kind: 'solo', profile }); used.add(profile.id);
      }
    });
    return groups;
  }, [q, filteredProfiles, profiles, coupleByUser, profileById]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'users', label: 'Users', count: profiles.length },
    { key: 'couples', label: 'Couples', count: pairedCouples.length },
    { key: 'subscribers', label: 'Paid', count: paidSubscriptions.length },
    { key: 'trials', label: 'Trials', count: trialSubscriptions.length },
  ];
  const roleLabel = (profile: ProfileRow) => profile.is_super_admin ? 'Super Admin' : profile.is_admin ? 'Admin' : 'User';

  const UserCard = ({ profile, paired = false }: { profile: ProfileRow; paired?: boolean }) => (
    <TouchableOpacity style={[styles.rowCard, paired && styles.pairedRowCard]} onPress={() => openUser(profile)} activeOpacity={0.8}>
      <View style={styles.rowTop}>
        <AppText style={styles.rowTitle}>{safeName(profile)}</AppText><AppText style={styles.chevron}>›</AppText>
      </View>
      <View style={styles.metaWrap}>
        <Badge text={roleLabel(profile)} />
        <Badge text={paired ? 'Paired' : 'Solo'} accent={paired} />
        <Badge text={computeEntitlement(profile).label} />
      </View>
    </TouchableOpacity>
  );

  if (selectedUser) {
    const { profile, couple, partnerName, subscription, entitlement } = selectedUser;
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={[styles.content, isWideScreen && styles.contentWide, { paddingTop: Math.max(insets.top + 20, 32) }]}>
          <TouchableOpacity onPress={() => setSelectedUser(null)} style={styles.backLink}><AppText style={styles.backLinkText}>‹ Users Dashboard</AppText></TouchableOpacity>
          <AppText style={styles.title}>{safeName(profile)}</AppText><AppText style={styles.subtitle}>Account details</AppText>
          <DetailCard label="ROLE" value={roleLabel(profile)} /><DetailCard label="EFFECTIVE ENTITLEMENT" value={entitlement.label} /><DetailCard label="USER ID" value={profile.id} mono /><DetailCard label="CREATED" value={fmtDate(profile.created_at)} /><DetailCard label="PARTNER" value={partnerName ?? 'Not paired'} /><DetailCard label="COUPLE STATUS" value={couple ? (couple.active === false ? 'Inactive' : 'Active') : 'No couple record'} /><DetailCard label="INVITE CODE" value={couple?.invite_code || '—'} mono /><DetailCard label="SUBSCRIPTION" value={subscription ? `${subscription.plan ?? 'Unknown plan'} · ${subscription.status ?? 'unknown'}` : 'None'} /><DetailCard label="SUBSCRIPTION START" value={fmtDate(subscription?.started_at)} /><DetailCard label="EXPIRES" value={fmtDate(subscription?.expires_at)} />
          {isSuperAdmin && !profile.is_super_admin ? <>
            <TouchableOpacity
              style={styles.roleToggleButton}
              onPress={() => {
                if (profile.is_admin) {
                  Alert.alert(
                    'Demote to User',
                    `Remove admin privileges from ${safeName(profile)}? They will lose access to all admin features.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Demote', style: 'destructive', onPress: () => handleToggleAdmin(profile.id, false) },
                    ]
                  );
                } else {
                  handleToggleAdmin(profile.id, true);
                }
              }}
              disabled={roleToggleLoading}
              activeOpacity={0.8}
            >
              {roleToggleLoading ? (
                <ActivityIndicator color="#69A7FF" size="small" />
              ) : profile.is_admin ? (
                <><ShieldOff color="#FFB347" size={18} /><AppText style={styles.roleToggleDemoteText}>Demote to User</AppText></>
              ) : (
                <><ShieldCheck color="#69A7FF" size={18} /><AppText style={styles.roleTogglePromoteText}>Promote to Admin</AppText></>
              )}
            </TouchableOpacity>
            {roleToggleError ? <AppText style={styles.roleToggleError}>{roleToggleError}</AppText> : null}
          </> : null}
          {isSuperAdmin ? <><TouchableOpacity style={styles.deleteButton} onPress={() => { setDeleteStep(1); setDeleteError(null); setDeleteModalOpen(true); }}><Trash2 color="#FF3B30" size={18} /><AppText style={styles.deleteButtonText}>Delete User</AppText></TouchableOpacity><AppText style={styles.note}>Deleting a user permanently removes their account, messages, vault content, and subscription. This cannot be undone.</AppText></> : <AppText style={styles.note}>Only super admins can delete users.</AppText>}
        </ScrollView>
        <Modal visible={deleteModalOpen} transparent animationType="fade" onRequestClose={() => { if (!deleting) { setDeleteModalOpen(false); setDeleteStep(1); } }}>
          <View style={styles.modalOverlay}><View style={styles.deleteModalCard}><View style={styles.deleteModalIcon}><AlertTriangle color="#FF3B30" size={28} /></View><AppText style={styles.deleteModalTitle}>{deleteStep === 1 ? `Delete ${safeName(profile)}?` : 'Are you absolutely sure?'}</AppText><AppText style={styles.deleteModalBody}>{deleteStep === 1 ? "This will permanently delete the user's account, all messages, vault content, subscription, and couple connection. This action cannot be undone." : `Tap "Delete Permanently" to remove ${safeName(profile)} and all their data. There is no undo.`}</AppText>{deleteError && <AppText style={styles.deleteModalError}>{deleteError}</AppText>}<View style={styles.deleteModalBtns}><TouchableOpacity style={styles.deleteModalCancelBtn} onPress={() => { setDeleteModalOpen(false); setDeleteStep(1); }} disabled={deleting}><AppText style={styles.deleteModalCancelText}>Cancel</AppText></TouchableOpacity>{deleteStep === 1 ? <TouchableOpacity style={styles.deleteModalConfirmBtn} onPress={() => setDeleteStep(2)}><AppText style={styles.deleteModalConfirmText}>Continue</AppText></TouchableOpacity> : <TouchableOpacity style={styles.deleteModalFinalBtn} onPress={() => handleDeleteUser(profile.id)} disabled={deleting}>{deleting ? <ActivityIndicator color="#fff" size="small" /> : <AppText style={styles.deleteModalFinalText}>Delete Permanently</AppText>}</TouchableOpacity>}</View></View></View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.root}><ScrollView contentContainerStyle={[styles.content, isWideScreen && styles.contentWide, { paddingTop: Math.max(insets.top + 20, 32) }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#FF2E8A" />}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backLink}><AppText style={styles.backLinkText}>‹ Admin</AppText></TouchableOpacity>
      <View style={styles.headerRow}><View style={styles.headerCopy}><AppText style={styles.title} numberOfLines={1}>Users Dashboard</AppText><AppText style={styles.subtitle}>Users, couples and subscriptions</AppText></View><TouchableOpacity style={styles.refreshButton} onPress={() => loadData(true)}><AppText style={styles.refreshText}>Refresh</AppText></TouchableOpacity></View>
      <View style={styles.tabBar}>{tabs.map(tab => <TouchableOpacity key={tab.key} style={[styles.tab, activeTab === tab.key && styles.tabActive]} onPress={() => { setActiveTab(tab.key); setSearch(''); }}><AppText style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</AppText><View style={[styles.countBadge, activeTab === tab.key && styles.countBadgeActive]}><AppText style={[styles.countText, activeTab === tab.key && styles.countTextActive]}>{tab.count}</AppText></View></TouchableOpacity>)}</View>
      <TextInput value={search} onChangeText={setSearch} placeholder={`Search ${activeTab}…`} placeholderTextColor="rgba(255,255,255,0.35)" autoCapitalize="none" autoCorrect={false} style={styles.search} />
      {error ? <View style={styles.errorCard}><AppText style={styles.errorTitle}>Could not load dashboard</AppText><AppText style={styles.errorText}>{error}</AppText></View> : loading ? <View style={styles.loadingWrap}><ActivityIndicator color="#FF2E8A" /><AppText style={styles.loadingText}>Loading users…</AppText></View> : <View style={styles.listWrap}>
        {activeTab === 'users' && userGroups.map(group => group.kind === 'solo' ? <UserCard key={group.profile.id} profile={group.profile} /> : <View key={group.couple.id} style={styles.coupleGroup}><UserCard profile={group.a} paired /><View style={styles.coupleConnector}><View style={styles.connectorLine} /><View style={styles.heartNode}><Heart color="#FF2E8A" fill="#FF2E8A" size={12} /><AppText style={styles.coupleLabel}>COUPLE</AppText></View><View style={styles.connectorLine} /></View><UserCard profile={group.b} paired /></View>)}
        {activeTab === 'couples' && filteredCouples.map(couple => { const a = profileById[couple.user_a_id]; const b = couple.user_b_id ? profileById[couple.user_b_id] : null; return <View key={couple.id} style={styles.coupleSummary}><View style={styles.coupleSummaryHeader}><Heart color="#FF2E8A" fill="#FF2E8A" size={15} /><AppText style={styles.coupleSummaryTitle}>Couple</AppText><Badge text={`Since ${fmtDate(couple.created_at)}`} /></View>{a && <UserCard profile={a} paired />}{b && <View style={styles.miniConnector}><View style={styles.connectorLine} /><Heart color="#FF2E8A" fill="#FF2E8A" size={10} /><View style={styles.connectorLine} /></View>}{b && <UserCard profile={b} paired />}</View>; })}
        {activeTab === 'subscribers' && filteredPaid.map((sub, index) => { const p = profileById[sub.user_id]; return p ? <TouchableOpacity key={`${sub.user_id}-${index}`} style={styles.rowCard} onPress={() => openUser(p)}><View style={styles.rowTop}><AppText style={styles.rowTitle}>{safeName(p)}</AppText><AppText style={styles.chevron}>›</AppText></View><View style={styles.metaWrap}><Badge text={sub.plan ?? 'Unknown plan'} /><Badge text={sub.status ?? 'Unknown status'} /></View></TouchableOpacity> : null; })}
        {activeTab === 'trials' && filteredTrials.map((sub, index) => { const p = profileById[sub.user_id]; return p ? <TouchableOpacity key={`${sub.user_id}-${index}`} style={styles.rowCard} onPress={() => openUser(p)}><View style={styles.rowTop}><AppText style={styles.rowTitle}>{safeName(p)}</AppText><AppText style={styles.chevron}>›</AppText></View><View style={styles.metaWrap}><Badge text="Trial" /><Badge text={`Started ${fmtDate(sub.trial_started_at ?? sub.started_at)}`} /><Badge text={`Ends ${fmtDate(sub.expires_at)}`} /></View></TouchableOpacity> : null; })}
        {((activeTab === 'users' && userGroups.length === 0) || (activeTab === 'couples' && filteredCouples.length === 0) || (activeTab === 'subscribers' && filteredPaid.length === 0) || (activeTab === 'trials' && filteredTrials.length === 0)) && <View style={styles.emptyCard}><AppText style={styles.emptyText}>No matching records.</AppText></View>}
      </View>}
    </ScrollView></View>
  );
}

function Badge({ text, accent = false }: { text: string; accent?: boolean }) { return <View style={[styles.badge, accent && styles.badgeAccent]}><AppText style={[styles.badgeText, accent && styles.badgeTextAccent]}>{text}</AppText></View>; }
function DetailCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <View style={styles.detailCard}><AppText style={styles.detailLabel}>{label}</AppText><AppText style={[styles.detailValue, mono && styles.mono]} selectable>{value}</AppText></View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07070A' }, content: { width: '100%', paddingHorizontal: 18, paddingBottom: 88 }, contentWide: { alignSelf: 'center', maxWidth: 920, paddingHorizontal: 28 }, backLink: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 14, marginBottom: 8 }, backLinkText: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontFamily: 'Inter-SemiBold' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }, headerCopy: { flex: 1, minWidth: 0 }, title: { color: '#FFFFFF', fontSize: 24, fontFamily: 'Inter-Bold' }, subtitle: { color: 'rgba(255,255,255,0.52)', fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 4 }, refreshButton: { flexShrink: 0, minHeight: 44, justifyContent: 'center', backgroundColor: '#171720', borderRadius: 22, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, refreshText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter-SemiBold' },
  tabBar: { flexDirection: 'row', gap: 8, marginBottom: 14 }, tab: { flex: 1, minWidth: 64, minHeight: 58, borderRadius: 14, backgroundColor: '#111119', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', gap: 3 }, tabActive: { borderColor: 'rgba(255,46,138,0.50)', backgroundColor: 'rgba(255,46,138,0.10)' }, tabText: { color: 'rgba(255,255,255,0.50)', fontSize: 11, fontFamily: 'Inter-SemiBold' }, tabTextActive: { color: '#FF2E8A' }, countBadge: { minWidth: 22, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center' }, countBadgeActive: { backgroundColor: 'rgba(255,46,138,0.18)' }, countText: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontFamily: 'Inter-Bold' }, countTextActive: { color: '#FF2E8A' },
  search: { color: '#FFFFFF', minHeight: 48, backgroundColor: '#111119', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 14 }, listWrap: { gap: 10 }, rowCard: { width: '100%', backgroundColor: '#111119', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 16, padding: 15, gap: 9 }, pairedRowCard: { borderColor: 'rgba(255,46,138,0.18)' }, rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, rowTitle: { flex: 1, minWidth: 0, color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-SemiBold' }, chevron: { color: 'rgba(255,255,255,0.35)', fontSize: 24, lineHeight: 24 }, metaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, badge: { borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.065)', paddingHorizontal: 8, paddingVertical: 4 }, badgeText: { color: 'rgba(255,255,255,0.60)', fontSize: 10, fontFamily: 'Inter-SemiBold' }, badgeAccent: { backgroundColor: 'rgba(255,46,138,0.12)' }, badgeTextAccent: { color: '#FF65A8' },
  coupleGroup: { gap: 0, marginBottom: 4 }, coupleConnector: { height: 28, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, gap: 7 }, connectorLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,46,138,0.35)' }, heartNode: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 }, coupleLabel: { color: '#FF65A8', fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 0.8 }, coupleSummary: { borderWidth: 1, borderColor: 'rgba(255,46,138,0.22)', backgroundColor: 'rgba(255,46,138,0.035)', borderRadius: 20, padding: 10 }, coupleSummaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 5, paddingBottom: 10 }, coupleSummaryTitle: { flex: 1, color: '#FF65A8', fontSize: 12, fontFamily: 'Inter-Bold', textTransform: 'uppercase', letterSpacing: 0.8 }, miniConnector: { height: 22, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 30 },
  loadingWrap: { paddingVertical: 50, alignItems: 'center', gap: 12 }, loadingText: { color: 'rgba(255,255,255,0.50)', fontSize: 13 }, errorCard: { backgroundColor: 'rgba(255,90,90,0.08)', borderColor: 'rgba(255,90,90,0.28)', borderWidth: 1, borderRadius: 16, padding: 16, gap: 7 }, errorTitle: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-SemiBold' }, errorText: { color: '#FF7777', fontSize: 12, lineHeight: 18 }, emptyCard: { paddingVertical: 40, alignItems: 'center' }, emptyText: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },
  detailCard: { backgroundColor: '#111119', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 16, padding: 15, gap: 6, marginTop: 10 }, detailLabel: { color: 'rgba(255,255,255,0.38)', fontSize: 10, fontFamily: 'Inter-Bold', letterSpacing: 0.7 }, detailValue: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter-Regular' }, mono: { fontFamily: 'monospace', fontSize: 12 }, note: { color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 18, marginTop: 18, textAlign: 'center' }, deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 16, backgroundColor: 'rgba(255,59,48,0.08)', borderWidth: 1, borderColor: 'rgba(255,59,48,0.25)' }, deleteButtonText: { color: '#FF3B30', fontSize: 15, fontFamily: 'Inter-SemiBold' },
  roleToggleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 16, backgroundColor: 'rgba(105,167,255,0.08)', borderWidth: 1, borderColor: 'rgba(105,167,255,0.25)', minHeight: 48 },
  roleTogglePromoteText: { color: '#69A7FF', fontSize: 15, fontFamily: 'Inter-SemiBold' },
  roleToggleDemoteText: { color: '#FFB347', fontSize: 15, fontFamily: 'Inter-SemiBold' },
  roleToggleError: { color: '#FF7777', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.70)', justifyContent: 'center', alignItems: 'center', padding: 24 }, deleteModalCard: { width: '100%', maxWidth: 380, backgroundColor: '#15151E', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,59,48,0.18)' }, deleteModalIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,59,48,0.10)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }, deleteModalTitle: { color: '#FFFFFF', fontSize: 18, fontFamily: 'Inter-Bold', textAlign: 'center', marginBottom: 10 }, deleteModalBody: { color: 'rgba(255,255,255,0.60)', fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 20 }, deleteModalError: { color: '#FF7777', fontSize: 12, lineHeight: 17, textAlign: 'center', marginBottom: 14 }, deleteModalBtns: { flexDirection: 'row', gap: 10, width: '100%' }, deleteModalCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#1E1E28', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center', minHeight: 44 }, deleteModalCancelText: { color: 'rgba(255,255,255,0.70)', fontSize: 14, fontFamily: 'Inter-SemiBold' }, deleteModalConfirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: 'rgba(255,59,48,0.12)', borderWidth: 1, borderColor: 'rgba(255,59,48,0.30)', alignItems: 'center', justifyContent: 'center', minHeight: 44 }, deleteModalConfirmText: { color: '#FF3B30', fontSize: 14, fontFamily: 'Inter-SemiBold' }, deleteModalFinalBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', minHeight: 44 }, deleteModalFinalText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter-SemiBold' },
});