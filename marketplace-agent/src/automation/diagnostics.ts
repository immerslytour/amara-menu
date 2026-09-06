import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { DEBUG_DIR } from '@/db';
import { AutomationError, type AutomationErrorCode } from './MarketplaceAdapter';

/**
 * On any unexpected UI: screenshot + HTML snapshot, then stop. Never guess.
 */
export async function captureFailure(
  page: Page | null,
  code: AutomationErrorCode,
  step: string,
  message: string,
): Promise<AutomationError> {
  const err = new AutomationError(code, step, message);
  if (!page) return err;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(DEBUG_DIR, `${stamp}_${step.replace(/[^a-z0-9]+/gi, '-')}`);
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  try {
    await page.screenshot({ path: `${base}.png`, fullPage: false, timeout: 5000 });
    err.screenshotPath = `${base}.png`;
  } catch {
    /* screenshot is best-effort */
  }
  try {
    fs.writeFileSync(`${base}.html`, await page.content());
    err.htmlPath = `${base}.html`;
  } catch {
    /* html snapshot is best-effort */
  }
  return err;
}

/** Short, bounded retry. No aggressive polling. */
export async function withRetry<T>(
  attempts: number,
  delayMs: number,
  fn: (attempt: number) => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, delayMs * i));
    }
  }
  throw lastErr;
}
