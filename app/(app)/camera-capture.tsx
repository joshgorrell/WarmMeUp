import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Flashlight, RefreshCcw, X } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { clearCameraCaptureResult, setCameraCaptureResult } from '@/lib/cameraCaptureStore';

type Mode = 'photo' | 'video';

export default function CameraCaptureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: Mode = params.mode === 'video' ? 'video' : 'photo';
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    clearCameraCaptureResult();
    setFlashEnabled(false); // Privacy-first: every camera session starts dark.
  }, []);

  useEffect(() => {
    if (!cameraPermission?.granted) requestCameraPermission();
    if (mode === 'video' && !micPermission?.granted) requestMicPermission();
  }, [cameraPermission?.granted, micPermission?.granted, mode]);

  const close = () => {
    clearCameraCaptureResult();
    router.back();
  };

  const capture = async () => {
    if (!cameraRef.current || busy) return;
    try {
      setBusy(true);
      if (mode === 'video') {
        if (recording) {
          cameraRef.current.stopRecording();
          return;
        }
        setRecording(true);
        const result = await cameraRef.current.recordAsync({ maxDuration: 60 });
        setRecording(false);
        if (result?.uri) {
          setCameraCaptureResult({ uri: result.uri, mediaType: 'video', mimeType: 'video/mp4' });
          router.back();
        }
      } else {
        const result = await cameraRef.current.takePictureAsync({ quality: 0.6 });
        if (result?.uri) {
          setCameraCaptureResult({ uri: result.uri, mediaType: 'photo', mimeType: 'image/jpeg' });
          router.back();
        }
      }
    } catch (e: any) {
      setRecording(false);
      Alert.alert('Camera Error', e?.message ?? 'Could not capture media.');
    } finally {
      setBusy(false);
    }
  };

  if (!cameraPermission || (mode === 'video' && !micPermission)) return <View style={styles.root} />;
  if (!cameraPermission.granted || (mode === 'video' && !micPermission?.granted)) {
    return (
      <View style={styles.permission}>
        <AppText style={styles.permissionTitle}>Camera access is required</AppText>
        <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
          <AppText style={styles.permissionButtonText}>Allow Camera</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        mode={mode === 'video' ? 'video' : 'picture'}
        flash={flashEnabled ? 'on' : 'off'}
        enableTorch={mode === 'video' && flashEnabled}
      />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={close}><X color="#fff" size={26} /></TouchableOpacity>
        <TouchableOpacity style={[styles.iconButton, flashEnabled && styles.activeButton]} onPress={() => setFlashEnabled(v => !v)}>
          <Flashlight color="#fff" size={24} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={() => setFacing(v => v === 'back' ? 'front' : 'back')}>
          <RefreshCcw color="#fff" size={23} />
        </TouchableOpacity>
      </View>
      <View style={styles.bottomBar}>
        <AppText style={styles.modeText}>{mode === 'video' ? (recording ? 'Recording… tap to stop' : 'Video') : 'Photo'}</AppText>
        <TouchableOpacity style={[styles.shutterOuter, recording && styles.recordingOuter]} onPress={capture} disabled={busy && !recording}>
          <View style={[styles.shutterInner, recording && styles.recordingInner]} />
        </TouchableOpacity>
        <AppText style={styles.flashText}>Flash {flashEnabled ? 'On' : 'Off'}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: { position: 'absolute', top: 54, left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between' },
  iconButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  activeButton: { backgroundColor: 'rgba(255,46,138,0.78)' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 38, alignItems: 'center', gap: 10 },
  shutterOuter: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  recordingOuter: { borderColor: '#fff' },
  recordingInner: { width: 34, height: 34, borderRadius: 7, backgroundColor: '#FF2E8A' },
  modeText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  flashText: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  permission: { flex: 1, backgroundColor: '#08080b', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 18 },
  permissionTitle: { color: '#fff', fontSize: 18, textAlign: 'center' },
  permissionButton: { backgroundColor: '#FF2E8A', paddingHorizontal: 22, paddingVertical: 13, borderRadius: 22 },
  permissionButtonText: { color: '#fff', fontWeight: '700' },
});
