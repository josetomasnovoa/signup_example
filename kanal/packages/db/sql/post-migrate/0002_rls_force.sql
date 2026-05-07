-- Harden RLS by introducing a non-owner runtime role and FORCE-ing every
-- tenant-scoped table. The migration role (default `kanal`) keeps owner
-- privileges and bypasses RLS for migrations + admin queries.
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanal_app') THEN
    CREATE ROLE kanal_app LOGIN PASSWORD 'kanal_app';
  END IF;
END$$;

GRANT CONNECT ON DATABASE kanal TO kanal_app;
GRANT USAGE ON SCHEMA public TO kanal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kanal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kanal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kanal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kanal_app;

-- FORCE RLS: even the table owner (kanal) is subject to policies, except
-- when explicitly bypassed via SET row_security=off. Migrations should
-- run before the swap or use a role with BYPASSRLS.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'tenant',
      'membership',
      'inbox',
      'channel',
      'rule',
      'destination',
      'message',
      'attachment',
      'delivery_attempt',
      'ai_usage',
      'api_key',
      'audit_log',
      'encrypted_secret',
      'usage_counter'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END$$;

-- NOTE: the migration role (default `kanal`) MUST be granted BYPASSRLS by
-- a superuser at provisioning time — owners of FORCE-RLS tables otherwise
-- lose the ability to migrate. We do that out-of-band:
--   sudo -u postgres psql -c "ALTER ROLE kanal BYPASSRLS;"
-- It is not run from within the migration because a role cannot alter
-- itself.
