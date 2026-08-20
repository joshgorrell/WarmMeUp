import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Modal,
  Platform,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TriangleAlert as AlertTriangle, Archive, Camera, Check, ChevronLeft, Download, Pause, Play, Share2, Trash2, Volume2, VolumeX } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { awardPoints } from '@/lib/points';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { evictCachedUrl, GalleryItem, getGalleryItems } from '@/lib/mediaGalleryStore';
import { clearLocalImageCache } from '@/lib/mediaCache';
import { extensionToMime, mimeToExtension, uploadMediaFile } from '@/lib/uploadMedia';
import { ZoomablePhoto } from '@/components/note/ZoomablePhoto';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

type MediaPageProps = {
  item: GalleryItem;
  isActive: boolean;
  screenWidth: number;
  screenHeight: number;
  insetTop: number;
  insetBottom: number;
  user: any;
  couple: any;
};

function MediaPage({
  item,
  isActive,
  screenWidth,
  screenHeight,
  insetTop,
  insetBottom,
  user,
  couple,
}: MediaPageProps) {
  const isVideo = item.mediaType === 'video';
  const canScreenshot = item.allowScreenshot;
  const canShare = item.allowShare;
  const canSave = item.allowSave;
  // Saving inside Warm Me Up is not the same as exporting/downloading to the device.
  // Internal saves must preserve the original sender permissions rather than reinterpret them.
  const showSaveToVault = !!item.interactionId;

  const [mediaUri, setMediaUri] = useState<string | null>(item.signedUri ?? null);
  const [loading, setLoading] = useState(!item.signedUri);
  const [mediaError, setMediaError] = useState(false);
  const retryAttemptedRef = useRef(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [screenshotWarning, setScreenshotWarning] = useState(false);
  const [savedToVault, setSavedToVault] = useState(false);
  const [savingToVault, setSavingToVault] = useState(false);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const mountedRef = useRef(true);
  const appStateRef = useRef(AppState.currentState);
  const lastInactiveAt = useRef<number | null>(null);
  const player = useVideoPlayer(mediaUri ? { uri: mediaUri } : null, (p) => {
    p.loop = false;
  });

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    if (!isActive) {
      setVideoPlaying(false);
      player.pause();
    }
  }, [isActive, player]);

  useEffect(() => {
    if (!item.storagePath || !isActive) return;
    let cancelled = false;
    setMediaError(false);
    retryAttemptedRef.current = false;

    // If we already have a valid signed URL from the chat, use it immediately
    // and refresh in the background. Only show a loading state if we have no URL.
    if (item.signedUri) {
      setMediaUri(item.signedUri);
      setLoading(false);
    } else {
      setLoading(true);
    }

    supabase.storage
      .from(item.storageBucket ?? 'vault')
      .createSignedUrl(item.storagePath, 12 * 60 * 60)
      .then(({ data, error }) => {
        if (cancelled || !mountedRef.current) return;
        if (error || !data?.signedUrl) {
          // Only show error if we don't already have a working URL
          if (!item.signedUri) {
            setMediaError(true);
            setLoading(false);
          }
          return;
        }
        setMediaUri(data.signedUrl);
        setMediaError(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item.storagePath, item.storageBucket, item.signedUri, isActive]);

  useEffect(() => {
    if (!mediaUri || Platform.OS === 'web') return;
    player.replaceAsync({ uri: mediaUri });
  }, [mediaUri, player]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = player.addListener('statusChange', (payload: any) => {
      if (payload.status === 'readyToPlay') {
        setLoading(false);
      } else if (payload.status === 'error') {
        setLoading(false);
        setMediaError(true);
        setVideoPlaying(false);
      }
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    player.muted = muted;
  }, [muted, player]);

  const handleScreenshotDetected = useCallback(async () => {
    if (!item.coupleId || !user?.id) return;
    if (canScreenshot) return;
    setScreenshotWarning(true);
    if (item.interactionId) {
      await supabase
        .from('interactions')
        .update({ screenshot_detected: true })
        .eq('id', item.interactionId);
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) {
        await fetch(`${SUPABASE_URL}/functions/v1/notify-screenshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            vault_item_id: item.id,
            couple_id: item.coupleId,
            detected_by_user_id: user.id,
            source_screen: item.storageBucket === 'vault' ? 'vault' : 'chat',
          }),
        });
      }
    } catch {}
  }, [item, user?.id, canScreenshot]);

  useEffect(() => {
    if (Platform.OS === 'web' || !isActive) return;
    const sub = AppState.addEventListener('change', nextState => {
      const prev = appStateRef.current;
      if (prev === 'active' && nextState === 'inactive') {
        lastInactiveAt.current = Date.now();
      }
      if (prev === 'inactive' && nextState === 'active') {
        const elapsed = lastInactiveAt.current ? Date.now() - lastInactiveAt.current : 999;
        if (elapsed < 400) handleScreenshotDetected();
        lastInactiveAt.current = null;
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [isActive, handleScreenshotDetected]);

  const handleShare = useCallback(async () => {
    if (!canShare || !mediaUri) return;
    try {
      await Share.share({ url: mediaUri, message: mediaUri });
    } catch {}
  }, [canShare, mediaUri]);

  const handleSaveToVault = useCallback(async () => {
    if (!couple?.id || !user?.id || !item.storagePath || !mediaUri || savingToVault || savedToVault) return;
    setSavingToVault(true);
    try {
      const sourceExt = item.storagePath.split('.').pop()?.toLowerCase() ?? '';
      const sourceMime = isVideo ? extensionToMime(sourceExt) : 'image/jpeg';
      const ext = mimeToExtension(sourceMime);
      const requestedPath = `${couple.id}/${user.id}/${Date.now()}.${ext}`;
      const uploadResult = await uploadMediaFile(
        mediaUri,
        'vault',
        requestedPath,
        sourceMime,
        undefined,
        user.id,
        couple.id,
      );

      const { data, error } = await supabase
        .from('vault_items')
        .insert({
          couple_id: couple.id,
          uploaded_by_user_id: user.id,
          media_type: isVideo ? 'video' : 'photo',
          file_path: uploadResult.storagePath,
          storage_path: uploadResult.storagePath,
          storage_bucket: 'vault',
          blurred_thumbnail_path: uploadResult.thumbnailPath ?? null,
          // Preserve the original sender's permissions exactly.
          allow_screenshot: canScreenshot,
          allow_save: canSave,
          allow_share: canShare,
          screenshot_detected: false,
          viewed_by_partner: false,
        })
        .select()
        .single();

      if (error) {
        supabase.storage.from('vault').remove([uploadResult.storagePath]).catch(() => {});
        throw error;
      }
      if (data) {
        await awardPoints(couple.id, user.id, 5, 'Saved chat media to Vault', data.id);
        if (mountedRef.current) setSavedToVault(true);
      }
    } catch (e: any) {
      Alert.alert('Vault Save Failed', e?.message ?? 'Could not save this media to the Vault.');
    } finally {
      if (mountedRef.current) setSavingToVault(false);
    }
  }, [
    couple?.id,
    user?.id,
    item.storagePath,
    mediaUri,
    savingToVault,
    savedToVault,
    isVideo,
    canScreenshot,
    canSave,
    canShare,
  ]);

  const toggleVideo = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        const v = webVideoRef.current;
        if (!v) return;
        if (videoPlaying) { v.pause(); setVideoPlaying(false); }
        else { await v.play(); setVideoPlaying(true); }
      } else {
        if (videoPlaying) { player.pause(); setVideoPlaying(false); }
        else { player.play(); setVideoPlaying(true); }
      }
    } catch {
      setMediaError(true);
      setVideoPlaying(false);
    }
  }, [videoPlaying, player]);

  const availableHeight = screenHeight - insetTop - insetBottom - 92;
  const formattedTimestamp = (() => {
    if (!item.createdAt) return null;
    try {
      const d = new Date(item.createdAt);
      const date = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return item.uploaderName ? `${item.uploaderName} · ${date} · ${time}` : `${date} · ${time}`;
    } catch {
      return null;
    }
  })();

  return (
    <View style={[styles.page, { width: screenWidth, height: screenHeight }]}>
      <View style={[styles.mediaStage, { width: screenWidth, height: availableHeight, marginTop: insetTop + 46 }]}>
        {!mediaUri && !mediaError && <ActivityIndicator color="#fff" size="large" />}

        {mediaUri && !isVideo && !mediaError && (
          <ZoomablePhoto
            key={mediaUri}
            uri={mediaUri}
            width={screenWidth}
            height={availableHeight}
            onLoad={() => setLoading(false)}
            onError={() => {
              if (retryAttemptedRef.current || !item.storagePath) {
                setLoading(false);
                setMediaError(true);
                return;
              }
              retryAttemptedRef.current = true;
              supabase.storage
                .from(item.storageBucket ?? 'vault')
                .createSignedUrl(item.storagePath, 12 * 60 * 60)
                .then(({ data }) => {
                  if (mountedRef.current && data?.signedUrl) setMediaUri(data.signedUrl);
                  else if (mountedRef.current) { setLoading(false); setMediaError(true); }
                })
                .catch(() => { if (mountedRef.current) { setLoading(false); setMediaError(true); } });
            }}
          />
        )}

        {mediaUri && isVideo && !mediaError && (
          <View style={{ width: screenWidth, height: availableHeight }}>
            {Platform.OS === 'web' ? (
              <video
                ref={webVideoRef as any}
                src={mediaUri}
                style={{ width: screenWidth, height: availableHeight, objectFit: 'contain' }}
                playsInline
                controls={false}
                muted={muted}
                preload="metadata"
                onLoadedMetadata={() => setLoading(false)}
                onError={() => { setLoading(false); setMediaError(true); setVideoPlaying(false); }}
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
              />
            ) : (
              <VideoView
                player={player}
                style={{ width: screenWidth, height: availableHeight }}
                contentFit="contain"
                nativeControls={false}
                onFirstFrameRender={() => setLoading(false)}
              />
            )}
            {!loading && (
              <TouchableOpacity style={styles.videoPlayButton} onPress={toggleVideo} activeOpacity={0.8}>
                <View style={styles.videoPlayButtonInner}>
                  {videoPlaying ? <Pause color="#fff" size={28} /> : <Play color="#fff" size={28} fill="#fff" />}
                </View>
              </TouchableOpacity>
            )}
            {!loading && (
              <TouchableOpacity style={styles.muteButton} onPress={() => setMuted(v => !v)} activeOpacity={0.8}>
                {muted ? <VolumeX color="#fff" size={20} /> : <Volume2 color="#fff" size={20} />}
              </TouchableOpacity>
            )}
          </View>
        )}

        {loading && mediaUri && !mediaError && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}

        {mediaError && (
          <View style={styles.errorWrap}>
            <AlertTriangle color="#FFB347" size={28} />
            <AppText style={styles.errorText}>
              {isVideo ? 'Video could not be played.' : 'Photo could not be loaded.'}
            </AppText>
          </View>
        )}
      </View>

      {formattedTimestamp ? (
        <View style={[styles.timestampWrap, { top: insetTop + 14 }]} pointerEvents="none">
          <AppText style={styles.timestamp}>{formattedTimestamp}</AppText>
        </View>
      ) : null}

      <View style={[styles.bottomBar, { paddingBottom: insetBottom + 10 }]} pointerEvents="box-none">
        {showSaveToVault && (
          <TouchableOpacity
            style={[styles.saveButton, savedToVault && styles.saveButtonDone]}
            onPress={handleSaveToVault}
            disabled={savingToVault || savedToVault}
            activeOpacity={0.8}
          >
            {savingToVault ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : savedToVault ? (
              <>
                <Check color="#4CAF50" size={16} />
                <AppText style={[styles.saveText, { color: '#4CAF50' }]}>Saved to Vault</AppText>
              </>
            ) : (
              <>
                <Archive color="#FF8A3D" size={16} />
                <AppText style={styles.saveText}>Save to Vault</AppText>
              </>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.permissionRow}>
          <PermissionBadge
            icon={<Camera color={canScreenshot ? '#FF2E8A' : 'rgba(255,255,255,0.35)'} size={14} />}
            label={canScreenshot ? 'Screenshot OK' : 'Screenshot restricted'}
            allowed={canScreenshot}
          />
          <PermissionBadge
            icon={<Download color={canSave ? '#FF2E8A' : 'rgba(255,255,255,0.35)'} size={14} />}
            label={canSave ? 'Device save OK' : 'No downloads'}
            allowed={canSave}
          />
          {canShare ? (
            <TouchableOpacity onPress={handleShare} activeOpacity={0.8}>
              <PermissionBadge icon={<Share2 color="#FF2E8A" size={14} />} label="Share" allowed />
            </TouchableOpacity>
          ) : (
            <PermissionBadge icon={<Share2 color="rgba(255,255,255,0.35)" size={14} />} label="No sharing" allowed={false} />
          )}
        </View>
      </View>

      <Modal visible={screenshotWarning} transparent animationType="fade" onRequestClose={() => setScreenshotWarning(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <AlertTriangle color="#FFB347" size={34} />
            <AppText style={styles.modalTitle}>Screenshot Detected</AppText>
            <AppText style={styles.modalBody}>Screenshots of this item are restricted. Your partner has been notified.</AppText>
            <TouchableOpacity style={styles.modalButton} onPress={() => setScreenshotWarning(false)}>
              <AppText style={styles.modalButtonText}>Got it</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function VaultViewerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useLayout();
  const { user, couple } = useAuth();
  const params = useLocalSearchParams<any>();

  const storedItems = getGalleryItems();
  const fallbackItems: GalleryItem[] = params.storagePath
    ? [{
        id: params.id ?? '',
        storagePath: params.storagePath,
        storageBucket: params.storageBucket ?? 'vault',
        coupleId: params.coupleId ?? null,
        mediaType: params.mediaType ?? 'photo',
        allowScreenshot: params.allowScreenshot === '1',
        allowSave: params.allowSave === '1',
        allowShare: params.allowShare === '1',
        interactionId: params.interactionId ?? null,
        createdAt: params.createdAt ?? null,
        uploaderName: params.uploaderName ?? null,
        signedUri: params.signedUri && params.signedUri !== 'undefined' ? params.signedUri : null,
        thumbUri: null,
      }]
    : [];

  const initialItems = storedItems.length > 0 ? storedItems : fallbackItems;
  const requestedIndex = parseInt(params.initialIndex ?? '0', 10) || 0;
  const initialIndex = Math.min(Math.max(0, requestedIndex), Math.max(0, initialItems.length - 1));

  const [items, setItems] = useState<GalleryItem[]>(initialItems);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef<FlatList<GalleryItem>>(null);

  const activeItem = items[activeIndex] ?? null;
  const canDeleteFromVault = !!activeItem?.id && (activeItem.storageBucket ?? 'vault') === 'vault';

  const performDeleteActive = useCallback(async () => {
    const item = items[activeIndex];
    if (!item?.id || deleting) return;
    setDeleting(true);
    try {
      let query = supabase
        .from('vault_items')
        .select('id, couple_id, storage_path, file_path, storage_bucket, blurred_thumbnail_path')
        .eq('id', item.id);
      if (item.coupleId) query = query.eq('couple_id', item.coupleId);

      const { data: row, error: fetchError } = await query.maybeSingle();
      if (fetchError) throw fetchError;
      if (!row) throw new Error('This item is no longer available in the Vault.');

      const deletedAt = new Date().toISOString();
      let deleteQuery = supabase.from('vault_items').update({ deleted_at: deletedAt }).eq('id', item.id);
      if (row.couple_id) deleteQuery = deleteQuery.eq('couple_id', row.couple_id);
      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;

      const bucket = row.storage_bucket ?? 'vault';
      const paths = [row.storage_path ?? row.file_path, row.blurred_thumbnail_path].filter(Boolean) as string[];
      if (paths.length > 0) {
        await supabase.storage.from(bucket).remove(paths).catch(() => {});
        paths.forEach(evictCachedUrl);
        clearLocalImageCache().catch(() => {});
      }

      if (item.chatMessageId) {
        const { data: chatMsg } = await supabase
          .from('chat_messages')
          .select('media_storage_path, media_storage_bucket')
          .eq('id', item.chatMessageId)
          .maybeSingle();
        await supabase
          .from('chat_messages')
          .update({ deleted_at: deletedAt })
          .eq('id', item.chatMessageId);
        if (chatMsg?.media_storage_path) {
          supabase.storage.from(chatMsg.media_storage_bucket ?? 'chat_media').remove([chatMsg.media_storage_path]).catch(() => {});
        }
      }

      const nextItems = items.filter((_, index) => index !== activeIndex);
      if (nextItems.length === 0) {
        router.back();
        return;
      }
      const nextIndex = Math.min(activeIndex, nextItems.length - 1);
      setItems(nextItems);
      setActiveIndex(nextIndex);
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index: nextIndex, animated: false });
      });
    } catch (e: any) {
      Alert.alert('Delete Failed', e?.message ?? 'Could not delete this Vault item.');
    } finally {
      setDeleting(false);
    }
  }, [items, activeIndex, deleting, router]);

  const confirmDeleteActive = useCallback(() => {
    if (!canDeleteFromVault || deleting) return;
    const noun = activeItem?.mediaType === 'video' ? 'video' : 'photo';
    const linkedChatNote = activeItem?.chatMessageId
      ? '\n\nThis item was sent from Chat — it will also be hidden from your Chat history.'
      : '';
    Alert.alert(
      'Delete from Vault?',
      `This permanently removes this ${noun} from the Vault for both of you. This cannot be undone.${linkedChatNote}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDeleteActive },
      ],
    );
  }, [canDeleteFromVault, deleting, activeItem?.mediaType, activeItem?.chatMessageId, performDeleteActive]);

  const getItemLayout = useCallback((_: ArrayLike<GalleryItem> | null | undefined, index: number) => ({
    length: screenWidth,
    offset: screenWidth * index,
    index,
  }), [screenWidth]);

  if (items.length === 0) {
    return (
      <View style={styles.emptyViewer}>
        <TouchableOpacity style={[styles.backButton, { top: insets.top + 8 }]} onPress={() => router.back()}>
          <ChevronLeft color="#fff" size={24} />
        </TouchableOpacity>
        <AppText style={styles.emptyText}>Media unavailable</AppText>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item, index) => item.id || String(index)}
        horizontal
        pagingEnabled
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex > 0 ? initialIndex : undefined}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        getItemLayout={getItemLayout}
        renderItem={({ item, index }) => (
          <MediaPage
            item={item}
            isActive={index === activeIndex}
            screenWidth={screenWidth}
            screenHeight={screenHeight}
            insetTop={insets.top}
            insetBottom={insets.bottom}
            user={user}
            couple={couple}
          />
        )}
        onMomentumScrollEnd={event => {
          const nextIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
          setActiveIndex(Math.min(Math.max(0, nextIndex), items.length - 1));
        }}
        style={{ width: screenWidth, height: screenHeight }}
      />

      <View style={[styles.topControls, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.topButton} onPress={() => router.back()} activeOpacity={0.8}>
          <ChevronLeft color="#fff" size={24} />
        </TouchableOpacity>

        {items.length > 1 ? (
          <View style={styles.counter} pointerEvents="none">
            <AppText style={styles.counterText}>{activeIndex + 1} / {items.length}</AppText>
          </View>
        ) : <View />}

        {canDeleteFromVault ? (
          <TouchableOpacity style={styles.deleteButton} onPress={confirmDeleteActive} disabled={deleting} activeOpacity={0.8}>
            {deleting ? <ActivityIndicator color="#FF6B6B" size="small" /> : <Trash2 color="#FF6B6B" size={20} />}
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </View>
    </View>
  );
}

function PermissionBadge({ icon, label, allowed }: { icon: React.ReactNode; label: string; allowed: boolean }) {
  return (
    <View style={[styles.permissionBadge, { borderColor: allowed ? 'rgba(255,46,138,0.35)' : 'rgba(255,255,255,0.12)' }]}>
      {icon}
      <AppText style={[styles.permissionLabel, { color: allowed ? '#fff' : 'rgba(255,255,255,0.45)' }]}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  page: { backgroundColor: '#000' },
  mediaStage: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  errorWrap: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 30 },
  errorText: { color: 'rgba(255,255,255,0.72)', fontSize: FontSize.sm, textAlign: 'center' },
  videoPlayButton: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  videoPlayButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteButton: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timestampWrap: { position: 'absolute', left: 58, right: 58, alignItems: 'center' },
  timestamp: { color: 'rgba(255,255,255,0.55)', fontSize: 11, textAlign: 'center' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
    gap: 8,
  },
  saveButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,138,61,0.4)',
    backgroundColor: 'rgba(255,138,61,0.12)',
  },
  saveButtonDone: { borderColor: 'rgba(76,175,80,0.35)', backgroundColor: 'rgba(76,175,80,0.10)' },
  saveText: { color: '#FF8A3D', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  permissionRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  permissionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  permissionLabel: { fontSize: 11, fontFamily: 'Inter-Medium' },
  topControls: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(70,0,0,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  counterText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-SemiBold' },
  emptyViewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  backButton: {
    position: 'absolute',
    left: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: 'rgba(255,255,255,0.55)', fontSize: FontSize.sm },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: Radius.xl,
    backgroundColor: '#1A1114',
    borderWidth: 1,
    borderColor: 'rgba(255,179,71,0.25)',
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  modalTitle: { color: '#fff', fontSize: FontSize.lg, fontFamily: 'Inter-Bold' },
  modalBody: { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  modalButton: {
    marginTop: 4,
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,179,71,0.35)',
  },
  modalButtonText: { color: '#FFB347', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
});
