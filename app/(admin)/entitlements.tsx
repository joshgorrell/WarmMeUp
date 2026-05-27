import React, { useEffect, useState, useCallback } from 'react';
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
import { Search, ShieldCheck, X, Calendar, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react-native';
import AppText from '@/components/AppText';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

interface AdminGrant {
  id: string;
  user_id: string;
  entitlement_type: string;
  expires_at: string | null;
  notes: string | null;
  active: boolean;
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
}

const ENTITLEMENT_TYPES: { value: string; label: string }[] = [
  { value: 'free_access', label: 'Free Access' },
  { value: 'extended_trial', label: 'Extended Trial' },
  { value: 'comped_subscription', label: 'Comped Subscription' },
];

export default function EntitlementsScreen() {
  const router = useRouter();
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
  const [grantLoading, setGrantLoading] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  const [revokeLoading, setRevokeLoading] = useState<string | null>(null);

  useEffect(() => {
    loadActiveGrants();
  }, []);

  const loadActiveGrants = useCallback(async () => {
    console.log('[ADMIN ENTITLEMENT] Loading active grants...');
    setGrantsLoading(true);
    setGrantsError(null);
    try {
      const { data, error } = await supabase
        .from('admin_grants')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[ADMIN ENTITLEMENT ERROR]', error.message);
        setGrantsError(error.message);
        setGrantsLoading(false);
        return;
      }

      // Enrich with profile display names
      const grants = data ?? [];
      const enriched = await Promise.all(
        grants.map(async (g) => {
          const { data: prof } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', g.user_id)
            .maybeSingle();
          return { ...g, profile: prof ?? undefined };
        })
      );
      setActiveGrants(enriched);
    } catch (err: any) {
      console.error('[ADMIN ENTITLEMENT ERROR]', err?.message);
      setGrantsError(err?.message ?? 'Unknown error');
    } finally {
      setGrantsLoading(false);
    }
  }, []);

  const handleSearch = async () => {
    const email = searchEmail.trim().toLowerCase();
    if (!email) return;
    setSearchLoading(true);
    setSearchResult(null);
    setSearchError(null);
    setGrantNotes('');
    setGrantExpiry('');

    try {
      // Search by display_name or pull via admin RPC — profiles don't have email in public schema.
      // We match on auth.users via service role by searching profiles with admin privilege.
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .ilike('display_name', `%${email}%`)
        .limit(5);

      // Also try exact-ish match on ID if it looks like a UUID
      let matchedId: string | null = null;
      let matchedName = '';

      if (profileError) {
        setSearchError(profileError.message);
        setSearchLoading(false);
        return;
      }

      // If single result, use it. Otherwise try to find by checking subscriptions or grants matching email substring
      if (profiles && profiles.length === 1) {
        matchedId = profiles[0].id;
        matchedName = profiles[0].display_name;
      } else if (profiles && profiles.length > 1) {
        // Return multiple results notice
        setSearchError(`Found ${profiles.length} users matching "${email}". Try a more specific name.`);
        setSearchLoading(false);
        return;
      } else {
        setSearchError(`No user found matching "${email}".`);
        setSearchLoading(false);
        return;
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

      setSearchResult({
        id: matchedId!,
        display_name: matchedName,
        currentGrant: grant ?? null,
        subscriptionPlan: sub?.plan ?? null,
        subscriptionStatus: sub?.status ?? null,
      });
    } catch (err: any) {
      setSearchError(err?.message ?? 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleGrant = async () => {
    if (!searchResult) return;
    if (grantLoading) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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

      // Revoke any existing active grant first
      if (searchResult.currentGrant) {
        await supabase
          .from('admin_grants')
          .update({ active: false })
          .eq('id', searchResult.currentGrant.id);
      }

      const { error } = await supabase.from('admin_grants').insert({
        user_id: searchResult.id,
        entitlement_type: grantType,
        expires_at: expiresAt,
        notes: grantNotes.trim() || null,
        active: true,
        granted_by: user.id,
      });

      if (error) {
        console.error('[ADMIN ENTITLEMENT ERROR] grant insert:', error.message);
        Alert.alert('Error', error.message);
        setGrantLoading(false);
        return;
      }

      Alert.alert('Access Granted', `${searchResult.display_name} now has ${ENTITLEMENT_TYPES.find(t => t.value === grantType)?.label ?? grantType} access.`);
      // If the admin granted themselves, refresh subscription state so the
      // account screen immediately reflects canInvite = true on return.
      if (searchResult.id === user?.id) {
        await refreshSubscription();
      }
      setSearchResult(null);
      setSearchEmail('');
      setGrantExpiry('');
      setGrantNotes('');
      await loadActiveGrants();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to grant access.');
    } finally {
      setGrantLoading(false);
    }
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
            const { error } = await supabase
              .from('admin_grants')
              .update({ active: false })
              .eq('id', grant.id);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              await loadActiveGrants();
            }
            setRevokeLoading(null);
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
    <AppShell scrollable={false}>
      <ScreenHeader title="Entitlements" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Search */}
        <AppText style={[styles.sectionLabel, { color: colors.textMuted }]}>FIND USER</AppText>
        <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
          <Search color={colors.textMuted} size={16} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by display name..."
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
                <AppText style={[styles.resultId, { color: colors.textMuted }]}>{searchResult.id.slice(0, 16)}…</AppText>
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
                    {ENTITLEMENT_TYPES.find(t => t.value === grant.entitlement_type)?.label ?? grant.entitlement_type} · expires {formatExpiry(grant.expires_at)}
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
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 48 },
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
});
