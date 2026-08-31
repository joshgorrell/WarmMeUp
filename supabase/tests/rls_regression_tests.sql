-- RLS Regression Tests for WarmMeUp
-- Run via: npm run test:rls
-- Requires: pgTAP extension enabled
--
-- Note: In PostgreSQL, DELETE/UPDATE on rows hidden by RLS silently affects
-- 0 rows (no error thrown). So cross-couple DELETE tests and immutable-table
-- UPDATE tests use lives_ok + verify the row was not modified, rather than
-- throws_ok.
--
-- INSERT violations DO throw (42501), so those use throws_ok with NULL
-- error matching (any exception satisfies the test).

SELECT plan(64);

-- ═══════════════════════════════════════════════════════════════
-- Test Setup: Create two couples with test users
-- Setup runs as the privileged role (bypasses RLS), then we switch
-- to the authenticated role for all test assertions.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, encrypted_password, role, aud, email_confirmed_at, instance_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'test_a@rls-test.local', 'x', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222', 'test_b@rls-test.local', 'x', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000'),
  ('33333333-3333-3333-3333-333333333333', 'test_c@rls-test.local', 'x', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000'),
  ('44444444-4444-4444-4444-444444444444', 'test_d@rls-test.local', 'x', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, display_name)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Test A'),
  ('22222222-2222-2222-2222-222222222222', 'Test B'),
  ('33333333-3333-3333-3333-333333333333', 'Test C'),
  ('44444444-4444-4444-4444-444444444444', 'Test D')
ON CONFLICT (id) DO NOTHING;

INSERT INTO couples (id, user_a_id, user_b_id, active)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_settings (user_id)
VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333'),
  ('44444444-4444-4444-4444-444444444444')
ON CONFLICT DO NOTHING;

INSERT INTO chat_messages (id, couple_id, sender_id, content_text)
VALUES ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'private message couple A')
ON CONFLICT DO NOTHING;

INSERT INTO vault_items (id, couple_id, uploaded_by_user_id, file_path, storage_path, media_type)
VALUES ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/test.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/test.jpg', 'photo')
ON CONFLICT DO NOTHING;

INSERT INTO wishes (id, couple_id, created_by_user_id, title)
VALUES ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'private wish couple A')
ON CONFLICT DO NOTHING;

INSERT INTO interactions (id, couple_id, sender_id, receiver_id, type, content_text)
VALUES ('a0000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'dice', 'test prompt')
ON CONFLICT DO NOTHING;

INSERT INTO activity_events (id, couple_id, actor_user_id, target_user_id, event_type)
VALUES ('a0000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'new_message')
ON CONFLICT DO NOTHING;

INSERT INTO chat_messages (id, couple_id, sender_id, content_text)
VALUES ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'private message couple B')
ON CONFLICT DO NOTHING;

INSERT INTO vault_items (id, couple_id, uploaded_by_user_id, file_path, storage_path, media_type)
VALUES ('b0000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/33333333-3333-3333-3333-333333333333/test.jpg', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/33333333-3333-3333-3333-333333333333/test.jpg', 'photo')
ON CONFLICT DO NOTHING;

INSERT INTO wishes (id, couple_id, created_by_user_id, title)
VALUES ('b0000000-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'private wish couple B')
ON CONFLICT DO NOTHING;

INSERT INTO interactions (id, couple_id, sender_id, receiver_id, type, content_text)
VALUES ('b0000000-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'dice', 'test prompt B')
ON CONFLICT DO NOTHING;

INSERT INTO point_events (id, couple_id, user_id, points, reason)
VALUES ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 10, 'test')
ON CONFLICT DO NOTHING;

INSERT INTO cash_in_events (id, couple_id, winner_user_id, loser_user_id, winner_choice, winner_points, loser_points)
VALUES ('c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'give', 10, 0)
ON CONFLICT DO NOTHING;

-- Switch to authenticated role so RLS is enforced for all tests
SET ROLE authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Cross-couple isolation: User C (couple B) cannot access couple A data
-- ═══════════════════════════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333')::text, true);

-- SELECT: User C sees 0 rows from couple A (5 tests)
SELECT results_eq($q$SELECT count(*)::int FROM chat_messages WHERE couple_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, ARRAY[0]::int[], 'C cannot SELECT A chat_messages');
SELECT results_eq($q$SELECT count(*)::int FROM vault_items WHERE couple_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, ARRAY[0]::int[], 'C cannot SELECT A vault_items');
SELECT results_eq($q$SELECT count(*)::int FROM wishes WHERE couple_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, ARRAY[0]::int[], 'C cannot SELECT A wishes');
SELECT results_eq($q$SELECT count(*)::int FROM interactions WHERE couple_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, ARRAY[0]::int[], 'C cannot SELECT A interactions');
SELECT results_eq($q$SELECT count(*)::int FROM activity_events WHERE couple_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, ARRAY[0]::int[], 'C cannot SELECT A activity_events');

-- INSERT: User C cannot insert into couple A — throws RLS violation (4 tests)
SELECT throws_ok($q$INSERT INTO chat_messages (couple_id, sender_id, content_text) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'injected')$q$, NULL, 'C cannot INSERT A chat_messages');
SELECT throws_ok($q$INSERT INTO vault_items (couple_id, uploaded_by_user_id, file_path, storage_path, media_type) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'fake.jpg', 'fake.jpg', 'photo')$q$, NULL, 'C cannot INSERT A vault_items');
SELECT throws_ok($q$INSERT INTO wishes (couple_id, created_by_user_id, title) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'injected')$q$, NULL, 'C cannot INSERT A wishes');
SELECT throws_ok($q$INSERT INTO interactions (couple_id, sender_id, receiver_id, type, content_text) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'dice', 'injected')$q$, NULL, 'C cannot INSERT A interactions');

