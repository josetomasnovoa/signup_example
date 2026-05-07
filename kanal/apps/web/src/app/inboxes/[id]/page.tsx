import { notFound } from 'next/navigation';
import { serverClient } from '@/lib/api';
import { KanalApiError } from '@kanal/sdk';

export const dynamic = 'force-dynamic';

export default async function InboxDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = serverClient();
  let inbox;
  try {
    inbox = await client.getInbox(id);
  } catch (err) {
    if (err instanceof KanalApiError && err.status === 404) notFound();
    throw err;
  }

  const { messages } = await client.listMessages(id, { limit: 25 });

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{inbox.name}</h1>
        <p className="text-sm text-muted-foreground">
          /{inbox.slug} · retention {inbox.retentionDays}d
          {inbox.aiEnabled ? ' · AI on' : ''}
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-lg font-medium mb-3">Recent messages</h2>
        {messages.length === 0 ? (
          <div className="text-sm text-muted-foreground">No messages yet.</div>
        ) : (
          <div className="rounded border border-border bg-white divide-y">
            {messages.map((m) => (
              <div key={m.id} className="p-4">
                <div className="flex items-baseline justify-between">
                  <div className="font-medium">
                    {m.subject ?? <span className="text-muted-foreground italic">no subject</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(m.receivedAt).toLocaleString()}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {m.contentText ?? '—'}
                </div>
                <div className="text-xs mt-2">
                  <span
                    className={
                      m.status === 'processed'
                        ? 'text-emerald-700'
                        : m.status === 'failed' || m.status === 'dead'
                          ? 'text-red-700'
                          : 'text-muted-foreground'
                    }
                  >
                    {m.status}
                  </span>
                  {m.aiClassification ? (
                    <span className="ml-3 text-muted-foreground">
                      {Object.entries(m.aiClassification)
                        .map(([k, v]) => `${k}=${String(v)}`)
                        .join(' · ')}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
