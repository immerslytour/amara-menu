/**
 * The ONLY surface the AI layer is allowed to act through.
 * Claude never touches Playwright: it receives structured data from these
 * functions and asks the application to act. Every mutating tool re-checks the
 * business rules itself.
 */
import * as repo from '@/db/repo';
import type { Conversation, ConversationStatus, Message, Product } from '@/lib/types';
import { guardReply } from './safety';

export interface NegotiationRulesView {
  askingPrice: number;
  minimumPrice: number;
  pickupArea: string;
  availability: string;
  neverBelowMinimum: true;
  neverShareExactAddress: true;
}

export interface ToolContext {
  conversationId: string;
  /** Injected by the worker; wraps the marketplace adapter. */
  deliver: (text: string) => Promise<{ ok: boolean; verified: boolean; error?: string }>;
}

export function getConversation(conversationId: string): Conversation | null {
  return repo.getConversation(conversationId);
}

export function getProduct(conversationId: string): Product | null {
  const convo = repo.getConversation(conversationId);
  if (!convo?.productId) return null;
  return repo.getProduct(convo.productId);
}

export function getConversationHistory(conversationId: string): Message[] {
  return repo.listMessages(conversationId);
}

export function getNegotiationRules(conversationId: string): NegotiationRulesView | null {
  const product = getProduct(conversationId);
  if (!product) return null;
  return {
    askingPrice: product.askingPrice,
    minimumPrice: product.minimumPrice,
    pickupArea: product.pickupArea,
    availability: product.availability,
    neverBelowMinimum: true,
    neverShareExactAddress: true,
  };
}

export function classifyLead(
  conversationId: string,
  input: { score: number; status: ConversationStatus; reason: string },
): void {
  const score = Math.max(0, Math.min(100, Math.round(input.score)));
  repo.upsertLead({ conversationId, score, status: input.status, reason: input.reason });
  repo.updateConversation(conversationId, { leadScore: score, status: input.status });
  repo.logEvent({
    type: 'LEAD_CLASSIFIED',
    conversationId,
    message: `AI classified buyer as ${input.status} (score ${score}).`,
    meta: { reason: input.reason },
  });
}

/**
 * Sends a reply through the browser. Refuses anything that breaks the price
 * floor or the privacy rules, even if the model asked for it.
 */
export async function sendMessage(
  ctx: ToolContext,
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  const product = getProduct(ctx.conversationId);
  if (!product) return { ok: false, reason: 'No product is linked to this conversation.' };

  const guard = guardReply(text, {
    minimumPrice: product.minimumPrice,
    askingPrice: product.askingPrice,
    pickupArea: product.pickupArea,
  });
  if (!guard.ok) {
    repo.logEvent({
      type: 'REPLY_BLOCKED',
      level: 'warn',
      conversationId: ctx.conversationId,
      productId: product.id,
      message: `Blocked an unsafe draft reply: ${guard.violations.join(' ')}`,
      meta: { draft: text },
    });
    return { ok: false, reason: guard.violations.join(' ') };
  }

  const delivered = await ctx.deliver(text);
  if (!delivered.ok || !delivered.verified) {
    repo.logEvent({
      type: 'REPLY_FAILED',
      level: 'error',
      conversationId: ctx.conversationId,
      productId: product.id,
      message: `Could not verify the reply was sent: ${delivered.error || 'not found in thread after sending'}`,
    });
    return { ok: false, reason: delivered.error || 'Send could not be verified in the browser.' };
  }

  repo.addMessage({ conversationId: ctx.conversationId, sender: 'AGENT', text });
  repo.logEvent({
    type: 'AI_REPLIED',
    conversationId: ctx.conversationId,
    productId: product.id,
    message: 'AI replied.',
    meta: { text },
  });
  return { ok: true };
}

/** Stops AI replies on this thread and flags it for the human. */
export function handoffToHuman(
  conversationId: string,
  input: { reason: string; agreedPrice: number | null },
): void {
  repo.updateConversation(conversationId, {
    status: 'HOT_LEAD',
    aiEnabled: false,
    humanTakeover: true,
    agreedPrice: input.agreedPrice ?? undefined,
  });
  const convo = repo.getConversation(conversationId);
  repo.logEvent({
    type: 'HUMAN_TAKEOVER_REQUIRED',
    level: 'warn',
    conversationId,
    productId: convo?.productId ?? null,
    message: 'Human takeover required.',
    meta: { reason: input.reason, agreedPrice: input.agreedPrice },
  });
}
