-- Row-level security policies for tenant-scoped tables.
--
-- Applied AFTER Drizzle migrations by `runMigrations()` in src/migrate.ts.
-- Idempotent: every policy is dropped if it exists before being recreated.
--
-- Runtime model (current): the app connects as the table owner, which by
-- default BYPASSES RLS even when policies are defined. The
-- `SET LOCAL app.tenant_id = '<uuid>'` plumbing is wired in `withTenant()`,
-- but the safety net is provisional until we add a separate non-owner
-- runtime role and FORCE ROW LEVEL SECURITY. Tracked as TODO in README.
--
-- Why we still ENABLE RLS now: every query path that goes through the
-- intended runtime role (when added) will already have policies in place.

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
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
  END LOOP;
END$$;

-- The `tenant` table itself: a row is visible if its primary key matches
-- the session tenant. A null/unset session shows no rows.
CREATE POLICY tenant_isolation ON tenant
  USING (id = current_setting('app.tenant_id', true)::uuid);

-- All other tenant-scoped tables match by tenant_id column.
CREATE POLICY tenant_isolation ON membership
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON inbox
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON channel
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON rule
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON destination
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON message
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON attachment
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON delivery_attempt
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON ai_usage
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON api_key
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON audit_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON encrypted_secret
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON usage_counter
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
