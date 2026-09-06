/**
 * Covers the two gaps that only show up on real Facebook:
 *  - inbox rows that do not carry the listing id, so the thread must be opened
 *    to work out which product the buyer is asking about
 *  - marking a listing sold on the marketplace itself, not just locally
 *
 *   npx tsx scripts/test-linking-and-sold.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '@/lib/env';

loadEnv();
process.env.MARKETPLACE_MODE = 'mock';
process.env.HEADLESS = '1';
process.env.MOCK_PORT = process.env.MOCK_PORT || '4014';

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function flags(body: Record<string, boolean>) {
  await fetch(`${MOCK}/mock/api/flags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function mockState() {
  return (await fetch(`${MOCK}/mock/api/state`)).json();
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data');
  for (const f of ['app.db', 'app.db-wal', 'app.db-shm', 'mock-marketplace.json']) {
    const full = path.join(dataDir, f);
    if (fs.existsSync(full)) fs.rmSync(full);
  }

  const server = await startMockServer(Number(process.env.MOCK_PORT));
  const worker = new AgentWorker('mock');

  // Two products whose titles are similar enough that title-matching alone
  // would be a coin flip.
  const mkProduct = (title: string, ask: number, min: number) => {
    const p = repo.createProduct({
      title,
      description: 'Good condition, cash on pickup.',
      photos: [],
      askingPrice: ask,
      minimumPrice: min,
      pickupArea: 'North Austin, TX',
      availability: 'today',
      category: 'Electronics',
      condition: 'Used - good',
    });
    repo.updateProduct(p.id, {
      generatedTitle: title,
      generatedDescription: 'Good condition, cash on pickup.',
      approvedAt: nowIso(),
    });
    return p;
  };

  const bike = mkProduct('Mountain Bike', 300, 250);
  const bikeTwo = mkProduct('Mountain Bike', 500, 450); // deliberately identical title

  try {
    console.log('\n-- publish both listings --');
    await worker.publishProduct(bike.id);
    await worker.publishProduct(bikeTwo.id);
    const listingOne = repo.getListingForProduct(bike.id, 'mock')!;
    const listingTwo = repo.getListingForProduct(bikeTwo.id, 'mock')!;
    check('both listings published', listingOne.status === 'ACTIVE' && listingTwo.status === 'ACTIVE');
    check('they have different marketplace ids', listingOne.externalId !== listingTwo.externalId);

    console.log('\n-- inbox that hides the listing id (like Facebook) --');
    await flags({ hideInboxListingId: true });
    await fetch(`${MOCK}/mock/api/simulate/buyer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ listingId: listingTwo.externalId, buyerName: 'Ana', text: 'Is this still available?' }),
    });

    await worker.checkMessages();
    await sleep(500);

    const convo = repo.listConversations().find((c) => c.buyerName === 'Ana');
    check('conversation was created', !!convo);
    check(
      'thread linked to the RIGHT product despite identical titles',
      convo?.productId === bikeTwo.id,
      `linked to ${convo?.productId} (expected ${bikeTwo.id} / not ${bike.id})`,
    );

    const messages = repo.listMessages(convo!.id);
    check('AI replied using the right product price', messages.some((m) => m.sender === 'AGENT' && m.text.includes('500')), JSON.stringify(messages.map((m) => m.text)));

    console.log('\n-- repeated sync does not duplicate messages --');
    const before = repo.listMessages(convo!.id).length;
    await worker.checkMessages();
    await worker.checkMessages();
    const after = repo.listMessages(convo!.id).length;
    check('message count is unchanged after two more syncs', after === before, `${before} -> ${after}`);

    console.log('\n-- mark sold on the marketplace --');
    check('listing is live before selling', (await mockState()).listings.find((l: any) => l.id === listingTwo.externalId).sold === false);
    await worker.markListingSold(bikeTwo.id);
    const sold = (await mockState()).listings.find((l: any) => l.id === listingTwo.externalId);
    check('the marketplace listing is now sold', sold.sold === true);
    check('the other listing is untouched', (await mockState()).listings.find((l: any) => l.id === listingOne.externalId).sold === false);
    check('local listing status is SOLD', repo.getListingForProduct(bikeTwo.id, 'mock')!.status === 'SOLD');
    check('the event log records it', repo.listEvents(20).some((e) => e.type === 'LISTING_MARKED_SOLD'));

    console.log('\n-- marking sold twice is safe --');
    await worker.markListingSold(bikeTwo.id);
    check('second attempt still reports sold', repo.getListingForProduct(bikeTwo.id, 'mock')!.status === 'SOLD');
    check('no error was recorded', !repo.listEvents(5).some((e) => e.type === 'SOLD_FAILED'));
  } finally {
    await (worker as any).closeBrowser?.();
    server.close();
  }

  console.log(failures === 0 ? '\nLinking + mark-sold checks passed.\n' : `\n${failures} check(s) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
