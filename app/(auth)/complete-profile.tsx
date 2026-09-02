import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import AvatarUploader from '@/components/AvatarUploader';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Radius, Spacing, FontSize } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';

const SUB_WAIT_MS = 600;

export default function CompleteProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, settings, subscriptionInfo, refreshSubscription, refreshProfile } = useAuth();
  const { contentMaxWidth, contentPadding } = useLayout();

  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingComplete, setPendingComplete] = useState(false);

  const email = user?.email ?? '';

  const nameChanged =
    firstName.trim() !== (profile?.first_name ?? '') ||
    lastName.trim() !== (profile?.last_name ?? '');
  const avatarChanged = avatarUri !== (profile?.avatar_url);

  const finish = useCallback(() => {
    router.replace('/(app)/(tabs)');
  }, [router]);

  const completeOnboarding = useCallback(async () => {
    if (user) {
      await supabase
        .from('user_settings')
        .update({ onboarding_seen: true, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }
    if (!subscriptionInfo.loading) {
      finish();
      return;
    }
    refreshSubscription().catch(() => {});
    setPendingComplete(true);
    setTimeout(() => {
      setPendingComplete(prev => {
        if (prev) finish();
        return false;
      });
    }, SUB_WAIT_MS);
  }, [user, subscriptionInfo.loading, refreshSubscription, finish]);

  useEffect(() => {
    if (!pendingComplete) return;
    if (subscriptionInfo.loading) return;
    setPendingComplete(false);
    finish();
  }, [pendingComplete, subscriptionInfo.loading]);

  const handleContinue = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (user && (nameChanged || avatarChanged)) {
        const fn = firstName.trim();
        const ln = lastName.trim();
        const fullName = [fn, ln].filter(Boolean).join(' ').trim();
        const patch: { first_name?: string; last_name?: string; display_name?: string; avatar_url?: string | null } = {};
        if (nameChanged) {
          patch.first_name = fn;
          patch.last_name = ln;
          patch.display_name = fullName || profile?.display_name || fn;
        }
        if (avatarChanged) {
          patch.avatar_url = avatarUri;
        }
        await supabase.from('profiles').update(patch).eq('id', user.id);
        await refreshProfile();
      }
      await completeOnboarding();
    } finally {
      setSaving(false);
    }
  }, [saving, user, nameChanged, avatarChanged, firstName, lastName, profile, avatarUri, refreshProfile, completeOnboarding]);

  const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ').trim() || profile?.display_name || '';

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#060406', '#08060A', '#0C080C']} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, maxWidth: contentMaxWidth, paddingHorizontal: contentPadding, alignSelf: 'center', width: '100%' }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AppText style={styles.title}>Complete Your Profile</AppText>
          <AppText style={styles.subtitle}>
            Add a photo so your partner recognizes you — it makes the app look so much better.
          </AppText>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <AvatarUploader
            userId={user?.id ?? ''}
            initialUri={profile?.avatar_url ?? null}
            displayName={displayName || undefined}
            size={120}
            onUploadStart={() => setUploadingAvatar(true)}
            onUploaded={(url) => { setAvatarUri(url); setUploadingAvatar(false); }}
            onError={() => setUploadingAvatar(false)}
          />
        </View>

        {/* Name fields */}
        <View style={styles.fieldsSection}>
          <View style={styles.field}>
            <AppText style={styles.label}>First name</AppText>
            <AppTextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor="rgba(255,255,255,0.2)"
              maxLength={20}
              returnKeyType="next"
            />
          </View>
          <View style={styles.field}>
            <AppText style={styles.label}>Last name</AppText>
            <AppTextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor="rgba(255,255,255,0.2)"
              maxLength={30}
              returnKeyType="done"
            />
          </View>
          <View style={styles.field}>
            <AppText style={styles.label}>Email</AppText>
            <View style={styles.emailBox}>
              <AppText style={styles.emailText} numberOfLines={1} ellipsizeMode="tail">{email || '—'}</AppText>
            </View>
          </View>
        </View>

        {/* Continue button */}
        <TouchableOpacity style={styles.continueBtn} onPress={handleContinue} activeOpacity={0.87} disabled={saving || uploadingAvatar}>
          <LinearGradient
            colors={['#FFB347', '#FF5A3D', '#FF2E8A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.continueGrad}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <AppText style={styles.continueLabel}>Continue</AppText>
            )}
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleContinue}
          activeOpacity={0.7}
          disabled={saving || uploadingAvatar}
        >
          <AppText style={styles.skipText}>Skip for now</AppText>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060406' },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  header: { alignItems: 'center', marginBottom: 28 },
  title: {
    color: '#fff',
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  avatarSection: { alignItems: 'center', marginBottom: 32 },
  fieldsSection: { gap: 16, marginBottom: 32 },
  field: { gap: 6 },
  label: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: Radius.lg,
    color: '#fff',
    fontSize: FontSize.md,
    fontFamily: 'Inter-Regular',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  emailBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  emailText: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: FontSize.md,
    fontFamily: 'Inter-Regular',
  },
  continueBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 14,
  },
  continueGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: Radius.pill,
  },
  continueLabel: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.2,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  skipText: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
