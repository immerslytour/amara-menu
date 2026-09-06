import {
  anchorFromHistory,
  decideNegotiation,
  extractBuyerOffer,
  type NegotiationDecision,
} from './pricing';

export interface NegotiationContext {
  askingPrice: number;
  minimumPrice: number;
  availability: string;
  pickupArea: string;
  /** Everything the seller side has already said, oldest first. */
  agentMessages: string[];
  latestBuyerMessage: string;
}

export interface NegotiationOutcome {
  decision: NegotiationDecision;
  /** Price the buyer and agent have settled on, if any. */
  agreedPrice: number | null;
  /** Deterministic wording, used directly when Claude is off or fails the guard. */
  fallbackReply: string;
  /** Facts Claude is allowed to use when rephrasing. */
  allowedFacts: string[];
}

/**
 * Applies the seller's price rules to the buyer's latest message.
 * The minimum price is enforced here, in code - not by the model.
 */
export function negotiate(ctx: NegotiationContext): NegotiationOutcome {
  const buyerOffer = extractBuyerOffer(ctx.latestBuyerMessage);
  const currentAnchor = anchorFromHistory(ctx.askingPrice, ctx.agentMessages, ctx.minimumPrice);
  const decision = decideNegotiation(
    { askingPrice: ctx.askingPrice, minimumPrice: ctx.minimumPrice, currentAnchor },
    buyerOffer,
  );

  const pickupPhrase = ctx.availability.trim()
    ? `if you can pick it up ${ctx.availability.trim()}`
    : 'if you can pick it up today';

  let fallbackReply: string;
  let agreedPrice: number | null = null;

  switch (decision.kind) {
    case 'ACCEPT':
      agreedPrice = decision.price;
      fallbackReply = `$${decision.price} works ${pickupPhrase}. I'll have the seller confirm the pickup details with you.`;
      break;
    case 'COUNTER':
      // Deliberately does not repeat the buyer's number: quoting a
      // below-minimum figure back at them is exactly what the guard blocks.
      fallbackReply = `I can't go that low, but I can do $${decision.price} ${pickupPhrase}.`;
      break;
    case 'HOLD_PRICE':
      fallbackReply = `$${decision.price} is the lowest I can go. It's yours at $${decision.price} ${pickupPhrase}.`;
      break;
    default:
      fallbackReply = `It's $${ctx.askingPrice}. Let me know if you'd like to arrange a pickup.`;
  }

  const allowedFacts = [
    `Asking price: $${ctx.askingPrice}`,
    ctx.pickupArea ? `Pickup area (general, never an exact address): ${ctx.pickupArea}` : '',
    ctx.availability ? `Availability: ${ctx.availability}` : '',
  ].filter(Boolean);

  return { decision, agreedPrice, fallbackReply, allowedFacts };
}
