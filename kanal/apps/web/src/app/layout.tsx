import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kanal — Multi-channel inbox',
  description: 'Configure your inboxes, rules, destinations and AI in one place.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex">
          <aside className="w-64 border-r border-border bg-white p-6">
            <div className="text-xl font-semibold mb-8">Kanal</div>
            <nav className="space-y-1 text-sm">
              <a className="block px-3 py-2 rounded hover:bg-muted" href="/inboxes">
                Inboxes
              </a>
              <a className="block px-3 py-2 rounded hover:bg-muted" href="/api-keys">
                API Keys
              </a>
              <a className="block px-3 py-2 rounded hover:bg-muted" href="/billing">
                Billing
              </a>
            </nav>
          </aside>
          <main className="flex-1 p-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
