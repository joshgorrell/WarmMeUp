import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Image as ExpoImage } from 'expo-image';
import { ResizeMode, Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Flashlight, Pause, Play, RefreshCcw, X } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { clearCameraCaptureResult, setCameraCaptureResult } from '@/lib/cameraCaptureStore';
import { cleanupTempFile } from '@/lib/mediaCache';

type Mode = 'photo' | 'video';
type PendingCapture = { uri: string; mediaType: Mode; mimeType: string };

function videoMimeFromUri(uri: string): string {
  const clean = uri.split('?')[0].toLowerCase();
  if (clean.endsWith('.mov') || clean.endsWith('.qt') || clean.endsWith('.m4v')) return 'video/quicktime';
  return 'video/mp4';
}

function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function CameraCaptureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'video' ? 'video' : 'photo');
  const cameraRef = useRef<CameraView>(null);
  const previewVideoRef = useRef<Video>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cameraGeneration, setCameraGeneration] = useState(0);
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  useEffect(() => {
    clearCameraCaptureResult();
    setFlashEnabled(false);
  }, []);

  useEffect(() => {
    if (!cameraPermission?.granted) requestCameraPermission();
  }, [cameraPermission?.granted, requestCameraPermission]);

  useEffect(() => {
    if (mode === 'video' && !micPermission?.granted) requestMicPermission();
  }, [mode, micPermission?.granted, requestMicPermission]);

  useEffect(() => {
    if (!recording) {
      setRecordingSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setRecordingSeconds(current => current + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [recording]);

  const remountCamera = () => setCameraGeneration(v => v + 1);

  const close = () => {
    if (recording) cameraRef.current?.stopRecording();
    if (pendingCapture?.uri) cleanupTempFile(pendingCapture.uri).catch(() => {});
    clearCameraCaptureResult();
    router.back();
  };

  const switchMode = (next: Mode) => {
    if (recording || busy || next === mode || pendingCapture) return;
    setMode(next);
    setFlashEnabled(false);
    remountCamera();
  };

  const switchFacing = () => {
    if (recording || busy || pendingCapture) return;
    setFacing(v => v === 'back' ? 'front' : 'back');
    remountCamera();
  };

  const capture = async () => {
    if (!cameraRef.current || pendingCapture) return;

    if (mode === 'video' && recording) {
      cameraRef.current.stopRecording();
      return;
    }

    if (busy) return;

    try {
      if (mode === 'video') {
        if (!micPermission?.granted) {
          const result = await requestMicPermission();
          if (!result.granted) {
            Alert.alert('Microphone Access Required', 'Allow microphone access to record videos with sound.');
            return;
          }
        }
        setBusy(true);
        setRecordingSeconds(0);
        setRecording(true);
        const result = await cameraRef.current.recordAsync({ maxDuration: 60 });
        setRecording(false);
        if (result?.uri) {
          setPreviewPlaying(false);
          setPendingCapture({ uri: result.uri, mediaType: 'video', mimeType: videoMimeFromUri(result.uri) });
        }
      } else {
        setBusy(true);
        const result = await cameraRef.current.takePictureAsync({ quality: 1 });
        if (result?.uri) setPendingCapture({ uri: result.uri, mediaType: 'photo', mimeType: 'image/jpeg' });
      }
    } catch (e: any) {
      setRecording(false);
      const message = String(e?.message ?? 'Could not capture media.');
      if (message.toLowerCase().includes('not ready')) {
        Alert.alert('Camera Starting', 'The camera is still starting. Please try again in a moment.');
      } else {
        Alert.alert('Camera Error', message);
      }
    } finally {
      setBusy(false);
    }
  };

  const togglePreviewPlayback = async () => {
    if (!previewVideoRef.current) return;
    try {
      if (previewPlaying) {
        await previewVideoRef.current.pauseAsync();
        setPreviewPlaying(false);
      } else {
        const status: any = await previewVideoRef.current.getStatusAsync();
        if (status?.isLoaded && status.didJustFinish) {
          await previewVideoRef.current.setPositionAsync(0);
        }
        await previewVideoRef.current.playAsync();
        setPreviewPlaying(true);
      }
    } catch {
      Alert.alert('Preview Error', 'Could not play this recording.');
    }
  };

  const retake = async () => {
    if (!pendingCapture) return;
    previewVideoRef.current?.pauseAsync().catch(() => {});
    setPreviewPlaying(false);
    await cleanupTempFile(pendingCapture.uri).catch(() => {});
    setPendingCapture(null);
    setFlashEnabled(false);
    remountCamera();
  };

  const useCapture = () => {
    if (!pendingCapture) return;
    previewVideoRef.current?.pauseAsync().catch(() => {});
    setPreviewPlaying(false);
    setCameraCaptureResult(pendingCapture);
    setPendingCapture(null);
    router.back();
  };

  if (!cameraPermission) return <View style={styles.root} />;
  if (!cameraPermission.granted) {
    return <View style={styles.permission}><AppText style={styles.permissionTitle}>Camera access is required</AppText><TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}><AppText style={styles.permissionButtonText}>Allow Camera</AppText></TouchableOpacity></View>;
  }

  if (pendingCapture) {
    return (
      <View style={styles.previewRoot}>
        {pendingCapture.mediaType === 'photo' ? (
          <ExpoImage source={{ uri: pendingCapture.uri }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="none" />
        ) : (
          <>
            <Video
              ref={previewVideoRef}
              source={{ uri: pendingCapture.uri }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls={false}
              shouldPlay={false}
              isLooping={false}
              onPlaybackStatusUpdate={(status: any) => {
                if (!status?.isLoaded) return;
                setPreviewPlaying(!!status.isPlaying);
                if (status.didJustFinish) setPreviewPlaying(false);
              }}
            />
            <TouchableOpacity style={styles.previewPlayButton} onPress={togglePreviewPlayback} activeOpacity={0.85}>
              <View style={styles.previewPlayButtonInner}>
                {previewPlaying ? <Pause color="#fff" size={30} /> : <Play color="#fff" size={32} fill="#fff" />}
              </View>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={styles.previewClose} onPress={close}><X color="#fff" size={26} /></TouchableOpacity>
        <View style={styles.previewActions}>
          <TouchableOpacity style={styles.retakeButton} onPress={retake}><AppText style={styles.retakeText}>Retake</AppText></TouchableOpacity>
          <TouchableOpacity style={styles.useButton} onPress={useCapture}><AppText style={styles.useText}>{pendingCapture.mediaType === 'video' ? 'Use Video' : 'Use Photo'}</AppText></TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        key={`${mode}-${facing}-${cameraGeneration}`}
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        mode={mode === 'video' ? 'video' : 'picture'}
        videoQuality="1080p"
        flash={mode === 'photo' && flashEnabled ? 'on' : 'off'}
        enableTorch={mode === 'video' && flashEnabled}
        onMountError={(error) => Alert.alert('Camera Error', error?.message ?? 'The camera could not start.')}
      />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={close}><X color="#fff" size={26} /></TouchableOpacity>
        <TouchableOpacity style={[styles.iconButton, flashEnabled && styles.activeButton]} onPress={() => setFlashEnabled(v => !v)} disabled={recording}><Flashlight color="#fff" size={24} /></TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={switchFacing} disabled={recording || busy}><RefreshCcw color="#fff" size={23} /></TouchableOpacity>
      </View>

      <View style={styles.bottomBar}>
        <View style={styles.modeSwitcher}>
          <TouchableOpacity onPress={() => switchMode('photo')} disabled={recording || busy}><AppText style={[styles.modeOption, mode === 'photo' && styles.modeOptionActive]}>PHOTO</AppText></TouchableOpacity>
          <TouchableOpacity onPress={() => switchMode('video')} disabled={recording || busy}><AppText style={[styles.modeOption, mode === 'video' && styles.modeOptionActive]}>VIDEO</AppText></TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.shutterOuter, recording && styles.recordingOuter]} onPress={capture} disabled={busy && !recording}>
          <View style={[styles.shutterInner, mode === 'video' && styles.videoShutter, recording && styles.recordingInner]} />
        </TouchableOpacity>
        <AppText style={styles.flashText}>{`${mode === 'video' ? 'Light' : 'Flash'} ${flashEnabled ? 'On' : 'Off'}`}</AppText>
        {recording && (
          <View style={styles.recordingStatus}>
            <View style={styles.recordingDot} />
            <AppText style={styles.recordingTimer}>{formatRecordingTime(recordingSeconds)}</AppText>
            <AppText style={styles.recordingText}>Tap stop</AppText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' }, previewRoot: { flex: 1, backgroundColor: '#000' },
  previewClose: { position: 'absolute', top: 54, left: 18, width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center' },
  previewPlayButton: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  previewPlayButtonInner: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(0,0,0,0.52)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center' },
  previewActions: { position: 'absolute', left: 24, right: 24, bottom: 34, flexDirection: 'row', gap: 12 },
  retakeButton: { flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: 'rgba(32,32,38,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center' },
  useButton: { flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: '#FF2E8A', alignItems: 'center', justifyContent: 'center' },
  retakeText: { color: '#fff', fontSize: 16, fontWeight: '700' }, useText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  topBar: { position: 'absolute', top: 54, left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between' },
  iconButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }, activeButton: { backgroundColor: 'rgba(255,46,138,0.78)' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 30, alignItems: 'center', gap: 10 },
  modeSwitcher: { flexDirection: 'row', gap: 28, backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8 },
  modeOption: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '700' }, modeOptionActive: { color: '#fff' },
  shutterOuter: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' }, videoShutter: { backgroundColor: '#FF2E8A' }, recordingOuter: { borderColor: '#fff' }, recordingInner: { width: 34, height: 34, borderRadius: 7, backgroundColor: '#FF2E8A' },
  flashText: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  recordingStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF2E8A' },
  recordingTimer: { color: '#fff', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  recordingText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  permission: { flex: 1, backgroundColor: '#08080b', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 18 }, permissionTitle: { color: '#fff', fontSize: 18, textAlign: 'center' },
  permissionButton: { backgroundColor: '#FF2E8A', paddingHorizontal: 22, paddingVertical: 13, borderRadius: 22 }, permissionButtonText: { color: '#fff', fontWeight: '700' },
});
