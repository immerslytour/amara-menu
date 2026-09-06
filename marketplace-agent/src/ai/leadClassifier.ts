import type { ConversationStatus } from '@/lib/types';
import { completeJson } from './client';
import { extractBuyerOffer } from './pricing';

export interface LeadClassification {
  score: number;
  status: ConversationStatus;
  reason: string;
  source: 'claude' | 'heuristic';
}

const READY_TO_BUY = [
  /\bi'?ll take it\b/i,
  /\bi want (it|this)\b/i,
  /\bcan i (pick|come|grab|get) (it )?(up|by)?\b/i,
  /\bpick (it )?up (today|tonight|tomorrow|now|this)/i,
  /\bwhere (can|do) (i|we) meet\b/i,
  /\bwhat'?s? (the )?address\b/i,
  /\bwhen can i (come|pick)/i,
  /\bi'?ll be there\b/i,
  /\bdeal\b/i,
  /\bsold\b/i,
];

const SPAM = [
  /\bcash ?app\b/i,
  /\bzelle\b/i,
  /\bgift card\b/i,
  /\bwestern union\b/i,
  /\bshipping (agent|company)\b/i,
  /\bmy (agent|courier) will (pick|collect)/i,
  /\bhttps?:\/\//i,
  /\bverif(y|ication) code\b/i,
  /\bwire transfer\b/i,
];

const QUESTION_WORDS = /\b(does|do|is|are|can|could|would|what|when|where|how|why|any|still)\b/i;

const LOW_INTENT = [/^\s*(hi|hey|hello|yo|ok|okay|k|thanks|thx|nice|cool)\s*[.!?]*\s*$/i];

export function statusForScore(score: number): ConversationStatus {
  if (score <= 30) return 'LOW_INTENT';
  if (score <= 60) return 'INTERESTED';
  if (score <= 80) return 'NEGOTIATING';
  return 'HOT_LEAD';
}

export function heuristicClassify(input: {
  buyerMessages: string[];
  minimumPrice: number;
  agreedPrice: number | null;
}): LeadClassification {
  const last = input.buyerMessages[input.buyerMessages.length - 1] || '';
  const all = input.buyerMessages.join('\n');

  if (SPAM.some((r) => r.test(all))) {
    return { score: 0, status: 'SPAM', reason: 'Message contains common marketplace scam patterns.', source: 'heuristic' };
  }
  if (!input.buyerMessages.length) {
    return { score: 0, status: 'NEW', reason: 'No buyer messages yet.', source: 'heuristic' };
  }
  if (input.agreedPrice !== null && input.agreedPrice >= input.minimumPrice) {
    return {
      score: 92,
      status: 'HOT_LEAD',
      reason: `Buyer agreed to $${input.agreedPrice}, at or above the minimum.`,
      source: 'heuristic',
    };
  }

  const readyToBuy = READY_TO_BUY.some((r) => r.test(last));
  const offer = extractBuyerOffer(last);
  const acceptableOffer = offer !== null && offer >= input.minimumPrice;

  if (readyToBuy && acceptableOffer) {
    return { score: 95, status: 'HOT_LEAD', reason: 'Buyer named an acceptable price and is ready to collect.', source: 'heuristic' };
  }
  if (acceptableOffer) {
    return { score: 85, status: 'HOT_LEAD', reason: `Buyer offered $${offer}, at or above the minimum.`, source: 'heuristic' };
  }
  if (readyToBuy) {
    return { score: 85, status: 'HOT_LEAD', reason: 'Buyer signalled they are ready to buy or collect.', source: 'heuristic' };
  }
  if (offer !== null) {
    return { score: 70, status: 'NEGOTIATING', reason: `Buyer offered $${offer}, below the minimum.`, source: 'heuristic' };
  }
  if (LOW_INTENT.some((r) => r.test(last))) {
    return { score: 20, status: 'LOW_INTENT', reason: 'Greeting only, no buying signal.', source: 'heuristic' };
  }
  if (/still available/i.test(last)) {
    return { score: 50, status: 'INTERESTED', reason: 'Buyer asked whether the item is available.', source: 'heuristic' };
  }
  if (last.includes('?') || QUESTION_WORDS.test(last)) {
    return { score: 45, status: 'QUESTION', reason: 'Buyer asked a question about the item.', source: 'heuristic' };
  }
  return { score: 35, status: 'INTERESTED', reason: 'Buyer engaged with the listing.', source: 'heuristic' };
}

/**
 * Claude refines the score/reason; the hard rules (spam floor, agreed-price ->
 * HOT_LEAD) are still enforced in code afterwards.
 */
export async function classifyLead(input: {
  productTitle: string;
  askingPrice: number;
  minimumPrice: number;
  agreedPrice: number | null;
  buyerMessages: string[];
  transcript: string;
}): Promise<LeadClassification> {
  const heuristic = heuristicClassify({
    buyerMessages: input.buyerMessages,
    minimumPrice: input.minimumPrice,
    agreedPrice: input.agreedPrice,
  });
  if (heuristic.status === 'SPAM' || heuristic.status === 'NEW') return heuristic;

  const fromClaude = await completeJson<{ score: number; status: ConversationStatus; reason: string }>({
    system: `You classify buyer intent for a marketplace seller.
Return JSON only: {"score": <0-100 integer>, "status": <one of NEW,QUESTION,INTERESTED,NEGOTIATING,HOT_LEAD,LOW_INTENT,SPAM,SOLD,CLOSED>, "reason": "<one short sentence>"}.
Scoring bands: 0-30 LOW_INTENT, 31-60 INTERESTED (use QUESTION if the buyer is mainly asking a question), 61-80 NEGOTIATING, 81-100 HOT_LEAD.
HOT_LEAD means the buyer appears ready to purchase now: they said they will take it, asked to pick it up, asked where to meet, or named a price the seller can accept.
Judge only from the conversation. Do not invent facts.`,
    user: `Item: ${input.productTitle}
Asking price: $${input.askingPrice}
Seller's minimum acceptable price (private): $${input.minimumPrice}
Price agreed so far: ${input.agreedPrice === null ? 'none' : `$${input.agreedPrice}`}

Conversation:
${input.transcript}`,
    maxTokens: 300,
    validate: (v) => {
      const o = v as any;
      const score = Number(o?.score);
      const valid: ConversationStatus[] = [
        'NEW', 'QUESTION', 'INTERESTED', 'NEGOTIATING', 'HOT_LEAD', 'LOW_INTENT', 'SPAM', 'SOLD', 'CLOSED',
      ];
      if (!Number.isFinite(score) || score < 0 || score > 100) return null;
      if (!valid.includes(o?.status)) return null;
      return { score: Math.round(score), status: o.status as ConversationStatus, reason: String(o?.reason || '') };
    },
  });

  if (!fromClaude) return heuristic;

  // Hard rules win over the model.
  const agreedOk = input.agreedPrice !== null && input.agreedPrice >= input.minimumPrice;
  if (agreedOk) {
    return { score: Math.max(fromClaude.score, 90), status: 'HOT_LEAD', reason: fromClaude.reason || heuristic.reason, source: 'claude' };
  }
  if (heuristic.status === 'HOT_LEAD' && fromClaude.status !== 'HOT_LEAD') {
    // Never downgrade a clear ready-to-buy signal.
    return heuristic;
  }
  return { score: fromClaude.score, status: fromClaude.status, reason: fromClaude.reason, source: 'claude' };
}
