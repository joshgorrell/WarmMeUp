import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
  ActivityIndicator,
  Image as RNImage,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { supabase } from '@/lib/supabase';
import { Radius, Spacing, FontSize } from '@/constants/theme';

const AVATAR_SIZE = 120;

export interface AvatarUploaderProps {
  userId: string;
  initialUri?: string | null;
  displayName?: string;
  size?: number;
  onUploaded?: (publicUrl: string) => void;
  onError?: (message: string) => void;
  onUploadStart?: () => void;
  /** When true, the outer ring + camera chip are hidden (bare circle) */
  bare?: boolean;
}

export default function AvatarUploader({
  userId,
  initialUri,
  displayName,
  size = AVATAR_SIZE,
  onUploaded,
  onError,
  onUploadStart,
  bare = false,
}: AvatarUploaderProps) {
  const [avatarUri, setAvatarUri] = useState<string | null>(initialUri ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = displayName?.[0]?.toUpperCase() ?? '?';

  const uploadAvatarUri = useCallback(async (uri: string) => {
    setUploading(true);
    setError(null);
    onUploadStart?.();
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

      const path = `${userId}/avatar-${Date.now()}.jpg`;

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
      if (!session) {
        const msg = 'Session expired — please sign in again.';
        setError(msg);
        onError?.(msg);
        return;
      }

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
        const msg = body?.message ?? body?.error ?? `Upload failed (HTTP ${response.status}).`;
        setError(msg);
        onError?.(msg);
        return;
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
      if (updateError) {
        const msg = updateError.message ?? 'Could not link photo to profile.';
        setError(msg);
        onError?.(msg);
        return;
      }

      setAvatarUri(publicUrl);
      onUploaded?.(publicUrl);
    } catch (err: any) {
      const msg = err?.message ?? 'Upload failed.';
      setError(msg);
      onError?.(msg);
    } finally {
      setUploading(false);
    }
  }, [userId, onUploaded, onError, onUploadStart]);

  const uploadAvatarFile = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    onUploadStart?.();
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
      if (uploadError) {
        const msg = uploadError.message ?? 'Upload failed.';
        setError(msg);
        onError?.(msg);
        return;
      }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
      if (updateError) {
        const msg = updateError.message ?? 'Could not link photo to profile.';
        setError(msg);
        onError?.(msg);
        return;
      }
      setAvatarUri(publicUrl);
      onUploaded?.(publicUrl);
    } catch (err: any) {
      const msg = err?.message ?? 'Upload failed.';
      setError(msg);
      onError?.(msg);
    } finally {
      setUploading(false);
    }
  }, [userId, onUploaded, onError, onUploadStart]);

  const handlePick = useCallback(async () => {
    if (uploading) return;
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
  }, [uploading, uploadAvatarUri, uploadAvatarFile]);

  const ringSize = size + 4;

  return (
    <View style={styles.section}>
      <TouchableOpacity
        onPress={handlePick}
        activeOpacity={0.8}
        disabled={uploading}
        style={styles.avatarWrap}
      >
        {bare ? (
          <View style={[styles.bareCircle, { width: size, height: size, borderRadius: size / 2 }]}>
            {avatarUri ? (
              <RNImage source={{ uri: avatarUri }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
            ) : (
              <AppText style={[styles.initial, { fontSize: size * 0.36 }]}>{initial}</AppText>
            )}
          </View>
        ) : (
          <LinearGradient
            colors={['#FFB347', '#FF5A3D', '#FF3D4F', '#FF2E8A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.avatarRing, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}
          >
            <View style={[styles.avatarInner, { width: size, height: size, borderRadius: size / 2 }]}>
              {avatarUri ? (
                <RNImage source={{ uri: avatarUri }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
              ) : (
                <AppText style={[styles.initial, { fontSize: size * 0.36 }]}>{initial}</AppText>
              )}
            </View>
          </LinearGradient>
        )}
        <View style={styles.cameraChip}>
          {uploading ? (
            <ActivityIndicator size="small" color="#FF2E8A" />
          ) : (
            <Camera color="#FF2E8A" size={14} strokeWidth={2.5} />
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={handlePick} disabled={uploading} activeOpacity={0.7}>
        <AppText style={styles.hint}>
          {uploading ? 'Uploading...' : avatarUri ? 'Change photo' : 'Add photo'}
        </AppText>
      </TouchableOpacity>
      {error && !uploading && (
        <AppText style={styles.errorText}>{error}</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { alignItems: 'center', gap: 10 },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    backgroundColor: 'rgba(255,46,138,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bareCircle: {
    backgroundColor: 'rgba(255,46,138,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    color: '#fff',
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
  hint: {
    color: '#FF7A45',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  errorText: {
    color: '#FF5A5F',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
