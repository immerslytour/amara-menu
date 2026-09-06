import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY as string });
  }
  return client;
}

export function model(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
}

/** Plain text completion. Returns null if Claude is unavailable or errors. */
export async function completeText(args: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string | null> {
  if (!hasApiKey()) return null;
  try {
    const res = await anthropic().messages.create({
      model: model(),
      max_tokens: args.maxTokens ?? 1024,
      system: args.system,
      messages: [{ role: 'user', content: args.user }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return text || null;
  } catch (err) {
    console.error('[ai] Claude call failed:', (err as Error).message);
    return null;
  }
}

/** Completion that must return JSON. Returns null on any failure. */
export async function completeJson<T>(args: {
  system: string;
  user: string;
  maxTokens?: number;
  validate: (value: unknown) => T | null;
}): Promise<T | null> {
  const raw = await completeText({ system: args.system, user: args.user, maxTokens: args.maxTokens });
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return args.validate(JSON.parse(match[0]));
  } catch {
    return null;
  }
}
