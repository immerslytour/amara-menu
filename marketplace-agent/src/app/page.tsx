'use client';

import Link from 'next/link';
import { useState } from 'react';
import { post, useAppState, type ConversationView } from '@/lib/useAppState';
import { Badge, Button, Card, Empty, LinkButton, SectionTitle, Stat, clock } from '@/components/ui';

export default function Dashboard() {
  const { state, refresh } = useAppState();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!state) return <p className="text-slate-500">Loading…</p>;

  async function act(conversationId: string, action: string) {
    setBusy(conversationId + action);
    setError(null);
    try {
      await post(`/api/conversations/${conversationId}/action`, { action });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="TOTAL PRODUCTS" value={state.stats.totalProducts} />
        <Stat label="ACTIVE LISTINGS" value={state.stats.activeListings} />
        <Stat label="ACTIVE CONVERSATIONS" value={state.stats.activeConversations} />
        <Stat label="HOT LEADS" value={state.stats.hotLeads} />
        <Stat label="SALES" value={state.stats.sales} />
      </div>

      {error && (
        <p className="rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">{error}</p>
      )}

      <section>
        <SectionTitle>HOT LEADS</SectionTitle>
        {state.hotLeads.length === 0 ? (
          <Empty>No hot leads yet.</Empty>
        ) : (
          <div className="space-y-3">
            {state.hotLeads.map((c) => (
              <HotLeadCard key={c.id} convo={c} busy={busy} onAct={act} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>CONVERSATIONS</SectionTitle>
        {state.conversations.length === 0 ? (
          <Empty>No conversations yet.</Empty>
        ) : (
          <Card className="divide-y divide-line p-0">
            {state.conversations.map((c) => (
              <Link
                key={c.id}
                href={`/leads/${c.id}`}
                className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-slate-800/40"
              >
                <span className="font-medium text-white">{c.productTitle || 'Unlinked item'}</span>
                <span className="text-slate-500">—</span>
                <span className="text-slate-300">{c.buyerName}</span>
                <span className="ml-auto flex items-center gap-3">
                  <span className="text-xs text-slate-500">score {c.leadScore}</span>
                  <Badge status={c.status} />
                  {!c.aiEnabled && <span className="text-[11px] text-slate-500">AI OFF</span>}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>PRODUCTS</SectionTitle>
          <LinkButton href="/products/new">+ Add Product</LinkButton>
        </div>
        {state.products.length === 0 ? (
          <Empty>No products yet. Add one to get started.</Empty>
        ) : (
          <Card className="divide-y divide-line p-0">
            {state.products.map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-slate-800/40"
              >
                <span className="font-medium text-white">{p.title}</span>
                <span className="text-slate-400">${p.askingPrice}</span>
                <span className="ml-auto flex items-center gap-3">
                  {!p.aiEnabled && <span className="text-[11px] text-slate-500">AI OFF</span>}
                  <Badge status={p.status} />
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>ACTIVITY LOG</SectionTitle>
        <Card className="max-h-80 space-y-2 overflow-auto text-sm">
          {state.events.length === 0 ? (
            <Empty>Nothing yet.</Empty>
          ) : (
            state.events.map((e) => (
              <div key={e.id} className="flex gap-3">
                <span className="w-20 shrink-0 text-slate-500">{clock(e.createdAt)}</span>
                <span
                  className={
                    e.level === 'error'
                      ? 'text-rose-300'
                      : e.level === 'warn'
                        ? 'text-amber-300'
                        : 'text-slate-300'
                  }
                >
                  {e.message}
                </span>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}

function HotLeadCard({
  convo,
  busy,
  onAct,
}: {
  convo: ConversationView;
  busy: string | null;
  onAct: (id: string, action: string) => void;
}) {
  return (
    <Card className="border-orange-700/50">
      <div className="mb-2 text-sm font-bold tracking-widest text-orange-300">🔥 READY TO CLOSE</div>
      <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
        <dt className="text-slate-500">Product</dt>
        <dd className="text-white">{convo.productTitle || 'Unlinked item'}</dd>
        <dt className="text-slate-500">Buyer</dt>
        <dd className="text-white">{convo.buyerName}</dd>
        <dt className="text-slate-500">Agreed price</dt>
        <dd className="text-white">{convo.agreedPrice ? `$${convo.agreedPrice}` : 'not agreed yet'}</dd>
        <dt className="text-slate-500">Buyer message</dt>
        <dd className="text-slate-200">
          {convo.lastBuyerMessage ? `"${convo.lastBuyerMessage.text}"` : '—'}
        </dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!!busy} onClick={() => onAct(convo.id, 'openChat')}>
          OPEN CHAT
        </Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => onAct(convo.id, 'takeOver')}>
          TAKE OVER
        </Button>
        <Button disabled={!!busy} onClick={() => onAct(convo.id, 'markSold')}>
          MARK SOLD
        </Button>
        <LinkButton href={`/leads/${convo.id}`}>VIEW THREAD</LinkButton>
      </div>
    </Card>
  );
}
