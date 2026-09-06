import { completeJson } from './client';

export interface ListingDraft {
  title: string;
  description: string;
  source: 'claude' | 'fallback';
  warnings: string[];
}

export interface ListingGeneratorInput {
  title: string;
  description: string;
  askingPrice: number;
  pickupArea: string;
  availability: string;
  photoCount: number;
}

const MAX_TITLE = 90;

/**
 * Cleans up the seller's copy. Claude may only rephrase what the seller wrote -
 * it must not invent specs, condition claims or history.
 */
export async function generateListing(input: ListingGeneratorInput): Promise<ListingDraft> {
  const draft = await completeJson<{ title: string; description: string }>({
    system: `You write Facebook Marketplace listings for a private seller.

STRICT RULES:
- Use ONLY the facts the seller gave you. Never invent specifications, model
  numbers, storage sizes, accessories, condition, age, warranty or history.
- If a detail is not in the seller's text, leave it out entirely.
- No false or exaggerated claims. No "like new" unless the seller said so.
- Do not mention shipping. Do not include an exact street address.
- Title: max ${MAX_TITLE} characters, plain, searchable, no emoji, no ALL CAPS.
- Description: 2-5 short lines, buyer-friendly, plain language, no emoji spam.
  You may mention the pickup area and availability the seller provided.
- Do not include the price in the title.

Return JSON only: {"title": "...", "description": "..."}`,
    user: `Seller's title: ${input.title}
Seller's description: ${input.description || '(none provided)'}
Asking price: $${input.askingPrice}
Pickup area: ${input.pickupArea || '(not provided)'}
Availability: ${input.availability || '(not provided)'}
Photos provided: ${input.photoCount}`,
    maxTokens: 800,
    validate: (v) => {
      const o = v as any;
      const title = String(o?.title || '').trim();
      const description = String(o?.description || '').trim();
      if (!title || !description) return null;
      return { title, description };
    },
  });

  if (draft) {
    const warnings = checkForInvention(draft.description, input);
    return {
      title: draft.title.slice(0, MAX_TITLE),
      description: draft.description,
      source: 'claude',
      warnings,
    };
  }
  return { ...fallbackDraft(input), source: 'fallback', warnings: [] };
}

/** Used when Claude is unavailable - never invents anything. */
export function fallbackDraft(input: ListingGeneratorInput): { title: string; description: string } {
  const lines: string[] = [];
  if (input.description.trim()) lines.push(input.description.trim());
  if (input.pickupArea.trim()) lines.push(`Pickup in ${input.pickupArea.trim()}.`);
  if (input.availability.trim()) lines.push(`Available: ${input.availability.trim()}.`);
  lines.push('Message me if you have questions.');
  return { title: input.title.trim().slice(0, MAX_TITLE), description: lines.join('\n') };
}

/** Flags claims that do not appear in the seller's own text. */
function checkForInvention(description: string, input: ListingGeneratorInput): string[] {
  const source = `${input.title} ${input.description}`.toLowerCase();
  const risky = [
    'brand new', 'like new', 'never used', 'warranty', 'receipt', 'original box',
    'unopened', 'sealed', 'refurbished', 'mint condition', 'free shipping',
  ];
  const warnings: string[] = [];
  const lower = description.toLowerCase();
  for (const phrase of risky) {
    if (lower.includes(phrase) && !source.includes(phrase)) {
      warnings.push(`Generated copy claims "${phrase}" which you did not mention. Review before publishing.`);
    }
  }
  return warnings;
}
