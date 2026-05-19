import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Lock, Eye, EyeOff, Mail, Check, Calendar, User } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { signInWithProvider, isOAuthSupported } from '@/lib/oauth';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppleIcon from '@/components/icons/AppleIcon';
import GoogleIcon from '@/components/icons/GoogleIcon';
import TermsModal from '@/components/TermsModal';

function getAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function parseDateInput(value: string): Date | null {
  const parts = value.split('/');
  if (parts.length !== 3) return null;
  const [mm, dd, yyyy] = parts.map(Number);
  if (!mm || !dd || !yyyy || yyyy < 1900) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getMonth() !== mm - 1) return null;
  return d;
}

export default function RegisterScreen() {
  const router = useRouter();
  const { pendingCode } = useLocalSearchParams<{ pendingCode?: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Proportional vertical rhythm
  const vXs = Math.round(height * 0.01);
  const vSm = Math.round(height * 0.016);
  const vMd = Math.round(height * 0.024);
  const inputPad = Math.max(Math.round(height * 0.014), 10);
  const headingSize = Math.min(Math.round(width * 0.076), 30);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [dob, setDob] = useState('');
  const [dobError, setDobError] = useState('');

  const tosAcceptedAt = new Date().toISOString();

  const validateAge = (): boolean => {
    if (!dob.trim()) {
      setDobError('Please enter your date of birth.');
      return false;
    }
    const parsed = parseDateInput(dob);
    if (!parsed) {
      setDobError('Enter a valid date in MM/DD/YYYY format.');
      return false;
    }
    if (getAge(parsed) < 18) {
      setDobError('You must be 18 or older to use Warm Me Up.');
      return false;
    }
    setDobError('');
    return true;
  };

  const handleDobChange = (text: string) => {
    // Auto-insert slashes: 2 digits → add /, 5 digits → add /
    let cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length > 2) cleaned = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    if (cleaned.length > 5) cleaned = cleaned.slice(0, 5) + '/' + cleaned.slice(5);
    if (cleaned.length > 10) return;
    setDob(cleaned);
    setDobError('');
  };

  const requireTos = () => {
    setError('Please agree to the Terms of Service and Privacy Policy to continue.');
    return false;
  };

  const handleRegister = async () => {
    if (!displayName.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!validateAge()) return;
    if (!tosAccepted) { requireTos(); return; }
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;
      if (data.user) {
        await supabase
          .from('profiles')
          .update({ display_name: displayName.trim(), tos_accepted_at: tosAcceptedAt })
          .eq('id', data.user.id);
        if (pendingCode) {
          router.replace({ pathname: '/(auth)/setup-pin', params: { pendingCode } });
        } else {
          router.replace('/(auth)/setup-pin');
        }
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'apple' | 'google') => {
    if (!displayName.trim()) {
      setError('Please enter your name before continuing.');
      return;
    }
    if (!validateAge()) return;
    if (!tosAccepted) { requireTos(); return; }
    setError('');
    setOauthLoading(provider);
    try {
      const session = await signInWithProvider(provider);
      // Web redirects away; native returns a session
      if (!session) return;

      const userId = session.user?.id;
      if (userId) {
        await supabase
          .from('profiles')
          .update({ display_name: displayName.trim(), tos_accepted_at: tosAcceptedAt })
          .eq('id', userId)
          .is('tos_accepted_at', null);

        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        if (!existing) {
          if (pendingCode) {
            router.replace({ pathname: '/(auth)/setup-pin', params: { pendingCode } });
          } else {
            router.replace('/(auth)/setup-pin');
          }
        } else {
          router.replace('/transition');
        }
      }
    } catch (e: any) {
      setError(e.message || `${provider === 'apple' ? 'Apple' : 'Google'} sign-in failed.`);
    } finally {
      setOauthLoading(null);
    }
  };

  const handlePrivacyPolicy = () => {
    Alert.alert(
      'Privacy Policy',
      'Our full Privacy Policy will be available at our website. By creating an account you acknowledge that Warm Me Up collects and processes only the data necessary to operate the service, stores it securely, and never sells your personal information.',
      [{ text: 'OK' }]
    );
  };

  const showGoogle = isOAuthSupported('google');
  const showApple = isOAuthSupported('apple');

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#060406', '#0A060A', '#0E080E']}
        style={StyleSheet.absoluteFill}
      />

      <TermsModal visible={termsVisible} onClose={() => setTermsVisible(false)} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: vMd, paddingBottom: Math.max(insets.bottom, vMd) + vMd }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header row */}
        <View style={[styles.headerRow, { marginBottom: vSm }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <ChevronLeft color="rgba(255,255,255,0.75)" size={20} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {/* Title */}
        <Text style={[styles.heading, { fontSize: headingSize, marginBottom: vXs }]}>Create your space</Text>
        <Text style={[styles.sub, { marginBottom: vSm }]}>Just for you and your partner.</Text>

        {/* OAuth buttons */}
        {(showGoogle || showApple) && (
          <View style={[styles.oauthBlock, { gap: vXs, marginBottom: vSm }]}>
            {showApple && (
              <TouchableOpacity
                style={[styles.oauthBtn, styles.appleBtn, { paddingVertical: inputPad }, !tosAccepted && styles.btnDisabled]}
                onPress={() => handleOAuth('apple')}
                activeOpacity={0.88}
                disabled={oauthLoading !== null || loading}
              >
                <AppleIcon color={tosAccepted ? '#fff' : 'rgba(255,255,255,0.35)'} size={18} />
                <Text style={[styles.appleBtnText, !tosAccepted && styles.textDisabled]}>
                  {oauthLoading === 'apple' ? 'Signing in…' : 'Continue with Apple'}
                </Text>
              </TouchableOpacity>
            )}

            {showGoogle && (
              <TouchableOpacity
                style={[styles.oauthBtn, styles.googleBtn, { paddingVertical: inputPad }, !tosAccepted && styles.googleBtnDisabled]}
                onPress={() => handleOAuth('google')}
                activeOpacity={0.88}
                disabled={oauthLoading !== null || loading}
              >
                <GoogleIcon size={18} />
                <Text style={[styles.googleBtnText, !tosAccepted && styles.googleTextDisabled]}>
                  {oauthLoading === 'google' ? 'Signing in…' : 'Continue with Google'}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
          </View>
        )}

        {/* Form fields */}
        <View style={[styles.form, { gap: vXs }]}>
          <View style={styles.inputWrap}>
            <User color="rgba(255,255,255,0.30)" size={16} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { paddingVertical: inputPad }]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor="rgba(255,255,255,0.24)"
              autoCapitalize="words"
              autoComplete="name"
              maxLength={40}
            />
          </View>

          <View style={styles.inputWrap}>
            <Mail color="rgba(255,255,255,0.30)" size={16} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { paddingVertical: inputPad }]}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="rgba(255,255,255,0.24)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={styles.inputWrap}>
            <Lock color="rgba(255,255,255,0.30)" size={16} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { paddingVertical: inputPad }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="rgba(255,255,255,0.24)"
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              {showPassword
                ? <EyeOff color="rgba(255,255,255,0.30)" size={16} />
                : <Eye color="rgba(255,255,255,0.30)" size={16} />
              }
            </TouchableOpacity>
          </View>

          <View style={styles.inputWrap}>
            <Lock color="rgba(255,255,255,0.30)" size={16} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { paddingVertical: inputPad }]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm Password"
              placeholderTextColor="rgba(255,255,255,0.24)"
              secureTextEntry={!showConfirm}
            />
            <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
              {showConfirm
                ? <EyeOff color="rgba(255,255,255,0.30)" size={16} />
                : <Eye color="rgba(255,255,255,0.30)" size={16} />
              }
            </TouchableOpacity>
          </View>

          {/* Date of birth — 18+ age gate */}
          <View>
            <View style={[styles.inputWrap, dobError ? styles.inputWrapError : null]}>
              <Calendar color="rgba(255,255,255,0.30)" size={16} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { paddingVertical: inputPad }]}
                value={dob}
                onChangeText={handleDobChange}
                placeholder="Date of Birth (MM/DD/YYYY)"
                placeholderTextColor="rgba(255,255,255,0.24)"
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>
            {dobError ? (
              <Text style={styles.fieldError}>{dobError}</Text>
            ) : (
              <Text style={styles.fieldHint}>You must be 18 or older to use this app.</Text>
            )}
          </View>

          {/* ToS checkbox */}
          <TouchableOpacity
            style={styles.tosRow}
            onPress={() => setTosAccepted(!tosAccepted)}
            activeOpacity={0.75}
          >
            <View style={[styles.checkbox, tosAccepted && styles.checkboxChecked]}>
              {tosAccepted && (
                <LinearGradient
                  colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.checkboxGrad}
                >
                  <Check color="#fff" size={11} strokeWidth={3} />
                </LinearGradient>
              )}
            </View>
            <Text style={styles.tosText}>
              I have read and agree to the{' '}
              <Text
                style={styles.tosLink}
                onPress={(e) => { e.stopPropagation(); setTermsVisible(true); }}
              >
                Terms of Service
              </Text>
              {' '}and{' '}
              <Text
                style={styles.tosLink}
                onPress={(e) => { e.stopPropagation(); handlePrivacyPolicy(); }}
              >
                Privacy Policy
              </Text>
            </Text>
          </TouchableOpacity>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.createBtn, !tosAccepted && styles.createBtnDisabled]}
            onPress={handleRegister}
            activeOpacity={0.85}
            disabled={loading || oauthLoading !== null}
          >
            {tosAccepted ? (
              <LinearGradient
                colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.createGrad, { paddingVertical: inputPad + 4 }]}
              >
                <Text style={styles.createLabel}>{loading ? 'Creating...' : 'Create Account'}</Text>
              </LinearGradient>
            ) : (
              <View style={[styles.createGrad, styles.createGradDisabled, { paddingVertical: inputPad + 4 }]}>
                <Text style={styles.createLabelDisabled}>{loading ? 'Creating...' : 'Create Account'}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginRow}
            onPress={() => router.replace('/(auth)/login')}
            activeOpacity={0.7}
          >
            <Text style={styles.loginText}>
              Already have an account?{'  '}
              <Text style={styles.loginLink}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060406' },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  heading: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.5,
  },
  sub: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
  },
  oauthBlock: {},
  oauthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  appleBtn: {
    backgroundColor: '#1A1A1A',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  appleBtnText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  textDisabled: {
    color: 'rgba(255,255,255,0.35)',
  },
  googleBtn: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  googleBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  googleBtnText: {
    color: '#1A1A1A',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  googleTextDisabled: {
    color: 'rgba(26,26,26,0.45)',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  dividerText: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  form: {},
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: Spacing.md,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
  },
  eyeBtn: {
    padding: 6,
  },
  tosRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    overflow: 'hidden',
    flexShrink: 0,
  },
  checkboxChecked: {
    borderColor: 'transparent',
  },
  checkboxGrad: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrapError: {
    borderColor: '#FF5A5F',
  },
  fieldError: {
    color: '#FF5A5F',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
    marginLeft: 4,
  },
  fieldHint: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
    marginLeft: 4,
  },
  tosText: {
    flex: 1,
    color: 'rgba(255,255,255,0.50)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  tosLink: {
    color: '#FF7A45',
    fontFamily: 'Inter-SemiBold',
  },
  error: {
    color: '#FF5A5F',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  createBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.50,
    shadowRadius: 18,
    elevation: 10,
  },
  createBtnDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  createGrad: {
    alignItems: 'center',
    borderRadius: Radius.pill,
  },
  createGradDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  createLabel: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  createLabelDisabled: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  loginRow: {
    alignItems: 'center',
  },
  loginText: {
    color: 'rgba(255,255,255,0.36)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  loginLink: {
    color: '#FF7A45',
    fontFamily: 'Inter-SemiBold',
  },
});
