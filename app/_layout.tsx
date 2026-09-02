import React, { Component, useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments, router as expoRouter } from 'expo-router';
import { DarkTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, TouchableOpacity, AppState, AppStateStatus, Platform, Image } from 'react-native';
import AppText from '@/components/AppText';
import type { NotificationData } from '@/lib/notifications';
import { emitIncoming } from '@/lib/incomingEvents';
import IncomingSlash from '@/components/IncomingSlash';
import UploadProgressOverlay from '@/components/UploadProgressOverlay';
import { supabase } from '@/lib/supabase';

const PREFETCH_LOGO = require('@/assets/images/image_(3).png');
const PREFETCH_SLOGAN = require('@/assets/images/image_(2).png');
if (Platform.OS !== 'web') { Image.prefetch(Image.resolveAssetSource(PREFETCH_LOGO).uri); Image.prefetch(Image.resolveAssetSource(PREFETCH_SLOGAN).uri); }

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; errorMsg: string }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { hasError: false, errorMsg: '' }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, errorMsg: error?.message ?? String(error) }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('[ErrorBoundary]', error, info.componentStack); }
  render() {
    if (this.state.hasError) return <View style={{ flex:1,backgroundColor:'#07070A',alignItems:'center',justifyContent:'center',gap:20,padding:24 }}><AppText style={{color:'#fff',fontSize:16,textAlign:'center'}}>Something went wrong.</AppText><AppText style={{color:'rgba(255,100,100,0.9)',fontSize:12,textAlign:'center',fontFamily:'monospace'}}>{this.state.errorMsg}</AppText><TouchableOpacity onPress={() => { this.setState({hasError:false,errorMsg:''}); try { expoRouter.replace('/(app)/(tabs)/'); } catch {} }} style={{backgroundColor:'#FF2E8A',paddingHorizontal:28,paddingVertical:12,borderRadius:24}}><AppText style={{color:'#fff',fontSize:15,fontFamily:'Inter-SemiBold'}}>Try Again</AppText></TouchableOpacity></View>;
    return this.props.children;
  }
}

export const pendingNotificationRoute = { current: null as NotificationData | null };
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert:false, shouldPlaySound:false, shouldSetBadge:false, shouldShowBanner:false, shouldShowList:false }) });
SplashScreen.preventAutoHideAsync();

function PrivacyOverlay() {
  const { settings } = useAuth(); const [hidden,setHidden] = useState(false); const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => { if (Platform.OS === 'web') return; const sub=AppState.addEventListener('change',(next:AppStateStatus)=>{ const prev=appStateRef.current; appStateRef.current=next; const blurEnabled=settings?.blur_on_background ?? true; if(!blurEnabled){setHidden(false);return;} if(next==='inactive'||next==='background')setHidden(true); else if(next==='active'&&(prev==='inactive'||prev==='background'))setHidden(false);}); return()=>sub.remove(); },[settings?.blur_on_background]);
  useEffect(() => { if(Platform.OS!=='web')return; const onVisibility=()=>{const blurEnabled=settings?.blur_on_background??true;if(!blurEnabled){setHidden(false);return;}setHidden(document.hidden);}; document.addEventListener('visibilitychange',onVisibility);return()=>document.removeEventListener('visibilitychange',onVisibility);},[settings?.blur_on_background]);
  useEffect(() => { if(Platform.OS!=='web')return; const style=document.createElement('style');style.id='warmup-print-guard';style.textContent='@media print { body { visibility: hidden !important; filter: blur(40px) !important; } }';document.head.appendChild(style);const before=()=>setHidden(true),after=()=>setHidden(false);window.addEventListener('beforeprint',before);window.addEventListener('afterprint',after);return()=>{style.remove();window.removeEventListener('beforeprint',before);window.removeEventListener('afterprint',after);};},[]);
  if(!hidden)return null; return <View style={[StyleSheet.absoluteFillObject,{backgroundColor:'#07070A',zIndex:9999}]} pointerEvents="none"/>;
}

function NotificationHandler(){useEffect(()=>{if(Platform.OS==='web')return;const responseSub=Notifications.addNotificationResponseReceivedListener(response=>{const data=response.notification.request.content.data as unknown as NotificationData|undefined;if(data&&typeof data.event_type==='string')pendingNotificationRoute.current=data;});const receivedSub=Notifications.addNotificationReceivedListener(()=>{if(AppState.currentState==='active')emitIncoming();});return()=>{responseSub.remove();receivedSub.remove();};},[]);return null;}

