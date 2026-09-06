/**
 * Renders every page in a real browser and fails on any runtime/console error.
 * Seeds a little data first so the dashboard has something to show.
 *
 *   npx tsx scripts/test-ui.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadEnv } from '@/lib/env';

loadEnv();

import * as repo from '@/db/repo';
import { nowIso } from '@/db';

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

async function pickFreePort(start: number): Promise<number> {
  for (let p = start; p < start + 20; p++) if (await portIsFree(p)) return p;
  throw new Error('no free port');
}

function seed() {
  const product = repo.createProduct({
    title: 'iPhone 15 128GB',
    description: 'Unlocked, no scratches, includes cable.',
    photos: [],
    askingPrice: 550,
    minimumPrice: 480,
    pickupArea: 'South Austin, TX',
    availability: 'weekday evenings',
    category: 'Electronics',
  });
  repo.updateProduct(product.id, {
    generatedTitle: 'iPhone 15 128GB — Unlocked',
    generatedDescription: 'Unlocked iPhone 15, 128GB. No scratches. Includes cable.\nPickup in South Austin, TX.',
    approvedAt: nowIso(),
  });
  repo.setProductStatus(product.id, 'ACTIVE');
  const listing = repo.createListing(product.id, 'mock');
  repo.updateListing(listing.id, {
    status: 'ACTIVE',
    externalId: 'item99',
    externalUrl: 'http://localhost:4010/marketplace/item/item99',
    publishedAt: nowIso(),
  });

  const convo = repo.upsertConversation({
    platform: 'mock',
    externalId: 'thread99',
    buyerName: 'Maria',
    productId: product.id,
  });
  repo.addMessage({ conversationId: convo.id, sender: 'BUYER', text: 'Is this still available? I can pick it up tonight.' });
  repo.addMessage({ conversationId: convo.id, sender: 'AGENT', text: '$500 works if you can pick it up today. I\'ll have the seller confirm the pickup details with you.' });
  repo.addMessage({ conversationId: convo.id, sender: 'BUYER', text: 'Perfect, I can pick it up tonight.' });
  repo.updateConversation(convo.id, {
    status: 'HOT_LEAD',
    leadScore: 92,
    agreedPrice: 500,
    aiEnabled: false,
    humanTakeover: true,
  });
  repo.upsertLead({ conversationId: convo.id, score: 92, status: 'HOT_LEAD', reason: 'Buyer agreed to $500 and wants to collect today.' });
  repo.logEvent({ type: 'SEEDED', productId: product.id, message: 'Seeded demo data for the UI check.' });
  return { productId: product.id, conversationId: convo.id };
}

async function main() {
  const { productId, conversationId } = seed();
  const port = await pickFreePort(3200);
  const base = `http://localhost:${port}`;
  const app: ChildProcess = spawn('npx', ['next', 'start', '-p', String(port)], {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env },
  });

  const shotDir = path.join(process.cwd(), 'data', 'ui-screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    for (let i = 0; i < 90; i++) {
      try {
        if ((await fetch(`${base}/api/state`)).ok) break;
      } catch {
        /* still starting */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(e.message));

    const routes: Array<[string, string, RegExp]> = [
      ['dashboard', '/', /HOT LEADS/],
      ['products', '/products', /PRODUCTS/],
      ['new-product', '/products/new', /Start Selling/],
      ['product-detail', `/products/${productId}`, /AI-GENERATED LISTING/],
      ['leads', '/leads', /LEADS/],
      ['conversation', `/leads/${conversationId}`, /READY TO CLOSE/],
      ['agent', '/agent', /EVENT LOG/],
      ['settings', '/settings', /Facebook session/],
    ];

    for (const [name, route, probe] of routes) {
      await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const body = await page.locator('body').innerText();
      check(`${name} renders`, probe.test(body), body.slice(0, 160).replace(/\n/g, ' | '));
      await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true });
    }

    // Dashboard specifics
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const dash = await page.locator('body').innerText();
    check('dashboard shows the five counters', ['TOTAL PRODUCTS', 'ACTIVE LISTINGS', 'ACTIVE CONVERSATIONS', 'HOT LEADS', 'SALES'].every((s) => dash.includes(s)));
    check('dashboard shows the READY TO CLOSE card', dash.includes('READY TO CLOSE'));
    check('dashboard shows the buyer and agreed price', dash.includes('Maria') && dash.includes('$500'));
    check('hot-lead card quotes the buyer, not the agent', dash.includes('I can pick it up tonight'));
    check('dashboard shows agent status', /Agent (running|stopped)/.test(dash));
    check('dashboard shows the OPEN CHAT / TAKE OVER / MARK SOLD actions', dash.includes('OPEN CHAT') && dash.includes('TAKE OVER') && dash.includes('MARK SOLD'));
    check('dashboard shows the activity log', dash.includes('ACTIVITY LOG'));

    // The add-product form must expose every required field.
    await page.goto(`${base}/products/new`, { waitUntil: 'networkidle' });
    for (const field of ['photos', 'title', 'description', 'askingPrice', 'minimumPrice', 'pickupArea', 'availability']) {
      check(`add-product form has "${field}"`, (await page.locator(`[name="${field}"]`).count()) > 0);
    }

    check('no console/page errors on any route', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
    console.log(`  screenshots in ${shotDir}`);
  } finally {
    await browser.close();
    try {
      if (app.pid) process.kill(-app.pid, 'SIGKILL');
    } catch {
      app.kill('SIGKILL');
    }
  }

  console.log(failures === 0 ? '\nUI checks passed.\n' : `\n${failures} UI check(s) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
