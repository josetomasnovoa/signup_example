import Link from 'next/link';
import { serverClient } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function InboxesPage() {
  const client = serverClient();
  const { inboxes } = await client.listInboxes();
  return (
    <div>
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Inboxes</h1>
        <Link
          href="/inboxes/new"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
        >
          New inbox
        </Link>
      </header>

      {inboxes.length === 0 ? (
        <div className="rounded border border-border bg-white p-10 text-center text-sm text-muted-foreground">
          No inboxes yet. Create one with the button above or via{' '}
          <code className="px-1 rounded bg-muted">POST /v1/inboxes</code>.
        </div>
      ) : (
        <div className="rounded border border-border bg-white divide-y">
          {inboxes.map((i) => (
            <Link
              key={i.id}
              href={`/inboxes/${i.id}`}
              className="flex items-center justify-between p-5 hover:bg-muted"
            >
              <div>
                <div className="font-medium">{i.name}</div>
                <div className="text-sm text-muted-foreground">
                  /{i.slug}
                  {i.aiEnabled ? ' · AI enabled' : ''}
                  {i.archivedAt ? ' · archived' : ''}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Created {new Date(i.createdAt).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
