/**
 * The optional dashboard lock. The agent can act as you on Marketplace, so when
 * DASHBOARD_TOKEN is set nothing - page or API - may be reachable without it.
 *
 *   npx tsx scripts/test-auth.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { loadEnv } from '@/lib/env';

loadEnv();

const TOKEN = 'test-token-abc123';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name} ${detail}`);
  }
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => probe.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

async function main() {
  let port = 3300;
  while (!(await portIsFree(port))) port++;
  const base = `http://localhost:${port}`;

  const app: ChildProcess = spawn('npx', ['next', 'start', '-p', String(port)], {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, DASHBOARD_TOKEN: TOKEN },
  });

  try {
    for (let i = 0; i < 90; i++) {
      try {
        await fetch(`${base}/unlock`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    console.log('\n-- locked --');
    const page = await fetch(`${base}/`, { redirect: 'manual' });
    check('a page request is redirected to /unlock', page.status === 307 || page.status === 308, String(page.status));
    check('and it says where to go', (page.headers.get('location') || '').includes('/unlock'));

    const api = await fetch(`${base}/api/state`);
    check('the API refuses without a token', api.status === 401, String(api.status));
    check('the API explains how to unlock', /unlock/i.test((await api.json()).error));

    const agent = await fetch(`${base}/api/agent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
    check('agent commands cannot be issued while locked', agent.status === 401, String(agent.status));

    console.log('\n-- unlocking --');
    const wrong = await fetch(`${base}/api/unlock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'nope' }),
    });
    check('the wrong token is rejected', wrong.status === 401);

    const right = await fetch(`${base}/api/unlock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN }),
    });
    check('the right token is accepted', right.ok);
    const cookie = right.headers.get('set-cookie') || '';
    check('it sets an httpOnly cookie', /dash_token=/.test(cookie) && /HttpOnly/i.test(cookie), cookie);

    const withCookie = await fetch(`${base}/api/state`, {
      headers: { cookie: cookie.split(';')[0] },
    });
    check('the API works once unlocked', withCookie.ok, String(withCookie.status));

    const withHeader = await fetch(`${base}/api/state`, { headers: { 'x-dashboard-token': TOKEN } });
    check('the header also works, for scripts', withHeader.ok, String(withHeader.status));

    const badHeader = await fetch(`${base}/api/state`, { headers: { 'x-dashboard-token': 'nope' } });
    check('a wrong header is still refused', badHeader.status === 401);
  } finally {
    try {
      if (app.pid) process.kill(-app.pid, 'SIGKILL');
    } catch {
      app.kill('SIGKILL');
    }
  }

  console.log(failures === 0 ? '\nDashboard lock checks passed.\n' : `\n${failures} check(s) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
