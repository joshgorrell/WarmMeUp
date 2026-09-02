import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { supabase } from '@/lib/supabase';
import { Radius, Spacing, FontSize } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';

let DateTimePicker: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') DateTimePicker = require('@react-native-community/datetimepicker').default;

function age(date: Date) {
  const now = new Date();
  let years = now.getFullYear() - date.getFullYear();
  const m = now.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) years--;
  return years;
}

function parseDob(value: string): Date | null {
  const parts = value.split('/').map(Number);
  if (parts.length !== 3) return null;
  const [m, d, y] = parts;
  if (!m || !d || !y || y < 1900) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function VerifyAgeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contentMaxWidth, contentPadding } = useLayout();
  const [dob, setDob] = useState<Date | null>(null);
  const [dobText, setDobText] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const maxDate = useMemo(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d; }, []);
  const selected = Platform.OS === 'web' ? parseDob(dobText) : dob;
  const valid = !!selected && age(selected) >= 18;

  const onWebChange = (text: string) => {
    let clean = text.replace(/[^0-9]/g, '');
    if (clean.length > 2) clean = clean.slice(0, 2) + '/' + clean.slice(2);
    if (clean.length > 5) clean = clean.slice(0, 5) + '/' + clean.slice(5);
    setDobText(clean.slice(0, 10));
    setError('');
  };

  const continueFlow = async () => {
    if (!selected || age(selected) < 18) {
      setError('You must be 18 or older to use Warm Me Up.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Your session expired. Please sign in again.');
      const { error: updateError } = await supabase.from('profiles').update({
        date_of_birth: isoDate(selected),
        age_verified_at: new Date().toISOString(),
      }).eq('id', user.id);
      if (updateError) throw updateError;
      router.replace('/transition');
    } catch (e: any) {
      setError(e?.message ?? 'Unable to verify your age. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl }]}>
      <LinearGradient colors={['#060406', '#0A060A', '#0E080E']} style={StyleSheet.absoluteFill} />
      <View style={[styles.card, { maxWidth: contentMaxWidth, paddingHorizontal: contentPadding, alignSelf: 'center', width: '100%' }]}>
        <AppText style={styles.title}>Confirm your age</AppText>
        <AppText style={styles.body}>Warm Me Up is for adults 18 and older. Enter your date of birth to continue.</AppText>

        {Platform.OS === 'web' ? (
          <AppTextInput value={dobText} onChangeText={onWebChange} placeholder="MM/DD/YYYY" placeholderTextColor="rgba(255,255,255,0.3)" keyboardType="number-pad" style={styles.input} />
        ) : (
          <TouchableOpacity style={styles.input} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
            <AppText style={dob ? styles.inputText : styles.placeholder}>{dob ? dob.toLocaleDateString() : 'Date of birth'}</AppText>
          </TouchableOpacity>
        )}

        {!!error && <AppText style={styles.error}>{error}</AppText>}
        <TouchableOpacity disabled={saving} onPress={continueFlow} activeOpacity={0.85} style={styles.buttonWrap}>
          <LinearGradient colors={['#FF7B00', '#FF5A3D', '#FF2E8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.button, saving && { opacity: 0.6 }]}>
            <AppText style={styles.buttonText}>{saving ? 'Saving…' : 'Continue'}</AppText>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {Platform.OS === 'ios' && DateTimePicker && (
        <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
          <View style={styles.pickerOverlay}><View style={styles.pickerSheet}>
            <TouchableOpacity onPress={() => setShowPicker(false)} style={styles.done}><AppText style={styles.doneText}>Done</AppText></TouchableOpacity>
            <DateTimePicker value={dob || maxDate} mode="date" display="spinner" maximumDate={maxDate} minimumDate={new Date(1900, 0, 1)} onChange={(_: any, date?: Date) => date && setDob(date)} textColor="#fff" />
          </View></View>
        </Modal>
      )}
      {Platform.OS === 'android' && showPicker && DateTimePicker && (
        <DateTimePicker value={dob || maxDate} mode="date" maximumDate={maxDate} minimumDate={new Date(1900, 0, 1)} onChange={(event: any, date?: Date) => { setShowPicker(false); if (event.type === 'set' && date) setDob(date); }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl },
  card: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.md },
  title: { color: '#fff', fontSize: 28, fontFamily: 'Inter-Bold' },
  body: { color: 'rgba(255,255,255,0.62)', fontSize: FontSize.sm, lineHeight: 21, fontFamily: 'Inter-Regular' },
  input: { minHeight: 54, borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: Spacing.md, justifyContent: 'center', color: '#fff', fontSize: FontSize.body },
  inputText: { color: '#fff', fontSize: FontSize.body }, placeholder: { color: 'rgba(255,255,255,0.3)', fontSize: FontSize.body },
  error: { color: '#FF6B70', fontSize: FontSize.sm },
  buttonWrap: { borderRadius: Radius.pill, overflow: 'hidden', marginTop: Spacing.sm },
  button: { paddingVertical: 15, alignItems: 'center' }, buttonText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: FontSize.body },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  pickerSheet: { backgroundColor: '#111018', paddingBottom: 28, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl },
  done: { alignSelf: 'flex-end', padding: Spacing.md }, doneText: { color: '#FF5A8A', fontFamily: 'Inter-SemiBold' },
});
