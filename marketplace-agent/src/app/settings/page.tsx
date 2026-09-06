'use client';

import { useAppState } from '@/lib/useAppState';
import { Card, SectionTitle } from '@/components/ui';

export default function SettingsPage() {
  const { state } = useAppState(5000);

  return (
    <div className="max-w-3xl space-y-6">
      <SectionTitle>SETTINGS</SectionTitle>

      <Card>
        <h3 className="font-semibold text-white">Marketplace mode</h3>
        <p className="mt-1 text-sm text-slate-300">
          Currently <strong>{state?.agent.mode === 'facebook' ? 'REAL FACEBOOK' : 'MOCK'}</strong>. The mode is set by
          the agent process, not the web UI.
        </p>
        <pre className="mt-3 overflow-auto rounded bg-black/40 p-3 text-xs text-slate-300">
{`# real Facebook browser
MARKETPLACE_MODE=facebook  npm run agent

# fake marketplace for development
npm run mock-agent`}
        </pre>
      </Card>

      <Card>
        <h3 className="font-semibold text-white">Facebook session</h3>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          <li>• You log into Facebook yourself, in the browser window the agent opens.</li>
          <li>• Your password is never asked for, stored, or transmitted by this app.</li>
          <li>• The session stays on this machine in <code>data/browser-profile</code>.</li>
          <li>• Delete that folder to sign out and forget the session.</li>
          <li>• CAPTCHAs, MFA and security checks are never bypassed — the agent pauses and asks you.</li>
        </ul>
      </Card>

      <Card>
        <h3 className="font-semibold text-white">Claude</h3>
        <p className="mt-1 text-sm text-slate-300">
          Set <code>ANTHROPIC_API_KEY</code> in <code>.env</code> to have Claude write the listing copy and the buyer
          replies. Without a key the agent still runs: it uses your own wording and the same deterministic price rules.
        </p>
      </Card>

      <Card>
        <h3 className="font-semibold text-white">Safety rules (always on)</h3>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          <li>• Never accepts or quotes a price below a product&apos;s minimum.</li>
          <li>• Never gives out an exact pickup address — a human confirms that.</li>
          <li>• Never invents specifications or condition claims.</li>
          <li>• Never sends payment details, phone numbers or email addresses.</li>
          <li>• Stops replying automatically once a buyer becomes a HOT LEAD.</li>
          <li>• Never reports an action as done unless it was verified in the browser.</li>
        </ul>
      </Card>
    </div>
  );
}
