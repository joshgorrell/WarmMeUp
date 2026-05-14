import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, UserCog, X, ShieldCheck, ShieldOff, Crown } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';

interface UserRow {
  id: string;
  display_name: string;
  is_admin: boolean;
  is_super_admin: boolean;
  created_at: string;
}

export default function UsersAdmin() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { profile: myProfile, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, is_admin, is_super_admin, created_at')
      .order('created_at', { ascending: true });
    setUsers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleToggleAdmin = (user: UserRow) => {
    if (!isSuperAdmin) return;
    if (user.id === myProfile?.id) {
      Alert.alert('Not Allowed', 'You cannot change your own admin status.');
      return;
    }
    const action = user.is_admin ? 'revoke' : 'grant';
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
            setSelected(updated);
          }
          setSaving(false);
        },
      },
    ]);
  };

  const isSelf = selected?.id === myProfile?.id;

  return (
    <AppShell scrollable={false}>
      <ScreenHeader title="Manage Users" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#FF2E8A" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {users.length === 0 && (
            <View style={styles.emptyWrap}>
              <UserCog color={colors.textMuted} size={36} strokeWidth={1.5} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No users found.</Text>
            </View>
          )}
          {users.map(u => (
            <TouchableOpacity
              key={u.id}
              style={[styles.userRow, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}
              onPress={() => setSelected(u)}
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
                  <Text style={[styles.userName, { color: colors.text }]}>{u.display_name}</Text>
                  {u.id === myProfile?.id && (
                    <View style={[styles.youBadge, { backgroundColor: 'rgba(120,120,130,0.12)' }]}>
                      <Text style={[styles.youBadgeText, { color: colors.textMuted }]}>YOU</Text>
                    </View>
                  )}
                </View>
                <View style={styles.metaRow}>
                  {u.is_super_admin ? (
                    <View style={[styles.roleBadge, { backgroundColor: 'rgba(255,179,0,0.12)' }]}>
                      <Text style={[styles.roleText, { color: '#FFB300' }]}>Super Admin</Text>
                    </View>
                  ) : u.is_admin ? (
                    <View style={[styles.roleBadge, { backgroundColor: 'rgba(255,46,138,0.10)' }]}>
                      <Text style={[styles.roleText, { color: '#FF2E8A' }]}>Admin</Text>
                    </View>
                  ) : (
                    <View style={[styles.roleBadge, { backgroundColor: 'rgba(120,120,130,0.08)' }]}>
                      <Text style={[styles.roleText, { color: colors.textMuted }]}>User</Text>
                    </View>
                  )}
                  <Text style={[styles.dateText, { color: colors.textMuted }]}>
                    Joined {new Date(u.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              <ChevronRight color={colors.textMuted} size={16} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Detail Modal */}
      <Modal visible={!!selected} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: isDark ? '#0F0F17' : '#FFF8F3', borderColor: colors.borderSubtle }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>User Details</Text>
              <TouchableOpacity onPress={() => setSelected(null)} activeOpacity={0.7}>
                <X color={colors.textMuted} size={22} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Name & role block */}
                <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted }]}>DISPLAY NAME</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{selected.display_name}</Text>
                </View>

                <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted }]}>ROLE</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {selected.is_super_admin ? 'Super Admin' : selected.is_admin ? 'Admin' : 'Regular User'}
                  </Text>
                </View>

                <View style={[styles.detailBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted }]}>MEMBER SINCE</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {new Date(selected.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </Text>
                </View>

                {/* Grant / Revoke — only super-admin, not self, not other super-admins */}
                {isSuperAdmin && !isSelf && !selected.is_super_admin && (
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: selected.is_admin ? 'rgba(255,90,95,0.08)' : 'rgba(255,46,138,0.08)',
                        borderColor: selected.is_admin ? 'rgba(255,90,95,0.30)' : 'rgba(255,46,138,0.30)',
                      },
                    ]}
                    onPress={() => handleToggleAdmin(selected)}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    {saving ? (
                      <ActivityIndicator color={selected.is_admin ? colors.danger : '#FF2E8A'} size="small" />
                    ) : selected.is_admin ? (
                      <>
                        <ShieldOff color={colors.danger} size={20} strokeWidth={2} />
                        <Text style={[styles.actionBtnText, { color: colors.danger }]}>Revoke Admin Access</Text>
                      </>
                    ) : (
                      <>
                        <ShieldCheck color="#FF2E8A" size={20} strokeWidth={2} />
                        <Text style={[styles.actionBtnText, { color: '#FF2E8A' }]}>Grant Admin Access</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {/* Explanatory note for non-super-admin viewers */}
                {!isSuperAdmin && (
                  <View style={[styles.noteBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                    <Text style={[styles.noteText, { color: colors.textMuted }]}>
                      Only the Super Admin can grant or revoke admin privileges.
                    </Text>
                  </View>
                )}

                {isSuperAdmin && isSelf && (
                  <View style={[styles.noteBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                    <Text style={[styles.noteText, { color: colors.textMuted }]}>
                      You cannot change your own admin status.
                    </Text>
                  </View>
                )}

                {isSuperAdmin && selected.is_super_admin && !isSelf && (
                  <View style={[styles.noteBlock, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
                    <Text style={[styles.noteText, { color: colors.textMuted }]}>
                      Super Admin privileges can only be changed directly in the database.
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing.screen, paddingBottom: 60, gap: Spacing.sm },
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
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  userName: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  youBadge: { borderRadius: Radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  youBadgeText: { fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  roleBadge: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  roleText: { fontSize: 10, fontFamily: 'Inter-Bold' },
  dateText: { fontSize: 11, fontFamily: 'Inter-Regular' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    maxHeight: '85%',
    gap: Spacing.md,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  modalTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold' },
  detailBlock: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm, gap: 4 },
  detailLabel: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1 },
  detailValue: { fontSize: FontSize.body, fontFamily: 'Inter-Medium' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    height: 52,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  actionBtnText: { fontSize: FontSize.body, fontFamily: 'Inter-Bold' },
  noteBlock: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginTop: Spacing.sm },
  noteText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 20 },
});
