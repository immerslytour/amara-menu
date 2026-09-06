/**
 * Full MVP flow, end to end, against the fake Marketplace and a real browser.
 *
 *   npm run e2e
 *
 * Exercises: product creation -> Claude listing draft -> approval -> browser
 * publish + verification -> buyer messages -> AI replies -> negotiation floor ->
 * HOT_LEAD handoff -> AI stops -> human marks sold.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { loadEnv } from '@/lib/env';

loadEnv();
process.env.MARKETPLACE_MODE = 'mock';
process.env.HEADLESS = '1';
process.env.MOCK_PORT = process.env.MOCK_PORT || '4011';

let APP_PORT = Number(process.env.E2E_APP_PORT || 3100);
let APP = `http://localhost:${APP_PORT}`;
const MOCK = `http://localhost:${process.env.MOCK_PORT}`;

/** A stale server on the port would silently answer with someone else's data. */
function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => probe.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

async function pickFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 20; port++) {
    if (await portIsFree(port)) return port;
  }
  throw new Error(`No free port in ${start}-${start + 20}. Kill stale servers and retry.`);
}

let failures = 0;
const steps: string[] = [];

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ok   ${name}`);
    steps.push(`ok   ${name}`);
  } else {
    failures++;
    console.log(`FAIL   ${name} ${detail}`);
    steps.push(`FAIL ${name} ${detail}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(pathname: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${APP}${pathname}`, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${pathname} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function waitFor<T>(label: string, fn: () => Promise<T | null>, timeoutMs = 60000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await sleep(750);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

async function main() {
  // ---------------------------------------------------------------- reset
  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  for (const f of ['app.db', 'app.db-wal', 'app.db-shm', 'mock-marketplace.json']) {
    const full = path.join(dataDir, f);
    if (fs.existsSync(full)) fs.rmSync(full);
  }

  const { startMockServer } = await import('@/automation/mock/server');
  const { AgentWorker } = await import('@/agent/worker');
  const repo = await import('@/db/repo');

  const mockServer = await startMockServer(Number(process.env.MOCK_PORT));
  console.log(`[e2e] fake marketplace on ${MOCK}`);

  console.log('[e2e] STEP 1: start the application');
  APP_PORT = await pickFreePort(APP_PORT);
  APP = `http://localhost:${APP_PORT}`;
  console.log(`[e2e] app on ${APP}`);
  const app: ChildProcess = spawn('npx', ['next', 'start', '-p', String(APP_PORT)], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: 'ignore',
    detached: true,
  });

  const cleanup = async () => {
    // Kill the whole process group: `npx` spawns next-server as a child, and a
    // survivor would hold the port and confuse the next run.
    try {
      if (app.pid) process.kill(-app.pid, 'SIGKILL');
    } catch {
      app.kill('SIGKILL');
    }
    mockServer.close();
    await worker?.stop();
  };

  let worker: any;
  try {
    await waitFor(
      'the web app to answer',
      async () => {
        try {
          const res = await fetch(`${APP}/api/state`);
          return res.ok ? true : null;
        } catch {
          return null;
        }
      },
      90000,
    );
    check('application starts and serves the dashboard API', true);

    // Agent worker in-process (equivalent to `npm run mock-agent`).
    worker = new AgentWorker('mock');
    worker.stop = async () => {
      worker.stopped = true;
    };
    worker.run();
    await waitFor('the agent worker heartbeat', async () => {
      const { agent } = await api('/api/agent');
      return agent.workerAlive && agent.heartbeatAt ? true : null;
    });
    check('agent worker comes online', true);

    // ------------------------------------------------------ STEP 2 + 3
    console.log('[e2e] STEP 2-3: create the product with photos');
    const photoDir = path.join(dataDir, 'e2e-photos');
    fs.mkdirSync(photoDir, { recursive: true });
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const photoPaths = ['ps5-front.png', 'ps5-side.png'].map((n) => {
      const full = path.join(photoDir, n);
      fs.writeFileSync(full, pngBytes);
      return full;
    });

    const form = new FormData();
    form.set('title', 'PlayStation 5 Disc Edition');
    form.set('description', 'Adult owned, barely used. Comes with one controller and all cables.');
    form.set('askingPrice', '450');
    form.set('minimumPrice', '400');
    form.set('pickupArea', 'North Austin, TX');
    form.set('availability', 'today');
    form.set('category', 'Electronics');
    for (const p of photoPaths) {
      form.append('photos', new Blob([new Uint8Array(fs.readFileSync(p))], { type: 'image/png' }), path.basename(p));
    }
    const created = await api('/api/products', { method: 'POST', body: form });
    const productId: string = created.product.id;
    check('product is created', !!productId);
    check('both photos are uploaded', created.product.photos.length === 2, JSON.stringify(created.product.photos));

    // ------------------------------------------------------------ STEP 4
    console.log('[e2e] STEP 4: generate the listing');
    const generated = await api(`/api/products/${productId}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'generate' }),
    });
    check('listing copy is generated', !!generated.draft?.title && !!generated.draft?.description);
    console.log(`       [${generated.draft.source}] ${generated.draft.title}`);

    // ------------------------------------------------------------ STEP 5
    console.log('[e2e] STEP 5-6: approve and open the browser');
    const beforeApproval = await api(`/api/products/${productId}`);
    check('listing is not published before approval', beforeApproval.product.status === 'DRAFT');

    await api('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'openBrowser' }),
    });
    await waitFor('the browser to open', async () => (repo.getAgentState().browserOpen ? true : null));
    check('browser opens and reports a logged-in marketplace session', repo.getAgentState().loggedIn);

    await api(`/api/products/${productId}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approveAndPublish' }),
    });

    // ------------------------------------------------------- STEP 7-10
    console.log('[e2e] STEP 7-10: publish through the marketplace UI and verify');
    const published = await waitFor(
      'the listing to publish',
      async () => {
        const res = await api(`/api/products/${productId}`);
        if (res.product.status === 'ACTIVE') return res;
        if (res.product.status === 'FAILED') throw new Error(`publish failed: ${res.listing?.errorMessage}`);
        return null;
      },
      120000,
    );
    check('product becomes ACTIVE', published.product.status === 'ACTIVE');
    check('listing has a marketplace URL', !!published.listing.externalUrl, published.listing.externalUrl);
    check('listing has a marketplace id', !!published.listing.externalId);
    check('listing has a published timestamp', !!published.listing.publishedAt);

    const listingId: string = published.listing.externalId;
    const mockState = await (await fetch(`${MOCK}/mock/api/state`)).json();
    const live = mockState.listings.find((l: any) => l.id === listingId);
    check('the listing really exists on the marketplace', !!live, JSON.stringify(mockState.listings));
    check('the marketplace shows the right price', live?.price === 450, String(live?.price));
    check('the marketplace received both photos', live?.photos?.length === 2, JSON.stringify(live?.photos));

    // ----------------------------------------------------------- STEP 11
    console.log('[e2e] STEP 11-12: buyer asks a question, AI replies');
    await buyerSays(listingId, 'John', 'Is this still available?');
    await checkMessages();
    const afterFirst = await waitForConversation('a reply to the first question', (c, msgs) =>
      msgs.some((m: any) => m.sender === 'AGENT') ? { c, msgs } : null,
    );
    check('AI replied to the buyer', afterFirst.msgs.some((m: any) => m.sender === 'AGENT'));
    console.log(`       AI: ${afterFirst.msgs.filter((m: any) => m.sender === 'AGENT').slice(-1)[0].text}`);
    const conversationId: string = afterFirst.c.id;
    check('conversation is linked to the product', afterFirst.c.productId === productId);

    // ----------------------------------------------------------- STEP 13
    console.log('[e2e] STEP 13-14: buyer lowballs, AI must not go below the minimum');
    await buyerSays(listingId, 'John', 'Would you take $350?');
    await checkMessages();
    const afterLowball = await waitForConversation('a counter-offer', (c, msgs) => {
      const agent = msgs.filter((m: any) => m.sender === 'AGENT');
      return agent.length >= 2 ? { c, msgs, agent } : null;
    });
    const counterText: string = afterLowball.agent.slice(-1)[0].text;
    console.log(`       AI: ${counterText}`);
    check('AI sent a new reply to the lowball', afterLowball.agent.length >= 2);
    check('AI countered at $425', counterText.includes('$425'), counterText);
    check('AI did not repeat the $350 offer', !counterText.includes('$350'), counterText);
    check('AI status is NEGOTIATING', afterLowball.c.status === 'NEGOTIATING', afterLowball.c.status);

    const allAgentPrices = afterLowball.msgs
      .filter((m: any) => m.sender === 'AGENT')
      .flatMap((m: any) => [...m.text.matchAll(/\$\s?(\d+(?:\.\d+)?)/g)].map((x: any) => Number(x[1])));
    check(
      'no price quoted by the AI is below the $400 minimum',
      allAgentPrices.every((p: number) => p >= 400),
      JSON.stringify(allAgentPrices),
    );

    // -------------------------------------------------------- STEP 15-18
    console.log('[e2e] STEP 15-18: buyer meets the minimum, conversation becomes HOT_LEAD');
    await buyerSays(listingId, 'John', 'I can pay $400. Can I pick it up tonight?');
    await checkMessages();
    /**
     * The handoff is complete only when the AI has switched itself off AND its
     * closing reply is the last message in the thread. Waiting on the status
     * alone raced the reply that Claude was still writing.
     */
    const hot = await waitForConversation('the HOT_LEAD handoff', (c, msgs) =>
      c.status === 'HOT_LEAD' && c.aiEnabled === false && msgs[msgs.length - 1]?.sender === 'AGENT'
        ? { c, msgs }
        : null,
    );
    const acceptText: string = hot.msgs.filter((m: any) => m.sender === 'AGENT').slice(-1)[0].text;
    console.log(`       AI: ${acceptText}`);
    check('conversation is HOT_LEAD', hot.c.status === 'HOT_LEAD');
    check('lead score is in the 81-100 band', hot.c.leadScore >= 81, String(hot.c.leadScore));
    check('agreed price is recorded at $400', hot.c.agreedPrice === 400, String(hot.c.agreedPrice));
    // Asserted on meaning, not on one exact sentence: Claude words this
    // differently each run, and the rule is "a human settles the pickup".
    const promisesHumanFollowUp =
      /\b(seller|i)\b[^.!?]*\b(confirm|arrange|sort out|work out|set up)\b[^.!?]*\b(pickup|pick-up|spot|details|meet|meeting|location)\b/i;
    check('AI defers the pickup arrangements to the human', promisesHumanFollowUp.test(acceptText), acceptText);
    check('AI never gave out an exact address', !/\b\d{1,5}\s+[A-Z][a-z]+\s+(st|street|ave|rd|road|dr|drive)\b/i.test(acceptText));
    check('AI switched itself off for this conversation', hot.c.aiEnabled === false);
    check('conversation is flagged for human takeover', hot.c.humanTakeover === true);

    const agentMsgCountAtHandoff = hot.msgs.filter((m: any) => m.sender === 'AGENT').length;
    await buyerSays(listingId, 'John', 'Great, what is your address?');
    await checkMessages();
    await sleep(4000);
    const afterHandoff = await api(`/api/conversations/${conversationId}`);
    check(
      'AI stays silent after handoff',
      afterHandoff.messages.filter((m: any) => m.sender === 'AGENT').length === agentMsgCountAtHandoff,
    );

    // ----------------------------------------------------------- STEP 18
    console.log('[e2e] STEP 18-19: dashboard shows READY TO CLOSE');
    const state = await api('/api/state');
    const hotLead = state.hotLeads.find((c: any) => c.id === conversationId);
    check('dashboard lists the hot lead', !!hotLead);
    check('dashboard shows the product', hotLead?.productTitle === 'PlayStation 5 Disc Edition');
    check('dashboard shows the buyer', hotLead?.buyerName === 'John');
    check('dashboard shows the agreed price', hotLead?.agreedPrice === 400);
    check(
      'dashboard shows the buyer\'s own last message',
      hotLead?.lastBuyerMessage?.sender === 'BUYER' && /address/i.test(hotLead.lastBuyerMessage.text),
      JSON.stringify(hotLead?.lastBuyerMessage),
    );
    check('hot-lead counter is 1', state.stats.hotLeads === 1, String(state.stats.hotLeads));
    check('active listings counter is 1', state.stats.activeListings === 1);

    // ----------------------------------------------------------- STEP 20
    console.log('[e2e] STEP 20: human marks it sold');
    const liveBefore = (await (await fetch(`${MOCK}/mock/api/state`)).json()).listings.find(
      (l: any) => l.id === listingId,
    );
    check('the listing is still live on the marketplace before selling', liveBefore.sold === false);

    await api(`/api/conversations/${conversationId}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'markSold' }),
    });
    const finalState = await api('/api/state');
    const soldProduct = finalState.products.find((p: any) => p.id === productId);
    check('product is marked SOLD', soldProduct.status === 'SOLD', soldProduct.status);
    check('sales counter is 1', finalState.stats.sales === 1);

    // Selling must take the listing down on the platform, not just here.
    const takenDown = await waitFor(
      'the marketplace listing to be marked sold',
      async () => {
        const live = (await (await fetch(`${MOCK}/mock/api/state`)).json()).listings.find(
          (l: any) => l.id === listingId,
        );
        return live?.sold ? live : null;
      },
      60000,
    );
    check('the marketplace listing itself is marked sold', takenDown.sold === true);
    check(
      'the local listing record follows',
      (await api(`/api/products/${productId}`)).listing.status === 'SOLD',
    );

    console.log('[e2e] STEP 21: editing and deleting a product');
    const edited = await api(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ askingPrice: 460, minimumPrice: 410, pickupArea: 'South Austin, TX' }),
    });
    check('product edits are saved', edited.product.askingPrice === 460 && edited.product.pickupArea === 'South Austin, TX');

    const badEdit = await fetch(`${APP}/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ askingPrice: 100, minimumPrice: 900 }),
    });
    check('a minimum above the asking price is rejected', badEdit.status === 400);
    check(
      'the rejected edit changed nothing',
      (await api(`/api/products/${productId}`)).product.askingPrice === 460,
    );

    const scratch = await api('/api/products', { method: 'POST', body: throwawayForm() });
    const deleted = await fetch(`${APP}/api/products/${scratch.product.id}`, { method: 'DELETE' });
    check('an unpublished product can be deleted', deleted.ok);
    check(
      'it is gone from the dashboard',
      !(await api('/api/state')).products.some((p: any) => p.id === scratch.product.id),
    );

    // ------------------------------------------------------- event log
    console.log('\n[e2e] EVENT LOG (most recent last)');
    const events = [...finalState.events].reverse();
    for (const e of events) {
      console.log(
        `  ${new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}  ${e.message}`,
      );
    }
    const types = new Set(events.map((e: any) => e.type));
    check('event log records the publish', types.has('LISTING_PUBLISHED'));
    check('event log records buyer messages', types.has('BUYER_MESSAGE'));
    check('event log records the classification', types.has('LEAD_CLASSIFIED'));
    check('event log records AI replies', types.has('AI_REPLIED'));
    check('event log records the human takeover', types.has('HUMAN_TAKEOVER_REQUIRED'));
  } finally {
    await cleanup();
  }

  console.log(
    failures === 0
      ? `\n✅ MVP flow passed (${steps.length} checks).\n`
      : `\n❌ ${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);

  /* ------------------------------------------------------------ helpers */

  function throwawayForm(): FormData {
    const f = new FormData();
    f.set('title', 'Old Desk Lamp');
    f.set('description', 'Works fine.');
    f.set('askingPrice', '20');
    f.set('minimumPrice', '15');
    f.set('pickupArea', 'North Austin, TX');
    f.set('availability', 'weekends');
    f.set('category', 'Home Goods');
    f.set('condition', 'Used - good');
    return f;
  }

  async function buyerSays(listingId: string, buyerName: string, text: string) {
    console.log(`       ${buyerName}: ${text}`);
    const res = await fetch(`${MOCK}/mock/api/simulate/buyer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ listingId, buyerName, text }),
    });
    if (!res.ok) throw new Error('buyer simulation failed');
  }

  async function checkMessages() {
    await api('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'checkMessages' }),
    });
  }

  async function waitForConversation(
    label: string,
    predicate: (c: any, msgs: any[]) => any,
  ): Promise<any> {
    return waitFor(
      label,
      async () => {
        const { conversations } = await api('/api/conversations');
        for (const c of conversations) {
          const { messages } = await api(`/api/conversations/${c.id}`);
          const hit = predicate(c, messages);
          if (hit) return hit;
        }
        return null;
      },
      90000,
    );
  }
}

main().catch(async (err) => {
  console.error('\n[e2e] FAILED:', err);
  process.exit(1);
});