-- DELETE: User C cannot delete couple A rows — silently affects 0 rows (5 tests)
SELECT lives_ok($q$DELETE FROM chat_messages WHERE id = 'a0000000-0000-0000-0000-000000000001'$q$, 'C DELETE A chat_messages (no throw)');
SELECT lives_ok($q$DELETE FROM vault_items WHERE id = 'a0000000-0000-0000-0000-000000000002'$q$, 'C DELETE A vault_items (no throw)');
SELECT lives_ok($q$DELETE FROM wishes WHERE id = 'a0000000-0000-0000-0000-000000000003'$q$, 'C DELETE A wishes (no throw)');
SELECT lives_ok($q$DELETE FROM interactions WHERE id = 'a0000000-0000-0000-0000-000000000004'$q$, 'C DELETE A interactions (no throw)');
SELECT lives_ok($q$DELETE FROM activity_events WHERE id = 'a0000000-0000-0000-0000-000000000005'$q$, 'C DELETE A activity_events (no throw)');

-- ═══════════════════════════════════════════════════════════════
-- Same-couple access: User B (partner in couple A) CAN access A's data
-- ═══════════════════════════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);

-- User B can read couple A data (1 test)
SELECT results_eq($q$SELECT count(*)::int FROM chat_messages WHERE couple_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, ARRAY[1]::int[], 'B can SELECT A chat_messages');

-- User B can DELETE partner's data — burn-it-all scenario (5 tests)
SELECT lives_ok($q$DELETE FROM vault_items WHERE id = 'a0000000-0000-0000-0000-000000000002'$q$, 'B can DELETE A vault_items (burn-it-all)');
SELECT lives_ok($q$DELETE FROM chat_messages WHERE id = 'a0000000-0000-0000-0000-000000000001'$q$, 'B can DELETE A chat_messages');
SELECT lives_ok($q$DELETE FROM wishes WHERE id = 'a0000000-0000-0000-0000-000000000003'$q$, 'B can DELETE A wishes');
SELECT lives_ok($q$DELETE FROM interactions WHERE id = 'a0000000-0000-0000-0000-000000000004'$q$, 'B can DELETE A interactions');
SELECT lives_ok($q$DELETE FROM activity_events WHERE id = 'a0000000-0000-0000-0000-000000000005'$q$, 'B can DELETE A activity_events');

