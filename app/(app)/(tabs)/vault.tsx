import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, RefreshControl, AppState, AppStateStatus, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Shield, EyeOff, Settings, Camera, Image as ImageIcon } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { VaultItem } from '@/lib/types';
import { awardPoints } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '@/hooks/useLayout';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import SecondaryButton from '@/components/SecondaryButton';
import BottomSheet from '@/components/BottomSheet';
import TabHeader from '@/components/TabHeader';
import AppShell from '@/components/AppShell';
import { FontSize, Spacing, Radius, NavHeight } from '@/constants/theme';


export default function VaultScreen() {
  const router = useRouter();
  const { user, couple, settings, isAuthenticatingRef } = useAuth();
  const { colors } = useTheme();
  const { width, cols } = useLayout();
  const insets = useSafeAreaInsets();
  const { available: bioAvailable, authenticate: bioAuthenticate } = useBiometricAuth();
  const NUM_COLS = cols(3, 4);
  const ITEM_SIZE = (width - Spacing.screen * 2 - Spacing.sm * (NUM_COLS - 1)) / NUM_COLS;
  const [items, setItems] = useState<VaultItem[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Cache of item.id -> short-lived signed URL (1 hour)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  // Vault biometric gate
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultAuthError, setVaultAuthError] = useState('');
  // Use a ref instead of state so changes don't cause useCallback/useEffect identity churn,
  // which was causing the AppState listener to re-register mid-auth and fire stale closures.
  const unlockingRef = useRef(false);

  const vaultFaceIdRequired = (settings?.vault_face_id_required ?? false) && Platform.OS !== 'web';

  const blurEnabled = settings?.blur_media ?? true;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const cameraActiveRef = useRef(false);

  // Unlock the vault via biometrics
  const unlockVault = useCallback(async () => {
    if (unlockingRef.current) return;
    setVaultAuthError('');
    if (bioAvailable) {
      unlockingRef.current = true;
      isAuthenticatingRef.current = true;
      try {
        const result = await bioAuthenticate('Unlock Vault');
        if (result.success) {
          setVaultUnlocked(true);
        } else {
          setVaultAuthError('Authentication failed. Try again.');
        }
      } finally {
        unlockingRef.current = false;
        isAuthenticatingRef.current = false;
      }
    } else {
      setVaultUnlocked(true);
    }
  }, [bioAvailable, bioAuthenticate, isAuthenticatingRef]);

  // On mount, check if vault requires biometric gate
  useEffect(() => {
    if (vaultFaceIdRequired && !vaultUnlocked) {
      unlockVault();
    }
  }, [vaultFaceIdRequired]);

  // Re-lock vault and re-blur when returning from background
  useEffect(() => {
    if (!blurEnabled && !vaultFaceIdRequired) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        if (blurEnabled) setRevealed(new Set());
        if (vaultFaceIdRequired && !cameraActiveRef.current) {
          setVaultUnlocked(false);
          unlockVault();
        }
      }
    });
    return () => sub.remove();
  }, [blurEnabled, vaultFaceIdRequired, unlockVault]);

  useEffect(() => {
    if (!couple?.id) return;
    load();
    const ch = supabase.channel(`vault_${couple.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vault_items', filter: `couple_id=eq.${couple.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id]);

  const load = async () => {
    if (!couple?.id) return;
    const { data } = await supabase.from('vault_items').select('*').eq('couple_id', couple.id).order('created_at', { ascending: false });
    if (data) {
      setItems(data);
      // Pre-fetch signed URLs for all items so thumbnails render immediately
      data.forEach(item => {
        const bucket = item.storage_bucket ?? 'vault';
        const path = item.storage_path ?? item.file_path;
        if (!path) return;
        supabase.storage.from(bucket).createSignedUrl(path, 60 * 60).then(({ data: urlData }) => {
          if (urlData?.signedUrl) {
            setSignedUrls(prev => ({ ...prev, [item.id]: urlData.signedUrl }));
          }
        });
      });
    }
  };

  const resolveSignedUrl = async (item: VaultItem): Promise<string | null> => {
    if (signedUrls[item.id]) return signedUrls[item.id];
    const bucket = item.storage_bucket ?? 'vault';
    const path = item.storage_path ?? item.file_path;
    if (!path) return null;
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60); // 1 hour
    if (data?.signedUrl) {
      setSignedUrls(prev => ({ ...prev, [item.id]: data.signedUrl }));
      return data.signedUrl;
    }
    return null;
  };

  const handleReveal = async (item: VaultItem) => {
    if (!revealed.has(item.id)) {
      setRevealed(prev => new Set([...prev, item.id]));
      // Generate signed URL now so it's ready when the image renders
      await resolveSignedUrl(item);
      if (item.uploaded_by_user_id !== user?.id && !item.viewed_by_partner && couple?.id) {
        await supabase.rpc('mark_vault_item_viewed', { item_id: item.id });
        await awardPoints(couple.id, user!.id, 2, 'Vault media viewed');
      }
    } else {
      const signedUrl = await resolveSignedUrl(item);
      if (!signedUrl) return;
      router.push({
        pathname: '/(app)/vault-viewer',
        params: {
          id: item.id,
          storagePath: item.storage_path ?? item.file_path,
          storageBucket: item.storage_bucket ?? 'vault',
          mediaType: item.media_type,
          allowScreenshot: item.allow_screenshot ? '1' : '0',
          allowSave: item.allow_save ? '1' : '0',
          allowShare: item.allow_share ? '1' : '0',
        },
      });
    }
  };

  const handleDeleteItem = (item: VaultItem) => {
    Alert.alert(
      'Delete from Vault',
      'This will permanently remove this item for both you and your partner.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setItems(prev => prev.filter(i => i.id !== item.id));
            setSignedUrls(prev => { const n = { ...prev }; delete n[item.id]; return n; });
            setRevealed(prev => { const n = new Set(prev); n.delete(item.id); return n; });
            const bucket = item.storage_bucket ?? 'vault';
            const path = item.storage_path ?? item.file_path;
            if (path) await supabase.storage.from(bucket).remove([path]);
            await supabase.from('vault_items').delete().eq('id', item.id);
          },
        },
      ]
    );
  };


  const uploadToVault = async (localUri: string, mediaType: 'photo' | 'video', mimeType: string) => {
    if (!couple?.id || !user) return;
    setUploading(true);
    setShowAdd(false);
    try {
      const response = await fetch(localUri);
      const blob = await response.blob();
      const ext = mediaType === 'video' ? 'mp4' : 'jpg';
      const storagePath = `${couple.id}/${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('vault')
        .upload(storagePath, blob, { contentType: mimeType, upsert: false });
      if (error) throw error;

      await supabase.from('vault_items').insert({
        couple_id: couple.id,
        uploaded_by_user_id: user.id,
        media_type: mediaType,
        file_path: storagePath,       // store path only, not a signed URL
        storage_path: storagePath,
        storage_bucket: 'vault',
        blurred_thumbnail_path: null,
        allow_screenshot: settings?.vault_allow_screenshot_default ?? false,
        allow_save: settings?.vault_allow_save_default ?? false,
        allow_share: settings?.vault_allow_share_default ?? false,
      });
      // Fire-and-forget: don't hold DB connections open during the grid reload
      awardPoints(couple.id, user.id, 5, 'Vault media added');
      notifyPartner({ event_type: 'new_vault_item', couple_id: couple.id, target_route: '/(app)/(tabs)/vault' });
      await load();
    } finally {
      setUploading(false);
    }
  };

  const handlePickFromLibrary = async () => {
    setShowAdd(false);
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library in Settings.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'] as any,
        quality: 0.85,
        videoMaxDuration: 60,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      await uploadToVault(asset.uri, isVideo ? 'video' : 'photo', isVideo ? 'video/mp4' : 'image/jpeg');
    } catch (e: any) {
      setUploading(false);
      Alert.alert('Upload Failed', e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  const handleTakePhoto = async () => {
    setShowAdd(false);
    // Wait for the bottom sheet slide-out animation to finish before presenting camera
    await new Promise(r => setTimeout(r, 350));
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Please allow camera access in Settings.');
        return;
      }
      // Prevent the AppState listener from re-locking vault while camera is open
      cameraActiveRef.current = true;
      let result;
      try {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images', 'videos'] as any,
          quality: 0.85,
          videoMaxDuration: 60,
          allowsEditing: false,
        });
      } finally {
        cameraActiveRef.current = false;
      }
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      await uploadToVault(asset.uri, isVideo ? 'video' : 'photo', isVideo ? 'video/mp4' : 'image/jpeg');
    } catch (e: any) {
      setUploading(false);
      Alert.alert('Upload Failed', e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const unviewed = items.filter(i => i.uploaded_by_user_id !== user?.id && !i.viewed_by_partner).length;

  // Vault biometric gate overlay
  if (vaultFaceIdRequired && !vaultUnlocked) {
    return (
      <AppShell scrollable={false}>
        <View style={styles.vaultGate}>
          <LinearGradient colors={['#07070A', '#0D0D12']} style={StyleSheet.absoluteFill} />
          <Shield color="#FF2E8A" size={48} strokeWidth={1.5} />
          <Text style={styles.vaultGateTitle}>Vault is Locked</Text>
          <Text style={styles.vaultGateSub}>Biometric verification required to view Vault content.</Text>
          {vaultAuthError ? <Text style={styles.vaultGateError}>{vaultAuthError}</Text> : null}
          <TouchableOpacity style={[styles.vaultGateBtn, unlockingRef.current && { opacity: 0.6 }]} onPress={unlockVault} activeOpacity={0.8} disabled={unlockingRef.current}>
            {unlockingRef.current
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.vaultGateBtnText}>Unlock Vault</Text>
            }
          </TouchableOpacity>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell scrollable={false}>
      <TabHeader title={unviewed > 0 ? `Vault  ·  ${unviewed} new` : 'Vault'} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF2E8A" />}
      >
        {/* Privacy notice */}
        <View style={[styles.privNotice, { backgroundColor: 'rgba(255,46,138,0.07)', borderColor: 'rgba(255,46,138,0.18)' }]}>
          <Shield color="#FF2E8A" size={14} strokeWidth={2} />
          <Text style={[styles.privText, { color: colors.textSecondary }]}>
            Protected media. Privacy defaults are set in your Profile.
          </Text>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIconWrap, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
              <Shield color="rgba(255,255,255,0.20)" size={48} strokeWidth={1.5} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing yet</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Something new is waiting. Add your first private moment.
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {items.map(item => {
              const isRevealed = revealed.has(item.id);
              const isNew = item.uploaded_by_user_id !== user?.id && !item.viewed_by_partner;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.gridItem, { width: ITEM_SIZE, height: ITEM_SIZE }]}
                  onPress={() => handleReveal(item)}
                  onLongPress={() => handleDeleteItem(item)}
                  delayLongPress={500}
                  activeOpacity={0.85}
                >
                  {signedUrls[item.id] ? (
                    <Image
                      source={{ uri: signedUrls[item.id] }}
                      style={[StyleSheet.absoluteFill, { borderRadius: Radius.sm }]}
                      blurRadius={blurEnabled && !isRevealed ? 6 : 0}
                    />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.04)' }]} />
                  )}
                  {blurEnabled && !isRevealed && (
                    <View style={styles.blurOverlay}>
                      <EyeOff color="rgba(255,255,255,0.7)" size={20} strokeWidth={2} />
                    </View>
                  )}
                  {isNew && <View style={[styles.newDot, { borderColor: '#050507' }]} />}
                  {!item.allow_screenshot && (
                    <View style={styles.shieldBadge}>
                      <Shield color="rgba(255,255,255,0.8)" size={10} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Upload progress overlay */}
      {uploading && (
        <View style={styles.uploadOverlay}>
          <View style={[styles.uploadCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator color="#FF2E8A" size="large" />
            <Text style={[styles.uploadText, { color: colors.text }]}>Uploading to Vault…</Text>
            <Text style={[styles.uploadSub, { color: colors.textMuted }]}>This will not be saved to your device.</Text>
          </View>
        </View>
      )}

      {/* Floating add button */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + NavHeight + Spacing.md }]}
        onPress={() => setShowAdd(true)}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Add to Vault"
      >
        <LinearGradient colors={['#FF5A3D', '#FF2E8A']} style={styles.fabGrad}>
          <Plus color="#fff" size={24} strokeWidth={2.5} />
        </LinearGradient>
      </TouchableOpacity>

      {/* Add Sheet */}
      <BottomSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add to Vault"
        subtitle="Privacy defaults will apply"
      >
        <View style={styles.sheetContent}>
          <View style={[styles.defaultsRow, { backgroundColor: 'rgba(255,46,138,0.06)', borderColor: 'rgba(255,46,138,0.18)' }]}>
            <Shield color="#FF2E8A" size={16} strokeWidth={2} />
            <Text style={[styles.defaultsText, { color: colors.textSecondary }]}>
              Screenshot: {settings?.vault_allow_screenshot_default ? 'On' : 'Off'}
              {'  ·  '}Save: {settings?.vault_allow_save_default ? 'On' : 'Off'}
              {'  ·  '}Share: {settings?.vault_allow_share_default ? 'On' : 'Off'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => { setShowAdd(false); router.push('/(app)/account'); }}
            activeOpacity={0.7}
            style={styles.manageLink}
          >
            <Settings color="#FF2E8A" size={14} strokeWidth={2} />
            <Text style={[styles.manageLinkText, { color: '#FF2E8A' }]}>Manage in My Profile</Text>
          </TouchableOpacity>

          <View style={styles.pickerRow}>
            <TouchableOpacity
              style={[styles.pickerBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
              onPress={handlePickFromLibrary}
              activeOpacity={0.75}
            >
              <ImageIcon color="#FF2E8A" size={24} strokeWidth={1.8} />
              <Text style={[styles.pickerLabel, { color: colors.text }]}>Photo Library</Text>
              <Text style={[styles.pickerSub, { color: colors.textMuted }]}>Choose existing</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
                onPress={handleTakePhoto}
                activeOpacity={0.75}
              >
                <Camera color="#FF8A3D" size={24} strokeWidth={1.8} />
                <Text style={[styles.pickerLabel, { color: colors.text }]}>Camera</Text>
                <Text style={[styles.pickerSub, { color: colors.textMuted }]}>Take now</Text>
              </TouchableOpacity>
            )}
          </View>
          <SecondaryButton label="Cancel" onPress={() => setShowAdd(false)} style={{ marginTop: Spacing.sm }} />
        </View>
      </BottomSheet>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 40 },
  privNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.lg },
  privText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  gridItem: { borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  blurOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)' },
  newDot: { position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF2E8A', borderWidth: 2 },
  shieldBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: 3 },
  empty: { alignItems: 'center', paddingTop: 80, gap: Spacing.lg },
  emptyIconWrap: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: FontSize.xl, fontFamily: 'Inter-Bold' },
  emptySub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', maxWidth: 260, lineHeight: 22 },
  fab: {
    position: 'absolute',
    right: Spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#FF2E8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  fabGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheetContent: { paddingBottom: Spacing.md },
  pickerRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  pickerBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: Radius.lg, borderWidth: 1,
    paddingVertical: Spacing.xl, paddingHorizontal: Spacing.md,
  },
  pickerLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  pickerSub: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', textAlign: 'center' },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 99,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.xl,
  },
  uploadCard: {
    borderRadius: Radius.xl, padding: Spacing.xl,
    alignItems: 'center', gap: Spacing.md, width: '100%', maxWidth: 300,
  },
  uploadText: { fontSize: FontSize.md, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  uploadSub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20 },
  defaultsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md },
  defaultsText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 18 },
  manageLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md },
  manageLinkText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  vaultGate: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.md,
  },
  vaultGateTitle: { color: '#fff', fontSize: FontSize.xl, fontFamily: 'Inter-Bold', marginTop: Spacing.md },
  vaultGateSub: { color: 'rgba(255,255,255,0.5)', fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20 },
  vaultGateError: { color: '#FF5A5F', fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  vaultGateBtn: {
    marginTop: Spacing.md,
    backgroundColor: '#FF2E8A',
    borderRadius: Radius.xl,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xxl,
  },
  vaultGateBtnText: { color: '#fff', fontSize: FontSize.body, fontFamily: 'Inter-SemiBold' },
});
