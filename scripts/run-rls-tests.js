#!/usr/bin/env node
/**
 * Runs the RLS regression tests (supabase/tests/rls_regression_tests.sql)
 * against the provisioned Supabase database using the service-role key.
 *
 * Usage: npm run test:rls
 *
 * Requires SUPABASE_DB_URL or (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) in env.
 */

const fs = require('fs');
const path = require('path');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'supabase', 'tests', 'rls_regression_tests.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const dbUrl = process.env.SUPABASE_DB_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (dbUrl) {
    // Use direct Postgres connection if available
    const { Client } = require('pg');
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    try {
      const result = await client.query(sql);
      for (const row of result.rows) {
        const val = Object.values(row)[0];
        if (typeof val === 'string') console.log(val);
      }
    } finally {
      await client.end();
    }
  } else if (supabaseUrl && serviceKey) {
    // Fall back to REST API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    const data = await response.json();
    console.log(data);
  } else {
    console.error('Error: SUPABASE_DB_URL or (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) required');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
