import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  Image, RefreshControl, AppState, AppStateStatus, ActivityIndicator, Platform, Alert, Animated,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Shield, EyeOff, Settings, Camera, Image as ImageIcon, Play, Video as VideoIcon } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { VaultItem } from '@/lib/types';
import { awardPoints } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { uploadMediaFile, PICKER_OPTIONS, resolveAssetMimeType, mimeToExtension } from '@/lib/uploadMedia';
import { logDebugEvent } from '@/lib/debugLog';
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
  const { user, couple, partnerProfile, settings, isAuthenticatingRef, vaultUnlocked, setVaultUnlocked, subscriptionInfo, refreshCouple } = useAuth();
  const { colors } = useTheme();
  const { width, cols } = useLayout();
  const insets = useSafeAreaInsets();
  const { available: bioAvailable, authenticate: bioAuthenticate } = useBiometricAuth();
  const NUM_COLS = cols(3, 4);
  const ITEM_SIZE = width > 0 ? (width - Spacing.screen * 2 - Spacing.sm * (NUM_COLS - 1)) / NUM_COLS : 100;
  const [items, setItems] = useState<VaultItem[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const spinAnim = useRef(new Animated.Value(0)).current;
  // Cache of item.id -> short-lived signed URL (1 hour TTL)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  // Timestamp (ms) when each URL was fetched — used to detect near-expiry
  const urlFetchedAtRef = useRef<Record<string, number>>({});
  const URL_TTL_MS = 55 * 60 * 1000; // refresh 5 min before Supabase's 1-hour expiry
  // Vault biometric gate
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
          setVaultUnlocked(true); // persists in AuthContext across navigation
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
      // Batch-fetch signed URLs grouped by bucket (one API call per bucket).
      // Skip items whose cached URL is still fresh (< 55 min old).
      const now = Date.now();
      const byBucket: Record<string, typeof data> = {};
      for (const item of data) {
        const bucket = item.storage_bucket ?? 'vault';
        const path = item.storage_path ?? item.file_path;
        if (!path) continue;
        const fetchedAt = urlFetchedAtRef.current[item.id] ?? 0;
        if (now - fetchedAt < URL_TTL_MS) continue; // still fresh
        if (!byBucket[bucket]) byBucket[bucket] = [];
        byBucket[bucket].push(item);
      }
      if (Object.keys(byBucket).length > 0) {
        await Promise.all(
          Object.entries(byBucket).map(async ([bucket, bucketItems]) => {
            const paths = bucketItems.map(i => (i.storage_path ?? i.file_path)!);
            const { data: urlData } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
            if (!urlData) return;
            const urlMap: Record<string, string> = {};
            const fetchTs: Record<string, number> = {};
            for (const item of bucketItems) {
              const path = item.storage_path ?? item.file_path;
              const entry = urlData.find(d => d.path === path);
              if (entry?.signedUrl) {
                urlMap[item.id] = entry.signedUrl;
                fetchTs[item.id] = Date.now();
              }
            }
            urlFetchedAtRef.current = { ...urlFetchedAtRef.current, ...fetchTs };
            setSignedUrls(prev => ({ ...prev, ...urlMap }));
          })
        );
      }
    }
  };

  const resolveSignedUrl = async (item: VaultItem): Promise<string | null> => {
    const fetchedAt = urlFetchedAtRef.current[item.id] ?? 0;
    const isFresh = Date.now() - fetchedAt < URL_TTL_MS;
    if (signedUrls[item.id] && isFresh) return signedUrls[item.id];
    const bucket = item.storage_bucket ?? 'vault';
    const path = item.storage_path ?? item.file_path;
    if (!path) return null;
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (data?.signedUrl) {
      urlFetchedAtRef.current[item.id] = Date.now();
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
    const msg = item.chat_message_id
      ? '\n\nThis item was sent from Chat — it will also be deleted from your Chat history.'
      : '';
    Alert.alert(
      'Delete from Vault',
      `This will permanently remove this item for both you and your partner.${msg}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // DB deletes first — if storage cleanup fails the file is orphaned
            // but the user won't see a broken tile. Reverse order risks a dangling
            // DB row pointing to a deleted file on every future load.
            const { error: dbError } = await supabase
              .from('vault_items')
              .delete()
              .eq('id', item.id);
            if (dbError) {
              Alert.alert('Delete Failed', 'Could not delete this item. Please try again.');
              return;
            }
            // Remove from local state only after DB confirms deletion
            setItems(prev => prev.filter(i => i.id !== item.id));
            setSignedUrls(prev => { const n = { ...prev }; delete n[item.id]; return n; });
            setRevealed(prev => { const n = new Set(prev); n.delete(item.id); return n; });
            // Best-effort storage cleanup (fire-and-forget)
            const bucket = item.storage_bucket ?? 'vault';
            const path = item.storage_path ?? item.file_path;
            if (path) supabase.storage.from(bucket).remove([path]).catch(() => {});
            // Delete linked chat message + its storage file
            if (item.chat_message_id) {
              const { data: chatMsg } = await supabase
                .from('chat_messages')
                .select('media_storage_path, media_storage_bucket')
                .eq('id', item.chat_message_id)
                .maybeSingle();
              await supabase.from('chat_messages').delete().eq('id', item.chat_message_id);
              if (chatMsg?.media_storage_path) {
                const chatBucket = chatMsg.media_storage_bucket ?? 'chat_media';
                supabase.storage.from(chatBucket).remove([chatMsg.media_storage_path]).catch(() => {});
              }
            }
          },
        },
      ]
    );
  };


  // Spin animation for the progress overlay
  const startSpin = () => {
    spinAnim.setValue(0);
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 900, useNativeDriver: true })
    ).start();
  };
  const stopSpin = () => spinAnim.stopAnimation();

  const uploadToVault = async (localUri: string, mediaType: 'photo' | 'video', mimeType: string) => {
    if (!user) {
      logDebugEvent('VAULT COUPLE MISSING', { reason: 'no_user', userId: null, coupleId: couple?.id ?? null });
      Alert.alert('Not signed in', 'Please sign in to use the Vault.');
      return;
    }

    // If no active couple yet, try to auto-create a solo couple so vault works
    if (!couple?.id) {
      logDebugEvent('VAULT COUPLE MISSING', { reason: 'no_couple', userId: user.id, coupleId: null });

      if (subscriptionInfo.canInvite) {
        // Try to create a solo couple inline so the upload can proceed
        const { data: rpcResult, error: createError } = await supabase.rpc('generate_invite_code');
        if (createError || !rpcResult) {
          logDebugEvent('VAULT COUPLE MISSING', {
            reason: 'auto_create_failed',
            userId: user.id,
            error: createError?.message ?? 'unknown',
            code: createError?.code ?? null,
          });
          Alert.alert(
            'Vault Unavailable',
            `Could not create your vault connection.\nCode: ${createError?.code ?? 'n/a'}\n${createError?.message ?? 'Unknown error'}`
          );
          return;
        }
        logDebugEvent('VAULT COUPLE CREATED', { coupleId: rpcResult.couple_id, inviteCode: rpcResult.invite_code });
        await refreshCouple();
        // couple state will update async — proceed with newCouple.id directly
        const ext = mimeToExtension(mimeType);
        const storagePath = `${rpcResult.couple_id}/${user.id}/${Date.now()}.${ext}`;
        setUploading(true);
        setUploadPct(0);
        setShowAdd(false);
        startSpin();
        try {
          await uploadMediaFile(localUri, 'vault', storagePath, mimeType, (pct) => setUploadPct(pct), user.id, rpcResult.couple_id);
          const { error: dbError } = await supabase.from('vault_items').insert({
            couple_id: rpcResult.couple_id, uploaded_by_user_id: user.id, media_type: mediaType,
            storage_path: storagePath, storage_bucket: 'vault',
            allow_screenshot: settings?.vault_allow_screenshot_default ?? false,
            allow_save: settings?.vault_allow_save_default ?? false,
            allow_share: settings?.vault_allow_share_default ?? false,
            chat_message_id: null,
          });
          if (dbError) {
            supabase.storage.from('vault').remove([storagePath]).catch(() => {});
            throw new Error(`Media uploaded but failed to save — ${dbError.message}`);
          }
          awardPoints(rpcResult.couple_id, user.id, 5, 'Vault media added');
          await load();
        } catch (e: any) {
          Alert.alert('Upload Failed', e?.message ?? 'Something went wrong. Please try again.');
        } finally {
          stopSpin();
          setUploading(false);
          setUploadPct(0);
        }
        return;
      }

      Alert.alert(
        'Vault Unavailable',
        'Set up your invite connection first to use the Vault.',
        [
          { text: 'Go to Connect', onPress: () => router.push('/(auth)/pair') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }
    setUploading(true);
    setUploadPct(0);
    setShowAdd(false);
    startSpin();
    try {
      const ext = mimeToExtension(mimeType);
      const storagePath = `${couple.id}/${user.id}/${Date.now()}.${ext}`;
      await uploadMediaFile(localUri, 'vault', storagePath, mimeType, (pct) => setUploadPct(pct), user.id, couple.id);

      const { error: dbError } = await supabase.from('vault_items').insert({
        couple_id: couple.id,
        uploaded_by_user_id: user.id,
        media_type: mediaType,
        storage_path: storagePath,
        storage_bucket: 'vault',
        allow_screenshot: settings?.vault_allow_screenshot_default ?? false,
        allow_save: settings?.vault_allow_save_default ?? false,
        allow_share: settings?.vault_allow_share_default ?? false,
        chat_message_id: null,
      });
      if (dbError) {
        // Clean up the already-uploaded storage file so it doesn't become an orphan
        supabase.storage.from('vault').remove([storagePath]).catch(() => {});
        logDebugEvent('VAULT UPLOAD ERROR', {
          reason: 'DB insert failed after storage upload',
          dbError: dbError.message,
          dbCode: dbError.code,
          storagePath,
          userId: user.id,
          coupleId: couple.id,
        });
        throw new Error(`Media uploaded but failed to save — ${dbError.message}`);
      }
      awardPoints(couple.id, user.id, 5, 'Vault media added');
      notifyPartner({ event_type: 'new_vault_item', couple_id: couple.id, target_route: '/(app)/(tabs)/vault', partnerUserId: partnerProfile?.id });
      await load();
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      stopSpin();
      setUploading(false);
      setUploadPct(0);
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
      const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      const mimeType = resolveAssetMimeType(asset);
      logDebugEvent('VAULT PICK', {
        source: 'library',
        mediaType: isVideo ? 'video' : 'photo',
        mimeType,
        uriPrefix: asset.uri.substring(0, 12),
        userId: user?.id ?? null,
        coupleId: couple?.id ?? null,
      });
      await uploadToVault(asset.uri, isVideo ? 'video' : 'photo', mimeType);
    } catch (e: any) {
      setUploading(false);
      Alert.alert('Upload Failed', e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  const handleTakePhoto = async () => {
    setShowAdd(false);
    await new Promise(r => setTimeout(r, 350));
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Please allow camera access in Settings.');
        return;
      }
      cameraActiveRef.current = true;
      let result;
      try {
        result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
      } finally {
        cameraActiveRef.current = false;
      }
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      const mimeType = resolveAssetMimeType(asset);
      logDebugEvent('VAULT PICK', {
        source: 'camera',
        mediaType: isVideo ? 'video' : 'photo',
        mimeType,
        uriPrefix: asset.uri.substring(0, 12),
        userId: user?.id ?? null,
        coupleId: couple?.id ?? null,
      });
      await uploadToVault(asset.uri, isVideo ? 'video' : 'photo', mimeType);
    } catch (e: any) {
      setUploading(false);
      Alert.alert('Upload Failed', e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  const handleTakePhotoOnly = async () => {
    setShowAdd(false);
    await new Promise(r => setTimeout(r, 350));
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Please allow camera access in Settings.');
        return;
      }
      cameraActiveRef.current = true;
      let result;
      try {
        result = await ImagePicker.launchCameraAsync({ ...PICKER_OPTIONS, mediaTypes: ['images'] as any });
      } finally {
        cameraActiveRef.current = false;
      }
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const mimeType = resolveAssetMimeType(asset);
      await uploadToVault(asset.uri, 'photo', mimeType);
    } catch (e: any) {
      setUploading(false);
      Alert.alert('Upload Failed', e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  const handleRecordVideo = async () => {
    setShowAdd(false);
    await new Promise(r => setTimeout(r, 350));
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Please allow camera access in Settings.');
        return;
      }
      cameraActiveRef.current = true;
      let result;
      try {
        result = await ImagePicker.launchCameraAsync({ ...PICKER_OPTIONS, mediaTypes: ['videos'] as any });
      } finally {
        cameraActiveRef.current = false;
      }
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const mimeType = resolveAssetMimeType(asset);
      await uploadToVault(asset.uri, 'video', mimeType);
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
          <AppText style={styles.vaultGateTitle}>Vault is Locked</AppText>
          <AppText style={styles.vaultGateSub}>Biometric verification required to view Vault content.</AppText>
          {vaultAuthError ? <AppText style={styles.vaultGateError}>{vaultAuthError}</AppText> : null}
          <TouchableOpacity style={[styles.vaultGateBtn, unlockingRef.current && { opacity: 0.6 }]} onPress={unlockVault} activeOpacity={0.8} disabled={unlockingRef.current}>
            {unlockingRef.current
              ? <ActivityIndicator color="#fff" size="small" />
              : <AppText style={styles.vaultGateBtnText}>Unlock Vault</AppText>
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
          <AppText style={[styles.privText, { color: colors.textSecondary }]}>
            Protected media. Privacy defaults are set in your Profile.
          </AppText>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIconWrap, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
              <Shield color="rgba(255,255,255,0.20)" size={48} strokeWidth={1.5} />
            </View>
            <AppText style={[styles.emptyTitle, { color: colors.text }]}>Nothing yet</AppText>
            <AppText style={[styles.emptySub, { color: colors.textSecondary }]}>
              Something new is waiting. Add your first private moment.
            </AppText>
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
                    item.media_type === 'video' && isRevealed ? (
                      // Revealed video: dark placeholder with centred play icon
                      <View style={[StyleSheet.absoluteFill, styles.videoThumbRevealed, { borderRadius: Radius.sm }]}>
                        <Play color="#fff" size={28} fill="rgba(255,255,255,0.85)" strokeWidth={1.5} />
                      </View>
                    ) : (
                      <Image
                        source={{ uri: signedUrls[item.id] }}
                        style={[StyleSheet.absoluteFill, { borderRadius: Radius.sm }]}
                        blurRadius={blurEnabled && !isRevealed ? 6 : 0}
                      />
                    )
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' }]}>
                      <ActivityIndicator color="rgba(255,255,255,0.25)" size="small" />
                    </View>
                  )}
                  {blurEnabled && !isRevealed && (
                    <View style={styles.blurOverlay}>
                      <EyeOff color="rgba(255,255,255,0.7)" size={20} strokeWidth={2} />
                    </View>
                  )}
                  {item.media_type === 'video' && !isRevealed && !blurEnabled && (
                    <View style={styles.videoBadge}>
                      <Play color="#fff" size={10} fill="#fff" strokeWidth={1.5} />
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
            <View style={styles.spinnerWrap}>
              <Animated.View style={{
                transform: [{
                  rotate: spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
                }],
              }}>
                <ActivityIndicator color="#FF2E8A" size="large" />
              </Animated.View>
              {uploadPct > 0 && (
                <AppText style={styles.uploadPct}>{uploadPct}%</AppText>
              )}
            </View>
            <AppText style={[styles.uploadText, { color: colors.text }]}>Uploading to Vault…</AppText>
            <AppText style={[styles.uploadSub, { color: colors.textMuted }]}>This will not be saved to your device.</AppText>
          </View>
        </View>
      )}

      {/* Floating add button */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + Spacing.lg }]}
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
            <AppText style={[styles.defaultsText, { color: colors.textSecondary }]}>
              Screenshot: {settings?.vault_allow_screenshot_default ? 'On' : 'Off'}
              {'  ·  '}Save: {settings?.vault_allow_save_default ? 'On' : 'Off'}
              {'  ·  '}Share: {settings?.vault_allow_share_default ? 'On' : 'Off'}
            </AppText>
          </View>

          <TouchableOpacity
            onPress={() => { setShowAdd(false); router.push('/(app)/account'); }}
            activeOpacity={0.7}
            style={styles.manageLink}
          >
            <Settings color="#FF2E8A" size={14} strokeWidth={2} />
            <AppText style={[styles.manageLinkText, { color: '#FF2E8A' }]}>Manage in My Profile</AppText>
          </TouchableOpacity>

          <View style={styles.pickerRow}>
            <TouchableOpacity
              style={[styles.pickerBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
              onPress={handlePickFromLibrary}
              activeOpacity={0.75}
            >
              <ImageIcon color="#FF2E8A" size={24} strokeWidth={1.8} />
              <AppText style={[styles.pickerLabel, { color: colors.text }]}>Photo Library</AppText>
              <AppText style={[styles.pickerSub, { color: colors.textMuted }]}>Choose existing</AppText>
            </TouchableOpacity>
            {Platform.OS !== 'web' && Platform.OS !== 'android' && (
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
                onPress={handleTakePhoto}
                activeOpacity={0.75}
              >
                <Camera color="#FF8A3D" size={24} strokeWidth={1.8} />
                <AppText style={[styles.pickerLabel, { color: colors.text }]}>Camera</AppText>
                <AppText style={[styles.pickerSub, { color: colors.textMuted }]}>Photo or video</AppText>
              </TouchableOpacity>
            )}
          </View>
          {Platform.OS === 'android' && (
            <View style={styles.pickerRow}>
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
                onPress={handleTakePhotoOnly}
                activeOpacity={0.75}
              >
                <Camera color="#FF8A3D" size={24} strokeWidth={1.8} />
                <AppText style={[styles.pickerLabel, { color: colors.text }]}>Take Photo</AppText>
                <AppText style={[styles.pickerSub, { color: colors.textMuted }]}>Camera</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
                onPress={handleRecordVideo}
                activeOpacity={0.75}
              >
                <VideoIcon color="#FF8A3D" size={24} strokeWidth={1.8} />
                <AppText style={[styles.pickerLabel, { color: colors.text }]}>Record Video</AppText>
                <AppText style={[styles.pickerSub, { color: colors.textMuted }]}>Camera</AppText>
              </TouchableOpacity>
            </View>
          )}
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
  videoThumbRevealed: { backgroundColor: '#0D0D12', alignItems: 'center', justifyContent: 'center' },
  videoBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: 4 },
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
  spinnerWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center', width: 56, height: 56 },
  uploadPct: { position: 'absolute', fontSize: 11, fontFamily: 'Inter-Bold', color: '#FF2E8A' },
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
