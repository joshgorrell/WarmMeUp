import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, ShieldCheck, X, Calendar, ChevronDown, ChevronUp, Plus, Trash2, TriangleAlert as AlertTriangle } from 'lucide-react-native';
import AppText from '@/components/AppText';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { logger } from '@/lib/logger';

interface AdminGrant {
  id: string;
  user_id: string;
  entitlement_type: string;
  expires_at: string | null;
  notes: string | null;
  active: boolean;
  can_invite: boolean;
  granted_by: string | null;
  created_at: string;
  profile?: { display_name: string; email?: string };
}

interface UserSearchResult {
  id: string;
  display_name: string;
  email?: string;
  currentGrant: AdminGrant | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  partnerName: string | null;
  partnerHasPremium: boolean;
}

const ENTITLEMENT_TYPES: { value: string; label: string }[] = [
  { value: 'free_access', label: 'Free Access' },
  { value: 'extended_trial', label: 'Extended Trial' },
  { value: 'comped_subscription', label: 'Comped Subscription' },
];

export default function EntitlementsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, refreshSubscription } = useAuth();

  const [searchEmail, setSearchEmail] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<UserSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [activeGrants, setActiveGrants] = useState<AdminGrant[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(true);
  const [grantsError, setGrantsError] = useState<string | null>(null);

  const [grantType, setGrantType] = useState('free_access');
  const [grantExpiry, setGrantExpiry] = useState('');
  const [grantNotes, setGrantNotes] = useState('');
  const [grantCanInvite, setGrantCanInvite] = useState(true);
  const [grantLoading, setGrantLoading] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const [revokeLoading, setRevokeLoading] = useState<string | null>(null);

  useEffect(() => {
    loadActiveGrants();
  }, []);

  const loadActiveGrants = useCallback(async () => {
    logger.log('[ADMIN ENTITLEMENT] Loading active grants...');
    if (!mountedRef.current) return;
    setGrantsLoading(true);
    if (mountedRef.current) setGrantsError(null);
    try {
      const { data, error } = await supabase
        .from('admin_grants')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[ADMIN ENTITLEMENT ERROR]', error.message);
        if (mountedRef.current) setGrantsError(error.message);
        if (mountedRef.current) setGrantsLoading(false);
        return;
      }

      // Enrich with profile display names — batch query instead of N+1
      const grants = data ?? [];
      let enriched: AdminGrant[] = grants;
      if (grants.length > 0) {
        const userIds = grants.map(g => g.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds);
        const nameMap = new Map((profiles ?? []).map(p => [p.id, p.display_name]));
        enriched = grants.map(g => ({
          ...g,
          profile: nameMap.has(g.user_id) ? { display_name: nameMap.get(g.user_id)! } : undefined,
        }));
      }
      if (mountedRef.current) setActiveGrants(enriched);
    } catch (err: any) {
      console.error('[ADMIN ENTITLEMENT ERROR]', err?.message);
      if (mountedRef.current) setGrantsError(err?.message ?? 'Unknown error');
    } finally {
      if (mountedRef.current) setGrantsLoading(false);
    }
  }, []);

  const handleSearch = async () => {
    const query = searchEmail.trim();
    if (!query) return;
    setSearchLoading(true);
    setSearchResult(null);
    setSearchError(null);
    setGrantNotes('');
    setGrantExpiry('');
    setGrantCanInvite(true);

    try {
      let matchedId: string | null = null;
      let matchedName = '';
      let matchedEmail = '';

      // Try exact email lookup via admin RPC first (searches auth.users)
      const looksLikeEmail = query.includes('@');
      if (looksLikeEmail) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('admin_search_user_by_email', { p_email: query.toLowerCase() });
        if (rpcError) {
          console.error('[ADMIN ENTITLEMENTS ERROR] email RPC:', rpcError.code, rpcError.message);
          setSearchError(`Email lookup failed: ${rpcError.message}`);
          setSearchLoading(false);
          return;
        }
        const found = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (found?.user_id) {
          matchedId = found.user_id;
          matchedName = found.display_name ?? query;
          matchedEmail = found.email ?? query;
        } else {
          setSearchError(`No account found for "${query}".`);
          setSearchLoading(false);
          return;
        }
      }

      // Fall back to display name search when query is not an email
      if (!matchedId) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, display_name')
          .ilike('display_name', `%${query}%`)
          .limit(5);

        if (profileError) {
          setSearchError(profileError.message);
          setSearchLoading(false);
          return;
        }

        if (profiles && profiles.length === 1) {
          matchedId = profiles[0].id;
          matchedName = profiles[0].display_name;
        } else if (profiles && profiles.length > 1) {
          setSearchError(`Found ${profiles.length} users matching "${query}". Try a more specific name or use their email.`);
          setSearchLoading(false);
          return;
        } else {
          setSearchError(`No user found matching "${query}". Try their email address for an exact lookup.`);
          setSearchLoading(false);
          return;
        }
      }

      // Get current grant
      const { data: grant } = await supabase
        .from('admin_grants')
        .select('*')
        .eq('user_id', matchedId)
        .eq('active', true)
        .maybeSingle();

      // Get current subscription
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan, status, expires_at')
        .eq('user_id', matchedId)
        .maybeSingle();

      // Check if user is in an active couple with a partner who has premium
      let partnerName: string | null = null;
      let partnerHasPremium = false;
      const { data: couple } = await supabase
        .from('couples')
        .select('user_a_id, user_b_id')
        .or(`user_a_id.eq.${matchedId},user_b_id.eq.${matchedId}`)
        .eq('active', true)
        .maybeSingle();

      if (couple && couple.user_b_id) {
        const partnerId = couple.user_a_id === matchedId ? couple.user_b_id : couple.user_a_id;
        const { data: partnerProfile } = await supabase
          .from('profiles')
          .select('display_name, is_admin, is_super_admin')
          .eq('id', partnerId)
          .maybeSingle();

        if (partnerProfile) {
          partnerName = partnerProfile.display_name;
          // Check partner's subscription
          const { data: partnerSub } = await supabase
            .from('subscriptions')
            .select('plan, status, expires_at')
            .eq('user_id', partnerId)
            .maybeSingle();
          const partnerSubActive = partnerSub?.status === 'active'
            && (!partnerSub?.expires_at || new Date(partnerSub.expires_at) > new Date())
            && (partnerSub?.plan === 'monthly' || partnerSub?.plan === 'yearly');
          // Check partner's active admin grant
          const { data: partnerGrant } = await supabase
            .from('admin_grants')
            .select('id, expires_at')
            .eq('user_id', partnerId)
            .eq('active', true)
            .maybeSingle();
          const partnerGrantActive = !!partnerGrant
            && (!partnerGrant.expires_at || new Date(partnerGrant.expires_at) > new Date());
          const partnerIsAdmin = partnerProfile.is_admin || partnerProfile.is_super_admin;
          partnerHasPremium = partnerSubActive || partnerGrantActive || partnerIsAdmin;
        }
      }

      setSearchResult({
        id: matchedId!,
        display_name: matchedName,
        email: matchedEmail || undefined,
        currentGrant: grant ?? null,
        subscriptionPlan: sub?.plan ?? null,
        subscriptionStatus: sub?.status ?? null,
        partnerName,
        partnerHasPremium,
      });
    } catch (err: any) {
      if (mountedRef.current) setSearchError(err?.message ?? 'Search failed');
    } finally {
      if (mountedRef.current) setSearchLoading(false);
    }
  };

  const handleGrant = async () => {
    if (!searchResult) return;
    if (grantLoading) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const doGrant = async () => {
      setGrantLoading(true);
      try {
        let expiresAt: string | null = null;
        if (grantExpiry.trim()) {
          const d = new Date(grantExpiry.trim());
          if (isNaN(d.getTime())) {
            Alert.alert('Invalid Date', 'Please enter a valid date in YYYY-MM-DD format.');
            setGrantLoading(false);
            return;
          }
          expiresAt = d.toISOString();
        }

        const { data: rpcResult, error: rpcError } = await supabase.rpc('grant_entitlement', {
          p_user_id: searchResult.id,
          p_entitlement_type: grantType,
          p_expires_at: expiresAt,
          p_notes: grantNotes.trim() || null,
          p_can_invite: grantCanInvite,
        });

        if (rpcError) {
          console.error('[ADMIN ENTITLEMENT ERROR] grant RPC:', rpcError.message);
          Alert.alert('Error', rpcError.message);
          setGrantLoading(false);
          return;
        }

        const result = (Array.isArray(rpcResult) ? rpcResult[0] : rpcResult) as
          { success: boolean; warning: string | null; already_covered_by_partner: boolean } | null;

        const typeLabel = ENTITLEMENT_TYPES.find(t => t.value === grantType)?.label ?? grantType;
        if (result?.already_covered_by_partner) {
          Alert.alert(
            'Access Granted (Redundant)',
            `${searchResult.display_name} now has ${typeLabel} access, but they were already covered by their partner's premium. This grant is not strictly needed.`
          );
        } else {
          Alert.alert('Access Granted', `${searchResult.display_name} now has ${typeLabel} access.`);
        }
        // If the admin granted themselves, refresh subscription state so the
        // account screen immediately reflects canInvite = true on return.
        if (searchResult.id === user?.id) {
          await refreshSubscription();
        }
        if (mountedRef.current) setSearchResult(null);
        if (mountedRef.current) setSearchEmail('');
        if (mountedRef.current) setGrantExpiry('');
        if (mountedRef.current) setGrantNotes('');
        if (mountedRef.current) setGrantCanInvite(true);
        await loadActiveGrants();
      } catch (err: any) {
        if (mountedRef.current) Alert.alert('Error', err?.message ?? 'Failed to grant access.');
      } finally {
        if (mountedRef.current) setGrantLoading(false);
      }
    };

    // If the user is already covered by their partner, confirm before granting.
    if (searchResult.partnerHasPremium) {
      Alert.alert(
        'Already Covered by Partner',
        `${searchResult.display_name} is connected to ${searchResult.partnerName ?? 'their partner'}, who already has premium access. This user already gets full access through their partner.\n\nDo you want to grant individual access anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Grant Anyway', style: 'destructive', onPress: doGrant },
        ]
      );
      return;
    }

    doGrant();
  };

  const handleRevoke = async (grant: AdminGrant) => {
    Alert.alert(
      'Revoke Access',
      `Remove ${ENTITLEMENT_TYPES.find(t => t.value === grant.entitlement_type)?.label ?? grant.entitlement_type} access for ${grant.profile?.display_name ?? grant.user_id}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setRevokeLoading(grant.id);
            try {
              const { error } = await supabase
                .from('admin_grants')
                .update({ active: false })
                .eq('id', grant.id);
              if (error) throw error;
              if (mountedRef.current) await loadActiveGrants();
            } catch {
              if (mountedRef.current) {
                Alert.alert('Error', 'Failed to revoke access. Please try again.');
              }
            } finally {
              if (mountedRef.current) setRevokeLoading(null);
            }
          },
        },
      ]
    );
  };

  const formatExpiry = (iso: string | null) => {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleDateString();
  };

  const isExpired = (iso: string | null) => {
    if (!iso) return false;
    return new Date(iso) < new Date();
  };

  return (
    <AppShell scrollable={false} noTopPadding>
      <ScreenHeader title="Entitlements" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xl }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Search */}
        <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>FIND USER</AppText>
        <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
          <Search color={colors.textMuted} size={16} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by email or display name..."
            placeholderTextColor={colors.textMuted}
            value={searchEmail}
            onChangeText={setSearchEmail}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchLoading ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <TouchableOpacity onPress={handleSearch} activeOpacity={0.7}>
              <AppText style={[styles.searchBtn, { color: '#69A7FF' }]}>Search</AppText>
            </TouchableOpacity>
          )}
        </View>

        {searchError ? (
          <AppText style={[styles.errorText, { color: colors.danger }]}>{searchError}</AppText>
        ) : null}

        {/* Search result */}
        {searchResult ? (
          <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <View style={styles.resultHeader}>
              <View style={[styles.avatarCircle, { backgroundColor: 'rgba(105,167,255,0.12)' }]}>
                <ShieldCheck color="#69A7FF" size={20} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={[styles.resultName, { color: colors.text }]}>{searchResult.display_name}</AppText>
                {searchResult.email ? (
                  <AppText style={[styles.resultId, { color: colors.textMuted }]}>{searchResult.email}</AppText>
                ) : (
                  <AppText style={[styles.resultId, { color: colors.textMuted }]}>{searchResult.id.slice(0, 16)}…</AppText>
                )}
              </View>
              <TouchableOpacity onPress={() => { setSearchResult(null); setSearchEmail(''); }} activeOpacity={0.7}>
                <X color={colors.textMuted} size={18} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            {/* Current state */}
            <View style={styles.stateRow}>
              <AppText style={[styles.stateLabel, { color: colors.textMuted }]}>Subscription:</AppText>
              <AppText style={[styles.stateValue, { color: colors.text }]}>
                {searchResult.subscriptionPlan ? `${searchResult.subscriptionPlan} (${searchResult.subscriptionStatus})` : 'None'}
              </AppText>
            </View>
            <View style={styles.stateRow}>
              <AppText style={[styles.stateLabel, { color: colors.textMuted }]}>Active Grant:</AppText>
              <AppText style={[styles.stateValue, { color: searchResult.currentGrant ? '#33D17A' : colors.textMuted }]}>
                {searchResult.currentGrant
                  ? `${searchResult.currentGrant.entitlement_type} (expires ${formatExpiry(searchResult.currentGrant.expires_at)})`
                  : 'None'}
              </AppText>
            </View>
            <View style={styles.stateRow}>
              <AppText style={[styles.stateLabel, { color: colors.textMuted }]}>Partner:</AppText>
              <AppText style={[styles.stateValue, { color: colors.text }]}>
                {searchResult.partnerName ?? 'Not connected'}
              </AppText>
            </View>

            {/* Already-covered-by-partner warning */}
            {searchResult.partnerHasPremium ? (
              <View style={[styles.coveredWarning, { backgroundColor: 'rgba(255,179,71,0.10)', borderColor: 'rgba(255,179,71,0.30)' }]}>
                <AlertTriangle color="#FFB347" size={16} strokeWidth={2} />
                <AppText style={[styles.coveredWarningText, { color: colors.textSecondary }]}>
                  Already covered by partner{searchResult.partnerName ? ` (${searchResult.partnerName})` : ''}. A grant is redundant — this user already has full access through their partner.
                </AppText>
              </View>
            ) : null}

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            {/* Grant form */}
            <AppText style={[styles.formLabel, { color: colors.textMuted }]}>GRANT ACCESS</AppText>

            {/* Entitlement type picker */}
            <TouchableOpacity
              style={[styles.pickerRow, { borderColor: colors.borderSubtle, backgroundColor: colors.bg1 }]}
              onPress={() => setShowTypeMenu(v => !v)}
              activeOpacity={0.8}
            >
              <AppText style={[styles.pickerValue, { color: colors.text }]}>
                {ENTITLEMENT_TYPES.find(t => t.value === grantType)?.label ?? grantType}
              </AppText>
              {showTypeMenu ? <ChevronUp color={colors.textMuted} size={16} /> : <ChevronDown color={colors.textMuted} size={16} />}
            </TouchableOpacity>
            {showTypeMenu && (
              <View style={[styles.typeMenu, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                {ENTITLEMENT_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={styles.typeOption}
                    onPress={() => { setGrantType(t.value); setShowTypeMenu(false); }}
                    activeOpacity={0.8}
                  >
                    <AppText style={[styles.typeOptionText, { color: grantType === t.value ? '#69A7FF' : colors.text }]}>{t.label}</AppText>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TextInput
              style={[styles.fieldInput, { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: colors.bg1 }]}
              placeholder="Expiry date (YYYY-MM-DD) — leave blank for permanent"
              placeholderTextColor={colors.textMuted}
              value={grantExpiry}
              onChangeText={setGrantExpiry}
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.fieldInput, { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: colors.bg1 }]}
              placeholder="Notes (optional)"
              placeholderTextColor={colors.textMuted}
              value={grantNotes}
              onChangeText={setGrantNotes}
            />

            <TouchableOpacity
              style={[styles.canInviteRow, { borderColor: colors.borderSubtle, backgroundColor: colors.bg1 }]}
              onPress={() => setGrantCanInvite(v => !v)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <AppText style={[styles.canInviteLabel, { color: colors.text }]}>Can invite a partner</AppText>
                <AppText style={[styles.canInviteHint, { color: colors.textMuted }]}>Allow this user to generate an invite code</AppText>
              </View>
              <View style={[styles.toggleTrack, { backgroundColor: grantCanInvite ? '#33D17A' : colors.borderSubtle }]}>
                <View style={[styles.toggleThumb, { transform: [{ translateX: grantCanInvite ? 18 : 2 }] }]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.grantBtn, { backgroundColor: grantLoading ? 'rgba(51,209,122,0.4)' : '#33D17A' }]}
              onPress={handleGrant}
              disabled={grantLoading}
              activeOpacity={0.85}
            >
              {grantLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Plus color="#fff" size={16} strokeWidth={2.5} />
                  <AppText style={styles.grantBtnText}>
                    {searchResult.currentGrant ? 'Update Grant' : 'Grant Access'}
                  </AppText>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Active grants list */}
        <AppText style={[styles.sectionLabel, { color: colors.textMuted, marginTop: Spacing.lg }]}>
          ACTIVE GRANTS ({activeGrants.length})
        </AppText>

        {grantsLoading ? (
          <ActivityIndicator color={colors.textMuted} style={{ marginTop: 16 }} />
        ) : grantsError ? (
          <AppText style={[styles.errorText, { color: colors.danger }]}>{grantsError}</AppText>
        ) : activeGrants.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <AppText style={[styles.emptyText, { color: colors.textMuted }]}>No active grants yet.</AppText>
          </View>
        ) : (
          activeGrants.map(grant => (
            <View
              key={grant.id}
              style={[
                styles.grantCard,
                { backgroundColor: colors.card, borderColor: isExpired(grant.expires_at) ? 'rgba(255,90,90,0.30)' : colors.borderSubtle },
              ]}
            >
              <View style={styles.grantCardRow}>
                <View style={[styles.grantIconWrap, { backgroundColor: 'rgba(51,209,122,0.10)' }]}>
                  <ShieldCheck color="#33D17A" size={18} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText style={[styles.grantName, { color: colors.text }]}>
                    {grant.profile?.display_name ?? grant.user_id.slice(0, 16) + '…'}
                  </AppText>
                  <AppText style={[styles.grantMeta, { color: colors.textMuted }]}>
                    {ENTITLEMENT_TYPES.find(t => t.value === grant.entitlement_type)?.label ?? grant.entitlement_type} · expires {formatExpiry(grant.expires_at)} · {grant.can_invite ? 'can invite' : 'no invite'}
                  </AppText>
                  {grant.notes ? (
                    <AppText style={[styles.grantNotes, { color: colors.textSecondary }]}>{grant.notes}</AppText>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => handleRevoke(grant)}
                  disabled={revokeLoading === grant.id}
                  style={styles.revokeBtn}
                  activeOpacity={0.7}
                >
                  {revokeLoading === grant.id ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Trash2 color={colors.danger} size={16} strokeWidth={2} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.screen },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2, marginBottom: Spacing.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    marginBottom: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: FontSize.body, fontFamily: 'Inter-Regular', outlineStyle: 'none' } as any,
  searchBtn: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  errorText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', marginBottom: Spacing.sm },
  resultCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  resultName: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold' },
  resultId: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  divider: { height: 1, marginVertical: 4 },
  stateRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  stateLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', width: 110 },
  stateValue: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', flex: 1 },
  formLabel: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: 8,
  },
  pickerValue: { fontSize: FontSize.body, fontFamily: 'Inter-Medium' },
  typeMenu: {
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
  },
  typeOption: { paddingHorizontal: Spacing.md, paddingVertical: 10 },
  typeOptionText: { fontSize: FontSize.body, fontFamily: 'Inter-Regular' },
  fieldInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    marginBottom: 8,
    outlineStyle: 'none',
  } as any,
  grantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.pill,
    paddingVertical: 12,
    marginTop: 4,
  },
  grantBtnText: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold', color: '#fff' },
  emptyCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
    alignItems: 'center',
  },
  emptyText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  grantCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
    marginBottom: Spacing.sm,
  },
  grantCardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  grantIconWrap: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  grantName: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold' },
  grantMeta: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', marginTop: 2 },
  grantNotes: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2, fontStyle: 'italic' },
  revokeBtn: { padding: 4, marginTop: 2 },
  coveredWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginTop: 8,
  },
  coveredWarningText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  canInviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: 8,
  },
  canInviteLabel: { fontSize: FontSize.body, fontFamily: 'Inter-Medium' },
  canInviteHint: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 1 },
  toggleTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    flexShrink: 0,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});
