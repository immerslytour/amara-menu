/**
 * Section 17: the agent must never click blindly.
 * Breaks the marketplace UI on purpose and checks the agent stops, captures
 * diagnostics, surfaces the error, and can retry once the UI is fixed.
 *
 *   npx tsx scripts/test-failure-recovery.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '@/lib/env';

loadEnv();
process.env.MARKETPLACE_MODE = 'mock';
process.env.HEADLESS = '1';
process.env.MOCK_PORT = process.env.MOCK_PORT || '4013';

import { startMockServer } from '@/automation/mock/server';
import { AgentWorker } from '@/agent/worker';
import * as repo from '@/db/repo';
import { nowIso } from '@/db';

const MOCK = `http://localhost:${process.env.MOCK_PORT}`;

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name} ${detail}`);
  }
}

async function flags(body: Record<string, boolean>) {
  await fetch(`${MOCK}/mock/api/flags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data');
  for (const f of ['app.db', 'app.db-wal', 'app.db-shm', 'mock-marketplace.json']) {
    const full = path.join(dataDir, f);
    if (fs.existsSync(full)) fs.rmSync(full);
  }

  const server = await startMockServer(Number(process.env.MOCK_PORT));
  const worker = new AgentWorker('mock');

  const product = repo.createProduct({
    title: 'Mountain Bike',
    description: 'Aluminium frame, recently serviced.',
    photos: [],
    askingPrice: 300,
    minimumPrice: 250,
    pickupArea: 'Round Rock, TX',
    availability: 'weekends',
    category: 'Sporting Goods',
  });
  repo.updateProduct(product.id, {
    generatedTitle: 'Mountain Bike — recently serviced',
    generatedDescription: 'Aluminium frame, recently serviced. Pickup in Round Rock, TX.',
    approvedAt: nowIso(),
  });

  try {
    console.log('\n-- a broken listing UI --');
    await flags({ breakCreateFlow: true });
    await worker.publishProduct(product.id);

    let listing = repo.getListingForProduct(product.id, 'mock')!;
    check('listing is marked FAILED, not ACTIVE', listing.status === 'FAILED', listing.status);
    check('product is marked FAILED', repo.getProduct(product.id)!.status === 'FAILED');
    check('the error names the failing step', /step "click-create-new-listing"/.test(listing.errorMessage || ''), listing.errorMessage || '');
    check('a screenshot was captured', !!listing.screenshotPath && fs.existsSync(listing.screenshotPath));
    check('an HTML snapshot was captured', !!listing.htmlPath && fs.existsSync(listing.htmlPath));
    check('the failure is in the event log', repo.listEvents(20).some((e) => e.type === 'AUTOMATION_FAILED' && e.level === 'error'));
    check('nothing was published to the marketplace', (await (await fetch(`${MOCK}/mock/api/state`)).json()).listings.length === 0);

    console.log('\n-- a security challenge --');
    await flags({ breakCreateFlow: false, verificationRequired: true });
    await worker.publishProduct(product.id);
    listing = repo.getListingForProduct(product.id, 'mock')!;
    check('publish stops on a verification challenge', listing.status === 'FAILED');
    check('the agent flags that verification is needed', repo.getAgentState().needsVerification);
    check(
      'the message tells the user to complete it manually',
      /security check/i.test(repo.getAgentState().lastError || ''),
      repo.getAgentState().lastError || '',
    );
    check('still nothing published', (await (await fetch(`${MOCK}/mock/api/state`)).json()).listings.length === 0);

    console.log('\n-- retry after the UI is fixed --');
    await flags({ verificationRequired: false });
    await worker.publishProduct(product.id);
    listing = repo.getListingForProduct(product.id, 'mock')!;
    check('retry succeeds', listing.status === 'ACTIVE', listing.errorMessage || listing.status);
    check('the error is cleared', !listing.errorMessage);
    check('the listing URL is recorded', !!listing.externalUrl);
    check('attempts were counted', listing.attempts === 3, String(listing.attempts));
    check('the listing now exists on the marketplace', (await (await fetch(`${MOCK}/mock/api/state`)).json()).listings.length === 1);
    check('verification flag is cleared', !repo.getAgentState().needsVerification);
  } finally {
    await (worker as any).closeBrowser?.();
    server.close();
  }

  console.log(failures === 0 ? '\nFailure-recovery checks passed.\n' : `\n${failures} check(s) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
