import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform, Share, Image, AppState, Modal,
} from 'react-native';
import AppText from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, Camera, Share2, Play, Pause, Volume2, VolumeX,
  TriangleAlert as AlertTriangle, Archive, Check,
} from 'lucide-react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { awardPoints } from '@/lib/points';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export default function VaultViewerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useLayout();
  const { user, couple, settings } = useAuth();

  const {
    id: itemId,
    storagePath,
    storageBucket,
    coupleId,
    mediaType,
    allowScreenshot,
    allowShare,
    allowSave,
    interactionId,
  } = useLocalSearchParams<{
    id: string;
    storagePath: string;
    storageBucket: string;
    coupleId: string;
    mediaType: string;
    allowScreenshot: string;
    allowSave: string;
    allowShare: string;
    interactionId?: string;
  }>();

  const isVideo = mediaType === 'video';
  const canScreenshot = allowScreenshot === '1';
  const canShare = allowShare === '1';
  const canSave = allowSave === '1';
  const showSaveToVault = !!interactionId && canSave;

  // Resolved short-lived signed URL — generated on mount, never stored in DB or route params
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [screenshotWarning, setScreenshotWarning] = useState(false);
  const [savedToVault, setSavedToVault] = useState(false);
  const [savingToVault, setSavingToVault] = useState(false);
  const videoRef = useRef<any>(null);
  const appState = useRef(AppState.currentState);
  const lastInactiveAt = useRef<number | null>(null);

  const [VideoComponent, setVideoComponent] = useState<React.ComponentType<any> | null>(null);
  const [avLoaded, setAvLoaded] = useState(false);

  // Generate a short-lived (1 hour) signed URL from the storage path.
  // The path is never stored as a token in the database or route params.
  useEffect(() => {
    if (!storagePath) return;
    const bucket = storageBucket ?? 'vault';
    supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 60).then(({ data }) => {
      if (data?.signedUrl) setMediaUri(data.signedUrl);
    });
  }, [storagePath, storageBucket]);

  useEffect(() => {
    if (!isVideo) return;
    let mounted = true;
    (async () => {
      try {
        const { Video, ResizeMode } = await import('expo-av');
        if (!mounted) return;
        setVideoComponent(() => (props: any) => (
          <Video {...props} resizeMode={ResizeMode.CONTAIN} />
        ));
        setAvLoaded(true);
      } catch {
        if (mounted) setVideoError(true);
      }
    })();
    return () => { mounted = false; };
  }, [isVideo]);

  // Screenshot detection via AppState inactive flash
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const sub = AppState.addEventListener('change', nextState => {
      const prev = appState.current;

      if (prev === 'active' && nextState === 'inactive') {
        lastInactiveAt.current = Date.now();
      }

      if (prev === 'inactive' && nextState === 'active') {
        const elapsed = lastInactiveAt.current ? Date.now() - lastInactiveAt.current : 999;
        if (elapsed < 400) {
          handleScreenshotDetected();
        }
        lastInactiveAt.current = null;
      }

      appState.current = nextState;
    });

    return () => sub.remove();
  }, [itemId, interactionId, coupleId, user?.id, canScreenshot]);

  const handleScreenshotDetected = useCallback(async () => {
    if (!coupleId || !user?.id) return;

    if (!canScreenshot) {
      setScreenshotWarning(true);
    }

    // Mark screenshot_detected on the right table
    if (interactionId) {
      await supabase
        .from('interactions')
        .update({ screenshot_detected: true })
        .eq('id', interactionId);
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) {
        await fetch(`${SUPABASE_URL}/functions/v1/notify-screenshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            vault_item_id: itemId,
            couple_id: coupleId,
            detected_by_user_id: user.id,
          }),
        });
      }
    } catch {
      // Best-effort — silent fail
    }
  }, [itemId, interactionId, coupleId, user?.id, canScreenshot]);

  const handleShare = useCallback(async () => {
    if (!canShare || !mediaUri) return;
    try {
      await Share.share({ url: mediaUri, message: mediaUri });
    } catch {}
  }, [canShare, mediaUri]);

  const handleSaveToVault = useCallback(async () => {
    if (!couple?.id || !user?.id || !storagePath || savingToVault || savedToVault) return;
    setSavingToVault(true);
    try {
      // Copy the chat_media file into the vault bucket under the couple/user path
      const ext = isVideo ? 'mp4' : 'jpg';
      const newPath = `${couple.id}/${user.id}/${Date.now()}.${ext}`;

      // Download the file via the short-lived signed URL and re-upload to vault bucket
      if (!mediaUri) return;
      const response = await fetch(mediaUri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('vault')
        .upload(newPath, blob, { contentType: isVideo ? 'video/mp4' : 'image/jpeg', upsert: false });
      if (uploadError) return;

      const { data } = await supabase.from('vault_items').insert({
        couple_id: couple.id,
        uploaded_by_user_id: user.id,
        media_type: isVideo ? 'video' : 'photo',
        file_path: newPath,
        storage_path: newPath,
        storage_bucket: 'vault',
        allow_screenshot: canScreenshot,
        allow_save: canSave,
        allow_share: canShare,
        screenshot_detected: false,
        viewed_by_partner: false,
      }).select().single();
      if (data) {
        await awardPoints(couple.id, user.id, 5, 'Saved chat media to Vault', data.id);
        setSavedToVault(true);
      }
    } catch {
      // silently fail
    }
    setSavingToVault(false);
  }, [couple?.id, user?.id, storagePath, mediaUri, isVideo, canScreenshot, canSave, canShare, savingToVault, savedToVault]);

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (videoPlaying) {
      videoRef.current.pauseAsync?.();
    } else {
      videoRef.current.playAsync?.();
    }
    setVideoPlaying(!videoPlaying);
  };

  const imageArea = Math.min(width, 900);
  const imageHeight = Math.min(Math.round(height * 0.72), 700);

  const mediaLeft = (width - imageArea) / 2;

  return (
    <View style={[styles.root, { backgroundColor: '#000' }]}>
      {/* Full-bleed media */}
      <View style={[styles.mediaWrap, { width: imageArea, height: imageHeight, left: mediaLeft }]}>
        {!mediaUri ? (
          <View style={styles.loader}>
            <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" />
          </View>
        ) : !isVideo ? (
          <>
            {!imageLoaded && (
              <View style={styles.loader}>
                <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" />
              </View>
            )}
            <GestureScrollView
              style={{ width: imageArea, height: imageHeight }}
              contentContainerStyle={{ width: imageArea, height: imageHeight }}
              maximumZoomScale={4}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Image
                source={{ uri: mediaUri ?? undefined }}
                style={{ width: imageArea, height: imageHeight }}
                resizeMode="contain"
                onLoad={() => setImageLoaded(true)}
              />
            </GestureScrollView>
          </>
        ) : (
          <View style={{ width: imageArea, height: imageHeight, alignItems: 'center', justifyContent: 'center' }}>
            {!avLoaded && !videoError && (
              <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" />
            )}
            {videoError && (
              <AppText style={styles.videoErrorText}>Video playback unavailable</AppText>
            )}
            {avLoaded && VideoComponent && (
              <>
                <VideoComponent
                  ref={videoRef}
                  source={{ uri: mediaUri ?? undefined }}
                  style={{ width: imageArea, height: imageHeight }}
                  isMuted={muted}
                  shouldPlay={false}
                  onPlaybackStatusUpdate={(status: any) => {
                    if (status.isLoaded) setVideoPlaying(status.isPlaying);
                  }}
                  onError={() => setVideoError(true)}
                  useNativeControls={Platform.OS === 'web'}
                />
                {Platform.OS !== 'web' && (
                  <View style={styles.videoControls}>
                    <TouchableOpacity onPress={togglePlayPause} style={styles.playBtn} activeOpacity={0.8}>
                      <View style={styles.playBtnInner}>
                        {videoPlaying
                          ? <Pause color="#fff" size={28} strokeWidth={2} />
                          : <Play color="#fff" size={28} strokeWidth={2} />
                        }
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setMuted(!muted)}
                      style={styles.muteBtn}
                      activeOpacity={0.8}
                    >
                      {muted
                        ? <VolumeX color="rgba(255,255,255,0.7)" size={20} />
                        : <Volume2 color="rgba(255,255,255,0.7)" size={20} />
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </View>

      {/* Top gradient + back */}
      <LinearGradient
        colors={['rgba(0,0,0,0.72)', 'transparent']}
        style={[styles.topGradient, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <ChevronLeft color="#fff" size={22} strokeWidth={2.2} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Bottom permission bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.88)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Save to Vault button — only for chat media */}
        {showSaveToVault && (
          <TouchableOpacity
            style={[styles.saveVaultBtn, savedToVault && styles.saveVaultBtnSaved]}
            onPress={handleSaveToVault}
            activeOpacity={0.8}
            disabled={savingToVault || savedToVault}
          >
            {savingToVault ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : savedToVault ? (
              <>
                <Check color="#4CAF50" size={16} />
                <AppText style={[styles.saveVaultText, { color: '#4CAF50' }]}>Saved to Vault</AppText>
              </>
            ) : (
              <>
                <Archive color="#FF8A3D" size={16} />
                <AppText style={styles.saveVaultText}>Save to Vault</AppText>
              </>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.permRow}>
          <PermBadge
            icon={<Camera color={canScreenshot ? '#FF2E8A' : 'rgba(255,255,255,0.28)'} size={16} />}
            label={canScreenshot ? 'Screenshot OK' : 'Partner notified'}
            allowed={canScreenshot}
          />
          <PermBadge
            icon={<Camera color="rgba(255,255,255,0.28)" size={16} />}
            label="Never saved to device"
            allowed={false}
          />
          {canShare ? (
            <TouchableOpacity onPress={handleShare} activeOpacity={0.8}>
              <PermBadge
                icon={<Share2 color="#FF2E8A" size={16} />}
                label="Share"
                allowed
              />
            </TouchableOpacity>
          ) : (
            <PermBadge
              icon={<Share2 color="rgba(255,255,255,0.28)" size={16} />}
              label="No sharing"
              allowed={false}
            />
          )}
        </View>
      </View>

      {/* Screenshot warning modal */}
      <Modal
        visible={screenshotWarning}
        transparent
        animationType="fade"
        onRequestClose={() => setScreenshotWarning(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <AlertTriangle color="#FFB347" size={32} strokeWidth={1.5} />
            </View>
            <AppText style={styles.modalTitle}>Screenshot Detected</AppText>
            <AppText style={styles.modalBody}>
              Screenshots of this item are restricted. Your partner has been notified.
            </AppText>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => setScreenshotWarning(false)}
              activeOpacity={0.8}
            >
              <AppText style={styles.modalBtnText}>Got it</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PermBadge({ icon, label, allowed }: { icon: React.ReactNode; label: string; allowed: boolean }) {
  return (
    <View style={[styles.badge, { borderColor: allowed ? 'rgba(255,46,138,0.35)' : 'rgba(255,255,255,0.12)' }]}>
      {icon}
      <AppText style={[styles.badgeLabel, { color: allowed ? '#fff' : 'rgba(255,255,255,0.35)' }]}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  mediaWrap: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  loader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    paddingHorizontal: Spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingHorizontal: Spacing.xl,
    gap: 10,
  },
  saveVaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,138,61,0.14)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,138,61,0.4)',
    paddingVertical: 12,
    paddingHorizontal: Spacing.xl,
    marginBottom: 4,
  },
  saveVaultBtnSaved: {
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderColor: 'rgba(76,175,80,0.35)',
  },
  saveVaultText: {
    color: '#FF8A3D',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  permRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  badgeLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
  videoControls: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  playBtn: { marginBottom: 12 },
  playBtnInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteBtn: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  videoErrorText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    backgroundColor: '#1A1114',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: 'rgba(255,179,71,0.25)',
  },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,179,71,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  modalBody: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalBtn: {
    marginTop: 4,
    backgroundColor: 'rgba(255,179,71,0.12)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,179,71,0.35)',
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  modalBtnText: {
    color: '#FFB347',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
});
