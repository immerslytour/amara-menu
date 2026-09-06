/**
 * Sends a buyer message into the fake Marketplace.
 *   npx tsx scripts/simulate-buyer.ts <listingId> "<buyer name>" "<message>"
 */
import { loadEnv } from '@/lib/env';

loadEnv();

async function main() {
  const [listingId, buyerName, text] = process.argv.slice(2);
  if (!listingId || !buyerName || !text) {
    console.error('usage: simulate-buyer.ts <listingId> "<buyer name>" "<message>"');
    process.exit(1);
  }
  const port = Number(process.env.MOCK_PORT || 4010);
  const res = await fetch(`http://localhost:${port}/mock/api/simulate/buyer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ listingId, buyerName, text }),
  });
  console.log(await res.json());
}

main();
