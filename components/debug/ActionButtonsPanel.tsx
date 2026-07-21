import React from 'react';
import {
  View, TouchableOpacity, StyleSheet, Platform, Share, ActivityIndicator,
} from 'react-native';
import { Trash2, LogOut, Shield, Share2, RefreshCw } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import {
  Row,
  RpcTestState,
  DbIdentityState,
  CheckUpdateState,
  ApplyUpdateState,
  SessionTestState,
  DbTestState,
  PushTestState,
} from './DebugSharedHelpers';

// ── Action Buttons + inline RPC/test result cards ──
// Extracted from debug.tsx lines ~2171-2726. Pure presentational —
// the parent owns all state and handlers; this component just
// renders the buttons and result cards.

type ActionButtonsPanelProps = {
  // destructive action states
  clearing: boolean;
  loggingOut: boolean;
  resetting: boolean;
  // push re-register
  reRegisterStatus: 'idle' | 'running' | 'done' | 'error';
  // local test notification
  localTestSent: 'idle' | 'sending' | 'sent' | 'error';
  // push test
  pushTest: PushTestState;
  // rpc test
  rpcTest: RpcTestState;
  // db identity
  dbIdentity: DbIdentityState;
  // OTA check
  checkUpdate: CheckUpdateState;
  // OTA apply
  applyUpdate: ApplyUpdateState;
  // session test
  sessionTest: SessionTestState;
  // db test
  dbTest: DbTestState;
  // flags
  userId: string | null;
  coupleId: string | null | undefined;
  isSuperAdmin: boolean | null | undefined;
  // handlers
  onClearLocalState: () => void;
  onForceLogout: () => void;
  onResetSecurity: () => void;
  onReRegisterToken: () => void;
  onLocalTestNotification: () => void;
  onTestPush: (force: boolean) => void;
  onTestRpc: () => void;
  onTestDbIdentity: () => void;
  onCheckUpdate: () => void;
  onFetchAndApplyUpdate: () => void;
  onTestGetSession: () => void;
  onTestDb: () => void;
  onShareDebugInfo: () => void;
};