-- ═══════════════════════════════════════════════════════════════
-- Intentionally absent DELETE policies: authenticated DELETE is a no-op
-- ═══════════════════════════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
SELECT lives_ok($q$DELETE FROM profiles WHERE id = '11111111-1111-1111-1111-111111111111'$q$, 'DELETE own profile (no throw, no effect)');
SELECT lives_ok($q$DELETE FROM user_settings WHERE user_id = '11111111-1111-1111-1111-111111111111'$q$, 'DELETE own user_settings (no throw, no effect)');
SELECT lives_ok($q$DELETE FROM subscriptions WHERE user_id = '11111111-1111-1111-1111-111111111111'$q$, 'DELETE own subscription (no throw, no effect)');
SELECT lives_ok($q$DELETE FROM scores WHERE user_id = '11111111-1111-1111-1111-111111111111'$q$, 'DELETE scores (no throw, no effect)');

-- Verify the rows still exist (privileged role) (2 tests)
RESET ROLE;
SELECT results_eq($q$SELECT count(*)::int FROM profiles WHERE id = '11111111-1111-1111-1111-111111111111'$q$, ARRAY[1]::int[], 'profile survived DELETE (service-role-only)');
SELECT results_eq($q$SELECT count(*)::int FROM user_settings WHERE user_id = '11111111-1111-1111-1111-111111111111'$q$, ARRAY[1]::int[], 'user_settings survived DELETE (service-role-only)');

-- ═══════════════════════════════════════════════════════════════
-- Immutable tables: authenticated UPDATE is a no-op
-- ═══════════════════════════════════════════════════════════════

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
SELECT lives_ok($q$UPDATE point_events SET points = 999 WHERE couple_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, 'UPDATE point_events (no throw, no effect)');
SELECT lives_ok($q$UPDATE cash_in_events SET winner_points = 999 WHERE couple_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, 'UPDATE cash_in_events (no throw, no effect)');

-- Verify the data was not modified (privileged role) (2 tests)
RESET ROLE;
SELECT results_eq($q$SELECT points::int FROM point_events WHERE id = 'c0000000-0000-0000-0000-000000000001'$q$, ARRAY[10]::int[], 'point_events not modified (immutable)');
SELECT results_eq($q$SELECT winner_points::int FROM cash_in_events WHERE id = 'c0000000-0000-0000-0000-000000000002'$q$, ARRAY[10]::int[], 'cash_in_events not modified (immutable)');

-- ═══════════════════════════════════════════════════════════════
-- Cross-couple isolation: User A cannot access couple B data
-- ═══════════════════════════════════════════════════════════════

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);

-- SELECT: User A sees 0 rows from couple B (5 tests)
SELECT results_eq($q$SELECT count(*)::int FROM chat_messages WHERE couple_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$q$, ARRAY[0]::int[], 'A cannot SELECT B chat_messages');
SELECT results_eq($q$SELECT count(*)::int FROM vault_items WHERE couple_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$q$, ARRAY[0]::int[], 'A cannot SELECT B vault_items');
SELECT results_eq($q$SELECT count(*)::int FROM wishes WHERE couple_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$q$, ARRAY[0]::int[], 'A cannot SELECT B wishes');
SELECT results_eq($q$SELECT count(*)::int FROM interactions WHERE couple_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$q$, ARRAY[0]::int[], 'A cannot SELECT B interactions');
SELECT results_eq($q$SELECT count(*)::int FROM activity_events WHERE couple_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$q$, ARRAY[0]::int[], 'A cannot SELECT B activity_events');

-- INSERT: User A cannot insert into couple B (4 tests)
SELECT throws_ok($q$INSERT INTO chat_messages (couple_id, sender_id, content_text) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'injected')$q$, NULL, 'A cannot INSERT B chat_messages');
SELECT throws_ok($q$INSERT INTO vault_items (couple_id, uploaded_by_user_id, file_path, storage_path, media_type) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'fake.jpg', 'fake.jpg', 'photo')$q$, NULL, 'A cannot INSERT B vault_items');
SELECT throws_ok($q$INSERT INTO wishes (couple_id, created_by_user_id, title) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'injected')$q$, NULL, 'A cannot INSERT B wishes');
SELECT throws_ok($q$INSERT INTO interactions (couple_id, sender_id, receiver_id, type, content_text) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'dice', 'injected')$q$, NULL, 'A cannot INSERT B interactions');

