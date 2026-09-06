/**
 * Decides what to say to a buyer and asks the application to say it.
 *
 * Control flow (availability, price floor, handoff) is deterministic code.
 * Claude is used for wording and for refining the lead score, and everything
 * it produces passes through the safety guard before it reaches the browser.
 */
import * as repo from '@/db/repo';
import type { Conversation, Message, Product } from '@/lib/types';
import { completeText } from './client';
import { classifyLead as classifyLeadWithClaude } from './leadClassifier';
import { negotiate } from './negotiationAgent';
import { guardReply } from './safety';
import * as tools from './tools';

export interface MessageAgentResult {
  handled: boolean;
  skipped?: string;
  status?: string;
  leadScore?: number;
  replySent?: string;
  handoff?: boolean;
  error?: string;
}

function transcript(messages: Message[], buyerName: string): string {
  return messages
    .map((m) => `${m.sender === 'BUYER' ? buyerName : 'Seller'}: ${m.text}`)
    .join('\n');
}

export async function runMessageAgent(args: {
  conversationId: string;
  deliver: (text: string) => Promise<{ ok: boolean; verified: boolean; error?: string }>;
}): Promise<MessageAgentResult> {
  const convo = tools.getConversation(args.conversationId);
  if (!convo) return { handled: false, error: 'Conversation not found.' };

  const product = tools.getProduct(args.conversationId);
  if (!product) {
    return { handled: false, skipped: 'No product linked to this conversation yet.' };
  }

  const history = tools.getConversationHistory(args.conversationId);
  const buyerMessages = history.filter((m) => m.sender === 'BUYER').map((m) => m.text);
  const lastMessage = history[history.length - 1];

  if (!buyerMessages.length) return { handled: false, skipped: 'No buyer messages yet.' };

  // Classify first: the dashboard should reflect intent even when AI replies are off.
  const classification = await classifyLeadWithClaude({
    productTitle: product.title,
    askingPrice: product.askingPrice,
    minimumPrice: product.minimumPrice,
    agreedPrice: convo.agreedPrice,
    buyerMessages,
    transcript: transcript(history, convo.buyerName),
  });
  tools.classifyLead(args.conversationId, classification);

  if (!product.aiEnabled) return { handled: false, skipped: 'AI is off for this product.', status: classification.status };
  if (!convo.aiEnabled) return { handled: false, skipped: 'AI is off for this conversation.', status: classification.status };
  if (convo.humanTakeover) return { handled: false, skipped: 'Human has taken over this conversation.', status: classification.status };
  if (classification.status === 'SPAM') {
    repo.logEvent({
      type: 'SPAM_IGNORED',
      conversationId: convo.id,
      productId: product.id,
      message: 'Conversation classified as spam; no reply sent.',
    });
    return { handled: false, skipped: 'Conversation looks like spam.', status: 'SPAM' };
  }
  if (!lastMessage || lastMessage.sender !== 'BUYER') {
    return { handled: false, skipped: 'Waiting for the buyer to reply.', status: classification.status };
  }

  // --- price rules (deterministic) -------------------------------------
  const outcome = negotiate({
    askingPrice: product.askingPrice,
    minimumPrice: product.minimumPrice,
    availability: product.availability,
    pickupArea: product.pickupArea,
    agentMessages: history.filter((m) => m.sender !== 'BUYER').map((m) => m.text),
    latestBuyerMessage: lastMessage.text,
  });

  const readyToClose =
    classification.status === 'HOT_LEAD' || outcome.decision.kind === 'ACCEPT';
  const agreedPrice =
    outcome.agreedPrice ?? (readyToClose ? (convo.agreedPrice ?? null) : null);

  /**
   * Hand off BEFORE composing the reply, not after.
   *
   * Writing the message takes a couple of seconds; doing the handoff afterwards
   * left a window where the dashboard already showed HOT_LEAD while the agreed
   * price was still missing and the AI still looked switched on. If the send
   * then fails, having already handed off is the safe failure: the human takes
   * over rather than the agent carrying on alone.
   */
  if (readyToClose) {
    tools.handoffToHuman(convo.id, { reason: classification.reason, agreedPrice });
  }

  // --- wording -----------------------------------------------------------
  const reply = await draftReply({
    product,
    convo,
    history,
    outcome,
    readyToClose,
    classificationReason: classification.reason,
  });

  const sent = await tools.sendMessage({ conversationId: convo.id, deliver: args.deliver }, reply);
  if (!sent.ok) {
    // Guard rejected Claude's wording -> retry once with the deterministic text.
    const safe = readyToClose ? handoffLine(outcome.fallbackReply) : outcome.fallbackReply;
    if (safe !== reply) {
      const retry = await tools.sendMessage({ conversationId: convo.id, deliver: args.deliver }, safe);
      if (retry.ok) {
        return finish({ convo, product, classification, readyToClose, agreedPrice, reply: safe });
      }
      return { handled: false, error: retry.reason, status: classification.status };
    }
    return { handled: false, error: sent.reason, status: classification.status };
  }

  return finish({ convo, product, classification, readyToClose, agreedPrice, reply });
}

