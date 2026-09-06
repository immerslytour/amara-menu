/**
 * Unit checks for the safety-critical rules: price floor, guard, lead bands.
 *   npx tsx scripts/test-rules.ts
 */
import { anchorFromHistory, decideNegotiation, extractBuyerOffer } from '@/ai/pricing';
import { negotiate } from '@/ai/negotiationAgent';
import { guardReply } from '@/ai/safety';
import { heuristicClassify, statusForScore } from '@/ai/leadClassifier';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name} ${detail}`);
  }
}

console.log('\n-- price parsing --');
check('parses "$350"', extractBuyerOffer('Would you take $350?') === 350);
check('parses "350" with offer hint', extractBuyerOffer('would you take 350') === 350);
check('takes the lowest named price', extractBuyerOffer('I have $300 or $350 cash') === 300);
check('ignores prices in plain chatter', extractBuyerOffer('Is the PS5 still available?') === null);
check('no false positive on model names', extractBuyerOffer('Is this the PS5 slim?') === null);

console.log('\n-- negotiation ladder (ask 450 / min 400) --');
const rules = { askingPrice: 450, minimumPrice: 400, currentAnchor: 450 };
const d1 = decideNegotiation(rules, 350);
check('counters $350 at $425', d1.kind === 'COUNTER' && d1.price === 425, JSON.stringify(d1));
const d2 = decideNegotiation({ ...rules, currentAnchor: 425 }, 400);
check('accepts $400 (== minimum)', d2.kind === 'ACCEPT' && d2.price === 400, JSON.stringify(d2));
const d3 = decideNegotiation({ ...rules, currentAnchor: 425 }, 380);
check('counters $380 at $415 (halfway to the floor)', d3.kind === 'COUNTER' && d3.price === 415, JSON.stringify(d3));
const d4 = decideNegotiation({ ...rules, currentAnchor: 405 }, 300);
check('holds at the floor when close to it', d4.kind === 'HOLD_PRICE' && d4.price === 400, JSON.stringify(d4));
check('accepts above asking as asking', decideNegotiation(rules, 500).kind === 'ACCEPT');

console.log('\n-- the floor can never be crossed --');
for (let offer = 1; offer < 400; offer++) {
  const d = decideNegotiation(rules, offer);
  if (d.kind !== 'NONE' && 'price' in d && d.price < 400) {
    failures++;
    console.log(`FAIL  offer $${offer} produced $${d.price}`);
  }
}
for (let anchor = 400; anchor <= 450; anchor += 5) {
  for (let offer = 1; offer < 400; offer++) {
    const d = decideNegotiation({ ...rules, currentAnchor: anchor }, offer);
    if ('price' in d && d.price < 400) {
      failures++;
      console.log(`FAIL  anchor $${anchor} offer $${offer} produced $${d.price}`);
    }
  }
}
check('no combination of offers/anchors ever goes below the minimum', true);

console.log('\n-- anchor tracking --');
check(
  'anchor follows the lowest price the agent quoted',
  anchorFromHistory(450, ["I can do $425 if you can pick it up today."], 400) === 425,
);

console.log('\n-- negotiation replies --');
const counter = negotiate({
  askingPrice: 450, minimumPrice: 400, availability: 'today', pickupArea: 'North Austin',
  agentMessages: [], latestBuyerMessage: 'Would you take $350?',
});
check('counter reply names $425', counter.fallbackReply.includes('$425'), counter.fallbackReply);
check('counter reply refuses $350', !/\$350\b(?!,)/.test(counter.fallbackReply.replace("can't do $350", '')) || counter.fallbackReply.includes("can't do $350"));
const accept = negotiate({
  askingPrice: 450, minimumPrice: 400, availability: 'today', pickupArea: 'North Austin',
  agentMessages: ["I can do $425 if you can pick it up today."], latestBuyerMessage: '$400?',
});
check('accept reply names $400', accept.fallbackReply.includes('$400'), accept.fallbackReply);
check('accept reply defers pickup details to the human', accept.fallbackReply.includes('confirm the pickup details'));
check('accept records the agreed price', accept.agreedPrice === 400);

console.log('\n-- safety guard --');
const ctx = { minimumPrice: 400, askingPrice: 450, pickupArea: 'North Austin' };
check('blocks a below-minimum quote', !guardReply('I can do $380 for you.', ctx).ok);
check('allows an at-minimum quote', guardReply('$400 works if you can pick it up today.', ctx).ok);
check('blocks a street address', !guardReply('Come to 1400 Rio Grande St.', ctx).ok);
check('blocks a lower-case street address', !guardReply('meet me at 1400 rio grande street', ctx).ok);
check('blocks an apartment number', !guardReply('Come by, apt 2.', ctx).ok);
check('does not block ordinary chatter with numbers', guardReply('$450 and I can be around after 6 today.', ctx).ok);
check('does not block "I can drive" chatter', guardReply('$450 works, I can drive it over.', ctx).ok);
check('blocks payment apps', !guardReply('Send it on Cash App and I will hold it.', ctx).ok);
check('blocks phone numbers', !guardReply('Text me at 512-555-1234.', ctx).ok);
check('blocks shipping offers', !guardReply('I can ship it to you tomorrow.', ctx).ok);
check('allows the general pickup area', guardReply('Pickup is in North Austin, $450.', ctx).ok);

console.log('\n-- lead scoring --');
check('band 0-30 is LOW_INTENT', statusForScore(20) === 'LOW_INTENT');
check('band 31-60 is INTERESTED', statusForScore(45) === 'INTERESTED');
check('band 61-80 is NEGOTIATING', statusForScore(70) === 'NEGOTIATING');
check('band 81-100 is HOT_LEAD', statusForScore(90) === 'HOT_LEAD');

const cases: Array<[string, string]> = [
  ["I'll take it.", 'HOT_LEAD'],
  ['Can I pick it up tonight?', 'HOT_LEAD'],
  ['Where can I meet you?', 'HOT_LEAD'],
  ['I can pay $400.', 'HOT_LEAD'],
  ['Is it still available? I want it.', 'HOT_LEAD'],
  ['Would you take $300?', 'NEGOTIATING'],
  ['Does it come with a controller?', 'QUESTION'],
  ['hey', 'LOW_INTENT'],
  ['My shipping agent will pick it up, send your Zelle', 'SPAM'],
];
for (const [msg, expected] of cases) {
  const got = heuristicClassify({ buyerMessages: [msg], minimumPrice: 400, agreedPrice: null });
  check(`"${msg}" -> ${expected}`, got.status === expected, `got ${got.status} (${got.score})`);
}

console.log(failures === 0 ? '\nAll rule checks passed.\n' : `\n${failures} check(s) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
