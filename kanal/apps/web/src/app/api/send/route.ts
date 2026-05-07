import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverClient } from '@/lib/api';

/**
 * Public POST endpoint used by the phone chat page.
 *
 * The chat page in `/chat/[slug]` is unauthenticated — anyone with the URL
 * can submit. We bridge here so the tenant API key never reaches the
 * browser. The route enforces:
 *   - inbox slug is in an env-controlled allowlist (KANAL_PUBLIC_INBOX_SLUGS)
 *   - body is bounded (text + senderName + senderId)
 *   - per-IP rate-limit is applied at the platform edge (Fly.io / Cloudflare)
 *
 * Future: add a per-IP token bucket with a Redis key, plus a captcha when
 * abuse is detected.
 */
const Body = z.object({
  text: z.string().min(1).max(4_000),
  senderName: z.string().min(1).max(80).optional(),
  senderId: z.string().min(1).max(80).optional(),
});

function publicSlugs(): Set<string> {
  const raw = process.env.KANAL_PUBLIC_INBOX_SLUGS ?? '';
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const allow = publicSlugs();
  if (allow.size > 0 && !allow.has(slug)) {
    return NextResponse.json({ error: 'inbox not public' }, { status: 404 });
  }

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const client = serverClient();
  const sender: { name?: string; phone?: string } = {};
  if (parsed.senderName) sender.name = parsed.senderName;
  if (parsed.senderId) sender.phone = parsed.senderId;
  try {
    const res = await client.sendMessage({
      inboxSlug: slug,
      contentText: parsed.text,
      channelKind: 'web',
      ...(parsed.senderName || parsed.senderId ? { sender } : {}),
    });
    return NextResponse.json({ id: res.id, status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'send failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
