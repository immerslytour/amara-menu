'use client';

import Link from 'next/link';
import { useAppState } from '@/lib/useAppState';
import { Badge, Card, Empty, SectionTitle } from '@/components/ui';

export default function LeadsPage() {
  const { state } = useAppState();
  if (!state) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <SectionTitle>LEADS</SectionTitle>
      {state.conversations.length === 0 ? (
        <Empty>No leads yet. Publish a listing and wait for buyers.</Empty>
      ) : (
        <Card className="divide-y divide-line p-0">
          {state.conversations.map((c) => (
            <Link key={c.id} href={`/leads/${c.id}`} className="block px-5 py-3 hover:bg-slate-800/40">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium text-white">{c.buyerName}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-300">{c.productTitle || 'Unlinked item'}</span>
                <span className="ml-auto flex items-center gap-3">
                  <span className="text-xs text-slate-500">score {c.leadScore}</span>
                  <Badge status={c.status} />
                </span>
              </div>
              {c.lastMessage && (
                <p className="mt-1 truncate text-sm text-slate-500">
                  {c.lastMessage.sender === 'BUYER' ? c.buyerName : 'You'}: {c.lastMessage.text}
                </p>
              )}
              {c.lead?.reason && <p className="mt-1 text-xs text-slate-600">{c.lead.reason}</p>}
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