function SessionGuard() {
  const { session, loading, isAdmin, isSuperAdmin } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const ageCheckFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    const first = segments[0];
    const current = segments[segments.length - 1];

    if (!session) {
      ageCheckFor.current = null;
      const protectedRoute = first === '(app)' || first === '(admin)' || first === 'weather' || first === 'unlock' || first === 'debug';
      if (protectedRoute) router.replace('/(auth)/welcome');
      return;
    }

    // Debug screens are developer/admin tools. Merely knowing the route must never grant access.
    if (first === 'debug' && !isAdmin && !isSuperAdmin) {
      router.replace('/(app)/(tabs)/');
      return;
    }

    // Email/password registration already performs the DOB gate in the registration form.
    // OAuth providers do not reliably return DOB, so require a one-time persisted age verification.
    const provider = session.user.app_metadata?.provider;
    const needsOAuthAgeGate = provider && provider !== 'email';
    if (!needsOAuthAgeGate || current === 'verify-age' || ageCheckFor.current === session.user.id) return;

    ageCheckFor.current = session.user.id;
    (async () => {
      const { data, error } = await supabase.from('profiles').select('age_verified_at').eq('id', session.user.id).maybeSingle();
      if (error) { ageCheckFor.current = null; return; }
      if (!data?.age_verified_at) router.push('/(auth)/verify-age');
    })();
  }, [session, loading, isAdmin, isSuperAdmin, segments, router]);
  return null;
}

function BackgroundLockManager(){const{session,settings,lockApp,isAuthenticatingRef,refreshCouple}=useAuth();const router=useRouter();const segments=useSegments();const appStateRef=useRef<AppStateStatus>(AppState.currentState);const wasBackgroundedRef=useRef(false);const backgroundedAtRef=useRef<number|null>(null);useEffect(()=>{if(Platform.OS==='web')return;const sub=AppState.addEventListener('change',(next:AppStateStatus)=>{appStateRef.current=next;if(next==='background'||next==='inactive'){wasBackgroundedRef.current=true;backgroundedAtRef.current=Date.now();}else if(next==='active'&&wasBackgroundedRef.current){wasBackgroundedRef.current=false;refreshCouple();const method=settings?.login_method??'none';if(!session||method==='none'||method==='password'||isAuthenticatingRef.current)return;const lockAfter=settings?.lock_after_seconds??null;const bgStart=backgroundedAtRef.current;backgroundedAtRef.current=null;if(lockAfter===null||lockAfter<0||bgStart===null)return;const bgSeconds=(Date.now()-bgStart)/1000;const shouldLock=lockAfter===0||bgSeconds>=lockAfter;if(shouldLock){lockApp();const currentRoute=segments[segments.length-1];const safeRoutes=['unlock','transition','weather'];if(!safeRoutes.includes(currentRoute))router.replace('/unlock');}}});return()=>sub.remove();},[session,settings?.login_method,settings?.lock_after_seconds,lockApp,isAuthenticatingRef,refreshCouple]);return null;}

export default function RootLayout(){useFrameworkReady();const[fontsLoaded,fontError]=useFonts({'Inter-Regular':Inter_400Regular,'Inter-Medium':Inter_500Medium,'Inter-SemiBold':Inter_600SemiBold,'Inter-Bold':Inter_700Bold});useEffect(()=>{if(fontsLoaded||fontError)SplashScreen.hideAsync();},[fontsLoaded,fontError]);if(!fontsLoaded&&!fontError)return null;return <ErrorBoundary><GestureHandlerRootView style={styles.root}><NavThemeProvider value={DarkTheme}><ThemeProvider><AuthProvider><Stack screenOptions={{headerShown:false,animation:'fade',contentStyle:{backgroundColor:'#05040A'}}}><Stack.Screen name="index"/><Stack.Screen name="weather"/><Stack.Screen name="transition"/><Stack.Screen name="unlock"/><Stack.Screen name="delete-account"/>{__DEV__&&<Stack.Screen name="debug"/>}<Stack.Screen name="(auth)"/><Stack.Screen name="(app)"/><Stack.Screen name="(admin)"/><Stack.Screen name="+not-found"/></Stack><IncomingSlash/><UploadProgressOverlay/><PrivacyOverlay/><SessionGuard/><BackgroundLockManager/><NotificationHandler/><StatusBar style="light"/></AuthProvider></ThemeProvider></NavThemeProvider></GestureHandlerRootView></ErrorBoundary>}

const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#05040A'}});
