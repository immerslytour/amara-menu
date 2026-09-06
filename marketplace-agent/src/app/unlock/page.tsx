'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';

export default function UnlockPage() {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Could not unlock.');
      const next = new URLSearchParams(window.location.search).get('next') || '/';
      window.location.href = next;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="text-lg font-semibold text-white">Dashboard locked</h1>
        <p className="mt-1 text-sm text-slate-400">
          Enter the token from <code>DASHBOARD_TOKEN</code> in your <code>.env</code>.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
            className="w-full rounded border border-line bg-[#0f1115] px-3 py-2 text-sm text-white"
          />
          {error && (
            <p className="rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">{error}</p>
          )}
          <Button type="submit" disabled={busy || !token}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
