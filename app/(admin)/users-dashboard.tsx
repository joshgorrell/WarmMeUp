import React, { useEffect, useState, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  Modal, Alert, ActivityIndicator,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronRight, UserCog, X, ShieldCheck, ShieldOff, Crown, Activity,
  Users, Heart, Lock, Check, TriangleAlert as AlertTriangle, RefreshCw, CreditCard, Gift,
  Trash2,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import type { DiagnosticsSnapshot } from '@/lib/diagnosticsSnapshot';
import { buildDiagnosticsReport } from '@/lib/diagnosticsSnapshot';
import * as Clipboard from 'expo-clipboard';

type TabKey = 'users' | 'couples' | 'subscribers' | 'trials';

interface UserRow {
  id: string;
  display_name: string;
  is_admin: boolean;
  is_super_admin: boolean;
  created_at: string;
}

interface CoupleContext {
  partnerName: string | null;
  active: boolean;
}

interface CoupleRow {
  id: string;
  user_a_id: string;
  user_b_id: string | null;
  invite_code: string;
  active: boolean;
  admin_notes: string;
  created_at: string;
  user_a_name: string;
  user_b_name: string | null;
}

interface SubscriptionRow {
  user_id: string;
  plan: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  trial_started_at: string | null;
  display_name: string;
}

interface UserDiagnosticsRow {
  user_id: string;
  email: string | null;
  snapshot: DiagnosticsSnapshot;
  captured_at: string;
}

function DiagRow({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <View style={diagStyles.row}>
      <AppText style={diagStyles.label}>{label}</AppText>
      <AppText style={[diagStyles.value, dim && diagStyles.valueDim]} numberOfLines={4} selectable>
        {value || '(empty)'}
      </AppText>
    </View>
  );
}

function DiagSection({ title }: { title: string }) {
  return <AppText style={diagStyles.section}>{title}</AppText>;
}

export default function UsersDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { profile: myProfile, isSuperAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('users');

  const [users, setUsers] = useState<UserRow[]>([]);
  const [coupleMap, setCoupleMap] = useState<Record<string, CoupleContext>>({});
  const [couples, setCouples] = useState<CoupleRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [selectedCouple, setSelectedCouple] = useState<CoupleRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');

  const [diagUser, setDiagUser] = useState<UserRow | null>(null);
  const [diagData, setDiagData] = useState<UserDiagnosticsRow | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [profilesResult, couplesResult, subsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, is_admin, is_super_admin, created_at')
        .order('created_at', { ascending: true }),
      supabase
        .from('couples')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('subscriptions')
        .select('user_id, plan, status, started_at, expires_at, trial_started_at')
        .order('started_at', { ascending: false }),
    ]);

    const profileList = profilesResult.data ?? [];
    const nameMap = Object.fromEntries(profileList.map(p => [p.id, p.display_name]));

    // Build couple context map for users tab
    const map: Record<string, CoupleContext> = {};
    for (const couple of couplesResult.data ?? []) {
      const { user_a_id, user_b_id, active } = couple;
      if (user_a_id) {
        map[user_a_id] = { partnerName: user_b_id ? (nameMap[user_b_id] ?? 'Unknown') : null, active };
      }
      if (user_b_id) {
        map[user_b_id] = { partnerName: nameMap[user_a_id] ?? 'Unknown', active };
      }
    }
    setUsers(profileList);
    setCoupleMap(map);

    // Enrich couples
    const enrichedCouples: CoupleRow[] = (couplesResult.data ?? []).map(c => ({
      ...c,
      admin_notes: c.admin_notes ?? '',
      user_a_name: nameMap[c.user_a_id] ?? 'Unknown',
      user_b_name: c.user_b_id ? (nameMap[c.user_b_id] ?? 'Unknown') : null,
    }));
    setCouples(enrichedCouples);

    // Enrich subscriptions
    const enrichedSubs: SubscriptionRow[] = (subsResult.data ?? []).map(s => ({
      ...s,
      display_name: nameMap[s.user_id] ?? 'Unknown',
    }));
    setSubscriptions(enrichedSubs);

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── User actions ──

  const handleToggleAdmin = (user: UserRow) => {
    if (!isSuperAdmin) return;
    if (user.id === myProfile?.id) {
      Alert.alert('Not Allowed', 'You cannot change your own admin status.');
      return;
    }
    const actionLabel = user.is_admin ? 'Revoke Admin' : 'Grant Admin';
    const message = user.is_admin
      ? `Remove admin access from ${user.display_name}? They will revert to a regular user immediately.`
      : `Grant admin access to ${user.display_name}? They will have full access to the Admin panel.`;

    Alert.alert(actionLabel, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: actionLabel,
        style: user.is_admin ? 'destructive' : 'default',
        onPress: async () => {
          setSaving(true);
          const { error } = await supabase
            .from('profiles')
            .update({ is_admin: !user.is_admin })
            .eq('id', user.id);
          if (error) {
            Alert.alert('Error', 'Could not update admin status. Please try again.');
          } else {
            const updated = { ...user, is_admin: !user.is_admin };
            setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
            setSelectedUser(updated);
          }
          setSaving(false);
        },
      },
    ]);
  };

  const [deleting, setDeleting] = useState(false);

  const handleDeleteUser = (user: UserRow) => {
    const partner = coupleMap[user.id];
    const isPaired = partner?.partnerName != null;
    const activeSub = subscriptions.find(
      s => s.user_id === user.id && s.status === 'active' && s.plan !== 'trial',
    );

    const warnings: string[] = [];
    if (isPaired) {
      warnings.push(`This user is currently paired with ${partner!.partnerName}. Deleting will disconnect their partner and remove all shared content.`);
    }
    if (activeSub) {
      warnings.push(`This user has an active ${activeSub.plan} subscription. Deleting will cancel it immediately.`);
    }

    const warningText = warnings.length > 0
      ? `\n\n${warnings.join('\n\n')}`
      : '';

    Alert.alert(
      'Delete User',
      `Are you sure you want to permanently delete ${user.display_name}? This cannot be undone.${warningText}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const token = session?.access_token;
              if (!token) throw new Error('Not authenticated.');

              const { error } = await supabase.functions.invoke('delete-account', {
                headers: { Authorization: `Bearer ${token}` },
                body: { targetUserId: user.id },
              });

              if (error) throw error;

              setUsers(prev => prev.filter(u => u.id !== user.id));
              setCouples(prev => prev.filter(c => c.user_a_id !== user.id && c.user_b_id !== user.id));
              setSubscriptions(prev => prev.filter(s => s.user_id !== user.id));
              setSelectedUser(null);
              Alert.alert('Deleted', `${user.display_name} has been permanently deleted.`);
            } catch (e) {
              Alert.alert('Error', 'Failed to delete user. Please try again.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const openDiagnosticsSnapshot = async (user: UserRow) => {
    setDiagUser(user);
    setDiagData(null);
    setDiagError(null);
    setDiagLoading(true);
    setSelectedUser(null);

    const { data, error } = await supabase
      .from('user_diagnostics')
      .select('user_id, email, snapshot, captured_at')
      .eq('user_id', user.id)
      .maybeSingle();

    setDiagLoading(false);
    if (error) {
      setDiagError('Failed to load snapshot: ' + error.message);
    } else if (!data) {
      setDiagError('No diagnostic snapshot saved for this user yet.');
    } else {
      setDiagData(data as UserDiagnosticsRow);
    }
  };

  const handleCopyDiag = async () => {
    if (!diagData) return;
    const report = buildDiagnosticsReport(
      diagData.snapshot,
      diagUser?.display_name,
      diagData.email,
    );
    await Clipboard.setStringAsync(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Couple actions ──

  const openCoupleDetail = (couple: CoupleRow) => {
    setSelectedCouple(couple);
    setNotes(couple.admin_notes ?? '');
  };

  const handleSaveNotes = async () => {
    if (!selectedCouple) return;
    setSaving(true);
    await supabase.from('couples').update({ admin_notes: notes }).eq('id', selectedCouple.id);
    setSaving(false);
    setSelectedCouple(prev => prev ? { ...prev, admin_notes: notes } : null);
    setCouples(prev => prev.map(c => c.id === selectedCouple.id ? { ...c, admin_notes: notes } : c));
  };

  const handleToggleActive = (couple: CoupleRow) => {
    const action = couple.active ? 'deactivate' : 'reactivate';
    Alert.alert(
      `${action.charAt(0).toUpperCase() + action.slice(1)} Couple`,
      `Are you sure you want to ${action} this couple? ${couple.active ? 'They will lose access to the app.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action.charAt(0).toUpperCase() + action.slice(1),
          style: couple.active ? 'destructive' : 'default',
          onPress: async () => {
            await supabase.from('couples').update({ active: !couple.active }).eq('id', couple.id);
            setCouples(prev => prev.map(c => c.id === couple.id ? { ...c, active: !c.active } : c));
            setSelectedCouple(prev => prev && prev.id === couple.id ? { ...prev, active: !prev.active } : prev);
          },
        },
      ]
    );
  };

  // ── Derived data ──

  const pairedCouples = couples.filter(c => c.user_b_id !== null);
  const soloCouples = couples.filter(c => c.user_b_id === null);
  const paidSubs = subscriptions.filter(s => s.plan !== 'trial' && s.status === 'active');
  const trialSubs = subscriptions.filter(s => s.plan === 'trial' && s.status === 'active');

  const tabs: { key: TabKey; label: string; count: number; icon: React.ReactNode; color: string }[] = [
    { key: 'users', label: 'Users', count: users.length, icon: <UserCog size={14} color={colors.textMuted} strokeWidth={2} />, color: '#FF2E8A' },
    { key: 'couples', label: 'Couples', count: pairedCouples.length, icon: <Heart size={14} color={colors.textMuted} strokeWidth={2} />, color: '#FF2E8A' },
    { key: 'subscribers', label: 'Subscribers', count: paidSubs.length, icon: <CreditCard size={14} color={colors.textMuted} strokeWidth={2} />, color: '#33D17A' },
    { key: 'trials', label: 'Trials', count: trialSubs.length, icon: <Gift size={14} color={colors.textMuted} strokeWidth={2} />, color: '#FFB347' },
  ];

  const isSelf = selectedUser?.id === myProfile?.id;
  const snap = diagData?.snapshot;

  const q = search.trim().toLowerCase();

  return (
    <AppShell scrollable={false} noTopPadding>
      <ScreenHeader title="Users Dashboard" onBack={() => router.back()} />

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderColor: colors.borderSubtle }]}>
        {tabs.map((tab, i) => (
          <React.Fragment key={tab.key}>
            {i > 0 && <View style={[styles.tabDivider, { backgroundColor: colors.borderSubtle }]} />}
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === tab.key && { backgroundColor: `${tab.color}14` },
              ]}
              onPress={() => { setActiveTab(tab.key); setSearch(''); }}
              activeOpacity={0.7}
            >
              {tab.icon}
              <AppText
                style={[
                  styles.tabLabel,
                  { color: activeTab === tab.key ? tab.color : colors.textMuted },
                  activeTab === tab.key && { fontFamily: 'Inter-SemiBold' },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </AppText>
              <View style={[styles.tabBadge, { backgroundColor: activeTab === tab.key ? `${tab.color}22` : 'rgba(120,120,130,0.10)' }]}>
                <AppText style={[styles.tabBadgeText, { color: activeTab === tab.key ? tab.color : colors.textMuted }]}>
                  {tab.count}
                </AppText>
              </View>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#FF2E8A" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.xl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Search */}
          <AppTextInput
            style={[styles.searchInput, { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
            value={search}
            onChangeText={setSearch}
            placeholder={`Search ${activeTab}…`}
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
          />

          {/* ── Users Tab ── */}
          {activeTab === 'users' && (() => {
            const filtered = q ? users.filter(u => u.display_name.toLowerCase().includes(q)) : users;
            if (filtered.length === 0) return (
              <View style={styles.emptyWrap}>
                <UserCog color={colors.textMuted} size={36} strokeWidth={1.5} />
                <AppText style={[styles.emptyText, { color: colors.textMuted }]}>
                  {q ? 'No users match your search.' : 'No users found.'}
                </AppText>
              </View>
            );
            return filtered.map(u => {
              const ctx = coupleMap[u.id];
              return (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.userRow, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}
                  onPress={() => setSelectedUser(u)}
                  activeOpacity={0.8}
                >
                  <View style={[
                    styles.avatarCircle,
                    { backgroundColor: u.is_super_admin ? 'rgba(255,179,0,0.15)' : u.is_admin ? 'rgba(255,46,138,0.10)' : 'rgba(120,120,130,0.10)' },
                  ]}>
                    {u.is_super_admin ? (
                      <Crown color="#FFB300" size={20} strokeWidth={2} />
                    ) : u.is_admin ? (
                      <ShieldCheck color="#FF2E8A" size={20} strokeWidth={2} />
                    ) : (
                      <UserCog color={colors.textMuted} size={20} strokeWidth={1.5} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <AppText style={[styles.userName, { color: colors.text }]}>{u.display_name}</AppText>
                      {u.id === myProfile?.id && (
                        <View style={[styles.youBadge, { backgroundColor: 'rgba(120,120,130,0.12)' }]}>
                          <AppText style={[styles.youBadgeText, { color: colors.textMuted }]}>YOU</AppText>
                        </View>
                      )}
                    </View>
                    <View style={styles.metaRow}>
                      {u.is_super_admin ? (
                        <View style={[styles.roleBadge, { backgroundColor: 'rgba(255,179,0,0.12)' }]}>
                          <AppText style={[styles.roleText, { color: '#FFB300' }]}>Super Admin</AppText>
                        </View>
                      ) : u.is_admin ? (
                        <View style={[styles.roleBadge, { backgroundColor: 'rgba(255,46,138,0.10)' }]}>
                          <AppText style={[styles.roleText, { color: '#FF2E8A' }]}>Admin</AppText>
                        </View>
                      ) : (
                        <View style={[styles.roleBadge, { backgroundColor: 'rgba(120,120,130,0.08)' }]}>
                          <AppText style={[styles.roleText, { color: colors.textMuted }]}>User</AppText>
                        </View>
                      )}
                      {ctx ? (
                        <AppText style={[styles.dateText, { color: ctx.active ? colors.textMuted : colors.danger }]}>
                          {ctx.partnerName ? `w/ ${ctx.partnerName}` : 'Solo'}
                        </AppText>
                      ) : null}
                    </View>
                  </View>
                  <ChevronRight color={colors.textMuted} size={16} />
                </TouchableOpacity>
              );
            });
          })()}

          {/* ── Couples Tab ── */}
          {activeTab === 'couples' && (() => {
            const filtered = q
              ? pairedCouples.filter(c =>
                  c.user_a_name.toLowerCase().includes(q) ||
                  (c.user_b_name ?? '').toLowerCase().includes(q)
                )
              : pairedCouples;
            if (filtered.length === 0) return (
              <View style={styles.emptyWrap}>
                <Heart color={colors.textMuted} size={36} strokeWidth={1.5} />
                <AppText style={[styles.emptyText, { color: colors.textMuted }]}>
                  {q ? 'No couples match your search.' : 'No paired couples yet.'}
                </AppText>
              </View>
            );
            return filtered.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.coupleRow, { backgroundColor: colors.card, borderColor: c.active ? colors.borderSubtle : 'rgba(255,90,95,0.25)' }]}
                onPress={() => openCoupleDetail(c)}
                activeOpacity={0.8}
              >
                <View style={[styles.avatarPair, { backgroundColor: c.active ? 'rgba(255,46,138,0.10)' : 'rgba(255,90,95,0.10)' }]}>
                  {c.active
                    ? <Heart color="#FF2E8A" size={20} strokeWidth={2} fill="rgba(255,46,138,0.35)" />
                    : <Lock color="#FF5A5F" size={20} strokeWidth={2} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <AppText style={[styles.coupleName, { color: colors.text }]}>
                    {c.user_a_name}{c.user_b_name ? ` & ${c.user_b_name}` : ''}
                  </AppText>
                  <View style={styles.metaRow}>
                    <View style={[styles.statusBadge, { backgroundColor: c.active ? 'rgba(51,209,122,0.12)' : 'rgba(255,90,95,0.12)' }]}>
                      <AppText style={[styles.statusText, { color: c.active ? '#33D17A' : colors.danger }]}>
                        {c.active ? 'Active' : 'Inactive'}
                      </AppText>
                    </View>
                    <AppText style={[styles.dateText, { color: colors.textMuted }]}>
                      {new Date(c.created_at).toLocaleDateString()}
                    </AppText>
                  </View>
                </View>
                <ChevronRight color={colors.textMuted} size={16} />
              </TouchableOpacity>
            ));
          })()}

          {/* ── Subscribers Tab ── */}
          {activeTab === 'subscribers' && (() => {
            const filtered = q
              ? paidSubs.filter(s => s.display_name.toLowerCase().includes(q))
              : paidSubs;
            if (filtered.length === 0) return (
              <View style={styles.emptyWrap}>
                <CreditCard color={colors.textMuted} size={36} strokeWidth={1.5} />
                <AppText style={[styles.emptyText, { color: colors.textMuted }]}>
                  {q ? 'No subscribers match your search.' : 'No paid subscribers yet.'}
                </AppText>
              </View>
            );
            return filtered.map(s => (
              <View
                key={s.user_id}
                style={[styles.subRow, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}
              >
                <View style={[styles.avatarPair, { backgroundColor: 'rgba(51,209,122,0.10)' }]}>
                  <CreditCard color="#33D17A" size={20} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText style={[styles.userName, { color: colors.text }]}>{s.display_name}</AppText>
                  <View style={styles.metaRow}>
                    <View style={[styles.statusBadge, { backgroundColor: 'rgba(51,209,122,0.12)' }]}>
                      <AppText style={[styles.statusText, { color: '#33D17A' }]}>{s.plan}</AppText>
                    </View>
                    <AppText style={[styles.dateText, { color: colors.textMuted }]}>
                      {s.expires_at
                        ? `Expires ${new Date(s.expires_at).toLocaleDateString()}`
                        : 'No expiry'}
                    </AppText>
                  </View>
                </View>
              </View>
            ));
          })()}

          {/* ── Trials Tab ── */}
          {activeTab === 'trials' && (() => {
            const filtered = q
              ? trialSubs.filter(s => s.display_name.toLowerCase().includes(q))
              : trialSubs;
            if (filtered.length === 0) return (
              <View style={styles.emptyWrap}>
                <Gift color={colors.textMuted} size={36} strokeWidth={1.5} />
                <AppText style={[styles.emptyText, { color: colors.textMuted }]}>
                  {q ? 'No trials match your search.' : 'No active trials.'}
                </AppText>
              </View>
            );
            return filtered.map(s => (
              <View
                key={s.user_id}
                style={[styles.subRow, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}
              >
                <View style={[styles.avatarPair, { backgroundColor: 'rgba(255,179,71,0.10)' }]}>
                  <Gift color="#FFB347" size={20} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText style={[styles.userName, { color: colors.text }]}>{s.display_name}</AppText>
                  <View style={styles.metaRow}>
                    <View style={[styles.statusBadge, { backgroundColor: 'rgba(255,179,71,0.12)' }]}>
                      <AppText style={[styles.statusText, { color: '#FFB347' }]}>Trial</AppText>
                    </View>
                    <AppText style={[styles.dateText, { color: colors.textMuted }]}>
                      {s.trial_started_at
                        ? `Started ${new Date(s.trial_started_at).toLocaleDateString()}`
                        : `Since ${new Date(s.started_at).toLocaleDateString()}`}
                    </AppText>
                  </View>
                </View>
              </View>
            ));
          })()}
        </ScrollView>
      )}

      {/* ── User Detail Modal ── */}
      <Modal visible={!!selectedUser} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: isDark ? '#0F0F17' : '#FFF8F3', borderColor: colors.borderSubtle }]}>
            <View style={styles.modalHeader}>
              <AppText style={[styles.modalTitle, { color: colors.text }]}>User Details</AppText>
              <TouchableOpacity onPress={() => setSelectedUser(null)} activeOpacity={0.7}>
                <X color={colors.textMuted} size={22} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {selectedUser && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
                <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <AppText style={[styles.detailLabel, { color: colors.textMuted }]}>DISPLAY NAME</AppText>
                  <AppText style={[styles.detailValue, { color: colors.text }]}>{selectedUser.display_name}</AppText>
                </View>

                <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <AppText style={[styles.detailLabel, { color: colors.textMuted }]}>ROLE</AppText>
                  <AppText style={[styles.detailValue, { color: colors.text }]}>
                    {selectedUser.is_super_admin ? 'Super Admin' : selectedUser.is_admin ? 'Admin' : 'Regular User'}
                  </AppText>
                </View>

                {coupleMap[selectedUser.id] ? (
                  <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                    <AppText style={[styles.detailLabel, { color: colors.textMuted }]}>COUPLE</AppText>
                    <AppText style={[styles.detailValue, { color: colors.text }]}>
                      {coupleMap[selectedUser.id].partnerName
                        ? `Paired with ${coupleMap[selectedUser.id].partnerName}`
                        : 'Solo (no partner yet)'}
                    </AppText>
                    <View style={[styles.statusBadge, {
                      backgroundColor: coupleMap[selectedUser.id].active ? 'rgba(51,209,122,0.12)' : 'rgba(255,90,95,0.12)',
                      alignSelf: 'flex-start',
                      marginTop: 4,
                    }]}>
                      <AppText style={[styles.statusText, { color: coupleMap[selectedUser.id].active ? '#33D17A' : '#FF5A5F' }]}>
                        {coupleMap[selectedUser.id].active ? 'Active' : 'Inactive'}
                      </AppText>
                    </View>
                  </View>
                ) : null}

                <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <AppText style={[styles.detailLabel, { color: colors.textMuted }]}>MEMBER SINCE</AppText>
                  <AppText style={[styles.detailValue, { color: colors.text }]}>
                    {new Date(selectedUser.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </AppText>
                </View>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: 'rgba(96,200,255,0.07)', borderColor: 'rgba(96,200,255,0.28)', marginBottom: Spacing.sm }]}
                  onPress={() => openDiagnosticsSnapshot(selectedUser)}
                  activeOpacity={0.8}
                >
                  <Activity color="#60C8FF" size={18} strokeWidth={2} />
                  <AppText style={[styles.actionBtnText, { color: '#60C8FF' }]}>View Debug Snapshot</AppText>
                </TouchableOpacity>

                {isSuperAdmin && !isSelf && !selectedUser.is_super_admin && (
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: selectedUser.is_admin ? 'rgba(255,90,95,0.08)' : 'rgba(255,46,138,0.08)',
                        borderColor: selectedUser.is_admin ? 'rgba(255,90,95,0.30)' : 'rgba(255,46,138,0.30)',
                      },
                    ]}
                    onPress={() => handleToggleAdmin(selectedUser)}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    {saving ? (
                      <ActivityIndicator color={selectedUser.is_admin ? colors.danger : '#FF2E8A'} size="small" />
                    ) : selectedUser.is_admin ? (
                      <>
                        <ShieldOff color={colors.danger} size={20} strokeWidth={2} />
                        <AppText style={[styles.actionBtnText, { color: colors.danger }]}>Revoke Admin Access</AppText>
                      </>
                    ) : (
                      <>
                        <ShieldCheck color="#FF2E8A" size={20} strokeWidth={2} />
                        <AppText style={[styles.actionBtnText, { color: '#FF2E8A' }]}>Grant Admin Access</AppText>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {isSuperAdmin && !isSelf && !selectedUser.is_super_admin && (
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: 'rgba(255,90,95,0.08)',
                        borderColor: 'rgba(255,90,95,0.30)',
                      },
                    ]}
                    onPress={() => handleDeleteUser(selectedUser)}
                    disabled={deleting}
                    activeOpacity={0.8}
                  >
                    {deleting ? (
                      <ActivityIndicator color={colors.danger} size="small" />
                    ) : (
                      <>
                        <Trash2 color={colors.danger} size={20} strokeWidth={2} />
                        <AppText style={[styles.actionBtnText, { color: colors.danger }]}>Delete User</AppText>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {!isSuperAdmin && (
                  <View style={[styles.noteBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                    <AppText style={[styles.noteText, { color: colors.textMuted }]}>
                      Only the Super Admin can grant or revoke admin privileges.
                    </AppText>
                  </View>
                )}
                {isSuperAdmin && isSelf && (
                  <View style={[styles.noteBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                    <AppText style={[styles.noteText, { color: colors.textMuted }]}>
                      You cannot change your own admin status.
                    </AppText>
                  </View>
                )}
                {isSuperAdmin && selectedUser.is_super_admin && !isSelf && (
                  <View style={[styles.noteBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                    <AppText style={[styles.noteText, { color: colors.textMuted }]}>
                      Super Admin privileges can only be changed directly in the database.
                    </AppText>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Couple Detail Modal ── */}
      <Modal visible={!!selectedCouple} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: isDark ? '#0F0F17' : '#FFF8F3', borderColor: colors.borderSubtle }]}>
            <View style={styles.modalHeader}>
              <AppText style={[styles.modalTitle, { color: colors.text }]}>Couple Details</AppText>
              <TouchableOpacity onPress={() => setSelectedCouple(null)} activeOpacity={0.7}>
                <X color={colors.textMuted} size={22} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {selectedCouple && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
                <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <AppText style={[styles.detailLabel, { color: colors.textMuted }]}>USERS</AppText>
                  <AppText style={[styles.detailValue, { color: colors.text }]}>{selectedCouple.user_a_name}</AppText>
                  {selectedCouple.user_b_name && (
                    <AppText style={[styles.detailValue, { color: colors.text }]}>{selectedCouple.user_b_name}</AppText>
                  )}
                </View>

                <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <AppText style={[styles.detailLabel, { color: colors.textMuted }]}>INVITE CODE</AppText>
                  <AppText style={[styles.codeText, { color: colors.text }]}>{selectedCouple.invite_code}</AppText>
                </View>

                <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <AppText style={[styles.detailLabel, { color: colors.textMuted }]}>PAIRED ON</AppText>
                  <AppText style={[styles.detailValue, { color: colors.text }]}>
                    {new Date(selectedCouple.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </AppText>
                </View>

                <AppText style={[styles.notesLabel, { color: colors.textMuted }]}>ADMIN NOTES</AppText>
                <AppTextInput
                  style={[styles.notesInput, { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Add internal notes about this couple…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.saveNotesBtn, { borderColor: colors.borderSubtle }]}
                  onPress={handleSaveNotes}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.textSecondary} size="small" />
                  ) : (
                    <>
                      <Check color={colors.textSecondary} size={16} strokeWidth={2} />
                      <AppText style={[styles.saveNotesBtnText, { color: colors.textSecondary }]}>Save Notes</AppText>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.dangerBtn,
                    {
                      backgroundColor: selectedCouple.active ? 'rgba(255,90,95,0.08)' : 'rgba(51,209,122,0.08)',
                      borderColor: selectedCouple.active ? 'rgba(255,90,95,0.30)' : 'rgba(51,209,122,0.30)',
                    },
                  ]}
                  onPress={() => handleToggleActive(selectedCouple)}
                  activeOpacity={0.8}
                >
                  {selectedCouple.active ? (
                    <AlertTriangle color={colors.danger} size={18} strokeWidth={2} />
                  ) : (
                    <RefreshCw color="#33D17A" size={18} strokeWidth={2} />
                  )}
                  <AppText style={[styles.dangerBtnText, { color: selectedCouple.active ? colors.danger : '#33D17A' }]}>
                    {selectedCouple.active ? 'Deactivate Couple' : 'Reactivate Couple'}
                  </AppText>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Debug Snapshot Modal ── */}
      <Modal visible={!!diagUser} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: isDark ? '#080810' : '#F4F8FF', borderColor: 'rgba(96,200,255,0.18)' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <AppText style={[styles.modalTitle, { color: '#60C8FF' }]}>Debug Snapshot</AppText>
                {diagUser && (
                  <AppText style={[styles.diagSubtitle, { color: colors.textMuted }]}>{diagUser.display_name}</AppText>
                )}
              </View>
              <TouchableOpacity onPress={() => { setDiagUser(null); setDiagData(null); setDiagError(null); }} activeOpacity={0.7}>
                <X color={colors.textMuted} size={22} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {diagLoading ? (
              <View style={styles.diagCenterWrap}>
                <ActivityIndicator color="#60C8FF" />
                <AppText style={[styles.diagMutedText, { color: colors.textMuted }]}>Loading snapshot…</AppText>
              </View>
            ) : diagError ? (
              <View style={styles.diagCenterWrap}>
                <AppText style={[styles.diagMutedText, { color: colors.textMuted, textAlign: 'center' }]}>{diagError}</AppText>
              </View>
            ) : snap ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {diagData?.captured_at && (
                  <AppText style={[styles.diagTimestamp, { color: colors.textMuted }]}>
                    Captured {new Date(diagData.captured_at).toLocaleString()}
                  </AppText>
                )}

                <DiagSection title="APP" />
                <DiagRow label="Version" value={snap.app_version} />
                <DiagRow label="Build" value={snap.build_number} />
                <DiagRow label="OTA update ID" value={snap.ota_update_id} />
                <DiagRow label="Runtime version" value={snap.runtime_version} />
                <DiagRow label="Channel" value={snap.channel} />
                <DiagRow label="Update source" value={snap.update_source} />

                <DiagSection title="DEVICE" />
                <DiagRow label="Platform" value={snap.platform} />
                <DiagRow label="OS version" value={snap.os_version} />

                <DiagSection title="NETWORK" />
                <DiagRow label="Supabase" value={snap.network_supabase_reachable} />

                <DiagSection title="AUTH" />
                <DiagRow label="Auth status" value={snap.auth_status} />
                <DiagRow label="Last auth error" value={snap.last_auth_error || '(none)'} dim={!!snap.last_auth_error} />
                <DiagRow label="Last signup error" value={snap.last_signup_error || '(none)'} dim={!!snap.last_signup_error} />

                <DiagSection title="PUSH / SUBSCRIPTION" />
                <DiagRow label="Push token" value={snap.push_token_status} />
                <DiagRow label="Subscription" value={snap.subscription_status} />
                <DiagRow label="Sub source" value={snap.subscription_source} />

                <DiagSection title="NAVIGATION" />
                <DiagRow label="Current route" value={snap.current_route} />

                <DiagSection title="RECENT EVENTS" />
                {snap.app_events.length > 0
                  ? snap.app_events.map((e, i) => (
                      <AppText key={i} style={styles.diagEvent} selectable>{e}</AppText>
                    ))
                  : <AppText style={[styles.diagMutedText, { color: colors.textMuted, marginLeft: 4 }]}>(none)</AppText>
                }

                <TouchableOpacity style={styles.copyBtn} onPress={handleCopyDiag} activeOpacity={0.82}>
                  <AppText style={styles.copyBtnText}>{copied ? 'Copied!' : 'Copy Full Report'}</AppText>
                </TouchableOpacity>

                <View style={{ height: 24 }} />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.screen,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: Radius.md,
    minWidth: 0,
  },
  tabDivider: { width: 1, alignSelf: 'center', height: 20, marginHorizontal: 2 },
  tabLabel: { fontSize: 11, fontFamily: 'Inter-Medium' },
  tabBadge: { borderRadius: Radius.pill, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center' },
  tabBadgeText: { fontSize: 9, fontFamily: 'Inter-Bold' },
  list: { paddingHorizontal: Spacing.screen, paddingTop: Spacing.md, gap: Spacing.sm },
  searchInput: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  emptyText: { fontSize: FontSize.body, fontFamily: 'Inter-Regular' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
  },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  userName: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  youBadge: { borderRadius: Radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  youBadgeText: { fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  roleBadge: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  roleText: { fontSize: 10, fontFamily: 'Inter-Bold' },
  dateText: { fontSize: 11, fontFamily: 'Inter-Regular' },
  coupleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
  },
  avatarPair: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  coupleName: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', marginBottom: 4 },
  statusBadge: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 10, fontFamily: 'Inter-Bold' },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    maxHeight: '88%',
    gap: Spacing.md,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  modalTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold' },
  detailBlock: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm, gap: 4 },
  detailLabel: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1 },
  detailValue: { fontSize: FontSize.body, fontFamily: 'Inter-Medium' },
  codeText: { fontSize: 18, fontFamily: 'Inter-Bold', letterSpacing: 4 },
  notesLabel: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1, marginBottom: 6 },
  notesInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.sm,
  },
  saveNotesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    height: 44,
    marginBottom: Spacing.lg,
  },
  saveNotesBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    height: 52,
    marginBottom: Spacing.md,
  },
  dangerBtnText: { fontSize: FontSize.body, fontFamily: 'Inter-Bold' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    height: 52,
    marginTop: Spacing.sm,
  },
  actionBtnText: { fontSize: FontSize.body, fontFamily: 'Inter-Bold' },
  noteBlock: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginTop: Spacing.sm },
  noteText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 20 },
  diagSubtitle: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', marginTop: 2 },
  diagCenterWrap: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  diagMutedText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  diagTimestamp: { fontSize: 11, fontFamily: 'Inter-Regular', marginBottom: Spacing.sm },
  diagEvent: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    lineHeight: 16,
    paddingVertical: 2,
    paddingLeft: 4,
  },
  copyBtn: {
    marginTop: Spacing.lg,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(96,200,255,0.30)',
    backgroundColor: 'rgba(96,200,255,0.07)',
    paddingVertical: 13,
    alignItems: 'center',
  },
  copyBtnText: {
    color: '#60C8FF',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
});

const diagStyles = StyleSheet.create({
  section: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: 9,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: Spacing.md,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 8,
  },
  label: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    width: 110,
    flexShrink: 0,
  },
  value: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    flex: 1,
  },
  valueDim: {
    color: 'rgba(255,200,100,0.85)',
  },
});
