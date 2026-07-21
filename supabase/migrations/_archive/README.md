# Archived Migrations

This directory contains the 174 original migration files that were applied
to the production database before the migration history was squashed and
re-baselined on 2026-07-22.

These files are kept for historical reference only. They should NOT be
re-applied to any database — the live schema is captured in the single
baseline migration `20260722000000_baseline_schema.sql` in the parent
directory.

## What happened

1. The live schema (tables, RLS policies, indexes) was captured from the
   production database using introspection queries.
2. All 174 migration files were moved to this `_archive/` directory.
3. A single baseline migration was written that recreates the full schema
   from scratch using `CREATE TABLE IF NOT EXISTS` and `DROP POLICY IF EXISTS`
   before each `CREATE POLICY`.

## Why

The migration history had grown to 174 files with many redundant fixes,
re-applied policies, and pgrst schema cache reloads. This made it hard to
understand the actual schema state. Squashing into a single baseline
provides a clean starting point for future migrations.