-- DELETE: User A cannot delete couple B rows (4 tests)
SELECT lives_ok($q$DELETE FROM chat_messages WHERE id = 'b0000000-0000-0000-0000-000000000001'$q$, 'A DELETE B chat_messages (no throw)');
SELECT lives_ok($q$DELETE FROM vault_items WHERE id = 'b0000000-0000-0000-0000-000000000002'$q$, 'A DELETE B vault_items (no throw)');
SELECT lives_ok($q$DELETE FROM wishes WHERE id = 'b0000000-0000-0000-0000-000000000003'$q$, 'A DELETE B wishes (no throw)');
SELECT lives_ok($q$DELETE FROM interactions WHERE id = 'b0000000-0000-0000-0000-000000000004'$q$, 'A DELETE B interactions (no throw)');

-- ═══════════════════════════════════════════════════════════════
-- Verify cross-couple DELETEs didn't actually delete (rows still exist)
-- ═══════════════════════════════════════════════════════════════

RESET ROLE;
SELECT results_eq($q$SELECT count(*)::int FROM chat_messages WHERE id = 'b0000000-0000-0000-0000-000000000001'$q$, ARRAY[1]::int[], 'B chat_messages survived A DELETE');
SELECT results_eq($q$SELECT count(*)::int FROM vault_items WHERE id = 'b0000000-0000-0000-0000-000000000002'$q$, ARRAY[1]::int[], 'B vault_items survived A DELETE');
SELECT results_eq($q$SELECT count(*)::int FROM wishes WHERE id = 'b0000000-0000-0000-0000-000000000003'$q$, ARRAY[1]::int[], 'B wishes survived A DELETE');
SELECT results_eq($q$SELECT count(*)::int FROM interactions WHERE id = 'b0000000-0000-0000-0000-000000000004'$q$, ARRAY[1]::int[], 'B interactions survived A DELETE');


-- ═══════════════════════════════════════════════════════════════
-- Admin flag self-elevation protection (2 tests)
-- ═══════════════════════════════════════════════════════════════

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);

-- Attempt to self-elevate is_admin
UPDATE profiles SET is_admin = true WHERE id = '11111111-1111-1111-1111-111111111111';

-- Attempt to self-elevate is_super_admin
UPDATE profiles SET is_super_admin = true WHERE id = '11111111-1111-1111-1111-111111111111';

RESET ROLE;
SELECT results_eq(
  $q$SELECT (is_admin::int || is_super_admin::int)::int FROM profiles WHERE id = '11111111-1111-1111-1111-111111111111'$q$,
  ARRAY[0]::int[],
  'Non-admin cannot self-elevate is_admin or is_super_admin'
);

-- Verify normal profile updates still work (display_name change)
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
UPDATE profiles SET display_name = 'Updated Name' WHERE id = '11111111-1111-1111-1111-111111111111';
RESET ROLE;
SELECT results_eq(
  $q$SELECT display_name FROM profiles WHERE id = '11111111-1111-1111-1111-111111111111'$q$,
  ARRAY['Updated Name']::text[],
  'Non-admin can still update own display_name'
);

-- ═══════════════════════════════════════════════════════════════
-- 51-64: SECURITY HARDENING — anon revocation, admin function access,
--        and column-level UPDATE restrictions
-- ═══════════════════════════════════════════════════════════════

-- 51: anon cannot SELECT from profiles
SELECT throws_ok(
  $ SELECT * FROM profiles LIMIT 1 $,
  'permission denied for table profiles',
  'Anon cannot read profiles (table grant revoked)'
);

-- 52: anon cannot SELECT from chat_messages
SELECT throws_ok(
  $ SELECT * FROM chat_messages LIMIT 1 $,
  'permission denied for table chat_messages',
  'Anon cannot read chat_messages (table grant revoked)'
);

-- 53: anon cannot SELECT from vault_items
SELECT throws_ok(
  $ SELECT * FROM vault_items LIMIT 1 $,
  'permission denied for table vault_items',
  'Anon cannot read vault_items (table grant revoked)'
);

-- 54: anon cannot SELECT from couples
SELECT throws_ok(
  $ SELECT * FROM couples LIMIT 1 $,
  'permission denied for table couples',
  'Anon cannot read couples (table grant revoked)'
);

