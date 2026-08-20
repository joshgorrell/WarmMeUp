import React, { useState } from 'react';
import { Modal, View, ScrollView, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Alert } from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { X, ShieldAlert, UserX } from 'lucide-react-native';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { clearLocalImageCache } from '@/lib/mediaCache';

interface Props { visible: boolean; onClose: () => void; }

const REPORT_REASONS = [
  ['harassment', 'Harassment or threatening behavior'],
  ['non_consensual_content', 'Non-consensual content'],
  ['underage_concern', 'Underage user concern'],
  ['illegal_or_harmful', 'Illegal or harmful activity'],
  ['spam_or_misuse', 'Spam or misuse'],
  ['other', 'Other'],
] as const;

const SECTIONS = [
  { title: '1. Intended Use', body: `Warm Me Up is designed for consensual adult relationships, private partner communication, playful interaction between partners, and respectful sharing between connected users.\n\nWarm Me Up is not a public social platform or dating marketplace. The app is intended only for communication and interaction between connected adult partners who are 18 years of age or older.` },
  { title: '2. Not for Illegal or Nefarious Use', body: `You may not use Warm Me Up for any illegal, unlawful, fraudulent, or harmful purpose. This includes facilitating crime, exploitation, coercion, abuse, blackmail, extortion, intimidation, fraud, trafficking, or unauthorized access. Violations may result in immediate account termination and, where required by law, referral to law enforcement.` },
  { title: '3. Consent Matters', body: `Only share messages, photos, videos, dares, prompts, and custom content with the clear consent of your partner. Respect boundaries at all times. “No” always means no. Users are responsible for ensuring all interactions remain consensual, respectful, and appropriate for both participants.` },
  { title: '4. Respectful Communication', body: `Warm Me Up should never be used to harass, intimidate, manipulate, threaten, blackmail, pressure, exploit, or shame another person. Keep things playful. Keep things healthy.` },
  { title: '5. Privacy & Trust', body: `Respect the privacy and trust of your partner. Users may not share another user's content without permission, upload content without consent, impersonate another person, attempt unauthorized account access, or misuse private media.` },
  { title: '6. No Guarantee of Privacy or Security', body: `Warm Me Up includes privacy-focused tools such as Vault, Privacy Mode, biometric authentication, and screenshot notifications. These features help users manage privacy but cannot guarantee absolute privacy or security. Content displayed on a device may still be captured by screenshots, recordings, another device, compromised hardware, or other means outside Warm Me Up's control.` },
  { title: '7. Prohibited Content', body: `Content involving minors, exploitation or abuse, non-consensual intimate imagery, criminal activity, violent threats, trafficking, harassment, stalking, malicious software, scams, fraud, or impersonation is prohibited. Violations may result in suspension or permanent account removal.` },
  { title: '8. Safety & Responsibility', body: `Users are responsible for the content they create, the dares they send or accept, the decisions they make, and interactions with their partner. Never pressure another user into participating in anything that makes them uncomfortable.` },
  { title: '9. Reporting Abuse', body: `Use the in-app Report Partner control below if you believe your partner is abusing the platform, violating these Guidelines, sharing non-consensual content, or engaging in harmful or illegal behavior. Reports are reviewed by Warm Me Up. Private messages and media are not automatically copied into a report.` },
  { title: '10. Enforcement', body: `Warm Me Up may investigate reports and may suspend or terminate accounts that violate these Guidelines, our Terms of Service, or applicable law. Where required by law, violations may be reported to law enforcement.` },
  { title: '11. Final Thoughts', body: `Warm Me Up was created for couples who want a fun, private space to connect and stay playful together. Use the app responsibly. Respect each other. Protect each other's trust.\n\nStay Playful.` },
];

