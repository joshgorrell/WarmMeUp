import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, AppState, AppStateStatus, ActivityIndicator, Platform, Alert, Animated, Linking, InteractionManager,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import AppText from '@/components/AppText';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Shield, EyeOff, Settings, Camera, Image as ImageIcon, Play, Check, Trash2, X } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { VaultItem } from '@/lib/types';
import { awardPoints } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { uploadMediaFile, PICKER_OPTIONS, resolveAssetMimeType, mimeToExtension } from '@/lib/uploadMedia';
import { logDebugEvent } from '@/lib/debugLog';
import { setGalleryItems, getCachedUrl, setCachedUrl, evictCachedUrl } from '@/lib/mediaGalleryStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '@/hooks/useLayout';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { useMediaReactions } from '@/hooks/useMediaReactions';
import MediaActionRow from '@/components/MediaActionRow';
import ConfirmSheet, { ConfirmAction } from '@/components/ConfirmSheet';
import SecondaryButton from '@/components/SecondaryButton';
import BottomSheet from '@/components/BottomSheet';
import TabHeader from '@/components/TabHeader';
import AppShell from '@/components/AppShell';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { clearLocalImageCache } from '@/lib/mediaCache';
import { consumeCameraCaptureResult } from '@/lib/cameraCaptureStore';

