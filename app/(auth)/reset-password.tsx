import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import PrimaryButton from '@/components/PrimaryButton';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (saving) return;
    if (password.length < 8 || password !== confirmation) {
      setError('Use at least 8 characters and enter the same password twice.');
      return;
    }
    setSaving(true); setError('');
    try {
      const { data: { user }, error: sessionError } = await supabase.auth.getUser();
      if (sessionError || !user) throw new Error('Your reset link has expired. Request a new email.');
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword(''); setConfirmation('');
      // Resume through the normal profile, pairing and subscription checks.
      router.replace('/transition');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your password. Try again.');
    } finally { setSaving(false); }
  };
  return <View style={styles.root}>
    <AppText style={styles.title}>Set a new password</AppText>
    <AppTextInput style={styles.input} placeholder="New password" placeholderTextColor="#999" secureTextEntry autoCapitalize="none" autoComplete="new-password" value={password} onChangeText={setPassword} />
    <AppTextInput style={styles.input} placeholder="Confirm password" placeholderTextColor="#999" secureTextEntry autoCapitalize="none" value={confirmation} onChangeText={setConfirmation} />
    {!!error && <AppText style={styles.error}>{error}</AppText>}
    <PrimaryButton label="Save password" onPress={save} loading={saving} />
    <PrimaryButton label="Request a new reset email" onPress={() => router.replace('/(auth)/forgot-password')} />
  </View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#07070A', justifyContent: 'center', padding: 24, gap: 18 }, title: { color: '#fff', fontSize: 24 }, input: { color: '#fff', backgroundColor: '#18151b', padding: 16, borderRadius: 12 }, error: { color: '#ff7777' } });
