import type { Locator, Page } from 'playwright';
import { SCROLL } from './selectors';

/**
 * Facebook loads conversations and messages lazily. These helpers page through
 * that content with a bounded number of rounds - never an open-ended poll.
 */

/** Scrolls down until no new items appear, or the round/limit budget runs out. */
export async function loadMoreDown(
  page: Page,
  items: Locator,
  rounds = SCROLL.inboxRounds,
  cap = SCROLL.maxConversations,
): Promise<number> {
  let previous = await items.count();
  for (let round = 0; round < rounds && previous < cap; round++) {
    const last = items.last();
    await last.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await page.mouse.wheel(0, 1200).catch(() => {});
    await page.waitForTimeout(SCROLL.pauseMs);
    const current = await items.count();
    if (current <= previous) return current;
    previous = current;
  }
  return previous;
}

/** Scrolls up inside a thread to pull in older messages. */
export async function loadMoreUp(
  page: Page,
  items: Locator,
  rounds = SCROLL.threadRounds,
): Promise<number> {
  let previous = await items.count();
  for (let round = 0; round < rounds; round++) {
    const first = items.first();
    await first.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await page.mouse.wheel(0, -1200).catch(() => {});
    await page.waitForTimeout(SCROLL.pauseMs);
    const current = await items.count();
    if (current <= previous) return current;
    previous = current;
  }
  return previous;
}
