import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Share, Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Copy, Share2 } from 'lucide-react-native';
import AppText from '@/components/AppText';
import WarmupLogo from '@/components/WarmupLogo';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';

const SECURE_STORE_KEYS_TO_READ = [
  'debug_auth_error_message',
  'debug_auth_error_status',
  'debug_auth_error_code',
  'debug_login_visible_error_message',
  'debug_login_error_source',
  'debug_login_error_full_json',
  'debug_login_button_pressed_at',
  'debug_login_handler_file',
  'debug_login_handler_name',
  'debug_login_reached_preflight',
  'debug_login_reached_signInWithPassword',
  'debug_login_preflight_has_supabase_client',
  'debug_login_preflight_has_anon_key',
  'debug_login_preflight_anon_key_length',
  'debug_network_supabase_root_ok',
  'debug_network_supabase_root_status',
  'debug_network_supabase_auth_health_ok',
  'debug_network_supabase_auth_health_status',
  'debug_network_supabase_auth_health_error',
  'debug_auth_session_cleared_at',
  'debug_auth_session_cleared_reason',
];

interface DiagEntry {
  key: string;
  value: string;
}

function maskSecret(val: string | null | undefined): string {
  if (!val) return 'not set';
  if (val.length <= 8) return '***';
  return val.slice(0, 4) + '…' + val.slice(-4);
}

function Row({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText style={styles.rowLabel}>{label}</AppText>
      <AppText style={[styles.rowValue, dim && styles.rowValueDim]} numberOfLines={3} selectable>
        {value || '(empty)'}
      </AppText>
    </View>
  );
}

function Section({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
    </View>
  );
}

export default function DebugFallbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useLayout();
  const logoSize = Math.min(Math.round(width * 0.12), 48);

  const [networkState, setNetworkState] = useState<string>('checking…');
  const [secureData, setSecureData] = useState<DiagEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
        if (!supabaseUrl) {
          setNetworkState('Supabase URL not configured');
          return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(supabaseUrl, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timer);
        setNetworkState(`reachable — HTTP ${res.status}`);
      } catch (e: any) {
        setNetworkState(`unreachable — ${e?.message ?? 'error'}`);
      }
    })();

    (async () => {
      if (Platform.OS === 'web') {
        setSecureData([]);
        return;
      }
      const entries: DiagEntry[] = [];
      for (const key of SECURE_STORE_KEYS_TO_READ) {
        try {
          const val = await SecureStore.getItemAsync(key);
          if (val) entries.push({ key, value: val });
        } catch {}
      }
      setSecureData(entries);
    })();
  }, []);

  // Build the full report text
  const buildReport = (): string => {
    const lines: string[] = [];
    lines.push('=== Warm Me Up — Basic Diagnostics ===');
    lines.push(`Timestamp:       ${new Date().toISOString()}`);
    lines.push('');
    lines.push('--- App ---');
    lines.push(`Version:         ${Constants.expoConfig?.version ?? 'unknown'}`);
    lines.push(`Build:           ${Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? 'unknown'}`);
    const otaId = Updates.updateId ?? 'n/a (embedded)';
    lines.push(`OTA update ID:   ${otaId}`);
    lines.push(`Runtime version: ${Updates.runtimeVersion ?? 'unknown'}`);
    lines.push(`Channel:         ${Updates.channel ?? 'unknown'}`);
    lines.push(`Update source:   ${Updates.isEmbeddedLaunch ? 'embedded' : 'OTA'}`);
    lines.push('');
    lines.push('--- Device ---');
    lines.push(`Platform:        ${Platform.OS}`);
    lines.push(`OS version:      ${Platform.Version ?? 'unknown'}`);
    lines.push('');
    lines.push('--- Network ---');
    lines.push(`Supabase reachability: ${networkState}`);
    lines.push(`Supabase URL:    ${process.env.EXPO_PUBLIC_SUPABASE_URL ? 'configured (present)' : 'NOT configured'}`);
    lines.push('');
    lines.push('--- Auth / Login Errors ---');
    for (const { key, value } of secureData) {
      lines.push(`${key}: ${value}`);
    }
    if (secureData.length === 0) lines.push('(no stored error data)');
    lines.push('');
    lines.push('=== end ===');
    return lines.join('\n');
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(buildReport());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: buildReport() });
    } catch {}
  };

  const supabaseUrlPresent = !!(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const otaId = Updates.updateId ?? null;
  const isEmbedded = Updates.isEmbeddedLaunch;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <ChevronLeft color="rgba(255,255,255,0.7)" size={22} strokeWidth={2} />
        </TouchableOpacity>
        <WarmupLogo size={logoSize} />
        <AppText style={styles.headerTitle}>Basic Diagnostics</AppText>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Section title="App" />
        <Row label="Version" value={Constants.expoConfig?.version ?? 'unknown'} />
        <Row label="Build" value={String(Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? 'unknown')} />
        <Row label="OTA update ID" value={otaId ?? 'n/a (embedded)'} />
        <Row label="Runtime version" value={Updates.runtimeVersion ?? 'unknown'} />
        <Row label="Channel" value={Updates.channel ?? 'unknown'} />
        <Row label="Update source" value={isEmbedded ? 'embedded' : 'OTA'} />

        <Section title="Device" />
        <Row label="Platform" value={Platform.OS} />
        <Row label="OS version" value={String(Platform.Version ?? 'unknown')} />

        <Section title="Network" />
        <Row label="Supabase reachability" value={networkState} />
        <Row label="Supabase URL configured" value={supabaseUrlPresent ? 'yes' : 'NO — missing EXPO_PUBLIC_SUPABASE_URL'} />

        <Section title="Auth / Login Errors" />
        {secureData.length > 0
          ? secureData.map(({ key, value }) => (
              <Row key={key} label={key} value={value} dim />
            ))
          : <Row label="Stored errors" value="(none)" />
        }

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} activeOpacity={0.82}>
            <Copy color="#60C8FF" size={17} strokeWidth={2} />
            <AppText style={styles.actionBtnText}>{copied ? 'Copied!' : 'Copy Report'}</AppText>
          </TouchableOpacity>
          {Platform.OS !== 'web' && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.82}>
              <Share2 color="#60C8FF" size={17} strokeWidth={2} />
              <AppText style={styles.actionBtnText}>Share Report</AppText>
            </TouchableOpacity>
          )}
        </View>

        <AppText style={styles.note}>
          This screen never exposes secrets, tokens, or private content. Safe to share with support.
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#07070A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.screen,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: FontSize.md,
    fontFamily: 'Inter-SemiBold',
    flex: 1,
  },
  scroll: {
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.md,
  },
  sectionHeader: {
    marginTop: Spacing.lg,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 6,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    gap: 12,
    alignItems: 'flex-start',
  },
  rowLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    width: 140,
    flexShrink: 0,
  },
  rowValue: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    flex: 1,
  },
  rowValueDim: {
    color: 'rgba(255,200,100,0.85)',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(96,200,255,0.30)',
    backgroundColor: 'rgba(96,200,255,0.07)',
    paddingVertical: 12,
  },
  actionBtnText: {
    color: '#60C8FF',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  note: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 15,
    marginTop: Spacing.lg,
  },
});
