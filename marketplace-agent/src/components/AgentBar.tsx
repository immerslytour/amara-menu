'use client';

import { useState } from 'react';
import { post, useAppState } from '@/lib/useAppState';
import { Button, timeAgo } from './ui';

export default function AgentBar() {
  const { state, refresh } = useAppState(3000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agent = state?.agent;

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
    <div className="border-b border-line bg-[#12141a]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-3 text-sm">
        <span className="font-semibold">
          {agent?.running ? '🟢 Agent running' : '🔴 Agent stopped'}
        </span>
        <span className="text-xs uppercase tracking-widest text-slate-500">
          {agent?.mode === 'facebook' ? 'facebook mode' : 'mock mode'}
        </span>
        {agent && !agent.workerAlive && (
          <span className="text-xs text-amber-400">
            agent process offline — run <code className="text-amber-300">npm run agent</code>
          </span>
        )}
        <span className="text-xs text-slate-500">
          Last activity: {agent?.lastActivity ? `${agent.lastActivity} ${timeAgo(agent.lastActivityAt)}.` : 'none yet.'}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => send('openBrowser')}>
            Open {agent?.mode === 'facebook' ? 'Facebook' : 'Mock'} Browser
          </Button>
          {agent?.running ? (
            <Button variant="danger" disabled={busy} onClick={() => send('stop')}>
              Stop Agent
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => send('start')}>
              Start Agent
            </Button>
          )}
        </div>
      </div>

      {(error || agent?.needsVerification || (agent && !agent.loggedIn && agent.browserOpen)) && (
        <div className="mx-auto max-w-6xl px-6 pb-3">
          {agent?.needsVerification && (
            <p className="rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
              Facebook requires manual verification. Complete it in the browser, then resume the agent.
            </p>
          )}
          {agent && !agent.loggedIn && agent.browserOpen && !agent.needsVerification && (
            <p className="rounded border border-sky-800 bg-sky-900/30 px-3 py-2 text-sm text-sky-200">
              Log into Facebook in the browser window. When you&apos;re finished, return here.
            </p>
          )}
          {error && (
            <p className="mt-2 rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
