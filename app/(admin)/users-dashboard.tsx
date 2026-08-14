import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AppText from '@/components/AppText';
import { supabase } from '@/lib/supabase';

type Result = {
  label: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  detail: string;
};

const initial = (label: string): Result => ({ label, status: 'idle', detail: 'Not tested yet' });

export default function UsersDashboardDiagnostic() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Result>(initial('Profiles'));
  const [couples, setCouples] = useState<Result>(initial('Couples'));
  const [subscriptions, setSubscriptions] = useState<Result>(initial('Subscriptions'));

  const run = async (
    setter: React.Dispatch<React.SetStateAction<Result>>,
    label: string,
    fn: () => PromiseLike<{ data: any; error: any }>,
  ) => {
    setter({ label, status: 'loading', detail: 'Loading…' });
    try {
      const { data, error } = await fn();
      if (error) {
        setter({ label, status: 'error', detail: `${error.code ?? ''} ${error.message ?? String(error)}`.trim() });
        return;
      }
      const count = Array.isArray(data) ? data.length : data ? 1 : 0;
      setter({ label, status: 'success', detail: `Loaded ${count} row${count === 1 ? '' : 's'}` });
    } catch (e: any) {
      setter({ label, status: 'error', detail: e?.message ?? String(e) });
    }
  };

  const testProfiles = () => run(
    setProfiles,
    'Profiles',
    () => supabase.from('profiles').select('id, display_name, is_admin, is_super_admin, created_at').order('created_at', { ascending: true }),
  );

  const testCouples = () => run(
    setCouples,
    'Couples',
    () => supabase.from('couples').select('*').order('created_at', { ascending: false }),
  );

  const testSubscriptions = () => run(
    setSubscriptions,
    'Subscriptions',
    () => supabase.from('subscriptions').select('user_id, plan, status, started_at, expires_at, trial_started_at').order('started_at', { ascending: false }),
  );

  const renderTest = (result: Result, onPress: () => void) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <AppText style={styles.cardTitle}>{result.label}</AppText>
        {result.status === 'loading' && <ActivityIndicator size="small" color="#FF2E8A" />}
      </View>
      <AppText style={[
        styles.detail,
        result.status === 'success' && styles.success,
        result.status === 'error' && styles.error,
      ]} selectable>
        {result.detail}
      </AppText>
      <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.8} disabled={result.status === 'loading'}>
        <AppText style={styles.buttonText}>{result.status === 'idle' ? `Test ${result.label}` : `Retest ${result.label}`}</AppText>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText style={styles.title}>Users Dashboard Diagnostic</AppText>
        <AppText style={styles.subtitle}>
          This temporary screen does no database work when it opens. If you can see this page, the route itself is healthy. Test each dataset one at a time and note which action, if any, closes the app.
        </AppText>

        {renderTest(profiles, testProfiles)}
        {renderTest(couples, testCouples)}
        {renderTest(subscriptions, testSubscriptions)}

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
          <AppText style={styles.backText}>Back to Admin</AppText>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07070A' },
  content: { paddingTop: 70, paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  title: { color: '#FFFFFF', fontSize: 22, fontFamily: 'Inter-Bold' },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 20, fontFamily: 'Inter-Regular', marginBottom: 8 },
  card: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: '#111119', borderRadius: 16, padding: 16, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter-SemiBold' },
  detail: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontFamily: 'Inter-Regular' },
  success: { color: '#33D17A' },
  error: { color: '#FF6464' },
  button: { alignSelf: 'flex-start', backgroundColor: '#FF2E8A', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22 },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter-SemiBold' },
  backButton: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  backText: { color: 'rgba(255,255,255,0.70)', fontSize: 14, fontFamily: 'Inter-SemiBold' },
});
