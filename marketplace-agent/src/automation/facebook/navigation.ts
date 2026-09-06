import type { Page } from 'playwright';
import { URLS } from './selectors';
import { captureFailure } from '../diagnostics';
import { checkReady } from './verification';
import { AutomationError } from '../MarketplaceAdapter';

/** Navigation + the ready-check that must pass before any automated action. */

export async function goto(page: Page, url: string, step: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (err) {
    throw await captureFailure(page, 'NAVIGATION_FAILED', step, `Could not open ${url}: ${(err as Error).message}`);
  }
  // Facebook renders progressively; give the shell a moment to settle.
  await page.waitForTimeout(1500);
}

/** Navigate, then stop with a clear error if login/verification is needed. */
export async function gotoReady(page: Page, url: string, step: string): Promise<void> {
  await goto(page, url, step);
  const ready = await checkReady(page);
  if (!ready.ready) {
    const code = ready.reason === 'VERIFICATION_REQUIRED' ? 'VERIFICATION_REQUIRED' : 'NOT_LOGGED_IN';
    const err = new AutomationError(code, step, ready.detail);
    throw err;
  }
}

export async function openMarketplace(page: Page): Promise<void> {
  await gotoReady(page, URLS.marketplace, 'open-marketplace');
}

export async function openCreateItem(page: Page): Promise<void> {
  await gotoReady(page, URLS.createItem, 'open-create-item');
}

export async function openInbox(page: Page): Promise<void> {
  await gotoReady(page, URLS.inbox, 'open-inbox');
}

export async function openThread(page: Page, threadId: string): Promise<void> {
  await gotoReady(page, URLS.thread(threadId), 'open-thread');
}
