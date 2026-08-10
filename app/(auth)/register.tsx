import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import AvatarUploader from '@/components/AvatarUploader';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Lock, Eye, EyeOff, Mail, Check, Calendar, User, Sparkles } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { signInWithProvider, isOAuthSupported } from '@/lib/oauth';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppleIcon from '@/components/icons/AppleIcon';
import GoogleIcon from '@/components/icons/GoogleIcon';
import * as AppleAuthentication from 'expo-apple-authentication';
import TermsModal from '@/components/TermsModal';
import PrivacyPolicyModal from '@/components/PrivacyPolicyModal';
import { useLayout } from '@/hooks/useLayout';
import { savePendingCode, clearPendingCode } from '@/lib/inviteCode';
import { friendlyAuthError } from '@/lib/authError';
import { completePendingJoin } from '@/lib/coupleJoin';
import { useAuth } from '@/context/AuthContext';

// Only loaded on native — web falls back to text input
let DateTimePicker: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

function getAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function formatDate(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
}

function getMaxDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d;
}

// Web-only: parse MM/DD/YYYY text input
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
  const { pendingCode, oauthComplete } = useLocalSearchParams<{ pendingCode?: string; oauthComplete?: string }>();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const insets = useSafeAreaInsets();
  const { refreshSubscription } = useAuth();

  const vXs = Math.round(height * 0.01);
  const vSm = Math.round(height * 0.016);
  const vMd = Math.round(height * 0.024);
  const inputPad = Math.max(Math.round(height * 0.014), 10);
  const headingSize = Math.min(Math.round(width * 0.076), 30);

  // Form values
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // DOB — native picker on iOS/Android, text on web
  const [dobDate, setDobDate] = useState<Date | null>(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [dobText, setDobText] = useState('');

  // Touched flags — errors only appear after a field is touched or submit attempted
  const [firstNameTouched, setFirstNameTouched] = useState(false);
  const [lastNameTouched, setLastNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  const [dobTouched, setDobTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'apple' | 'google' | null>(null);
  const [apiError, setApiError] = useState('');

  const [tosAccepted, setTosAccepted] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);

  // OAuth ToS consent modal
  const [tosConsentVisible, setTosConsentVisible] = useState(false);
  const [pendingOAuthProvider, setPendingOAuthProvider] = useState<'apple' | 'google' | null>(null);

  // Step state: form → name (if needed) → avatar
  const [step, setStep] = useState<'form' | 'name' | 'avatar'>('form');
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarDone, setAvatarDone] = useState(false);
  const [avatarSkip, setAvatarSkip] = useState(false);

  const tosAcceptedAt = new Date().toISOString();
  const maxDate = getMaxDate();

  // When arriving from login-screen OAuth (oauthComplete=1), check if the session
  // already has a name. If yes, go to avatar. If no, go to name step.
  useEffect(() => {
    if (oauthComplete !== '1') return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStep('form');
        return;
      }
      const meta = user.user_metadata ?? {};
      const hasName = !!(meta.first_name || meta.given_name || meta.full_name);
      if (hasName) {
        setCreatedUserId(user.id);
        setStep('avatar');
      } else {
        setCreatedUserId(user.id);
        setStep('name');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthComplete]);

  // --- Derived: DOB validity ---
  const dobValid: boolean = Platform.OS === 'web'
    ? (() => {
        const parsed = parseDateInput(dobText);
        return parsed !== null && getAge(parsed) >= 18;
      })()
    : dobDate !== null && getAge(dobDate) >= 18;

  // --- Per-field inline errors ---
  const firstNameError = firstName.trim().length === 0
    ? 'First name is required'
    : firstName.trim().length < 2 ? 'Must be at least 2 characters' : null;
  const lastNameError = lastName.trim().length === 0
    ? 'Last name is required'
    : lastName.trim().length < 2 ? 'Must be at least 2 characters' : null;
  const emailError = email.trim().length === 0
    ? 'Email is required'
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Please enter a valid email address' : null;
  const passwordError = password.length === 0
    ? 'Password is required'
    : password.length < 8 ? 'Must be at least 8 characters' : null;
  const confirmPasswordError = confirmPassword.length === 0
    ? 'Please confirm your password'
    : password !== confirmPassword ? 'Passwords do not match' : null;
  const dobFieldError = !dobValid
    ? (dobDate !== null || dobText.length > 0 ? 'You must be 18 or older to use Warm Me Up' : 'Date of birth is required')
    : null;

  const showFirstNameError = (firstNameTouched || submitAttempted) && !!firstNameError;
  const showLastNameError = (lastNameTouched || submitAttempted) && !!lastNameError;
  const showEmailError = (emailTouched || submitAttempted) && !!emailError;
  const showPasswordError = (passwordTouched || submitAttempted) && !!passwordError;
  const showConfirmPasswordError = (confirmPasswordTouched || submitAttempted) && !!confirmPasswordError;
  const showDobError = (dobTouched || submitAttempted) && !!dobFieldError;

  // Password hint (not red) while typing but not yet erroring
  const showPasswordHint = !showPasswordError;

  // --- Create Account disabled until all fields valid ---
  const formReady =
    !firstNameError &&
    !lastNameError &&
    !emailError &&
    !passwordError &&
    !confirmPasswordError &&
    dobValid &&
    tosAccepted;

  // --- Web DOB text change ---
  const handleDobTextChange = (text: string) => {
    let cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length > 2) cleaned = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    if (cleaned.length > 5) cleaned = cleaned.slice(0, 5) + '/' + cleaned.slice(5);
    if (cleaned.length > 10) return;
    setDobText(cleaned);
    setDobTouched(true);
  };

  // --- Route after avatar step (or skip) ---
  const proceedFromAvatarStep = useCallback(() => {
    if (!createdUserId) return;
    const uid = createdUserId;

    // If email was already confirmed (OAuth or auto-confirm), go straight to onboarding/pair.
    // Otherwise go to verify-email.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email_confirmed_at) {
        if (pendingCode) {
          completePendingJoin(pendingCode).then(async (result) => {
            await clearPendingCode();
            if (result.ok) {
              router.replace({ pathname: '/(auth)/pair', params: { prefilledCode: pendingCode } });
              return;
            }
            router.replace('/(auth)/onboarding');
          });
        } else {
          router.replace('/(auth)/onboarding');
        }
      } else {
        const params: Record<string, string> = { email: email || user?.email || '' };
        if (pendingCode) params.pendingCode = pendingCode;
        router.replace({ pathname: '/(auth)/verify-email', params });
      }
    });
  }, [createdUserId, pendingCode, email, router]);

  // --- Shared OAuth body (called after consent guaranteed) ---
  const runOAuth = async (provider: 'apple' | 'google') => {
    setApiError('');
    setOauthLoading(provider);
    if (pendingCode) await savePendingCode(pendingCode);
    try {
      const session = await signInWithProvider(provider);
      if (!session) return;

      const userId = session.user?.id;
      if (userId) {
        // Prefer name from OAuth provider (Apple provides it on first sign-in);
        // fall back to whatever the user typed in the form.
        const meta = session.user?.user_metadata ?? {};
        const providerFn = meta.first_name || meta.given_name || '';
        const providerLn = meta.last_name || meta.family_name || '';
        const fn = providerFn || firstName.trim();
        const ln = providerLn || lastName.trim();
        const fullName = [fn, ln].filter(Boolean).join(' ');

        const { data: updatedProfile } = await supabase
          .from('profiles')
          .update({
            ...(fn ? { first_name: fn } : {}),
            ...(ln ? { last_name: ln } : {}),
            ...(fullName ? { display_name: fullName } : {}),
            tos_accepted_at: tosAcceptedAt,
          })
          .eq('id', userId)
          .is('tos_accepted_at', null)
          .select('id')
          .maybeSingle();

        const isNewUser = !!updatedProfile;
        if (isNewUser) {
          setCreatedUserId(userId);
          // If we got a name from the provider or the form, go to avatar.
          // Otherwise prompt for name first.
          if (fn) {
            setStep('avatar');
          } else {
            setStep('name');
          }
        } else {
          router.replace('/transition');
        }
      }
    } catch (e: unknown) {
      setApiError(friendlyAuthError(e));
    } finally {
      setOauthLoading(null);
    }
  };

  // --- Name step continue (after OAuth if no name was obtained) ---
  const handleNameStepContinue = async () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || fn.length < 2) {
      setFirstNameTouched(true);
      setApiError('Please enter your first name.');
      return;
    }
    if (!ln || ln.length < 2) {
      setLastNameTouched(true);
      setApiError('Please enter your last name.');
      return;
    }
    const fullName = `${fn} ${ln}`;
    setApiError('');
    setLoading(true);
    try {
      if (createdUserId) {
        await supabase
          .from('profiles')
          .update({ first_name: fn, last_name: ln, display_name: fullName })
          .eq('id', createdUserId);
      }
      setStep('avatar');
    } catch (e: unknown) {
      setApiError(friendlyAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  // --- Create Account ---
  const handleRegister = async () => {
    setSubmitAttempted(true);
    setApiError('');

    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || fn.length < 2 || !ln || ln.length < 2) return;
    if (!email.trim() || !password || password.length < 8 || password !== confirmPassword) return;
    if (!dobValid) return;
    if (!tosAccepted) return;

    const fullName = `${fn} ${ln}`;
    setLoading(true);
    try {
      const redirectTo = Platform.OS === 'web'
        ? (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined)
        : 'warmup://auth/callback';

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (signUpError) throw signUpError;
      if (data.user) {
        await supabase
          .from('profiles')
          .update({ first_name: fn, last_name: ln, display_name: fullName, tos_accepted_at: tosAcceptedAt })
          .eq('id', data.user.id);

        setCreatedUserId(data.user.id);
        setStep('avatar');
      }
    } catch (e: unknown) {
      setApiError(friendlyAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  // --- OAuth tap ---
  const handleOAuth = (provider: 'apple' | 'google') => {
    if (!tosAccepted) {
      setPendingOAuthProvider(provider);
      setTosConsentVisible(true);
      return;
    }
    runOAuth(provider);
  };

  const handleTosConsentAgree = () => {
    setTosAccepted(true);
    setTosConsentVisible(false);
    const provider = pendingOAuthProvider;
    setPendingOAuthProvider(null);
    if (provider) {
      // setTimeout lets state settle before running OAuth
      setTimeout(() => runOAuth(provider), 0);
    }
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
      <PrivacyPolicyModal visible={privacyVisible} onClose={() => setPrivacyVisible(false)} />

      {/* ToS consent modal for OAuth */}
      <Modal
        visible={tosConsentVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTosConsentVisible(false)}
      >
        <View style={styles.consentOverlay}>
          <View style={styles.consentCard}>
            <AppText style={styles.consentTitle}>Before you continue</AppText>
            <AppText style={styles.consentBody}>
              By continuing, you agree to the{' '}
              <AppText style={styles.consentLink} onPress={() => setTermsVisible(true)}>
                Terms of Service
              </AppText>
              {' '}and{' '}
              <AppText style={styles.consentLink} onPress={() => setPrivacyVisible(true)}>
                Privacy Policy
              </AppText>
              .
            </AppText>
            <View style={styles.consentActions}>
              <TouchableOpacity
                style={styles.consentCancel}
                onPress={() => { setTosConsentVisible(false); setPendingOAuthProvider(null); }}
                activeOpacity={0.75}
              >
                <AppText style={styles.consentCancelText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.consentAgreeBtn}
                onPress={handleTosConsentAgree}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.consentAgreeGrad}
                >
                  <AppText style={styles.consentAgreeText}>Agree & Continue</AppText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* iOS DOB picker in bottom sheet */}
      {Platform.OS === 'ios' && DateTimePicker && (
        <Modal
          visible={showDobPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDobPicker(false)}
        >
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowDobPicker(false)} activeOpacity={0.7}>
                  <AppText style={styles.pickerDone}>Done</AppText>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dobDate || maxDate}
                mode="date"
                display="spinner"
                maximumDate={maxDate}
                minimumDate={new Date(1900, 0, 1)}
                onChange={(_event: any, date?: Date) => {
                  if (date) setDobDate(date);
                }}
                textColor="#fff"
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Android DOB picker — native dialog */}
      {Platform.OS === 'android' && showDobPicker && DateTimePicker && (
        <DateTimePicker
          value={dobDate || maxDate}
          mode="date"
          display="spinner"
          maximumDate={maxDate}
          minimumDate={new Date(1900, 0, 1)}
          onChange={(event: any, date?: Date) => {
            setShowDobPicker(false);
            if (event.type === 'set' && date) setDobDate(date);
          }}
        />
      )}

      {step === 'avatar' && createdUserId ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: vMd + insets.top, paddingBottom: Math.max(insets.bottom, vMd) + vMd }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={isTablet ? [styles.innerWrap, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }] : styles.innerWrap}>
            {/* Header row */}
            <View style={[styles.headerRow, { marginBottom: vSm }]}>
              <TouchableOpacity style={styles.backBtn} onPress={() => { setStep('form'); setCreatedUserId(null); }} activeOpacity={0.7}>
                <ChevronLeft color="rgba(255,255,255,0.75)" size={20} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            <View style={styles.avatarStepHeader}>
              <View style={styles.avatarStepBadge}>
                <Sparkles color="#FF8A3D" size={16} strokeWidth={2.2} />
              </View>
              <AppText style={styles.avatarStepTitle}>Add your photo</AppText>
              <AppText style={styles.avatarStepSub}>
                Your partner will see it in chat and throughout the app. It makes everything feel more personal — but you can skip if you prefer.
              </AppText>
            </View>

            <View style={styles.avatarStepUploader}>
              <AvatarUploader
                userId={createdUserId}
                displayName={[firstName.trim(), lastName.trim()].filter(Boolean).join(' ').trim() || undefined}
                size={120}
                onUploadStart={() => setAvatarUploading(true)}
                onUploaded={() => { setAvatarDone(true); setAvatarUploading(false); }}
                onError={() => setAvatarUploading(false)}
              />
            </View>

            <TouchableOpacity
              style={[styles.avatarStepContinueBtn, avatarUploading && styles.avatarStepContinueDisabled]}
              onPress={proceedFromAvatarStep}
              activeOpacity={0.85}
              disabled={avatarUploading}
            >
              <LinearGradient
                colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.avatarStepContinueGrad}
              >
                {avatarUploading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <AppText style={styles.avatarStepContinueLabel}>Continue</AppText>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.avatarStepSkipBtn}
              onPress={proceedFromAvatarStep}
              activeOpacity={0.7}
              disabled={avatarUploading}
            >
              <AppText style={styles.avatarStepSkipText}>Skip for now</AppText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : step === 'name' && createdUserId ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: vMd + insets.top, paddingBottom: Math.max(insets.bottom, vMd) + vMd }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={isTablet ? [styles.innerWrap, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }] : styles.innerWrap}>
            {/* Header row */}
            <View style={[styles.headerRow, { marginBottom: vSm }]}>
              <TouchableOpacity style={styles.backBtn} onPress={() => { setStep('form'); setCreatedUserId(null); }} activeOpacity={0.7}>
                <ChevronLeft color="rgba(255,255,255,0.75)" size={20} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {/* Title */}
            <AppText style={[styles.heading, { fontSize: headingSize, marginBottom: vXs }]}>What's your name?</AppText>
            <AppText style={[styles.sub, { marginBottom: vSm }]}>Your partner will see it in chat and throughout the app.</AppText>

            {/* Name inputs */}
            <View style={[styles.form, { gap: vXs }]}>
              <View>
                <View style={styles.nameRow}>
                  <View style={[styles.inputWrap, { flex: 1 }, showFirstNameError && styles.inputWrapError]}>
                    <User color="rgba(255,255,255,0.30)" size={16} style={styles.inputIcon} />
                    <AppTextInput
                      style={[styles.input, { paddingVertical: inputPad }]}
                      value={firstName}
                      onChangeText={(t) => { setFirstName(t); if (!firstNameTouched) setFirstNameTouched(true); }}
                      onBlur={() => setFirstNameTouched(true)}
                      placeholder="First name"
                      placeholderTextColor="rgba(255,255,255,0.24)"
                      autoCapitalize="words"
                      autoComplete="given-name"
                      maxLength={20}
                      autoFocus
                    />
                  </View>
                  <View style={[styles.inputWrap, { flex: 1 }, showLastNameError && styles.inputWrapError]}>
                    <AppTextInput
                      style={[styles.input, styles.inputNoIcon, { paddingVertical: inputPad }]}
                      value={lastName}
                      onChangeText={(t) => { setLastName(t); if (!lastNameTouched) setLastNameTouched(true); }}
                      onBlur={() => setLastNameTouched(true)}
                      placeholder="Last name"
                      placeholderTextColor="rgba(255,255,255,0.24)"
                      autoCapitalize="words"
                      autoComplete="family-name"
                      maxLength={30}
                    />
                  </View>
                </View>
                {showFirstNameError && (
                  <AppText style={styles.fieldError}>{firstNameError}</AppText>
                )}
                {!showFirstNameError && showLastNameError && (
                  <AppText style={styles.fieldError}>{lastNameError}</AppText>
                )}
              </View>

              {apiError ? <AppText style={styles.error}>{apiError}</AppText> : null}

              {/* Continue */}
              <TouchableOpacity
                style={styles.createBtn}
                onPress={handleNameStepContinue}
                activeOpacity={0.85}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.createGrad, { paddingVertical: inputPad + 4 }]}
                >
                  <AppText style={styles.createLabel}>{loading ? 'Saving...' : 'Continue'}</AppText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      ) : (
      <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: vMd + insets.top, paddingBottom: Math.max(insets.bottom, vMd) + vMd }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={isTablet ? [styles.innerWrap, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }] : styles.innerWrap}>
            {/* Header row */}
            <View style={[styles.headerRow, { marginBottom: vSm }]}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
                <ChevronLeft color="rgba(255,255,255,0.75)" size={20} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {/* Title */}
            <AppText style={[styles.heading, { fontSize: headingSize, marginBottom: vXs }]}>Create your account</AppText>
            <AppText style={[styles.sub, { marginBottom: vSm }]}>Private. Playful. Just for you and your partner.</AppText>

            {/* OAuth buttons — always enabled */}
            {(showGoogle || showApple) && (
              <View style={[styles.oauthBlock, { gap: vXs, marginBottom: vSm }]}>
                {showApple && (
                  Platform.OS === 'ios' ? (
                    <AppleAuthentication.AppleAuthenticationButton
                      onPress={() => handleOAuth('apple')}
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                      cornerRadius={Radius.lg}
                      style={styles.appleNativeBtn}
                    />
                  ) : (
                    <TouchableOpacity
                      style={[styles.oauthBtn, styles.appleBtn, { paddingVertical: inputPad }]}
                      onPress={() => handleOAuth('apple')}
                      activeOpacity={0.88}
                      disabled={oauthLoading !== null || loading}
                    >
                      <AppleIcon color="#fff" size={18} />
                      <AppText style={styles.appleBtnText}>
                        {oauthLoading === 'apple' ? 'Signing in…' : 'Continue with Apple'}
                      </AppText>
                    </TouchableOpacity>
                  )
                )}

                {showGoogle && (
                  <TouchableOpacity
                    style={[styles.oauthBtn, styles.googleBtn, { paddingVertical: inputPad }]}
                    onPress={() => handleOAuth('google')}
                    activeOpacity={0.88}
                    disabled={oauthLoading !== null || loading}
                  >
                    <GoogleIcon size={18} />
                    <AppText style={styles.googleBtnText}>
                      {oauthLoading === 'google' ? 'Signing in…' : 'Continue with Google'}
                    </AppText>
                  </TouchableOpacity>
                )}

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <AppText style={styles.dividerText}>or</AppText>
                  <View style={styles.dividerLine} />
                </View>
              </View>
            )}

            {/* Form fields */}
            <View style={[styles.form, { gap: vXs }]}>
              {/* Name row */}
              <View>
                <View style={styles.nameRow}>
                  <View style={[styles.inputWrap, { flex: 1 }, showFirstNameError && styles.inputWrapError]}>
                    <User color="rgba(255,255,255,0.30)" size={16} style={styles.inputIcon} />
                    <AppTextInput
                      style={[styles.input, { paddingVertical: inputPad }]}
                      value={firstName}
                      onChangeText={(t) => { setFirstName(t); if (!firstNameTouched) setFirstNameTouched(true); }}
                      onBlur={() => setFirstNameTouched(true)}
                      placeholder="First name"
                      placeholderTextColor="rgba(255,255,255,0.24)"
                      autoCapitalize="words"
                      autoComplete="given-name"
                      maxLength={20}
                    />
                  </View>
                  <View style={[styles.inputWrap, { flex: 1 }, showLastNameError && styles.inputWrapError]}>
                    <AppTextInput
                      style={[styles.input, styles.inputNoIcon, { paddingVertical: inputPad }]}
                      value={lastName}
                      onChangeText={(t) => { setLastName(t); if (!lastNameTouched) setLastNameTouched(true); }}
                      onBlur={() => setLastNameTouched(true)}
                      placeholder="Last name"
                      placeholderTextColor="rgba(255,255,255,0.24)"
                      autoCapitalize="words"
                      autoComplete="family-name"
                      maxLength={30}
                    />
                  </View>
                </View>
                {showFirstNameError && (
                  <AppText style={styles.fieldError}>{firstNameError}</AppText>
                )}
                {!showFirstNameError && showLastNameError && (
                  <AppText style={styles.fieldError}>{lastNameError}</AppText>
                )}
              </View>

              {/* Email */}
              <View>
                <View style={[styles.inputWrap, showEmailError && styles.inputWrapError]}>
                  <Mail color="rgba(255,255,255,0.30)" size={16} style={styles.inputIcon} />
                  <AppTextInput
                    style={[styles.input, { paddingVertical: inputPad }]}
                    value={email}
                    onChangeText={(t) => { setEmail(t); if (!emailTouched) setEmailTouched(true); }}
                    onBlur={() => setEmailTouched(true)}
                    placeholder="Email"
                    placeholderTextColor="rgba(255,255,255,0.24)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                </View>
                {showEmailError && (
                  <AppText style={styles.fieldError}>{emailError}</AppText>
                )}
              </View>

              {/* Password */}
              <View>
                <View style={[styles.inputWrap, showPasswordError && styles.inputWrapError]}>
                  <Lock color="rgba(255,255,255,0.30)" size={16} style={styles.inputIcon} />
                  <AppTextInput
                    style={[styles.input, { paddingVertical: inputPad }]}
                    value={password}
                    onChangeText={(t) => { setPassword(t); if (!passwordTouched) setPasswordTouched(true); }}
                    onBlur={() => setPasswordTouched(true)}
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
                {showPasswordError ? (
                  <AppText style={styles.fieldError}>{passwordError}</AppText>
                ) : showPasswordHint ? (
                  <AppText style={styles.fieldHint}>Must be at least 8 characters</AppText>
                ) : null}
              </View>

              {/* Confirm Password */}
              <View>
                <View style={[styles.inputWrap, showConfirmPasswordError && styles.inputWrapError]}>
                  <Lock color="rgba(255,255,255,0.30)" size={16} style={styles.inputIcon} />
                  <AppTextInput
                    style={[styles.input, { paddingVertical: inputPad }]}
                    value={confirmPassword}
                    onChangeText={(t) => { setConfirmPassword(t); if (!confirmPasswordTouched) setConfirmPasswordTouched(true); }}
                    onBlur={() => setConfirmPasswordTouched(true)}
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
                {showConfirmPasswordError && (
                  <AppText style={styles.fieldError}>{confirmPasswordError}</AppText>
                )}
              </View>

              {/* Date of Birth */}
              <View>
                {Platform.OS === 'web' ? (
                  <View style={[styles.inputWrap, showDobError && styles.inputWrapError]}>
                    <Calendar color="rgba(255,255,255,0.30)" size={16} style={styles.inputIcon} />
                    <AppTextInput
                      style={[styles.input, { paddingVertical: inputPad }]}
                      value={dobText}
                      onChangeText={handleDobTextChange}
                      onBlur={() => setDobTouched(true)}
                      placeholder="Date of Birth (MM/DD/YYYY)"
                      placeholderTextColor="rgba(255,255,255,0.24)"
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.inputWrap, styles.dobTrigger, showDobError && styles.inputWrapError]}
                    onPress={() => { setDobTouched(true); setShowDobPicker(true); }}
                    activeOpacity={0.8}
                  >
                    <Calendar color="rgba(255,255,255,0.30)" size={16} style={styles.inputIcon} />
                    <AppText style={[
                      styles.dobText,
                      { paddingVertical: inputPad },
                      !dobDate && styles.dobPlaceholder,
                    ]}>
                      {dobDate ? formatDate(dobDate) : 'Date of Birth'}
                    </AppText>
                    <ChevronLeft
                      color="rgba(255,255,255,0.30)"
                      size={16}
                      style={{ transform: [{ rotate: '-90deg' }] }}
                    />
                  </TouchableOpacity>
                )}
                {showDobError ? (
                  <AppText style={styles.fieldError}>{dobFieldError}</AppText>
                ) : (
                  <AppText style={styles.fieldHint}>You must be 18 or older to use this app.</AppText>
                )}
              </View>

              {/* API / server errors */}
              {apiError ? <AppText style={styles.error}>{apiError}</AppText> : null}

              {/* ToS checkbox — immediately above Create Account */}
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
                <AppText style={styles.tosText}>
                  I have read and agree to the{' '}
                  <AppText
                    style={styles.tosLink}
                    onPress={(e) => { e.stopPropagation(); setTermsVisible(true); }}
                  >
                    Terms of Service
                  </AppText>
                  {' '}and{' '}
                  <AppText
                    style={styles.tosLink}
                    onPress={(e) => { e.stopPropagation(); setPrivacyVisible(true); }}
                  >
                    Privacy Policy
                  </AppText>
                </AppText>
              </TouchableOpacity>

              {/* Create Account */}
              <TouchableOpacity
                style={[styles.createBtn, !formReady && styles.createBtnDisabled]}
                onPress={handleRegister}
                activeOpacity={0.85}
                disabled={loading || oauthLoading !== null || !formReady}
              >
                {formReady ? (
                  <LinearGradient
                    colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.createGrad, { paddingVertical: inputPad + 4 }]}
                  >
                    <AppText style={styles.createLabel}>{loading ? 'Creating...' : 'Create Account'}</AppText>
                  </LinearGradient>
                ) : (
                  <View style={[styles.createGrad, styles.createGradDisabled, { paddingVertical: inputPad + 4 }]}>
                    <AppText style={styles.createLabelDisabled}>{loading ? 'Creating...' : 'Create Account'}</AppText>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.loginRow}
                onPress={() => router.replace('/(auth)/login')}
                activeOpacity={0.7}
              >
                <AppText style={styles.loginText}>
                  Already have an account?{'  '}
                  <AppText style={styles.loginLink}>Sign In</AppText>
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
  },
  innerWrap: {
    flex: 1,
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
  appleBtn: {
    backgroundColor: '#1A1A1A',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  appleBtnText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  appleNativeBtn: {
    width: '100%',
    height: 48,
  },
  googleBtn: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  googleBtnText: {
    color: '#1A1A1A',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
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
  nameRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: Spacing.md,
  },
  inputWrapError: {
    borderColor: '#FF5A5F',
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
  inputNoIcon: {
    paddingLeft: 0,
  },
  eyeBtn: {
    padding: 6,
  },
  dobTrigger: {
    cursor: 'pointer',
  } as any,
  dobText: {
    flex: 1,
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
  },
  dobPlaceholder: {
    color: 'rgba(255,255,255,0.24)',
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
    paddingVertical: Spacing.sm,
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
  // ToS consent modal
  consentOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  consentCard: {
    backgroundColor: '#1A1020',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 380,
    gap: Spacing.md,
  },
  consentTitle: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  consentBody: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    textAlign: 'center',
  },
  consentLink: {
    color: '#FF7A45',
    fontFamily: 'Inter-SemiBold',
  },
  consentActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  consentCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  consentCancelText: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  consentAgreeBtn: {
    flex: 1,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  consentAgreeGrad: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  consentAgreeText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
  },
  // iOS DOB picker bottom sheet
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#1A1020',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  pickerDone: {
    color: '#FF7A45',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
    paddingHorizontal: Spacing.sm,
  },
  // Avatar step
  avatarStepHeader: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  avatarStepBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,138,61,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,138,61,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  avatarStepTitle: {
    color: '#fff',
    fontSize: FontSize.xxl,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  avatarStepSub: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  avatarStepUploader: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  avatarStepContinueBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 14,
  },
  avatarStepContinueDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  avatarStepContinueGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: Radius.pill,
  },
  avatarStepContinueLabel: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.2,
  },
  avatarStepSkipBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  avatarStepSkipText: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
