/*
# Enable pgTAP extension for RLS regression tests

1. New Extensions
- pgTAP — PostgreSQL testing framework for writing database-level tests.
  Used to assert RLS policies correctly isolate couple-scoped data.

2. Security
- No security impact. pgTAP is a testing utility only.
*/

CREATE EXTENSION IF NOT EXISTS pgtap;
