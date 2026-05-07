import { notFound } from 'next/navigation';
import { serverClient } from '@/lib/api';
import { ChatRoom } from './ChatRoom';

export const dynamic = 'force-dynamic';

/**
 * Public chat page. Each phone visiting this URL gets their own input
 * surface; phones never see each other's messages (the thread on the
 * right is reconstructed from localStorage only). All submissions land
 * in the same inbox on the server side, where rules + AI run, and
 * destinations fan out the result.
 *
 * Available only for inbox slugs listed in KANAL_PUBLIC_INBOX_SLUGS.
 */
export default async function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const allow = (process.env.KANAL_PUBLIC_INBOX_SLUGS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length > 0 && !allow.includes(slug)) notFound();

  // Verify the inbox exists (and that the slug we serve actually maps to one).
  const client = serverClient();
  const all = await client.listInboxes();
  const inbox = all.inboxes.find((i) => i.slug === slug && !i.archivedAt);
  if (!inbox) notFound();

  return <ChatRoom slug={slug} inboxName={inbox.name} aiEnabled={inbox.aiEnabled} />;
}
