/*
  # Remove pgtap from the client-facing API surface

  1. Problem
     - The `pgtap` test extension is installed in the `public` schema, which is the
       schema the Data API exposes. Its functions were therefore callable as RPCs by
       the `anon` and `authenticated` roles.
     - Several of them (`lives_ok(text)`, `throws_ok(text)`, `performs_ok(text,numeric)`,
       `runtests()`) take a SQL string and execute it, giving any holder of the public
       anon key arbitrary statement execution as a low-privilege role.

  2. Change
     - Revoke ALL privileges on every function, procedure, table and view that belongs
       to the pgtap extension from `anon` and `authenticated`.
     - The extension itself stays installed, so the RLS regression suite
       (supabase/tests/rls_regression_tests.sql) still runs via a privileged role.

  3. Notes
     - No application code calls any pgtap object, so nothing in the app changes.
*/

DO $$
DECLARE
  r record;
BEGIN
  -- Functions and procedures owned by the pgtap extension
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_depend d
    JOIN pg_extension e ON e.oid = d.refobjid AND e.extname = 'pgtap'
    JOIN pg_proc p ON p.oid = d.objid
    WHERE d.classid = 'pg_proc'::regclass
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;

  -- Tables, views and sequences owned by the pgtap extension
  FOR r IN
    SELECT format('%I.%I', n.nspname, c.relname) AS rel
    FROM pg_depend d
    JOIN pg_extension e ON e.oid = d.refobjid AND e.extname = 'pgtap'
    JOIN pg_class c ON c.oid = d.objid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE d.classid = 'pg_class'::regclass
      AND c.relkind IN ('r', 'v', 'm', 'S', 'p')
  LOOP
    EXECUTE format('REVOKE ALL ON %s FROM anon, authenticated', r.rel);
  END LOOP;
END $$;
