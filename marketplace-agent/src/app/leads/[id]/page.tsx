'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { post } from '@/lib/useAppState';
import { Badge, Button, Card, SectionTitle, clock } from '@/components/ui';
import type { Conversation, Lead, Message, Product } from '@/lib/types';

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<{
    conversation: Conversation;
    product: Product | null;
    messages: Message[];
    lead: Lead | null;
  } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/conversations/${id}`, { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) return <p className="text-slate-500">Loading…</p>;
  const { conversation: convo, product, messages, lead } = data;

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      await post(`/api/conversations/${id}/action`, { action, ...body });
      if (action === 'send') setText('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-white">{convo.buyerName}</h1>
        <Badge status={convo.status} />
        <span className="text-sm text-slate-400">{product?.title || 'Unlinked item'}</span>
        {convo.agreedPrice && <span className="text-sm text-emerald-400">agreed ${convo.agreedPrice}</span>}
        <span className="text-xs text-slate-500">score {convo.leadScore}</span>
      </div>

      {convo.status === 'HOT_LEAD' && (
        <Card className="border-orange-700/50">
          <p className="text-sm font-bold tracking-widest text-orange-300">🔥 READY TO CLOSE</p>
          <p className="mt-2 text-sm text-slate-300">
            The AI has stopped replying to this conversation so you can close the sale yourself.
            {lead?.reason ? ` ${lead.reason}` : ''}
          </p>
        </Card>
      )}

      {error && (
        <p className="rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!!busy} onClick={() => act('openChat')}>
          OPEN CHAT
        </Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => act('takeOver')}>
          TAKE OVER
        </Button>
        <Button disabled={!!busy} onClick={() => act('markSold')}>
          MARK SOLD
        </Button>
        <Button variant="ghost" disabled={!!busy} onClick={() => act('toggleAi')}>
          AI {convo.aiEnabled ? 'ON' : 'OFF'}
        </Button>
        <Button variant="ghost" disabled={!!busy} onClick={() => act('close')}>
          Close
        </Button>
      </div>

      <Card>
        <SectionTitle>CONVERSATION</SectionTitle>
        <div className="max-h-[420px] space-y-2 overflow-auto">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                m.sender === 'BUYER'
                  ? 'bg-slate-800 text-slate-100'
                  : m.sender === 'HUMAN'
                    ? 'ml-auto bg-emerald-700 text-white'
                    : 'ml-auto bg-blue-700 text-white'
              }`}
            >
              <div className="mb-0.5 text-[10px] uppercase tracking-widest opacity-70">
                {m.sender === 'BUYER' ? convo.buyerName : m.sender === 'HUMAN' ? 'You' : 'AI'} · {clock(m.timestamp)}
              </div>
              {m.text}
            </div>
          ))}
          {messages.length === 0 && <p className="text-sm text-slate-500">No messages yet.</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Reply as yourself…"
            className="flex-1 rounded border border-line bg-[#0f1115] px-3 py-2 text-sm text-white"
          />
          <Button disabled={!text.trim() || busy === 'send'} onClick={() => act('send', { text })}>
            Send
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Sending from here types the message into the browser as you. The agent process must be running.
        </p>
      </Card>

      {product && (
        <Card>
          <SectionTitle>PRICE RULES</SectionTitle>
          <p className="text-sm text-slate-300">
            Asking ${product.askingPrice} · minimum ${product.minimumPrice} · pickup {product.pickupArea}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            The agent never accepts below ${product.minimumPrice} and never gives out an exact address.
          </p>
        </Card>
      )}
    </div>
  );
}
