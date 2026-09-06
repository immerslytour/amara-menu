import { extractPrices } from './pricing';

export interface GuardContext {
  minimumPrice: number;
  askingPrice: number;
  /** Allowed to mention the general pickup area, never a street address. */
  pickupArea: string;
}

export interface GuardResult {
  ok: boolean;
  violations: string[];
}

const FORBIDDEN = [
  { re: /\b(venmo|cash ?app|zelle|paypal|bitcoin|btc|wire transfer|gift card)\b/i, why: 'payment details' },
  { re: /\bpassword\b/i, why: 'credentials' },
  // "1400 Rio Grande St" - a number followed by capitalised street words.
  { re: /\b\d{1,5}\s+(?:[A-Z][A-Za-z'-]*\s+){0,2}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Drive|Dr|Lane|Ln|Way|Ct|Court|Hwy|Highway)\b\.?/, why: 'a street address' },
  // Lower-cased variants, restricted to words that rarely show up in chatter.
  { re: /\b\d{1,5}\s+[\w'-]+(?:\s+[\w'-]+){0,2}\s+(?:street|avenue|boulevard|road|lane|court|highway)\b/i, why: 'a street address' },
  { re: /\b(?:apt|apartment|unit|suite|ste)\.?\s*#?\s*\d+/i, why: 'a unit number' },
  { re: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/, why: 'a phone number' },
  { re: /[\w.+-]+@[\w-]+\.[\w.]+/, why: 'an email address' },
  { re: /\b(ssn|social security)\b/i, why: 'personal identifiers' },
  { re: /\bi (can )?ship\b|\bshipping\b/i, why: 'shipping (this agent only handles local pickup)' },
];

/**
 * Last line of defence before anything is typed into the browser.
 * Anything that fails here is replaced by the deterministic template.
 */
export function guardReply(text: string, ctx: GuardContext): GuardResult {
  const violations: string[] = [];
  const trimmed = text.trim();

  if (!trimmed) violations.push('Reply is empty.');
  if (trimmed.length > 600) violations.push('Reply is too long.');

  for (const { re, why } of FORBIDDEN) {
    if (re.test(trimmed)) violations.push(`Reply mentions ${why}.`);
  }

  // Hard price floor: no quoted amount inside the item's price range may sit
  // below the seller's minimum.
  for (const price of extractPrices(trimmed)) {
    if (price < ctx.minimumPrice && price >= ctx.minimumPrice * 0.2 && price <= ctx.askingPrice * 3) {
      violations.push(`Reply quotes $${price}, below the $${ctx.minimumPrice} minimum.`);
    }
  }

  return { ok: violations.length === 0, violations };
}