export default function CommunityGuidelinesModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user, couple, partnerProfile, refreshCouple, refreshSubscription } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const partnerId = couple && user ? (couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id) : null;
  const partnerName = partnerProfile?.display_name || partnerProfile?.first_name || 'your partner';

  const submitReport = async () => {
    if (!user?.id || !partnerId || !couple?.id || !reason) return;
    setSubmitting(true);
    const { error } = await supabase.from('safety_reports').insert({ reporter_user_id: user.id, reported_user_id: partnerId, couple_id: couple.id, reason, notes: notes.trim() || null });
    setSubmitting(false);
    if (error) { Alert.alert('Report not sent', error.message); return; }
    setReportOpen(false); setReason(''); setNotes('');
    Alert.alert('Report received', 'Thank you. Your report was submitted to the Warm Me Up safety queue.');
  };

  const disconnectAndBlock = () => {
    if (!user?.id || !partnerId || !couple?.id) return;
    Alert.alert('Disconnect & Block Partner?', `This will block ${partnerName}, end your connection, and permanently remove shared couple data. They will not be able to reconnect with you unless you later remove the block.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect & Block', style: 'destructive', onPress: async () => {
        setBlocking(true);
        try {
          const { error: blockError } = await supabase.from('blocked_users').upsert({ blocker_user_id: user.id, blocked_user_id: partnerId });
          if (blockError) throw blockError;
          const { data: { session } } = await supabase.auth.getSession();
          const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
          const res = await fetch(`${baseUrl}/functions/v1/disconnect-couple`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, Apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' } });
          if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error ?? 'Failed to disconnect'); }
          await clearLocalImageCache();
          await refreshCouple(); await refreshSubscription();
          onClose();
          Alert.alert('Partner blocked', 'The connection has ended and this partner is blocked from reconnecting with you.');
        } catch (e: any) {
          Alert.alert('Unable to block partner', e?.message ?? 'Please try again.');
        } finally { setBlocking(false); }
      }},
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={['#060406', '#0A060A', '#0E080E']} style={styles.root}>
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? Spacing.md : insets.top + Spacing.sm }]}>
          <View style={styles.headerTextBlock}><AppText style={styles.headerTitle}>Safety & Community Guidelines</AppText><AppText style={styles.headerSub}>Respect, consent, privacy and control</AppText></View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}><X color="rgba(255,255,255,0.70)" size={18} /></TouchableOpacity>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xxl }]} showsVerticalScrollIndicator={false}>
          {!!partnerId && <View style={styles.safetyCard}>
            <AppText style={styles.safetyTitle}>Safety controls</AppText>
            <AppText style={styles.safetyBody}>You can report a concern or immediately disconnect and block your connected partner. Neither action requires your partner's approval.</AppText>
            <TouchableOpacity style={styles.safetyButton} onPress={() => setReportOpen(true)}><ShieldAlert color="#FF8A3D" size={18} /><AppText style={styles.safetyButtonText}>Report Partner</AppText></TouchableOpacity>
            <TouchableOpacity style={[styles.safetyButton, styles.blockButton]} onPress={disconnectAndBlock} disabled={blocking}><UserX color="#FF666B" size={18} /><AppText style={[styles.safetyButtonText, { color: '#FF777B' }]}>{blocking ? 'Disconnecting…' : 'Disconnect & Block Partner'}</AppText></TouchableOpacity>
          </View>}
          {SECTIONS.map(section => <View key={section.title} style={styles.section}><AppText style={styles.sectionTitle}>{section.title}</AppText><AppText style={styles.sectionBody}>{section.body}</AppText></View>)}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm }]}><TouchableOpacity style={styles.doneBtn} onPress={onClose}><LinearGradient colors={['#FF7B00', '#FF5A3D', '#FF2E8A']} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.doneGrad}><AppText style={styles.doneLabel}>Close</AppText></LinearGradient></TouchableOpacity></View>
      </LinearGradient>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <View style={styles.reportOverlay}><View style={styles.reportCard}>
          <View style={styles.reportHeader}><AppText style={styles.reportTitle}>Report Partner</AppText><TouchableOpacity onPress={() => setReportOpen(false)}><X color="#fff" size={20} /></TouchableOpacity></View>
          <AppText style={styles.safetyBody}>Choose the reason that best describes your concern. Private messages and media are not attached automatically.</AppText>
          {REPORT_REASONS.map(([value, label]) => <TouchableOpacity key={value} style={[styles.reasonRow, reason === value && styles.reasonSelected]} onPress={() => setReason(value)}><View style={[styles.radio, reason === value && styles.radioSelected]} /><AppText style={styles.reasonText}>{label}</AppText></TouchableOpacity>)}
          <AppTextInput value={notes} onChangeText={setNotes} placeholder="Optional details" placeholderTextColor="rgba(255,255,255,0.3)" multiline maxLength={1000} style={styles.notes} />
          <TouchableOpacity style={[styles.submit, (!reason || submitting) && { opacity: 0.45 }]} disabled={!reason || submitting} onPress={submitReport}>{submitting ? <ActivityIndicator color="#fff" /> : <AppText style={styles.submitText}>Submit Report</AppText>}</TouchableOpacity>
        </View></View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:{flex:1}, header:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',paddingHorizontal:Spacing.xl,paddingBottom:Spacing.md,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,0.08)'}, headerTextBlock:{flex:1,paddingRight:Spacing.md}, headerTitle:{color:'#fff',fontSize:FontSize.lg,fontFamily:'Inter-Bold'}, headerSub:{color:'rgba(255,255,255,0.40)',fontSize:FontSize.sm,marginTop:2}, closeBtn:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,0.07)'},
  scroll:{flex:1}, scrollContent:{paddingHorizontal:Spacing.xl,paddingTop:Spacing.lg}, section:{marginBottom:Spacing.lg}, sectionTitle:{color:'#fff',fontSize:FontSize.body,fontFamily:'Inter-SemiBold',marginBottom:Spacing.sm}, sectionBody:{color:'rgba(255,255,255,0.56)',fontSize:FontSize.sm,lineHeight:21},
  safetyCard:{borderWidth:1,borderColor:'rgba(255,90,95,0.20)',backgroundColor:'rgba(255,255,255,0.04)',borderRadius:Radius.lg,padding:Spacing.md,gap:Spacing.sm,marginBottom:Spacing.xl}, safetyTitle:{color:'#fff',fontFamily:'Inter-Bold',fontSize:FontSize.body}, safetyBody:{color:'rgba(255,255,255,0.58)',fontSize:FontSize.sm,lineHeight:20}, safetyButton:{minHeight:48,borderWidth:1,borderColor:'rgba(255,138,61,0.28)',borderRadius:Radius.md,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:Spacing.md,backgroundColor:'rgba(255,138,61,0.06)'}, blockButton:{borderColor:'rgba(255,90,95,0.28)',backgroundColor:'rgba(255,90,95,0.06)'}, safetyButtonText:{color:'#FFB06E',fontFamily:'Inter-SemiBold',fontSize:FontSize.sm},
  footer:{paddingHorizontal:Spacing.xl,paddingTop:Spacing.md,borderTopWidth:1,borderTopColor:'rgba(255,255,255,0.08)'}, doneBtn:{borderRadius:Radius.pill,overflow:'hidden'}, doneGrad:{alignItems:'center',paddingVertical:14}, doneLabel:{color:'#fff',fontSize:FontSize.body,fontFamily:'Inter-Bold'},
  reportOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.82)',justifyContent:'center',padding:Spacing.xl}, reportCard:{backgroundColor:'#15121A',borderRadius:Radius.xl,borderWidth:1,borderColor:'rgba(255,255,255,0.12)',padding:Spacing.lg,gap:Spacing.sm}, reportHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}, reportTitle:{color:'#fff',fontSize:FontSize.lg,fontFamily:'Inter-Bold'}, reasonRow:{minHeight:44,borderRadius:Radius.md,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:Spacing.sm}, reasonSelected:{backgroundColor:'rgba(255,46,138,0.08)'}, radio:{width:16,height:16,borderRadius:8,borderWidth:1.5,borderColor:'rgba(255,255,255,0.35)'}, radioSelected:{borderColor:'#FF2E8A',backgroundColor:'#FF2E8A'}, reasonText:{color:'rgba(255,255,255,0.78)',fontSize:FontSize.sm}, notes:{minHeight:90,borderWidth:1,borderColor:'rgba(255,255,255,0.12)',borderRadius:Radius.md,color:'#fff',padding:Spacing.md,textAlignVertical:'top',marginTop:Spacing.sm}, submit:{backgroundColor:'#FF2E8A',borderRadius:Radius.pill,minHeight:48,alignItems:'center',justifyContent:'center',marginTop:Spacing.sm}, submitText:{color:'#fff',fontFamily:'Inter-Bold',fontSize:FontSize.sm}
});
