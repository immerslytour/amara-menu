import * as repo from '@/db/repo';

const HEARTBEAT_TIMEOUT_MS = 20000;

/** The agent process only counts as running if it has heartbeated recently. */
export function workerIsAlive(): boolean {
  const state = repo.getAgentState();
  return (
    state.workerAlive &&
    !!state.heartbeatAt &&
    Date.now() - new Date(state.heartbeatAt).getTime() < HEARTBEAT_TIMEOUT_MS
  );
}
