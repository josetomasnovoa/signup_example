import { KanalClient } from '@kanal/sdk';

/**
 * Server-side Kanal client. Reads the bearer token from the
 * `KANAL_API_KEY` env var (server only — never expose this to the
 * browser). For per-user auth in production we would mint a short-lived
 * tenant-scoped key from the Clerk session and inject it here per request.
 */
export function serverClient(): KanalClient {
  const apiKey = process.env.KANAL_API_KEY;
  if (!apiKey) throw new Error('KANAL_API_KEY env var is required for the dashboard');
  return new KanalClient({
    apiKey,
    baseUrl: process.env.KANAL_API_URL ?? 'http://localhost:3001',
  });
}