export default function ActionButtonsPanel({
  clearing,
  loggingOut,
  resetting,
  reRegisterStatus,
  localTestSent,
  pushTest,
  rpcTest,
  dbIdentity,
  checkUpdate,
  applyUpdate,
  sessionTest,
  dbTest,
  userId,
  coupleId,
  isSuperAdmin,
  onClearLocalState,
  onForceLogout,
  onResetSecurity,
  onReRegisterToken,
  onLocalTestNotification,
  onTestPush,
  onTestRpc,
  onTestDbIdentity,
  onCheckUpdate,
  onFetchAndApplyUpdate,
  onTestGetSession,
  onTestDb,
  onShareDebugInfo,
}: ActionButtonsPanelProps) {
  return (
    <View style={btnStyles.buttonArea}>
      <TouchableOpacity
        style={[btnStyles.actionBtn, btnStyles.actionBtnDanger, clearing && btnStyles.btnDisabled]}
        onPress={onClearLocalState}
        disabled={clearing}
        activeOpacity={0.8}
      >
        <Trash2 size={15} color="#fff" />
        <AppText style={btnStyles.actionBtnLabel}>
          {clearing ? 'Clearing…' : 'Clear Local Device State'}
        </AppText>
      </TouchableOpacity>
      <AppText style={btnStyles.btnNote}>
        Deletes PIN, unlock timer, and weather cache. Stays logged in.
      </AppText>

      <TouchableOpacity
        style={[btnStyles.actionBtn, btnStyles.actionBtnDanger, loggingOut && btnStyles.btnDisabled]}
        onPress={onForceLogout}
        disabled={loggingOut}
        activeOpacity={0.8}
      >
        <LogOut size={15} color="#fff" />
        <AppText style={btnStyles.actionBtnLabel}>
          {loggingOut ? 'Logging out…' : 'Force Logout'}
        </AppText>
      </TouchableOpacity>
      <AppText style={btnStyles.btnNote}>
        Signs out of Supabase and returns to welcome screen.
      </AppText>

      <TouchableOpacity
        style={[btnStyles.actionBtn, btnStyles.actionBtnWarn, resetting && btnStyles.btnDisabled]}
        onPress={onResetSecurity}
        disabled={resetting}
        activeOpacity={0.8}
      >
        <Shield size={15} color="#fff" />
        <AppText style={btnStyles.actionBtnLabel}>
          {resetting ? 'Resetting…' : 'Reset Security Settings'}
        </AppText>
      </TouchableOpacity>
      <AppText style={btnStyles.btnNote}>
        Sets login_method=password, disables stealth mode, clears lock timer in DB.
      </AppText>

      {/* ── Push Test Buttons ── */}
      <TouchableOpacity
        style={[btnStyles.actionBtn, { backgroundColor: '#1a1a2e' }, (reRegisterStatus === 'running' || Platform.OS === 'web' || !userId) && btnStyles.btnDisabled]}
        onPress={onReRegisterToken}
        disabled={reRegisterStatus === 'running' || Platform.OS === 'web' || !userId}
        activeOpacity={0.8}
      >
        {reRegisterStatus === 'running'
          ? <ActivityIndicator size="small" color="#A569BD" />
          : <RefreshCw size={15} color="#A569BD" />
        }
        <AppText style={[btnStyles.actionBtnLabel, { color: '#A569BD' }]}>
          {reRegisterStatus === 'running' ? 'Re-registering…'
            : reRegisterStatus === 'done' ? 'Token Re-registered'
            : reRegisterStatus === 'error' ? 'Re-register Failed (check permission)'
            : 'A. Re-register Push Token'}
        </AppText>
      </TouchableOpacity>
      <AppText style={btnStyles.btnNote}>
        Fetches a fresh Expo push token from APNs and saves it to the database. Fixes stale or missing tokens without toggling Settings.
      </AppText>

      <TouchableOpacity
        style={[btnStyles.actionBtn, { backgroundColor: '#1a2a1a' }, (localTestSent === 'sending' || Platform.OS === 'web') && btnStyles.btnDisabled]}
        onPress={onLocalTestNotification}
        disabled={localTestSent === 'sending' || Platform.OS === 'web'}
        activeOpacity={0.8}
      >
        {localTestSent === 'sending'
          ? <ActivityIndicator size="small" color="#82E0AA" />
          : <RefreshCw size={15} color="#82E0AA" />
        }
        <AppText style={[btnStyles.actionBtnLabel, { color: '#82E0AA' }]}>
          {localTestSent === 'sending' ? 'Scheduling…'
            : localTestSent === 'sent' ? 'Local Notification Sent'
            : localTestSent === 'error' ? 'Local Notification Failed'
            : 'B. Local Test Notification'}
        </AppText>
      </TouchableOpacity>
      <AppText style={btnStyles.btnNote}>
        Schedules a notification to appear in 1 second. Proves permission + in-app handler. No server involved.
      </AppText>

      <TouchableOpacity
        style={[btnStyles.actionBtn, { backgroundColor: '#0d2233' }, (pushTest.running || Platform.OS === 'web' || !coupleId) && btnStyles.btnDisabled]}
        onPress={() => onTestPush(false)}
        disabled={pushTest.running || Platform.OS === 'web' || !coupleId}
        activeOpacity={0.8}
      >
        {pushTest.running && pushTest.self.status === 'loading'
          ? <ActivityIndicator size="small" color="#5DADE2" />
          : <RefreshCw size={15} color="#5DADE2" />
        }
        <AppText style={[btnStyles.actionBtnLabel, { color: '#5DADE2' }]}>
          {pushTest.running ? 'Running push tests…' : 'C. End-to-End Push Test (Self + Partner)'}
        </AppText>
      </TouchableOpacity>
      <AppText style={btnStyles.btnNote}>
        Re-registers token, saves to DB, then sends via Expo push server to both self and partner.
      </AppText>

      {pushTest.running && (
        <View style={[btnStyles.rpcCard, btnStyles.rpcCardLoading]}>
          <AppText style={[btnStyles.rpcCardStatus, { color: '#FFA040' }]}>
            {pushTest.self.status === 'loading' ? 'Sending self push…'
              : pushTest.partner.status === 'loading' ? 'Sending partner push…'
              : 'Running…'}
          </AppText>
        </View>
      )}

      {!pushTest.running && pushTest.ranAt !== null && (() => {
        const selfReceiptOk = pushTest.self.receipt_status === 'ok';
        const selfReceiptErr = pushTest.self.receipt_status === 'error' || (pushTest.self.receipt_error ?? '') !== '';
        const partnerReceiptOk = pushTest.partner.receipt_status === 'ok';
        const partnerReceiptErr = pushTest.partner.receipt_status === 'error' || (pushTest.partner.receipt_error ?? '') !== '';
        const anyReceiptOk = selfReceiptOk || partnerReceiptOk;
        const anyReceiptErr = selfReceiptErr || partnerReceiptErr;
        const cardStyle = pushTest.top_error || anyReceiptErr
          ? btnStyles.rpcCardError
          : anyReceiptOk
            ? { backgroundColor: '#0d1f2b', borderColor: '#1a4a6a' }
            : { backgroundColor: '#2b2b0d', borderColor: '#6a6a1a' };
        const cardColor = pushTest.top_error || anyReceiptErr ? '#FF6B6B' : anyReceiptOk ? '#5DADE2' : '#FFA040';
        return (
        <View style={[btnStyles.rpcCard, cardStyle]}>
          <View style={btnStyles.rpcCardHeader}>
            <AppText style={[btnStyles.rpcCardStatus, { color: cardColor }]}>
              PUSH TEST — {pushTest.top_error || anyReceiptErr ? 'ERROR' : anyReceiptOk ? 'DELIVERED' : 'PENDING'}
            </AppText>
            <AppText style={btnStyles.rpcCardTs} selectable>{pushTest.ranAt?.substring(11, 19)}</AppText>
          </View>
          {([
            ['permission', pushTest.permission_status],
            ['token_present', pushTest.token_present],
            ['token_saved_to_db', pushTest.token_saved_to_db],
            ['self.send_status', pushTest.self.send_status],
            ['self.expo_ticket_status', pushTest.self.expo_status],
            ['self.expo_ticket_id', pushTest.self.expo_ticket_id],
            ['self.expo_receipt_status', pushTest.self.receipt_status],
            ['self.expo_receipt_error', pushTest.self.receipt_error],
            ['self.expo_receipt_details', pushTest.self.receipt_details],
            ['self.expo_receipt_timeout', pushTest.self.receipt_timeout],
            ['self.expo_payload_sent', pushTest.self.expo_payload_sent],
            ['self.skipped', pushTest.self.skipped_reason],
            ['self.error', pushTest.self.error],
            ['partner.token_present', pushTest.partner_token_present],
            ['partner.enabled', pushTest.partner_enabled],
            ['partner.send_status', pushTest.partner.send_status],
            ['partner.expo_ticket_status', pushTest.partner.expo_status],
            ['partner.expo_ticket_id', pushTest.partner.expo_ticket_id],
            ['partner.expo_receipt_status', pushTest.partner.receipt_status],
            ['partner.expo_receipt_error', pushTest.partner.receipt_error],
            ['partner.expo_receipt_details', pushTest.partner.receipt_details],
            ['partner.expo_receipt_timeout', pushTest.partner.receipt_timeout],
            ['partner.expo_payload_sent', pushTest.partner.expo_payload_sent],
            ['partner.skipped', pushTest.partner.skipped_reason],
            ['partner.error', pushTest.partner.error],
            ['top_error', pushTest.top_error],
          ] as [string, string | number | boolean | null][]).filter(([, v]) => v !== null && v !== '').map(([label, value]) => {
            const isError = value === false || (typeof value === 'string' && (value.includes('error') || value.includes('Error') || value === 'DeviceNotRegistered' || value === 'InvalidCredentials'));
            const isOk = typeof value === 'string' && (value === 'ok' || value === '200');
            return (
            <View key={label} style={btnStyles.rpcCardField}>
              <AppText style={btnStyles.rpcCardFieldLabel}>{label}</AppText>
              <AppText style={[btnStyles.rpcCardFieldValue, isError ? { color: '#FF6B6B' } : isOk ? { color: '#5DADE2' } : {}]} selectable>
                {String(value)}
              </AppText>
            </View>
            );
          })}
        </View>
        );
      })()}

      {isSuperAdmin && (
        <>
          <TouchableOpacity
            style={[btnStyles.actionBtn, { backgroundColor: '#2a0d1a', borderWidth: 1, borderColor: '#6a2d3a' }, (pushTest.running || Platform.OS === 'web' || !coupleId) && btnStyles.btnDisabled]}
            onPress={() => onTestPush(true)}
            disabled={pushTest.running || Platform.OS === 'web' || !coupleId}
            activeOpacity={0.8}
          >
            {pushTest.running
              ? <ActivityIndicator size="small" color="#F1948A" />
              : <Shield size={15} color="#F1948A" />
            }
            <AppText style={[btnStyles.actionBtnLabel, { color: '#F1948A' }]}>
              Force Partner Test Push (Admin Override)
            </AppText>
          </TouchableOpacity>
          <AppText style={btnStyles.btnNote}>
            Bypasses partner push_notifications_enabled. Super-admin only.
          </AppText>
        </>
      )}

      <TouchableOpacity
        style={[btnStyles.actionBtn, { backgroundColor: '#1a3a1a' }, rpcTest.status === 'loading' && btnStyles.btnDisabled]}
        onPress={onTestRpc}
        disabled={rpcTest.status === 'loading'}
        activeOpacity={0.8}
      >
        {rpcTest.status === 'loading'
          ? <ActivityIndicator size="small" color="#4CAF50" />
          : <RefreshCw size={15} color="#4CAF50" />
        }
        <AppText style={[btnStyles.actionBtnLabel, { color: '#4CAF50' }]}>
          {rpcTest.status === 'loading' ? 'Testing RPC…' : 'Test generate_invite_code RPC'}
        </AppText>
      </TouchableOpacity>

      {/* Inline result card — always visible after first run */}
      {rpcTest.status !== 'idle' && (
        <View style={[
          btnStyles.rpcCard,
          rpcTest.status === 'loading' && btnStyles.rpcCardLoading,
          rpcTest.status === 'success' && btnStyles.rpcCardSuccess,
          (rpcTest.status === 'error' || rpcTest.status === 'timeout') && btnStyles.rpcCardError,
        ]}>
          <View style={btnStyles.rpcCardHeader}>
            <AppText style={[
              btnStyles.rpcCardStatus,
              rpcTest.status === 'success' && { color: '#4CAF50' },
              (rpcTest.status === 'error' || rpcTest.status === 'timeout') && { color: '#FF6B6B' },
              rpcTest.status === 'loading' && { color: '#FFA040' },
            ]}>
              {rpcTest.status.toUpperCase()}
            </AppText>
            {rpcTest.ranAt && (
              <AppText style={btnStyles.rpcCardTs} selectable>{rpcTest.ranAt}</AppText>
            )}
          </View>

          {rpcTest.status === 'success' && rpcTest.result !== null && (
            <View style={btnStyles.rpcCardField}>
              <AppText style={btnStyles.rpcCardFieldLabel}>result</AppText>
              <AppText style={btnStyles.rpcCardFieldValue} selectable numberOfLines={0}>
                {JSON.stringify(rpcTest.result, null, 2)}
              </AppText>
            </View>
          )}

          {(rpcTest.status === 'error' || rpcTest.status === 'timeout') && rpcTest.error && (
            <>
              {rpcTest.error.code && (
                <View style={btnStyles.rpcCardField}>
                  <AppText style={btnStyles.rpcCardFieldLabel}>code</AppText>
                  <AppText style={btnStyles.rpcCardFieldValue} selectable>{rpcTest.error.code}</AppText>
                </View>
              )}
              {rpcTest.error.message && (
                <View style={btnStyles.rpcCardField}>
                  <AppText style={btnStyles.rpcCardFieldLabel}>message</AppText>
                  <AppText style={btnStyles.rpcCardFieldValue} selectable numberOfLines={0}>{rpcTest.error.message}</AppText>
                </View>
              )}
              {rpcTest.error.details && (
                <View style={btnStyles.rpcCardField}>
                  <AppText style={btnStyles.rpcCardFieldLabel}>details</AppText>
                  <AppText style={btnStyles.rpcCardFieldValue} selectable numberOfLines={0}>{rpcTest.error.details}</AppText>
                </View>
              )}
              {rpcTest.error.hint && (
                <View style={btnStyles.rpcCardField}>
                  <AppText style={btnStyles.rpcCardFieldLabel}>hint</AppText>
                  <AppText style={btnStyles.rpcCardFieldValue} selectable numberOfLines={0}>{rpcTest.error.hint}</AppText>
                </View>
              )}
            </>
          )}
        </View>
      )}

      <AppText style={btnStyles.btnNote}>
        Calls generate_invite_code() RPC. Result appears immediately above.
      </AppText>

      <TouchableOpacity
        style={[btnStyles.actionBtn, { backgroundColor: '#0d2233' }, dbIdentity.status === 'loading' && btnStyles.btnDisabled]}
        onPress={onTestDbIdentity}
        disabled={dbIdentity.status === 'loading'}
        activeOpacity={0.8}
      >
        {dbIdentity.status === 'loading'
          ? <ActivityIndicator size="small" color="#60C8FF" />
          : <Shield size={15} color="#60C8FF" />
        }
        <AppText style={[btnStyles.actionBtnLabel, { color: '#60C8FF' }]}>
          {dbIdentity.status === 'loading' ? 'Checking DB…' : 'Test DB Identity RPC'}
        </AppText>
      </TouchableOpacity>

      {dbIdentity.status !== 'idle' && (
        <View style={[
          btnStyles.rpcCard,
          dbIdentity.status === 'loading' && btnStyles.rpcCardLoading,
          dbIdentity.status === 'success' && { backgroundColor: '#0d1f2b', borderColor: '#1a4a6a' },
          dbIdentity.status === 'error' && btnStyles.rpcCardError,
        ]}>
          <View style={btnStyles.rpcCardHeader}>
            <AppText style={[
              btnStyles.rpcCardStatus,
              dbIdentity.status === 'success' && { color: '#60C8FF' },
              dbIdentity.status === 'error' && { color: '#FF6B6B' },
              dbIdentity.status === 'loading' && { color: '#FFA040' },
            ]}>
              DB IDENTITY — {dbIdentity.status.toUpperCase()}
            </AppText>
            {dbIdentity.ranAt && (
              <AppText style={btnStyles.rpcCardTs} selectable>{dbIdentity.ranAt.substring(11, 19)}</AppText>
            )}
          </View>

          {dbIdentity.status === 'success' && dbIdentity.result !== null && (
            Object.entries(dbIdentity.result as Record<string, any>).map(([k, v]) => (
              <View key={k} style={btnStyles.rpcCardField}>
                <AppText style={btnStyles.rpcCardFieldLabel}>{k}</AppText>
                <AppText style={btnStyles.rpcCardFieldValue} selectable>{String(v)}</AppText>
              </View>
            ))
          )}

          {dbIdentity.status === 'error' && dbIdentity.error && (
            <>
              {dbIdentity.error.code && (
                <View style={btnStyles.rpcCardField}>
                  <AppText style={btnStyles.rpcCardFieldLabel}>code</AppText>
                  <AppText style={btnStyles.rpcCardFieldValue} selectable>{dbIdentity.error.code}</AppText>
                </View>
              )}
              {dbIdentity.error.message && (
                <View style={btnStyles.rpcCardField}>
                  <AppText style={btnStyles.rpcCardFieldLabel}>message</AppText>
                  <AppText style={btnStyles.rpcCardFieldValue} selectable numberOfLines={0}>{dbIdentity.error.message}</AppText>
                </View>
              )}
            </>
          )}
        </View>
      )}

      <AppText style={btnStyles.btnNote}>
        Confirms which Supabase project the app is connected to.
      </AppText>

      <TouchableOpacity
        style={[btnStyles.actionBtn, { backgroundColor: '#0d1a2b' }, checkUpdate.status === 'loading' && btnStyles.btnDisabled]}
        onPress={onCheckUpdate}
        disabled={checkUpdate.status === 'loading'}
        activeOpacity={0.8}
      >
        {checkUpdate.status === 'loading'
          ? <ActivityIndicator size="small" color="#60C8FF" />
          : <RefreshCw size={15} color="#60C8FF" />
        }
        <AppText style={[btnStyles.actionBtnLabel, { color: '#60C8FF' }]}>
          {checkUpdate.status === 'loading' ? 'Checking for update…' : 'checkForUpdateAsync()'}
        </AppText>
      </TouchableOpacity>

      {checkUpdate.status !== 'idle' && (
        <View style={[
          btnStyles.rpcCard,
          checkUpdate.status === 'loading' && btnStyles.rpcCardLoading,
          checkUpdate.status === 'success' && (checkUpdate.isAvailable ? btnStyles.rpcCardSuccess : { backgroundColor: '#0d2b0d', borderColor: '#2d6a2d' }),
          checkUpdate.status === 'error' && btnStyles.rpcCardError,
        ]}>
          <View style={btnStyles.rpcCardHeader}>
            <AppText style={[
              btnStyles.rpcCardStatus,
              checkUpdate.status === 'success' && { color: checkUpdate.isAvailable ? '#FFA040' : '#4CAF50' },
              checkUpdate.status === 'error' && { color: '#FF6B6B' },
              checkUpdate.status === 'loading' && { color: '#FFA040' },
            ]}>
              {checkUpdate.status === 'success'
                ? (checkUpdate.isAvailable ? 'UPDATE AVAILABLE' : 'UP TO DATE')
                : checkUpdate.status.toUpperCase()}
            </AppText>
            {checkUpdate.ranAt && (
              <AppText style={btnStyles.rpcCardTs} selectable>{checkUpdate.ranAt.substring(11, 19)}</AppText>
            )}
          </View>
          {checkUpdate.status === 'success' && checkUpdate.manifest && (
            <View style={btnStyles.rpcCardField}>
              <AppText style={btnStyles.rpcCardFieldLabel}>manifest</AppText>
              <AppText style={btnStyles.rpcCardFieldValue} selectable numberOfLines={0}>{checkUpdate.manifest}</AppText>
            </View>
          )}
          {checkUpdate.status === 'error' && checkUpdate.error && (
            <View style={btnStyles.rpcCardField}>
              <AppText style={btnStyles.rpcCardFieldLabel}>error</AppText>
              <AppText style={btnStyles.rpcCardFieldValue} selectable numberOfLines={0}>{checkUpdate.error}</AppText>
            </View>
          )}
        </View>
      )}
      <AppText style={btnStyles.btnNote}>
        Calls Updates.checkForUpdateAsync() — shows whether a newer OTA is available.
      </AppText>

      <TouchableOpacity
        style={[btnStyles.actionBtn, { backgroundColor: '#0d2b1a' }, (applyUpdate.status === 'checking' || applyUpdate.status === 'fetching' || applyUpdate.status === 'reloading') && btnStyles.btnDisabled]}
        onPress={onFetchAndApplyUpdate}
        disabled={applyUpdate.status === 'checking' || applyUpdate.status === 'fetching' || applyUpdate.status === 'reloading'}
        activeOpacity={0.8}
      >
        {(applyUpdate.status === 'checking' || applyUpdate.status === 'fetching' || applyUpdate.status === 'reloading')
          ? <ActivityIndicator size="small" color="#4CAF50" />
          : <RefreshCw size={15} color="#4CAF50" />
        }
        <AppText style={[btnStyles.actionBtnLabel, { color: '#4CAF50' }]}>
          {applyUpdate.status === 'checking' ? 'Checking…'
            : applyUpdate.status === 'fetching' ? 'Downloading update…'
            : applyUpdate.status === 'reloading' ? 'Reloading app…'
            : 'Fetch + Apply OTA Update'}
        </AppText>
      </TouchableOpacity>

      {applyUpdate.status !== 'idle' && (
        <View style={[
          btnStyles.rpcCard,
          (applyUpdate.status === 'checking' || applyUpdate.status === 'fetching' || applyUpdate.status === 'reloading') && btnStyles.rpcCardLoading,
          applyUpdate.status === 'no-update' && { backgroundColor: '#0d2b0d', borderColor: '#2d6a2d' },
          applyUpdate.status === 'error' && btnStyles.rpcCardError,
        ]}>
          <View style={btnStyles.rpcCardHeader}>
            <AppText style={[
              btnStyles.rpcCardStatus,
              applyUpdate.status === 'no-update' && { color: '#4CAF50' },
              applyUpdate.status === 'error' && { color: '#FF6B6B' },
              (applyUpdate.status === 'checking' || applyUpdate.status === 'fetching' || applyUpdate.status === 'reloading') && { color: '#FFA040' },
            ]}>
              {applyUpdate.status === 'no-update' ? 'UP TO DATE'
                : applyUpdate.status === 'reloading' ? 'RELOADING…'
                : applyUpdate.status.toUpperCase()}
            </AppText>
            {applyUpdate.ranAt && (
              <AppText style={btnStyles.rpcCardTs} selectable>{applyUpdate.ranAt.substring(11, 19)}</AppText>
            )}
          </View>
          {applyUpdate.status === 'error' && applyUpdate.error && (
            <View style={btnStyles.rpcCardField}>
              <AppText style={btnStyles.rpcCardFieldLabel}>error</AppText>
              <AppText style={btnStyles.rpcCardFieldValue} selectable numberOfLines={0}>{applyUpdate.error}</AppText>
            </View>
          )}
        </View>
      )}
      <AppText style={btnStyles.btnNote}>
        Downloads the latest OTA if available and immediately reloads the app.
      </AppText>

      {/* getSession test */}
      <TouchableOpacity
        style={[btnStyles.actionBtn, { backgroundColor: '#0d1f33' }, sessionTest.status === 'loading' && btnStyles.btnDisabled]}
        onPress={onTestGetSession}
        disabled={sessionTest.status === 'loading'}
        activeOpacity={0.8}
      >
        {sessionTest.status === 'loading'
          ? <ActivityIndicator size="small" color="#7EC8FF" />
          : <Shield size={15} color="#7EC8FF" />
        }
        <AppText style={[btnStyles.actionBtnLabel, { color: '#7EC8FF' }]}>
          {sessionTest.status === 'loading' ? 'Getting session…' : 'Test getSession()'}
        </AppText>
      </TouchableOpacity>
      {sessionTest.status !== 'idle' && (
        <View style={[
          btnStyles.rpcCard,
          sessionTest.status === 'loading' && btnStyles.rpcCardLoading,
          sessionTest.status === 'success' && { backgroundColor: '#0d1f33', borderColor: '#1a4a6a' },
          sessionTest.status === 'error' && btnStyles.rpcCardError,
        ]}>
          <View style={btnStyles.rpcCardHeader}>
            <AppText style={[btnStyles.rpcCardStatus, { color: sessionTest.status === 'error' ? '#FF6B6B' : '#7EC8FF' }]}>
              GET SESSION — {sessionTest.status.toUpperCase()}
            </AppText>
            {sessionTest.ranAt && <AppText style={btnStyles.rpcCardTs} selectable>{sessionTest.ranAt.substring(11, 19)}</AppText>}
          </View>
          {(sessionTest.result || sessionTest.error) && (
            <View style={btnStyles.rpcCardField}>
              <AppText style={btnStyles.rpcCardFieldValue} selectable numberOfLines={0}>
                {sessionTest.result ?? sessionTest.error}
              </AppText>
            </View>
          )}
        </View>
      )}
      <AppText style={btnStyles.btnNote}>
        Calls supabase.auth.getSession() and logs full result to console.
      </AppText>

      {/* DB test */}
      <TouchableOpacity
        style={[btnStyles.actionBtn, { backgroundColor: '#1a1a0d' }, dbTest.status === 'loading' && btnStyles.btnDisabled]}
        onPress={onTestDb}
        disabled={dbTest.status === 'loading'}
        activeOpacity={0.8}
      >
        {dbTest.status === 'loading'
          ? <ActivityIndicator size="small" color="#FFD966" />
          : <RefreshCw size={15} color="#FFD966" />
        }
        <AppText style={[btnStyles.actionBtnLabel, { color: '#FFD966' }]}>
          {dbTest.status === 'loading' ? 'Testing DB…' : 'Test DB (profiles select)'}
        </AppText>
      </TouchableOpacity>
      {dbTest.status !== 'idle' && (
        <View style={[
          btnStyles.rpcCard,
          dbTest.status === 'loading' && btnStyles.rpcCardLoading,
          dbTest.status === 'success' && { backgroundColor: '#1a1a0d', borderColor: '#4a4a1a' },
          dbTest.status === 'error' && btnStyles.rpcCardError,
        ]}>
          <View style={btnStyles.rpcCardHeader}>
            <AppText style={[btnStyles.rpcCardStatus, { color: dbTest.status === 'error' ? '#FF6B6B' : '#FFD966' }]}>
              DB TEST — {dbTest.status.toUpperCase()}
            </AppText>
            {dbTest.ranAt && <AppText style={btnStyles.rpcCardTs} selectable>{dbTest.ranAt.substring(11, 19)}</AppText>}
          </View>
          {(dbTest.result || dbTest.error) && (
            <View style={btnStyles.rpcCardField}>
              <AppText style={btnStyles.rpcCardFieldValue} selectable numberOfLines={0}>
                {dbTest.result ?? dbTest.error}
              </AppText>
            </View>
          )}
        </View>
      )}
      <AppText style={btnStyles.btnNote}>
        Calls supabase.from('profiles').select('*').limit(1) and logs full result to console.
      </AppText>

      <TouchableOpacity
        style={[btnStyles.actionBtn, btnStyles.actionBtnNeutral]}
        onPress={onShareDebugInfo}
        activeOpacity={0.8}
      >
        <Share2 size={15} color="#fff" />
        <AppText style={btnStyles.actionBtnLabel}>Copy Debug Info</AppText>
      </TouchableOpacity>
      <AppText style={btnStyles.btnNote}>
        Opens share sheet with all debug values and recent events as JSON.
      </AppText>
    </View>
  );
}

const btnStyles = StyleSheet.create({
  buttonArea: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    paddingVertical: 13,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  actionBtnDanger: {
    backgroundColor: '#8B0000',
  },
  actionBtnWarn: {
    backgroundColor: '#7A4500',
  },
  actionBtnNeutral: {
    backgroundColor: '#1E3A5F',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  actionBtnLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    color: '#fff',
  },
  btnNote: {
    fontSize: 11,
    color: '#777',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: Spacing.sm,
  },
  rpcCard: {
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: 6,
    gap: 8,
    borderWidth: 1,
  },
  rpcCardLoading: {
    backgroundColor: '#1a1a0d',
    borderColor: '#4a4a1a',
  },
  rpcCardSuccess: {
    backgroundColor: '#0d2b0d',
    borderColor: '#2d6a2d',
  },
  rpcCardError: {
    backgroundColor: '#2b0d0d',
    borderColor: '#6a2d2d',
  },
  rpcCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rpcCardStatus: {
    fontSize: 13,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.5,
  },
  rpcCardTs: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#666',
    flexShrink: 1,
  },
  rpcCardField: {
    gap: 2,
  },
  rpcCardFieldLabel: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rpcCardFieldValue: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#ddd',
    lineHeight: 18,
  },
});
