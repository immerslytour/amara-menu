/**
 * Price parsing + the deterministic negotiation policy.
 *
 * Deliberately NOT delegated to the model: the minimum-price floor is a hard
 * business rule, so it is computed in code. Claude only phrases the result,
 * and the phrasing is re-checked against these numbers before it is sent.
 */

const OFFER_HINTS =
  /(take|accept|offer|pay|give you|do it for|how about|what about|would you|lowest|best price|deal|for)/i;

/** Money amounts explicitly written by the buyer. */
export function extractPrices(text: string): number[] {
  const out: number[] = [];
  const dollar = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  for (const m of text.matchAll(dollar)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  if (!out.length && OFFER_HINTS.test(text)) {
    // "would you take 350", "I can do 400 cash"
    const bare = /(?:^|[^\w.$])(\d{2,6})(?:\s*(?:bucks|dollars|cash))?(?![\w.%])/g;
    for (const m of text.matchAll(bare)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 20 && n <= 1_000_000) out.push(n);
    }
  }
  return out;
}

/** The buyer's offer = the lowest price they named in the message. */
export function extractBuyerOffer(text: string): number | null {
  const prices = extractPrices(text);
  if (!prices.length) return null;
  return Math.min(...prices);
}

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

export type NegotiationDecision =
  | { kind: 'ACCEPT'; price: number; reason: string }
  | { kind: 'COUNTER'; price: number; buyerOffer: number; reason: string }
  | { kind: 'HOLD_PRICE'; price: number; reason: string }
  | { kind: 'NONE'; reason: string };

export interface NegotiationRules {
  askingPrice: number;
  minimumPrice: number;
  /** Lowest price the agent has already quoted in this thread, if any. */
  currentAnchor: number;
}

/**
 * Never returns a price below minimumPrice. Concedes roughly halfway toward the
 * floor each round, then holds at the floor.
 */
export function decideNegotiation(
  rules: NegotiationRules,
  buyerOffer: number | null,
): NegotiationDecision {
  const { minimumPrice } = rules;
  const anchor = Math.max(minimumPrice, Math.min(rules.currentAnchor, rules.askingPrice));

  if (buyerOffer === null) {
    return { kind: 'NONE', reason: 'Buyer did not name a price.' };
  }
  if (buyerOffer >= minimumPrice) {
    const price = Math.min(buyerOffer, rules.askingPrice);
    return { kind: 'ACCEPT', price, reason: `Offer $${buyerOffer} is at or above the $${minimumPrice} floor.` };
  }
  // Below the floor: concede halfway from the current anchor toward the floor.
  const next = roundTo5(minimumPrice + (anchor - minimumPrice) / 2);
  const counter = Math.max(minimumPrice, Math.min(next, anchor));
  if (counter <= minimumPrice || anchor - minimumPrice <= 5) {
    return {
      kind: 'HOLD_PRICE',
      price: minimumPrice,
      reason: `Offer $${buyerOffer} is below the $${minimumPrice} floor; holding at the floor.`,
    };
  }
  return {
    kind: 'COUNTER',
    price: counter,
    buyerOffer,
    reason: `Offer $${buyerOffer} is below the $${minimumPrice} floor; countering at $${counter}.`,
  };
}

/** Lowest price the seller side has quoted so far (the current anchor). */
export function anchorFromHistory(
  askingPrice: number,
  agentMessages: string[],
  minimumPrice: number,
): number {
  let anchor = askingPrice;
  for (const text of agentMessages) {
    for (const p of extractPrices(text)) {
      if (p >= minimumPrice && p <= askingPrice && p < anchor) anchor = p;
    }
  }
  return anchor;
}
