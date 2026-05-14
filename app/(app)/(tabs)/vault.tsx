import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, RefreshControl, AppState, AppStateStatus, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Shield, EyeOff, Settings, Camera, Image as ImageIcon, CircleQuestionMark, Lock, Clock, Users, Smartphone, ScanFace, FingerprintPattern as Fingerprint, FileSliders as Sliders } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { VaultItem } from '@/lib/types';
import { awardPoints } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { useLayout } from '@/hooks/useLayout';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import SecondaryButton from '@/components/SecondaryButton';
import BottomSheet from '@/components/BottomSheet';
import TabHeader from '@/components/TabHeader';
import AppShell from '@/components/AppShell';
import { FontSize, Spacing, Radius } from '@/constants/theme';


export default function VaultScreen() {
  const router = useRouter();
  const { user, couple, settings } = useAuth();
  const { colors } = useTheme();
  const { width, cols } = useLayout();
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
  const [unlocking, setUnlocking] = useState(false);
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);

  const vaultFaceIdRequired = (settings?.vault_face_id_required ?? false) && Platform.OS !== 'web';

  const blurEnabled = settings?.blur_on_background ?? true;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Unlock the vault via biometrics
  const unlockVault = useCallback(async () => {
    if (unlocking) return;
    setVaultAuthError('');
    if (bioAvailable) {
      setUnlocking(true);
      const result = await bioAuthenticate('Unlock Vault');
      setUnlocking(false);
      if (result.success) {
        setVaultUnlocked(true);
      } else {
        setVaultAuthError('Authentication failed. Try again.');
      }
    } else {
      setVaultUnlocked(true);
    }
  }, [bioAvailable, bioAuthenticate, unlocking]);

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
        if (vaultFaceIdRequired) {
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
    if (data) setItems(data);
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
      await awardPoints(couple.id, user.id, 5, 'Vault media added');
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
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Please allow camera access in Settings.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
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

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const unviewed = items.filter(i => i.uploaded_by_user_id !== user?.id && !i.viewed_by_partner).length;

  const headerRight = (
    <View style={styles.headerBtns}>
      <TouchableOpacity style={styles.secInfoBtn} onPress={() => setShowSecurityInfo(true)} activeOpacity={0.75}>
        <CircleQuestionMark color="rgba(255,255,255,0.55)" size={20} strokeWidth={1.8} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.addBtnWrap} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
        <LinearGradient colors={['#FF5A3D', '#FF2E8A']} style={styles.addGrad}>
          <Plus color="#fff" size={20} strokeWidth={2.5} />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

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
          <TouchableOpacity style={[styles.vaultGateBtn, unlocking && { opacity: 0.6 }]} onPress={unlockVault} activeOpacity={0.8} disabled={unlocking}>
            {unlocking
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
      <TabHeader
        title={unviewed > 0 ? `Vault  ·  ${unviewed} new` : 'Vault'}
        rightSlot={headerRight}
      />
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
                  activeOpacity={0.85}
                >
                  {signedUrls[item.id] ? (
                    <Image
                      source={{ uri: signedUrls[item.id] }}
                      style={[StyleSheet.absoluteFill, { borderRadius: Radius.sm }]}
                      blurRadius={blurEnabled && !isRevealed ? 20 : 0}
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

      {/* Security Info Sheet */}
      <BottomSheet
        visible={showSecurityInfo}
        onClose={() => setShowSecurityInfo(false)}
        title="Your Vault is Private"
        subtitle="Here is how your photos and videos are kept safe."
        scrollable
      >
        <View style={styles.secInfoContent}>
          {[
            {
              icon: <Lock color="#FF2E8A" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,46,138,0.10)',
              title: 'Private Storage',
              desc: 'Your media lives in a locked, private vault. There is no public link anyone can guess or stumble upon — files are completely hidden from the internet.',
            },
            {
              icon: <Clock color="#FF8A3D" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,138,61,0.10)',
              title: 'Links Expire in 1 Hour',
              desc: 'Every time a photo or video loads, the app generates a temporary access link. That link stops working after one hour — so even if intercepted, it quickly becomes useless.',
            },
            {
              icon: <Users color="#69A7FF" size={20} strokeWidth={1.8} />,
              bg: 'rgba(105,167,255,0.10)',
              title: 'Just the Two of You',
              desc: 'Server-level security rules ensure only you and your partner can ever access your vault. These rules live on our servers, not just the app, so they cannot be bypassed.',
            },
            {
              icon: <Smartphone color="#33D17A" size={20} strokeWidth={1.8} />,
              bg: 'rgba(51,209,122,0.10)',
              title: 'Never Saved to Your Device',
              desc: 'Photos and videos taken inside the app go straight to the vault. They are never written to your camera roll or stored anywhere on your phone.',
            },
            {
              icon: <ScanFace color="#FFB347" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,179,71,0.10)',
              title: 'Face ID & PIN Lock',
              desc: 'You can require biometric verification (Face ID or fingerprint) before the vault even opens. Turn this on in your Account settings for an extra layer of protection.',
            },
            {
              icon: <Shield color="#FF5A3D" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,90,61,0.10)',
              title: 'Screenshot Detection',
              desc: 'When screenshots are turned off for an item, the app detects if your partner takes one and sends you a notification immediately.',
            },
            {
              icon: <Sliders color="rgba(255,255,255,0.65)" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,255,255,0.06)',
              title: 'Your Rules, Your Control',
              desc: 'You decide whether each upload can be screenshotted, saved, or shared. Defaults are set in your Profile and apply to every new item you add.',
            },
          ].map(({ icon, bg, title, desc }) => (
            <View key={title} style={[styles.secInfoRow, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={[styles.secInfoIcon, { backgroundColor: bg }]}>{icon}</View>
              <View style={styles.secInfoText}>
                <Text style={[styles.secInfoTitle, { color: colors.text }]}>{title}</Text>
                <Text style={[styles.secInfoDesc, { color: colors.textSecondary }]}>{desc}</Text>
              </View>
            </View>
          ))}
          <View style={[styles.secInfoFooter, { backgroundColor: 'rgba(255,46,138,0.06)', borderColor: 'rgba(255,46,138,0.18)' }]}>
            <Shield color="#FF2E8A" size={14} strokeWidth={2} />
            <Text style={[styles.secInfoFooterText, { color: colors.textSecondary }]}>
              Your moments are safe. We built this app to protect your privacy at every step.
            </Text>
          </View>
        </View>
      </BottomSheet>

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
  addBtnWrap: { borderRadius: 20, overflow: 'hidden' },
  addGrad: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
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
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  secInfoBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  secInfoContent: { paddingBottom: Spacing.lg, gap: Spacing.sm },
  secInfoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md,
  },
  secInfoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  secInfoText: { flex: 1, gap: 4 },
  secInfoTitle: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', lineHeight: 18 },
  secInfoDesc: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 19 },
  secInfoFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginTop: Spacing.xs },
  secInfoFooterText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 18, fontStyle: 'italic' },
});
