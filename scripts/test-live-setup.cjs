#!/usr/bin/env node
/**
 * Live Privacy Verification — Test Setup
 *
 * Creates 4 test users (2 couples), inserts test data, and prints
 * credentials + IDs needed to run test-live-privacy-verification.cjs
 *
 * After running this script:
 *   1. Copy the JSON output
 *   2. Run the SQL below to toggle admin/super-admin on A1
 *   3. Run test-live-privacy-verification.cjs with the printed args
 *
 * Usage: node scripts/test-live-setup.cjs
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'TestPass123!';
const ts = Date.now();

async function main() {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  const emails = {
    a1: `rls-a1-${ts}@throwaway.test`,
    a2: `rls-a2-${ts}@throwaway.test`,
    b1: `rls-b1-${ts}@throwaway.test`,
    b2: `rls-b2-${ts}@throwaway.test`,
  };

  const users = {};
  for (const [key, email] of Object.entries(emails)) {
    const { data, error } = await client.auth.signUp({ email, password: PASSWORD });
    if (error) throw new Error(`Failed to create ${key}: ${error.message}`);
    users[key] = { id: data.user.id, email };
  }

  console.log(JSON.stringify({
    userA1: users.a1,
    userA2: users.a2,
    userB1: users.b1,
    userB2: users.b2,
    password: PASSWORD,
  }, null, 2));

  console.error('\n--- Next steps ---');
  console.error('1. Run this SQL to set up profiles, couples, and test data:');
  console.error(`   (See scripts/test-admin-setup.sql template — replace user IDs)`);
  console.error('2. Run test-live-privacy-verification.cjs with these args:');
  console.error(`   node scripts/test-live-privacy-verification.cjs ${users.a1.email} ${users.b1.email} <coupleA-id> <coupleB-id> ${users.a1.id} ${users.b1.id} ${users.a2.id} ${users.b2.id}`);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(2); });
