import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import AppText from '@/components/AppText';
import { getUploadProgressState, subscribeUploadProgress, UploadProgressState } from '@/lib/uploadProgress';

export default function UploadProgressOverlay() {
  const [progress, setProgress] = useState<UploadProgressState>(getUploadProgressState());

  useEffect(() => subscribeUploadProgress(setProgress), []);

  if (!progress.visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.card}>
        <View style={styles.header}>
          <AppText style={styles.label}>{progress.label}</AppText>
          <AppText style={styles.pct}>{progress.pct}%</AppText>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress.pct}%` }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 62,
    zIndex: 10000,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: 'rgba(18,16,24,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: { color: '#fff', fontSize: 13, fontFamily: 'Inter-SemiBold' },
  pct: { color: '#FF5A8F', fontSize: 13, fontFamily: 'Inter-Bold', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: '#FF2E8A' },
});
