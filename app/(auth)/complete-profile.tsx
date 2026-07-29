import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Linking,
  ActivityIndicator,
  Image as RNImage,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Check, X } from 'lucide-react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Radius, Spacing, FontSize } from '@/constants/theme';

const SUB_WAIT_MS = 600;

export default function CompleteProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, settings, subscriptionInfo, refreshSubscription, refreshProfile } = useAuth();

  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
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

  const uploadAvatarUri = useCallback(async (uri: string) => {
    if (!user) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      let uploadUri = uri;
      let contentType = 'image/jpeg';
      if (Platform.OS !== 'web') {
        try {
          const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
          const result = await manipulateAsync(uri, [{ resize: { width: 800 } }], { compress: 0.8, format: SaveFormat.JPEG });
          uploadUri = result.uri;
        } catch {}
      }

      const path = `${user.id}/avatar-${Date.now()}.jpg`;

      const blob: Blob = await new Promise((resolve, reject) => {
        if (uploadUri.startsWith('http://') || uploadUri.startsWith('https://')) {
          fetch(uploadUri).then(r => r.blob()).then(resolve).catch(reject);
          return;
        }
        const xhr = new XMLHttpRequest();
        xhr.responseType = 'blob';
        xhr.onload = () => resolve(xhr.response as Blob);
        xhr.onerror = () => reject(new Error('Could not read photo file.'));
        xhr.open('GET', uploadUri);
        xhr.send();
      });

      await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAvatarError('Session expired — please sign in again.'); return; }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const response = await fetch(`${supabaseUrl}/storage/v1/object/avatars/${path}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        body: blob,
      });
      if (!response.ok) {
        let body: any = null;
        try { body = await response.json(); } catch {}
        setAvatarError(body?.message ?? body?.error ?? `Upload failed (HTTP ${response.status}).`);
        return;
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      if (updateError) { setAvatarError(updateError.message ?? 'Could not link photo to profile.'); return; }

      setAvatarUri(publicUrl);
      await refreshProfile();
    } catch (err: any) {
      setAvatarError(err?.message ?? 'Upload failed.');
    } finally {
      setUploadingAvatar(false);
    }
  }, [user, refreshProfile]);

  const uploadAvatarFile = useCallback(async (file: File) => {
    if (!user) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
      if (uploadError) { setAvatarError(uploadError.message ?? 'Upload failed.'); return; }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      if (updateError) { setAvatarError(updateError.message ?? 'Could not link photo to profile.'); return; }
      setAvatarUri(publicUrl);
      await refreshProfile();
    } catch (err: any) {
      setAvatarError(err?.message ?? 'Upload failed.');
    } finally {
      setUploadingAvatar(false);
    }
  }, [user, refreshProfile]);

  const handlePickAvatar = useCallback(async () => {
    if (!user || uploadingAvatar) return;
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Photo Library Access Required',
          'Allow access to your photo library in Settings to upload a profile photo.',
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        void uploadAvatarUri(result.assets[0].uri);
      }
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void uploadAvatarFile(file);
      input.remove();
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }, [user, uploadingAvatar, uploadAvatarUri, uploadAvatarFile]);

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
  const initial = displayName?.[0]?.toUpperCase() ?? '?';

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#060406', '#08060A', '#0C080C']} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
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
          <TouchableOpacity
            onPress={handlePickAvatar}
            activeOpacity={0.8}
            disabled={uploadingAvatar}
            style={styles.avatarWrap}
          >
            <LinearGradient
              colors={['#FFB347', '#FF5A3D', '#FF3D4F', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarRing}
            >
              <View style={styles.avatarInner}>
                {avatarUri ? (
                  <RNImage source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
                ) : (
                  <AppText style={styles.avatarInitial}>{initial}</AppText>
                )}
              </View>
            </LinearGradient>
            <View style={styles.cameraChip}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#FF2E8A" />
              ) : (
                <Camera color="#FF2E8A" size={14} strokeWidth={2.5} />
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar} activeOpacity={0.7}>
            <AppText style={styles.avatarHint}>
              {uploadingAvatar ? 'Uploading...' : avatarUri ? 'Change photo' : 'Add photo'}
            </AppText>
          </TouchableOpacity>
          {avatarError && !uploadingAvatar && (
            <AppText style={styles.avatarError}>{avatarError}</AppText>
          )}
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

const AVATAR_SIZE = 120;

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
  avatarSection: { alignItems: 'center', marginBottom: 32, gap: 10 },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatarRing: {
    width: AVATAR_SIZE + 4,
    height: AVATAR_SIZE + 4,
    borderRadius: (AVATAR_SIZE + 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: 'rgba(255,46,138,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 44,
    fontFamily: 'Inter-Bold',
  },
  cameraChip: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1A1018',
    borderWidth: 2,
    borderColor: '#0C080C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: {
    color: '#FF7A45',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  avatarError: {
    color: '#FF5A5F',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
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
