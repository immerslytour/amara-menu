import { NextResponse } from 'next/server';
import * as repo from '@/db/repo';
import type { AgentCommandType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ACTIONS: Record<string, AgentCommandType> = {
  start: 'START_AGENT',
  stop: 'STOP_AGENT',
  openBrowser: 'OPEN_BROWSER',
  closeBrowser: 'CLOSE_BROWSER',
  checkMessages: 'CHECK_MESSAGES',
};

export async function GET() {
  return NextResponse.json({
    agent: repo.getAgentState(),
    pendingCommands: repo.pendingCommandCount(),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const type = ACTIONS[action];
  if (!type) return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

  const state = repo.getAgentState();
  const alive =
    state.workerAlive &&
    !!state.heartbeatAt &&
    Date.now() - new Date(state.heartbeatAt).getTime() < 20000;
  if (!alive) {
    return NextResponse.json(
      {
        error:
          'The agent process is not running. Start it in a second terminal with `npm run agent` (or `npm run mock-agent`).',
      },
      { status: 409 },
    );
  }

  const cmd = repo.enqueueCommand(type);
  return NextResponse.json({ queued: cmd.id });
}
