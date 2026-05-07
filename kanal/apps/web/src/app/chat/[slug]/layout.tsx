/**
 * The chat route owns the whole viewport — no dashboard chrome on the
 * phone. This layout overrides the outer `RootLayout` for `/chat/*` so the
 * sidebar doesn't show on mobile.
 */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 bg-white">{children}</div>;
}
