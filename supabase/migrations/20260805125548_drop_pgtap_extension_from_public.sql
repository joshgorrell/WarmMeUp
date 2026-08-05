/*
  # Remove the pgtap test extension from the public schema

  1. Problem
     - `pgtap` was installed in `public`, the schema the Data API exposes, and it is
       owned by `supabase_admin`, so its default PUBLIC EXECUTE grant could not be
       revoked from this connection (the two preceding REVOKE migrations were no-ops).
     - Functions such as `lives_ok(text)`, `throws_ok(text)`, `performs_ok(text,numeric)`
       and `runtests()` execute a caller-supplied SQL string, so any holder of the public
       anon key had arbitrary statement execution through /rest/v1/rpc/...
     - Its views `tap_funky` and `pg_all_foreign_keys` were readable by `anon` and
       disclosed every function and foreign key in the database.

  2. Change
     - Drop the extension, which removes all ~1079 functions and both views from the
       public schema in one step.

  3. Notes
     - No application code references any pgtap object.
     - The RLS regression suite (supabase/tests/rls_regression_tests.sql) needs pgtap to
       run. Re-enable it only on a non-production database, or in a schema that the Data
       API does not expose.
*/

DROP EXTENSION IF EXISTS pgtap;