-- 55: anon cannot call accept_partner RPC
SELECT throws_ok(
  $ SELECT * FROM accept_partner() $,
  'permission denied for function accept_partner',
  'Anon cannot call accept_partner (EXECUTE revoked)'
);

-- 56: anon cannot call preview_invite RPC
SELECT throws_ok(
  $ SELECT * FROM preview_invite('TESTCODE') $,
  'permission denied for function preview_invite',
  'Anon cannot call preview_invite (EXECUTE revoked)'
);

-- 57: anon cannot call get_pending_partner_profile RPC
SELECT throws_ok(
  $ SELECT * FROM get_pending_partner_profile() $,
  'permission denied for function get_pending_partner_profile',
  'Anon cannot call get_pending_partner_profile (EXECUTE revoked)'
);

-- 58: authenticated cannot call admin_search_user_by_email
SELECT throws_ok(
  $ SELECT * FROM admin_search_user_by_email('someone@example.com') $,
  'permission denied for function admin_search_user_by_email',
  'Authenticated cannot call admin_search_user_by_email (EXECUTE revoked from authenticated)'
);

-- 59: authenticated cannot call admin_set_global_debug_access
SELECT throws_ok(
  $ SELECT * FROM admin_set_global_debug_access(true, 'hash', now() + interval '1 hour', 'enable') $,
  'permission denied for function admin_set_global_debug_access',
  'Authenticated cannot call admin_set_global_debug_access (EXECUTE revoked from authenticated)'
);

-- 60: authenticated cannot call debug_database_identity
SELECT throws_ok(
  $ SELECT * FROM debug_database_identity() $,
  'permission denied for function debug_database_identity',
  'Authenticated cannot call debug_database_identity (EXECUTE revoked from authenticated)'
);

-- 61: authenticated cannot UPDATE profiles.is_admin column
SELECT throws_ok(
  $ UPDATE profiles SET is_admin = true WHERE id = '00000000-0000-0000-0000-000000000000' $,
  'permission denied for column is_admin of table profiles',
  'Authenticated cannot UPDATE profiles.is_admin (column privilege revoked)'
);

-- 62: authenticated cannot UPDATE profiles.is_super_admin column
SELECT throws_ok(
  $ UPDATE profiles SET is_super_admin = true WHERE id = '00000000-0000-0000-0000-000000000000' $,
  'permission denied for column is_super_admin of table profiles',
  'Authenticated cannot UPDATE profiles.is_super_admin (column privilege revoked)'
);

-- 63: authenticated cannot UPDATE couples.user_a_id column
SELECT throws_ok(
  $ UPDATE couples SET user_a_id = '00000000-0000-0000-0000-000000000000' WHERE id = '00000000-0000-0000-0000-000000000000' $,
  'permission denied for column user_a_id of table couples',
  'Authenticated cannot UPDATE couples.user_a_id (column privilege revoked)'
);

-- 64: authenticated cannot UPDATE couples.pending_partner_id column
SELECT throws_ok(
  $ UPDATE couples SET pending_partner_id = '00000000-0000-0000-0000-000000000000' WHERE id = '00000000-0000-0000-0000-000000000000' $,
  'permission denied for column pending_partner_id of table couples',
  'Authenticated cannot UPDATE couples.pending_partner_id (column privilege revoked)'
);

SELECT * FROM finish();

-- ═══════════════════════════════════════════════════════════════
-- Cleanup: Remove test data
-- ═══════════════════════════════════════════════════════════════
DELETE FROM point_events WHERE id = 'c0000000-0000-0000-0000-000000000001';
DELETE FROM cash_in_events WHERE id = 'c0000000-0000-0000-0000-000000000002';
DELETE FROM activity_events WHERE id = 'a0000000-0000-0000-0000-000000000005';
DELETE FROM interactions WHERE id IN ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004');
DELETE FROM wishes WHERE id IN ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003');
DELETE FROM vault_items WHERE id IN ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002');
DELETE FROM chat_messages WHERE id IN ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');
DELETE FROM user_settings WHERE user_id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
DELETE FROM couples WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
DELETE FROM profiles WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
DELETE FROM auth.users WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