function finish(args: {
  convo: Conversation;
  product: Product;
  classification: { score: number; status: string; reason: string };
  readyToClose: boolean;
  agreedPrice: number | null;
  reply: string;
}): MessageAgentResult {
  if (args.readyToClose) {
    return {
      handled: true,
      status: 'HOT_LEAD',
      leadScore: Math.max(args.classification.score, 85),
      replySent: args.reply,
      handoff: true,
    };
  }
  return {
    handled: true,
    status: args.classification.status,
    leadScore: args.classification.score,
    replySent: args.reply,
    handoff: false,
  };
}

/** Any promise that a human will settle the pickup, however Claude worded it. */
const PICKUP_HANDOFF_PROMISE =
  /(confirm|sort out|arrange|work out|send)[^.!?]*\b(pickup|pick-up|meet|meeting|details|spot|location)\b|\bseller will\b/i;

function handoffLine(base: string): string {
  return PICKUP_HANDOFF_PROMISE.test(base)
    ? base
    : `${base} I'll have the seller confirm the pickup details with you.`;
}

async function draftReply(args: {
  product: Product;
  convo: Conversation;
  history: Message[];
  outcome: ReturnType<typeof negotiate>;
  readyToClose: boolean;
  classificationReason: string;
}): Promise<string> {
  const { product, outcome } = args;
  const deterministic = args.readyToClose ? handoffLine(outcome.fallbackReply) : outcome.fallbackReply;

  const priceInstruction = (() => {
    switch (outcome.decision.kind) {
      case 'ACCEPT':
        return `The buyer's price of $${outcome.decision.price} is acceptable. Accept it clearly, then say you'll have the seller confirm the pickup details. Do NOT give an exact address.`;
      case 'COUNTER':
        return `Do NOT accept the buyer's offer. Counter at exactly $${outcome.decision.price}, ideally conditioned on a prompt pickup. Do NOT repeat the buyer's number anywhere in your reply. The only dollar figure in your reply must be $${outcome.decision.price}.`;
      case 'HOLD_PRICE':
        return `Hold firm at exactly $${outcome.decision.price}. Never name any price below $${outcome.decision.price}.`;
      default:
        return `The buyer did not make an offer. The price is $${product.askingPrice}. Never name any price below $${product.minimumPrice}.`;
    }
  })();

  const text = await completeText({
    system: `You are a polite, brief marketplace seller's assistant replying to a buyer.

You may ONLY use these facts:
${outcome.allowedFacts.map((f) => `- ${f}`).join('\n')}
- Item title: ${product.title}
- Item description as listed: ${product.description}

HARD RULES:
- Never invent specifications, condition, age, accessories, or history that are not in the facts above.
- Never state or imply a price below $${product.minimumPrice}.
- Never give an exact street address. The general pickup area is fine.
- Never mention shipping, payment apps, phone numbers or email addresses.
- Never claim the item is reserved or sold unless told so.
- 1-2 short sentences. Friendly, plain, no emoji, no sign-off.

${priceInstruction}

Reply with the message text only.`,
    user: `Conversation so far:
${transcript(args.history, args.convo.buyerName)}

Write the seller's next message.`,
    maxTokens: 300,
  });

  if (!text) return deterministic;

  const cleaned = text.replace(/^["']|["']$/g, '').trim();
  const guard = guardReply(cleaned, {
    minimumPrice: product.minimumPrice,
    askingPrice: product.askingPrice,
    pickupArea: product.pickupArea,
  });
  if (!guard.ok) {
    repo.logEvent({
      type: 'REPLY_BLOCKED',
      level: 'warn',
      conversationId: args.convo.id,
      productId: product.id,
      message: `Claude's draft failed the safety guard, using the safe template instead: ${guard.violations.join(' ')}`,
      meta: { draft: cleaned },
    });
    return deterministic;
  }
  // On handoff the promise to hand over must always be present.
  return args.readyToClose ? handoffLine(cleaned) : cleaned;
}
