import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, RefreshCw } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Spacing, Radius, FontSize } from '@/constants/theme';

type Report = { id:string; reporter_user_id:string; reported_user_id:string|null; couple_id:string|null; reason:string; notes:string|null; status:string; created_at:string; admin_notes:string|null };

export default function SafetyReportsAdmin() {
  const router = useRouter();
  const { isAdmin, isSuperAdmin, user } = useAuth();
  const [reports,setReports]=useState<Report[]>([]); const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);const{data}=await supabase.from('safety_reports').select('*').order('created_at',{ascending:false}).limit(200);setReports((data??[]) as Report[]);setLoading(false);},[]);
  useEffect(()=>{if(isAdmin||isSuperAdmin)load();else setLoading(false);},[isAdmin,isSuperAdmin,load]);
  const setStatus=async(id:string,status:string)=>{await supabase.from('safety_reports').update({status,reviewed_at:new Date().toISOString(),reviewed_by:user?.id??null}).eq('id',id);load();};
  if(!isAdmin&&!isSuperAdmin)return <View style={styles.root}><AppText style={styles.title}>Access denied</AppText></View>;
  return <View style={styles.root}>
    <View style={styles.header}><TouchableOpacity onPress={()=>router.back()}><ChevronLeft color="#fff" size={24}/></TouchableOpacity><AppText style={styles.title}>Safety Reports</AppText><TouchableOpacity onPress={load}><RefreshCw color="#fff" size={20}/></TouchableOpacity></View>
    {loading?<ActivityIndicator color="#FF2E8A" style={{marginTop:40}}/>:<ScrollView contentContainerStyle={styles.list}>{reports.length===0?<AppText style={styles.muted}>No reports.</AppText>:reports.map(r=><View key={r.id} style={styles.card}><View style={styles.row}><AppText style={styles.reason}>{r.reason.replaceAll('_',' ')}</AppText><AppText style={styles.status}>{r.status}</AppText></View><AppText style={styles.meta}>{new Date(r.created_at).toLocaleString()}</AppText><AppText style={styles.meta}>Reporter: {r.reporter_user_id}</AppText><AppText style={styles.meta}>Reported: {r.reported_user_id??'—'}</AppText>{r.notes&&<AppText style={styles.notes}>{r.notes}</AppText>}<View style={styles.actions}><TouchableOpacity style={styles.action} onPress={()=>setStatus(r.id,'reviewing')}><AppText style={styles.actionText}>Reviewing</AppText></TouchableOpacity><TouchableOpacity style={styles.action} onPress={()=>setStatus(r.id,'resolved')}><AppText style={styles.actionText}>Resolve</AppText></TouchableOpacity><TouchableOpacity style={styles.action} onPress={()=>setStatus(r.id,'dismissed')}><AppText style={styles.actionText}>Dismiss</AppText></TouchableOpacity></View></View>)}</ScrollView>}
  </View>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#07060A',paddingTop:50},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:Spacing.lg,paddingBottom:Spacing.md},title:{color:'#fff',fontSize:22,fontFamily:'Inter-Bold'},list:{padding:Spacing.lg,gap:Spacing.md,paddingBottom:60},card:{borderWidth:1,borderColor:'rgba(255,255,255,0.10)',backgroundColor:'rgba(255,255,255,0.04)',borderRadius:Radius.lg,padding:Spacing.md,gap:7},row:{flexDirection:'row',justifyContent:'space-between'},reason:{color:'#fff',fontSize:FontSize.body,fontFamily:'Inter-SemiBold',textTransform:'capitalize'},status:{color:'#FF8A6B',fontSize:FontSize.xs,fontFamily:'Inter-SemiBold',textTransform:'uppercase'},meta:{color:'rgba(255,255,255,0.42)',fontSize:FontSize.xs},notes:{color:'rgba(255,255,255,0.75)',fontSize:FontSize.sm,lineHeight:20,marginTop:6},actions:{flexDirection:'row',gap:8,marginTop:8,flexWrap:'wrap'},action:{borderWidth:1,borderColor:'rgba(255,46,138,0.3)',borderRadius:Radius.pill,paddingHorizontal:12,paddingVertical:7},actionText:{color:'#FF7AAA',fontSize:FontSize.xs,fontFamily:'Inter-SemiBold'},muted:{color:'rgba(255,255,255,0.45)',textAlign:'center',marginTop:40}});
