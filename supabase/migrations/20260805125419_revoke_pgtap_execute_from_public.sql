/*
  # Remove the default PUBLIC EXECUTE grant from pgtap objects

  The previous migration revoked pgtap privileges from `anon` and `authenticated`,
  but PostgreSQL grants EXECUTE on functions to PUBLIC by default, so both roles
  still reached them through that implicit grant. This revokes the PUBLIC grant as
  well, which is what actually removes pgtap from the Data API surface.

  The extension owner (postgres) keeps full access, so the RLS regression suite,
  which connects with the direct database URL, continues to work.
*/

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_depend d
    JOIN pg_extension e ON e.oid = d.refobjid AND e.extname = 'pgtap'
    JOIN pg_proc p ON p.oid = d.objid
    WHERE d.classid = 'pg_proc'::regclass
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;

  FOR r IN
    SELECT format('%I.%I', n.nspname, c.relname) AS rel
    FROM pg_depend d
    JOIN pg_extension e ON e.oid = d.refobjid AND e.extname = 'pgtap'
    JOIN pg_class c ON c.oid = d.objid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE d.classid = 'pg_class'::regclass
      AND c.relkind IN ('r', 'v', 'm', 'S', 'p')
  LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', r.rel);
  END LOOP;
END $$;
