/**
 * Development mode: runs the fake Marketplace website plus the agent worker
 * pointed at it. Nothing touches Facebook.
 *
 *   npm run mock-agent
 */
import { loadEnv } from '@/lib/env';

loadEnv();
process.env.MARKETPLACE_MODE = 'mock';

import { startMockServer } from '@/automation/mock/server';
import { AgentWorker } from './worker';
import * as repo from '@/db/repo';

async function main() {
  const port = Number(process.env.MOCK_PORT || 4010);
  await startMockServer(port);
  console.log(`[mock-marketplace] fake marketplace on http://localhost:${port}`);
  repo.setAgentState({ mode: 'mock' });
  repo.logEvent({ type: 'MOCK_MODE', message: `Mock marketplace running on http://localhost:${port}.` });
  const worker = new AgentWorker('mock');
  console.log('[agent] worker starting in MOCK mode');
  await worker.run();
}

main().catch((err) => {
  console.error('[mock-agent] fatal:', err);
  process.exit(1);
});