export default function VaultScreen() {
  const router = useRouter();
  const { vault_item_id: deepLinkVaultItemId } = useLocalSearchParams<{ vault_item_id?: string }>();
  const { user, couple, partnerProfile, profile, settings, isAuthenticatingRef, vaultUnlocked, setVaultUnlocked, subscriptionInfo, refreshCouple } = useAuth();
  const { colors } = useTheme();
  const { width, height: screenHeight, cols, contentPadding } = useLayout();
  const insets = useSafeAreaInsets();
  const { available: bioAvailable, authenticate: bioAuthenticate } = useBiometricAuth();
  const NUM_COLS = cols(3, 5, 6);
  const ITEM_SIZE = width > 0 ? (width - contentPadding * 2 - Spacing.sm * (NUM_COLS - 1)) / NUM_COLS : 100;
  const [items, setItems] = useState<VaultItem[]>([]);
  const PAGE_SIZE = 30;
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const oldestCreatedAtRef = useRef<string | null>(null);
  const [pageRevealed, setPageRevealed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const urlFetchedAtRef = useRef<Record<string, number>>({});
  const URL_TTL_MS = 11.5 * 60 * 60 * 1000;
  const [vaultAuthError, setVaultAuthError] = useState('');
  const unlockingRef = useRef(false);
  const vaultFaceIdRequired = (settings?.vault_face_id_required ?? false) && Platform.OS !== 'web';
  const blurEnabled = settings?.blur_vault_media ?? settings?.blur_media ?? true;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const cameraActiveRef = useRef(false);
  const thumbnailsVisible = !blurEnabled || pageRevealed;
  const [activeVaultItemId, setActiveVaultItemId] = useState<string | null>(null);
  const [vaultMenuAnchor, setVaultMenuAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [vaultPillSize, setVaultPillSize] = useState<{ w: number; h: number } | null>(null);
  const tileRefs = useRef<Record<string, View | null>>({});
  const scrollViewRef = useRef<any>(null);
  const [highlightedVaultId, setHighlightedVaultId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const handledVaultLinkRef = useRef<string | null>(null);
  const [confirmSheet, setConfirmSheet] = useState<{ title: string; message?: string; actions: ConfirmAction[] } | null>(null);

  const vaultItemIds = useMemo(() => items.map(i => i.id), [items]);
  const { reactionsMap: vaultReactionsMap, react: reactOnVaultItem } = useMediaReactions(couple?.id, user?.id, 'vault_items', vaultItemIds);

  const unlockVault = useCallback(async () => {
    if (unlockingRef.current) return;
    setVaultAuthError('');
    if (bioAvailable) {
      unlockingRef.current = true;
      isAuthenticatingRef.current = true;
      try {
        const result = await bioAuthenticate('Unlock Vault');
        if (result.success) setVaultUnlocked(true);
        else setVaultAuthError('Authentication failed. Try again.');
      } finally {
        unlockingRef.current = false;
        isAuthenticatingRef.current = false;
      }
    } else setVaultUnlocked(true);
  }, [bioAvailable, bioAuthenticate, isAuthenticatingRef, setVaultUnlocked]);

  useEffect(() => {
    if (!blurEnabled) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if ((prev === 'background' || prev === 'inactive') && next === 'active') setPageRevealed(false);
    });
    return () => sub.remove();
  }, [blurEnabled]);

  useFocusEffect(useCallback(() => {
    if (vaultFaceIdRequired && !vaultUnlocked) unlockVault();
    return () => {
      if (blurEnabled) setPageRevealed(false);
      if (!cameraActiveRef.current) setVaultUnlocked(false);
    };
  }, [vaultFaceIdRequired, blurEnabled, vaultUnlocked, setVaultUnlocked, unlockVault]));

  useEffect(() => {
    if (!couple?.id) return;
    load();
    const ch = supabase.channel(`vault_${couple.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vault_items', filter: `couple_id=eq.${couple.id}` }, async (payload) => {
        const newItem = payload.new as VaultItem;
        if (!newItem?.id || newItem.deleted_at) return;
        setItems(prev => prev.some(i => i.id === newItem.id) ? prev : [newItem, ...prev]);
        await fetchGridUrlsForItems([newItem]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vault_items', filter: `couple_id=eq.${couple.id}` }, (payload) => {
        const updated = payload.new as VaultItem;
        if (updated.deleted_at) {
          setItems(prev => prev.filter(i => i.id !== updated.id));
          setSignedUrls(prev => { const n = { ...prev }; delete n[updated.id]; return n; });
          setThumbUrls(prev => { const n = { ...prev }; delete n[updated.id]; return n; });
          setSelectedIds(prev => { const n = new Set(prev); n.delete(updated.id); return n; });
          const p = (updated as any).storage_path ?? (updated as any).file_path;
          if (p) evictCachedUrl(p);
          if ((updated as any).blurred_thumbnail_path) evictCachedUrl((updated as any).blurred_thumbnail_path);
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id]);

  useEffect(() => {
    if (!deepLinkVaultItemId || items.length === 0 || handledVaultLinkRef.current === deepLinkVaultItemId) return;
    const target = items.find(i => i.id === deepLinkVaultItemId);
    if (!target) return;
    handledVaultLinkRef.current = deepLinkVaultItemId;
    setTimeout(() => {
      const tileRef = tileRefs.current[deepLinkVaultItemId];
      if (tileRef && scrollViewRef.current) {
        tileRef.measureLayout(scrollViewRef.current, (_x: number, y: number) => scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true }), () => {});
      }
      setHighlightedVaultId(deepLinkVaultItemId);
      setTimeout(() => setHighlightedVaultId(null), 2000);
    }, 200);
  }, [deepLinkVaultItemId, items.length]);

  const fetchGridUrlsForItems = async (itemsToFetch: VaultItem[]) => {
    const thumbByBucket: Record<string, VaultItem[]> = {};
    const fallbackByBucket: Record<string, VaultItem[]> = {};
    const seededThumbs: Record<string, string> = {};
    const seededFallbacks: Record<string, string> = {};
    const now = Date.now();

    for (const item of itemsToFetch) {
      const bucket = item.storage_bucket ?? 'vault';
      const fullPath = item.storage_path ?? item.file_path;
      const thumbPath = item.blurred_thumbnail_path;

      if (thumbPath) {
        const cachedThumb = getCachedUrl(thumbPath);
        if (cachedThumb) seededThumbs[item.id] = cachedThumb;
        else {
          if (!thumbByBucket[bucket]) thumbByBucket[bucket] = [];
          thumbByBucket[bucket].push(item);
        }
      } else if (fullPath) {
        const cachedFull = getCachedUrl(fullPath);
        if (cachedFull) {
          seededFallbacks[item.id] = cachedFull;
          urlFetchedAtRef.current[item.id] = now;
        } else {
          if (!fallbackByBucket[bucket]) fallbackByBucket[bucket] = [];
          fallbackByBucket[bucket].push(item);
        }
      }
    }

    if (Object.keys(seededThumbs).length) setThumbUrls(prev => ({ ...prev, ...seededThumbs }));
    if (Object.keys(seededFallbacks).length) setSignedUrls(prev => ({ ...prev, ...seededFallbacks }));

    await Promise.all([
      ...Object.entries(thumbByBucket).map(async ([bucket, bucketItems]) => {
        const paths = bucketItems.map(i => i.blurred_thumbnail_path!);
        const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 12 * 60 * 60);
        if (!data) return;
        const pathToUrl = new Map(data.map(d => [d.path, d.signedUrl]));
        const next: Record<string, string> = {};
        for (const item of bucketItems) {
          const path = item.blurred_thumbnail_path!;
          const signed = pathToUrl.get(path);
          if (signed) { next[item.id] = signed; setCachedUrl(path, signed); }
        }
        if (Object.keys(next).length) setThumbUrls(prev => ({ ...prev, ...next }));
      }),
      ...Object.entries(fallbackByBucket).map(async ([bucket, bucketItems]) => {
        const paths = bucketItems.map(i => (i.storage_path ?? i.file_path)!);
        const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 12 * 60 * 60);
        if (!data) return;
        const pathToUrl = new Map(data.map(d => [d.path, d.signedUrl]));
        const next: Record<string, string> = {};
        for (const item of bucketItems) {
          const path = item.storage_path ?? item.file_path;
          const signed = path ? pathToUrl.get(path) : null;
          if (signed && path) { next[item.id] = signed; urlFetchedAtRef.current[item.id] = Date.now(); setCachedUrl(path, signed); }
        }
        if (Object.keys(next).length) setSignedUrls(prev => ({ ...prev, ...next }));
      }),
    ]);
  };

  const load = async () => {
    if (!couple?.id) return;
    setHasMore(true);
    oldestCreatedAtRef.current = null;
    const { data } = await supabase.from('vault_items').select('*').eq('couple_id', couple.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(PAGE_SIZE);
    if (data) {
      setItems(data);
      if (data.length > 0) oldestCreatedAtRef.current = data[data.length - 1].created_at;
      setHasMore(data.length === PAGE_SIZE);
      fetchGridUrlsForItems(data).catch(() => {});
    }
  };

  const loadMore = async () => {
    if (!couple?.id || loadingMore || !hasMore) return;
    const cursor = oldestCreatedAtRef.current;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const { data } = await supabase.from('vault_items').select('*').eq('couple_id', couple.id).is('deleted_at', null).lt('created_at', cursor).order('created_at', { ascending: false }).limit(PAGE_SIZE);
      if (data && data.length > 0) {
        setItems(prev => [...prev, ...data]);
        oldestCreatedAtRef.current = data[data.length - 1].created_at;
        setHasMore(data.length === PAGE_SIZE);
        fetchGridUrlsForItems(data).catch(() => {});
      } else setHasMore(false);
    } finally { setLoadingMore(false); }
  };

  const markAllViewed = async (allItems: VaultItem[]) => {
    if (!couple?.id || !user) return;
    const unviewed = allItems.filter(i => i.uploaded_by_user_id !== user.id && !i.viewed_by_partner);
    for (const item of unviewed) {
      supabase.rpc('mark_vault_item_viewed', { item_id: item.id }).then(() => {}, () => {});
      awardPoints(couple.id, user.id, 2, 'Vault media viewed');
    }
  };

  const handleRevealPage = async () => { setPageRevealed(true); await markAllViewed(items); };

  const handleTilePress = async (item: VaultItem) => {
    if (blurEnabled && !pageRevealed) { await handleRevealPage(); return; }

    const gallery = items.map(i => {
      const uploaderName = i.uploaded_by_user_id === user?.id ? (profile?.display_name ?? 'You') : (partnerProfile?.display_name ?? 'Partner');
      return {
        id: i.id,
        storagePath: i.storage_path ?? i.file_path,
        storageBucket: i.storage_bucket ?? 'vault',
        coupleId: i.couple_id,
        mediaType: i.media_type,
        allowScreenshot: i.allow_screenshot,
        allowSave: i.allow_save,
        allowShare: i.allow_share,
        createdAt: i.created_at,
        uploaderName,
        signedUri: signedUrls[i.id] ?? null,
        thumbUri: thumbUrls[i.id] ?? signedUrls[i.id] ?? null,
        interactionId: null,
      };
    });
    const initialIndex = gallery.findIndex(g => g.id === item.id);
    setGalleryItems(gallery);
    router.push({ pathname: '/(app)/vault-viewer', params: { initialIndex: String(Math.max(0, initialIndex)) } });
  };

  const handleDeleteItem = (item: VaultItem) => {
    const linkedChatNote = item.chat_message_id ? '\n\nThis item was sent from Chat — it will also be hidden from your Chat history.' : '';
    const doDelete = async () => {
      const deletedAt = new Date().toISOString();
      const { error: dbError } = await supabase.from('vault_items').update({ deleted_at: deletedAt }).eq('id', item.id);
      if (dbError) { Alert.alert('Delete Failed', 'Could not delete this item. Please try again.'); return; }
      setItems(prev => prev.filter(i => i.id !== item.id));
      setSignedUrls(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      setThumbUrls(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      const path = item.storage_path ?? item.file_path;
      if (path) evictCachedUrl(path);
      if (item.blurred_thumbnail_path) evictCachedUrl(item.blurred_thumbnail_path);
      const bucket = item.storage_bucket ?? 'vault';
      if (path) supabase.storage.from(bucket).remove([path]).catch(() => {});
      clearLocalImageCache().catch(() => {});
      if (item.chat_message_id) {
        const { data: chatMsg } = await supabase.from('chat_messages').select('media_storage_path, media_storage_bucket').eq('id', item.chat_message_id).maybeSingle();
        await supabase.from('chat_messages').update({ deleted_at: deletedAt }).eq('id', item.chat_message_id);
        if (chatMsg?.media_storage_path) supabase.storage.from(chatMsg.media_storage_bucket ?? 'chat_media').remove([chatMsg.media_storage_path]).catch(() => {});
      }
    };
    setConfirmSheet({ title: 'Delete from Vault', message: `This will permanently remove this item for both you and your partner.${linkedChatNote}`, actions: [{ label: 'Delete', style: 'destructive', onPress: doDelete }, { label: 'Cancel', style: 'cancel', onPress: () => {} }] });
  };

  const enterSelectMode = () => { setSelectMode(true); setSelectedIds(new Set()); if (blurEnabled && !pageRevealed) handleRevealPage(); };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    if (Platform.OS !== 'web') import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}));
  };

  const handleBulkDelete = () => {
    const ids = [...selectedIds]; if (!ids.length) return; const count = ids.length;
    const doBulkDelete = async () => {
      const deletedAt = new Date().toISOString(); const idSet = new Set(ids); const targets = items.filter(i => idSet.has(i.id));
      await Promise.all(targets.map(async item => {
        await supabase.from('vault_items').update({ deleted_at: deletedAt }).eq('id', item.id);
        const path = item.storage_path ?? item.file_path; const bucket = item.storage_bucket ?? 'vault';
        if (path) { evictCachedUrl(path); if (item.blurred_thumbnail_path) evictCachedUrl(item.blurred_thumbnail_path); supabase.storage.from(bucket).remove([path]).catch(() => {}); }
        if (item.chat_message_id) {
          const { data: chatMsg } = await supabase.from('chat_messages').select('media_storage_path, media_storage_bucket').eq('id', item.chat_message_id).maybeSingle();
          await supabase.from('chat_messages').update({ deleted_at: deletedAt }).eq('id', item.chat_message_id);
          if (chatMsg?.media_storage_path) supabase.storage.from(chatMsg.media_storage_bucket ?? 'chat_media').remove([chatMsg.media_storage_path]).catch(() => {});
        }
      }));
      setItems(prev => prev.filter(i => !idSet.has(i.id)));
      setSignedUrls(prev => { const n = { ...prev }; ids.forEach(id => delete n[id]); return n; });
      setThumbUrls(prev => { const n = { ...prev }; ids.forEach(id => delete n[id]); return n; });
      setSelectedIds(new Set()); setSelectMode(false);
    };
    setConfirmSheet({ title: `Delete ${count} ${count === 1 ? 'item' : 'items'}`, message: `This will permanently remove ${count} ${count === 1 ? 'item' : 'items'} for both you and your partner.`, actions: [{ label: 'Delete', style: 'destructive', onPress: doBulkDelete }, { label: 'Cancel', style: 'cancel', onPress: () => {} }] });
  };

  const handleVaultLongPress = (item: VaultItem) => {
    const ref = tileRefs.current[item.id];
    if (!ref) { setActiveVaultItemId(item.id); setVaultMenuAnchor({ x: width / 2 - ITEM_SIZE / 2, y: Math.round(screenHeight * 0.3), width: ITEM_SIZE, height: ITEM_SIZE }); return; }
    ref.measureInWindow((x, y, w, h) => {
      if (Platform.OS !== 'web') import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}));
      setVaultMenuAnchor({ x, y, width: w, height: h }); setActiveVaultItemId(item.id);
    });
  };

  const startSpin = () => { spinAnim.setValue(0); Animated.loop(Animated.timing(spinAnim, { toValue: 1, duration: 900, useNativeDriver: true })).start(); };
  const stopSpin = () => spinAnim.stopAnimation();

  const uploadToVault = async (localUri: string, mediaType: 'photo' | 'video', mimeType: string) => {
    if (!user) { Alert.alert('Not signed in', 'Please sign in to use the Vault.'); return; }
    if (!couple?.id) {
      if (subscriptionInfo.canInvite) {
        const { data: rpcResult, error: createError } = await supabase.rpc('generate_invite_code');
        if (createError || !rpcResult) { Alert.alert('Vault Unavailable', `Could not create your vault connection.\nCode: ${createError?.code ?? 'n/a'}\n${createError?.message ?? 'Unknown error'}`); return; }
        await refreshCouple();
        const ext = mimeToExtension(mimeType); const storagePath = `${rpcResult.couple_id}/${user.id}/${Date.now()}.${ext}`;
        setUploading(true); setUploadPct(0); setShowAdd(false); startSpin();
        try {
          const uploadResult = await uploadMediaFile(localUri, 'vault', storagePath, mimeType, pct => setUploadPct(pct), user.id, rpcResult.couple_id);
          const actualPath = uploadResult.storagePath;
          const insertPayload = { couple_id: rpcResult.couple_id, uploaded_by_user_id: user.id, media_type: mediaType, file_path: actualPath, storage_path: actualPath, storage_bucket: 'vault', blurred_thumbnail_path: uploadResult.thumbnailPath ?? null, allow_screenshot: false, allow_save: settings?.vault_allow_save_default ?? false, allow_share: settings?.vault_allow_share_default ?? false, chat_message_id: null };
          const { error: dbError } = await supabase.from('vault_items').insert(insertPayload);
          if (dbError) { supabase.storage.from('vault').remove([actualPath]).catch(() => {}); throw new Error(`Media uploaded but failed to save — ${dbError.message}`); }
          awardPoints(rpcResult.couple_id, user.id, 5, 'Vault media added'); await load(); InteractionManager.runAfterInteractions(() => scrollViewRef.current?.scrollTo({ y: 0, animated: true }));
        } catch (e: any) { Alert.alert('Upload Failed', e?.message ?? 'Something went wrong. Please try again.'); }
        finally { stopSpin(); setUploading(false); setUploadPct(0); }
        return;
      }
      Alert.alert('Vault Unavailable', 'Set up your invite connection first to use the Vault.', [{ text: 'Go to Connect', onPress: () => router.push('/(auth)/pair') }, { text: 'Cancel', style: 'cancel' }]); return;
    }
    setUploading(true); setUploadPct(0); setShowAdd(false); startSpin();
    try {
      const ext = mimeToExtension(mimeType); const storagePath = `${couple.id}/${user.id}/${Date.now()}.${ext}`;
      const uploadResult = await uploadMediaFile(localUri, 'vault', storagePath, mimeType, pct => setUploadPct(pct), user.id, couple.id);
      const actualPath = uploadResult.storagePath;
      const insertPayload = { couple_id: couple.id, uploaded_by_user_id: user.id, media_type: mediaType, file_path: actualPath, storage_path: actualPath, storage_bucket: 'vault', blurred_thumbnail_path: uploadResult.thumbnailPath ?? null, allow_screenshot: false, allow_save: settings?.vault_allow_save_default ?? false, allow_share: settings?.vault_allow_share_default ?? false, chat_message_id: null };
      const { error: dbError } = await supabase.from('vault_items').insert(insertPayload);
      if (dbError) { supabase.storage.from('vault').remove([actualPath]).catch(() => {}); throw new Error(`Media uploaded but failed to save — ${dbError.message}`); }
      awardPoints(couple.id, user.id, 5, 'Vault media added'); notifyPartner({ event_type: 'new_vault_item', couple_id: couple.id, target_route: '/(app)/(tabs)/vault', partnerUserId: partnerProfile?.id }); await load(); InteractionManager.runAfterInteractions(() => scrollViewRef.current?.scrollTo({ y: 0, animated: true }));
    } catch (e: any) { Alert.alert('Upload Failed', e?.message ?? 'Something went wrong. Please try again.'); }
    finally { stopSpin(); setUploading(false); setUploadPct(0); }
  };

  useFocusEffect(useCallback(() => {
    if (!cameraActiveRef.current) return;
    const captured = consumeCameraCaptureResult(); cameraActiveRef.current = false; if (!captured) return;
    logDebugEvent('VAULT PICK', { source: 'in_app_camera', mediaType: captured.mediaType, mimeType: captured.mimeType, uriPrefix: captured.uri.substring(0, 12), userId: user?.id ?? null, coupleId: couple?.id ?? null });
    uploadToVault(captured.uri, captured.mediaType, captured.mimeType);
  }, [user?.id, couple?.id]));

  const handlePickFromLibrary = async () => {
    setShowAdd(false);
    try {
      const ImagePicker = await import('expo-image-picker'); const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Photo Library Access Required', 'Allow access to your photo library in Settings to add media to the Vault.', [{ text: 'Open Settings', onPress: () => Linking.openSettings() }, { text: 'Cancel', style: 'cancel' }]); return; }
      const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS); if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0]; const isVideo = asset.type === 'video'; const mimeType = resolveAssetMimeType(asset);
      await uploadToVault(asset.uri, isVideo ? 'video' : 'photo', mimeType);
    } catch (e: any) { setUploading(false); Alert.alert('Upload Failed', e?.message ?? 'Something went wrong. Please try again.'); }
  };

  const handleOpenCamera = (mode: 'photo' | 'video' = 'photo') => { if (Platform.OS === 'web') return; setShowAdd(false); cameraActiveRef.current = true; router.push({ pathname: '/(app)/camera-capture', params: { mode } }); };
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const unviewed = items.filter(i => i.uploaded_by_user_id !== user?.id && !i.viewed_by_partner).length;

  if (vaultFaceIdRequired && !vaultUnlocked) {
    return <AppShell scrollable={false}><View style={styles.vaultGate}><LinearGradient colors={['#07070A', '#0D0D12']} style={StyleSheet.absoluteFill} /><Shield color="#FF2E8A" size={48} strokeWidth={1.5} /><AppText style={styles.vaultGateTitle}>Vault is Locked</AppText><AppText style={styles.vaultGateSub}>Biometric verification required to view Vault content.</AppText>{vaultAuthError ? <AppText style={styles.vaultGateError}>{vaultAuthError}</AppText> : null}<TouchableOpacity style={styles.vaultGateBtn} onPress={unlockVault} activeOpacity={0.8}><AppText style={styles.vaultGateBtnText}>Unlock Vault</AppText></TouchableOpacity></View></AppShell>;
  }

  return (
    <AppShell scrollable={false}>
      <TabHeader title={selectMode ? `${selectedIds.size} selected` : (unviewed > 0 ? `Vault  ·  ${unviewed} new` : 'Vault')} rightSlot={items.length > 0 ? (selectMode ? <TouchableOpacity onPress={exitSelectMode}><X color="#FF2E8A" size={22} /></TouchableOpacity> : <TouchableOpacity onPress={enterSelectMode}><AppText style={styles.selectBtnText}>Select</AppText></TouchableOpacity>) : null} />
      <ScrollView ref={scrollViewRef} contentContainerStyle={[styles.scroll, { paddingHorizontal: contentPadding }]} showsVerticalScrollIndicator={false} onScroll={(e) => { const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent; if (loadingMore || !hasMore) return; if (contentSize.height - layoutMeasurement.height - contentOffset.y < 200) loadMore(); }} scrollEventThrottle={64} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF2E8A" />}>
        <View style={styles.vaultHeader}><Shield color="#FF2E8A" size={14} /><AppText style={[styles.vaultHeaderText, { color: colors.textSecondary }]}>Protected Media{items.length > 0 ? `  ·  ${thumbnailsVisible ? 'Tap any item to expand or blur.' : 'Tap any item to view.'}` : ''}</AppText></View>
        {items.length === 0 ? <View style={styles.empty}><View style={styles.emptyIconWrap}><Shield color="rgba(255,255,255,0.20)" size={48} /></View><AppText style={[styles.emptyTitle, { color: colors.text }]}>Nothing yet</AppText><AppText style={[styles.emptySub, { color: colors.textSecondary }]}>Something new is waiting. Add your first private moment.</AppText></View> :
          <View style={styles.grid}>{items.map(item => {
            const isNew = item.uploaded_by_user_id !== user?.id && !item.viewed_by_partner; const url = thumbUrls[item.id] ?? signedUrls[item.id]; const uniqueEmojis = [...new Set((vaultReactionsMap[item.id] ?? []).map(r => r.emoji))].slice(0, 2);
            return <View key={item.id} style={{ position: 'relative' }}><TouchableOpacity ref={ref => { tileRefs.current[item.id] = ref as any; }} style={[styles.gridItem, { width: ITEM_SIZE, height: ITEM_SIZE }]} onPress={() => selectMode ? toggleSelection(item.id) : handleTilePress(item)} onLongPress={() => selectMode ? undefined : handleVaultLongPress(item)} delayLongPress={400} activeOpacity={0.85}>
              {url ? <Image source={{ uri: url }} style={[StyleSheet.absoluteFill, { borderRadius: Radius.sm }]} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={item.id} /> : <View style={[StyleSheet.absoluteFill, styles.gridPlaceholder]}><ActivityIndicator color="rgba(255,255,255,0.25)" size="small" /></View>}
              {!thumbnailsVisible && <BlurView intensity={80} tint="dark" style={[StyleSheet.absoluteFill, styles.blurOverlay]}><EyeOff color="rgba(255,255,255,0.7)" size={20} /></BlurView>}
              {thumbnailsVisible && item.media_type === 'video' && <View style={styles.videoBadge}><Play color="#fff" size={10} fill="#fff" /></View>}
              {isNew && <View style={styles.newDot} />}{!item.allow_screenshot && <View style={styles.shieldBadge}><Shield color="rgba(255,255,255,0.8)" size={10} /></View>}
              {thumbnailsVisible && uniqueEmojis.length > 0 && <View style={styles.tileReactionRow}>{uniqueEmojis.map(emoji => <View key={emoji} style={styles.tileReactionPill}><AppText style={styles.tileReactionEmoji}>{emoji}</AppText></View>)}</View>}
              {item.id === highlightedVaultId && <View style={[StyleSheet.absoluteFill, styles.tileHighlight]} pointerEvents="none" />}
              {selectMode && <View style={[styles.selectCheck, selectedIds.has(item.id) && styles.selectCheckActive]}>{selectedIds.has(item.id) && <Check color="#fff" size={14} />}</View>}
            </TouchableOpacity></View>;
          })}{loadingMore && <View style={{ width: '100%', paddingVertical: Spacing.lg, alignItems: 'center' }}><ActivityIndicator color="rgba(255,255,255,0.25)" size="small" /></View>}</View>}
      </ScrollView>

      {activeVaultItemId && vaultMenuAnchor && (() => {
        const activeItem = items.find(i => i.id === activeVaultItemId); if (!activeItem) return null; const activeReactions = vaultReactionsMap[activeVaultItemId] ?? [];
        const pillW = vaultPillSize?.w ?? 0, pillH = vaultPillSize?.h ?? 0, gap = 16, safeTop = insets.top + 8; const centeredLeft = vaultMenuAnchor.x + vaultMenuAnchor.width / 2 - pillW / 2; const left = vaultPillSize ? Math.max(8, Math.min(centeredLeft, width - pillW - 8)) : -9999; const top = vaultPillSize ? (vaultMenuAnchor.y < screenHeight * 0.25 ? vaultMenuAnchor.y + vaultMenuAnchor.height + gap : Math.max(safeTop, vaultMenuAnchor.y - pillH - gap)) : -9999;
        const dismissAll = () => { setActiveVaultItemId(null); setVaultMenuAnchor(null); setVaultPillSize(null); };
        return <View style={[StyleSheet.absoluteFill, { zIndex: 9998 }]} pointerEvents="box-none"><View style={{ position: 'absolute', left, top }} onLayout={e => { const { width: w, height: h } = e.nativeEvent.layout; if (w > 0 && h > 0) setVaultPillSize({ w, h }); }}><MediaActionRow reactions={activeReactions} myUserId={user?.id} isMedia isInVault isMine={activeItem.uploaded_by_user_id === user?.id} screenWidth={width} onReact={emoji => { dismissAll(); reactOnVaultItem(activeItem.id, emoji, activeItem.uploaded_by_user_id, activeItem.id); }} onAlreadyInVault={dismissAll} onDelete={() => { dismissAll(); setTimeout(() => handleDeleteItem(activeItem), 50); }} onDismiss={dismissAll} /></View></View>;
      })()}

      {uploading && <View style={styles.uploadOverlay}><View style={[styles.uploadCard, { backgroundColor: colors.card }]}><ActivityIndicator color="#FF2E8A" size="large" /><AppText style={[styles.uploadText, { color: colors.text }]}>Uploading to Vault…</AppText>{uploadPct > 0 && <AppText style={styles.uploadPct}>{uploadPct}%</AppText>}<AppText style={[styles.uploadSub, { color: colors.textMuted }]}>This will not be saved to your device.</AppText></View></View>}

      {selectMode && <View style={[styles.bulkBar, { bottom: insets.bottom + Spacing.lg }]}><TouchableOpacity style={styles.bulkSelectAllBtn} onPress={() => setSelectedIds(selectedIds.size === items.length ? new Set() : new Set(items.map(i => i.id)))}><AppText style={styles.bulkSelectAllText}>{selectedIds.size === items.length && items.length > 0 ? 'Deselect All' : 'Select All'}</AppText></TouchableOpacity><TouchableOpacity style={[styles.bulkDeleteBtn, selectedIds.size === 0 && { opacity: 0.4 }]} onPress={handleBulkDelete} disabled={selectedIds.size === 0}><Trash2 color="#fff" size={16} /><AppText style={styles.bulkDeleteText}>{selectedIds.size > 0 ? `Delete ${selectedIds.size}` : 'Delete'}</AppText></TouchableOpacity></View>}

      {!selectMode && <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + Spacing.lg }]} onPress={() => setShowAdd(true)} activeOpacity={0.88}><LinearGradient colors={['#FF5A3D', '#FF2E8A']} style={styles.fabGrad}><Plus color="#fff" size={24} /></LinearGradient></TouchableOpacity>}

      <BottomSheet visible={showAdd} onClose={() => setShowAdd(false)} title="Add to Vault" subtitle="Privacy defaults will apply"><View style={styles.sheetContent}><View style={styles.defaultsRow}><Shield color="#FF2E8A" size={16} /><AppText style={[styles.defaultsText, { color: colors.textSecondary }]}>Save: {settings?.vault_allow_save_default ? 'On' : 'Off'}  ·  Share: {settings?.vault_allow_share_default ? 'On' : 'Off'}</AppText></View><TouchableOpacity onPress={() => { setShowAdd(false); router.push({ pathname: '/(app)/account', params: { tab: 'settings', section: 'vault' } }); }} style={styles.manageLink}><Settings color="#FF2E8A" size={14} /><AppText style={styles.manageLinkText}>Manage in My Profile</AppText></TouchableOpacity><View style={styles.pickerRow}><TouchableOpacity style={[styles.pickerBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]} onPress={handlePickFromLibrary}><ImageIcon color="#FF2E8A" size={24} /><AppText style={[styles.pickerLabel, { color: colors.text }]}>Photo Library</AppText><AppText style={[styles.pickerSub, { color: colors.textMuted }]}>Choose existing</AppText></TouchableOpacity>{Platform.OS !== 'web' && <TouchableOpacity style={[styles.pickerBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]} onPress={() => handleOpenCamera('photo')}><Camera color="#FF8A3D" size={24} /><AppText style={[styles.pickerLabel, { color: colors.text }]}>Camera</AppText><AppText style={[styles.pickerSub, { color: colors.textMuted }]}>Photo or video · flash off</AppText></TouchableOpacity>}</View><SecondaryButton label="Cancel" onPress={() => setShowAdd(false)} style={{ marginTop: Spacing.sm }} /></View></BottomSheet>
      <ConfirmSheet visible={!!confirmSheet} title={confirmSheet?.title ?? ''} message={confirmSheet?.message} actions={confirmSheet?.actions ?? []} onDismiss={() => setConfirmSheet(null)} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  vaultHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md },
  vaultHeaderText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  gridItem: { borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  gridPlaceholder: { borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  blurOverlay: { alignItems: 'center', justifyContent: 'center' },
  videoBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: 4 },
  newDot: { position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF2E8A', borderWidth: 2, borderColor: '#050507' },
  shieldBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: 3 },
  tileReactionRow: { position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', gap: 2 },
  tileReactionPill: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 5, paddingVertical: 2 },
  tileReactionEmoji: { fontSize: 12, lineHeight: 16 },
  tileHighlight: { borderRadius: Radius.sm, backgroundColor: 'rgba(255,179,71,0.22)', borderWidth: 2, borderColor: 'rgba(255,179,71,0.60)' },
  empty: { alignItems: 'center', paddingTop: 80, gap: Spacing.lg },
  emptyIconWrap: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  emptyTitle: { fontSize: FontSize.xl, fontFamily: 'Inter-Bold' },
  emptySub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', maxWidth: 260, lineHeight: 22 },
  fab: { position: 'absolute', right: Spacing.xl, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', shadowColor: '#FF2E8A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8 },
  fabGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheetContent: { paddingBottom: Spacing.md },
  pickerRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  pickerBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.xl, paddingHorizontal: Spacing.md },
  pickerLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  pickerSub: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', textAlign: 'center' },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 99, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  uploadCard: { borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md, width: '100%', maxWidth: 300 },
  uploadText: { fontSize: FontSize.md, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  uploadSub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20 },
  uploadPct: { fontSize: 11, fontFamily: 'Inter-Bold', color: '#FF2E8A' },
  defaultsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,46,138,0.18)', backgroundColor: 'rgba(255,46,138,0.06)', padding: Spacing.md },
  defaultsText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 18 },
  manageLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md },
  manageLinkText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', color: '#FF2E8A' },
  vaultGate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.md },
  vaultGateTitle: { color: '#fff', fontSize: FontSize.xl, fontFamily: 'Inter-Bold', marginTop: Spacing.md },
  vaultGateSub: { color: 'rgba(255,255,255,0.5)', fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20 },
  vaultGateError: { color: '#FF5A5F', fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  vaultGateBtn: { marginTop: Spacing.md, backgroundColor: '#FF2E8A', borderRadius: Radius.xl, paddingVertical: 14, paddingHorizontal: Spacing.xxl },
  vaultGateBtnText: { color: '#fff', fontSize: FontSize.body, fontFamily: 'Inter-SemiBold' },
  selectBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', color: '#FF2E8A' },
  selectCheck: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  selectCheckActive: { backgroundColor: '#FF2E8A', borderColor: '#FF2E8A' },
  bulkBar: { position: 'absolute', left: Spacing.xl, right: Spacing.xl, flexDirection: 'row', gap: Spacing.sm, zIndex: 100 },
  bulkSelectAllBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: Radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.06)' },
  bulkSelectAllText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', color: 'rgba(255,255,255,0.8)' },
  bulkDeleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.pill, backgroundColor: '#FF3D4F' },
  bulkDeleteText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', color: '#fff' },
});