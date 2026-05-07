'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';

interface LocalMessage {
  id: string;
  text: string;
  sentAt: string;
  status: 'sending' | 'sent' | 'failed';
  errorMessage?: string;
}

interface Props {
  slug: string;
  inboxName: string;
  aiEnabled: boolean;
}

const NAME_KEY_PREFIX = 'kanal:chat:name:';
const SID_KEY_PREFIX = 'kanal:chat:sid:';
const LOG_KEY_PREFIX = 'kanal:chat:log:';

function loadStr(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
}

function loadLog(key: string): LocalMessage[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LocalMessage[];
  } catch {
    return [];
  }
}

function saveLog(key: string, log: LocalMessage[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(log.slice(-100)));
}

export function ChatRoom({ slug, inboxName, aiEnabled }: Props) {
  const [name, setName] = useState<string>('');
  const [senderId, setSenderId] = useState<string>('');
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [text, setText] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const nameKey = `${NAME_KEY_PREFIX}${slug}`;
  const sidKey = `${SID_KEY_PREFIX}${slug}`;
  const logKey = `${LOG_KEY_PREFIX}${slug}`;

  useEffect(() => {
    setName(loadStr(nameKey) ?? '');
    let sid = loadStr(sidKey);
    if (!sid) {
      sid = `web_${crypto.randomUUID()}`;
      window.localStorage.setItem(sidKey, sid);
    }
    setSenderId(sid);
    setMessages(loadLog(logKey));
  }, [logKey, nameKey, sidKey]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function persist(next: LocalMessage[]): void {
    setMessages(next);
    saveLog(logKey, next);
  }

  function updateMessage(id: string, patch: Partial<LocalMessage>): void {
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m));
      saveLog(logKey, next);
      return next;
    });
  }

  async function send(): Promise<void> {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setText('');
    const local: LocalMessage = {
      id: crypto.randomUUID(),
      text: body,
      sentAt: new Date().toISOString(),
      status: 'sending',
    };
    persist([...messages, local]);
    try {
      const res = await fetch(`/api/send?slug=${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: body,
          ...(name ? { senderName: name } : {}),
          senderId,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        updateMessage(local.id, {
          status: 'failed',
          errorMessage: err.error ?? `HTTP ${res.status}`,
        });
      } else {
        updateMessage(local.id, { status: 'sent' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'network error';
      updateMessage(local.id, { status: 'failed', errorMessage: msg });
    } finally {
      setBusy(false);
    }
  }

  function handleNameChange(value: string): void {
    setName(value);
    if (typeof window !== 'undefined') window.localStorage.setItem(nameKey, value);
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="font-semibold">{inboxName}</div>
          <div className="text-xs text-muted-foreground">
            #{slug}
            {aiEnabled ? ' · AI on' : ''}
          </div>
        </div>
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="px-3 py-1.5 text-sm rounded border border-border w-36"
          maxLength={80}
        />
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            Send your first message. Only you can see this thread.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className="ml-auto max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-4 py-2 shadow-sm"
            >
              <div className="whitespace-pre-wrap text-sm">{m.text}</div>
              <div className="text-[10px] mt-1 opacity-80 flex items-center gap-2">
                <time>{new Date(m.sentAt).toLocaleTimeString()}</time>
                <span>
                  {m.status === 'sending'
                    ? '· sending…'
                    : m.status === 'sent'
                      ? '· sent'
                      : `· failed${m.errorMessage ? ` (${m.errorMessage})` : ''}`}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="px-3 py-3 border-t border-border flex gap-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 px-3 py-2 rounded-lg border border-border resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          maxLength={4000}
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-1 text-sm"
        >
          <Send size={16} />
          Send
        </button>
      </form>
    </div>
  );
}
