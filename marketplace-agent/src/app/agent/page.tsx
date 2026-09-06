'use client';

import { useState } from 'react';
import { post, useAppState } from '@/lib/useAppState';
import { Button, Card, Empty, SectionTitle, clock, timeAgo } from '@/components/ui';

export default function AgentPage() {
  const { state, refresh } = useAppState(2500);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state) return <p className="text-slate-500">Loading…</p>;
  const agent = state.agent;

  async function send(action: string) {
    setBusy(true);
    setError(null);
    try {
      await post('/api/agent', { action });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle>AGENT</SectionTitle>

      <Card>
        <p className="text-lg font-semibold">{agent.running ? '🟢 Agent running' : '🔴 Agent stopped'}</p>
        <p className="mt-1 text-sm text-slate-400">
          Last activity: {agent.lastActivity ? `${agent.lastActivity} ${timeAgo(agent.lastActivityAt)}.` : 'none yet.'}
        </p>
        <dl className="mt-4 grid grid-cols-[190px_1fr] gap-y-1 text-sm">
          <dt className="text-slate-500">Mode</dt>
          <dd>{agent.mode === 'facebook' ? 'Real Facebook browser' : 'Mock marketplace'}</dd>
          <dt className="text-slate-500">Agent process</dt>
          <dd>{agent.workerAlive ? 'online' : 'offline — run `npm run agent`'}</dd>
          <dt className="text-slate-500">Browser</dt>
          <dd>{agent.browserOpen ? 'open' : 'closed'}</dd>
          <dt className="text-slate-500">Signed in</dt>
          <dd>{agent.loggedIn ? 'yes' : 'no'}</dd>
          <dt className="text-slate-500">Needs verification</dt>
          <dd>{agent.needsVerification ? 'yes — complete it in the browser' : 'no'}</dd>
        </dl>

        {agent.lastError && (
          <p className="mt-4 rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
            {agent.lastError}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">{error}</p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button disabled={busy || agent.running} onClick={() => send('start')}>
            START AGENT
          </Button>
          <Button variant="danger" disabled={busy || !agent.running} onClick={() => send('stop')}>
            STOP AGENT
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => send('openBrowser')}>
            Open {agent.mode === 'facebook' ? 'Facebook' : 'Mock'} Browser
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => send('closeBrowser')}>
            Close Browser
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => send('checkMessages')}>
            Check messages now
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>EVENT LOG</SectionTitle>
        <div className="max-h-[520px] space-y-2 overflow-auto text-sm">
          {state.events.length === 0 ? (
            <Empty>Nothing yet.</Empty>
          ) : (
            state.events.map((e) => (
              <div key={e.id} className="flex gap-3">
                <span className="w-20 shrink-0 text-slate-500">{clock(e.createdAt)}</span>
                <span
                  className={
                    e.level === 'error' ? 'text-rose-300' : e.level === 'warn' ? 'text-amber-300' : 'text-slate-300'
                  }
                >
                  {e.message}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
