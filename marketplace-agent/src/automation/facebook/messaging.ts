import { createHash } from 'node:crypto';
import type { Page } from 'playwright';
import { INBOX, LISTING_PAGE, SCROLL, URLS } from './selectors';
import { firstVisible } from './locators';
import { loadMoreDown, loadMoreUp } from './scrolling';
import { captureFailure } from '../diagnostics';
import { openInbox, openThread } from './navigation';
import type { ConversationSnapshot, MessageSnapshot, SendResult } from '../MarketplaceAdapter';

/** Reading the Marketplace inbox and replying, through the normal chat UI. */

export async function fetchConversations(page: Page): Promise<ConversationSnapshot[]> {
  await openInbox(page);
  await page.waitForTimeout(2000);

  const links = page.locator(INBOX.threadLink);
  // The inbox is lazily loaded: page through it before reading.
  await loadMoreDown(page, links);

  const count = Math.min(await links.count(), SCROLL.maxConversations);
  const out: ConversationSnapshot[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    const href = (await link.getAttribute('href').catch(() => null)) || '';
    const id = href.match(/\/messages\/t\/([^/?#]+)/)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const text = (await link.innerText().catch(() => '')) || '';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    out.push({
      externalId: id,
      buyerName: lines[0] || 'Buyer',
      // Inbox rows rarely carry the listing id; getThreadListingId resolves it
      // from inside the thread when the product cannot be matched by title.
      listingExternalId: null,
      listingTitle: lines[1] || null,
      lastMessagePreview: lines[2] || lines[1] || null,
      unread: /unread/i.test((await link.getAttribute('aria-label').catch(() => '')) || ''),
    });
  }
  return out;
}

/** Resolves which listing a thread is about, by the item link inside the thread. */
export async function getThreadListingId(page: Page, threadId: string): Promise<string | null> {
  await openThread(page, threadId);
  await page.waitForTimeout(1500);
  const link = page.locator(INBOX.threadListingLink).first();
  if (!(await link.isVisible().catch(() => false))) return null;
  const href = (await link.getAttribute('href')) || '';
  return href.match(LISTING_PAGE.itemUrlPattern)?.[1] ?? null;
}

interface RawRow {
  label: string;
  text: string;
  /** Anything in the row that looks like a time, e.g. a <time> or title attr. */
  timeHint: string;
}

export async function fetchMessages(page: Page, threadId: string): Promise<MessageSnapshot[]> {
  await openThread(page, threadId);
  await page.waitForTimeout(2000);

  const rows = page.locator('[role="row"]');
  // Older messages load when you scroll up.
  await loadMoreUp(page, rows);

  /**
   * Facebook marks the seller's own messages with an aria-label / "You sent"
   * prefix. We read the accessible text of each row and infer the sender from
   * it, which survives class-name churn.
   */
  const raw: RawRow[] = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[role="row"]'));
    return nodes
      .map((n) => {
        const el = n as HTMLElement;
        const timeEl = el.querySelector('time, [title], abbr');
        return {
          label: n.getAttribute('aria-label') || '',
          text: (el.innerText || '').trim(),
          timeHint:
            timeEl?.getAttribute('datetime') ||
            timeEl?.getAttribute('title') ||
            (timeEl as HTMLElement | null)?.innerText ||
            '',
        };
      })
      .filter((r) => r.text.length > 0);
  });

  const syncedAt = Date.now();
  const occurrences = new Map<string, number>();
  const out: MessageSnapshot[] = [];

  raw.forEach((row, index) => {
    const combined = `${row.label} ${row.text}`;
    const mine = /\byou sent\b/i.test(combined);
    const text = row.text.replace(/^You sent\s*/i, '').split('\n')[0].trim();
    if (!text) return;
    const sender = mine ? 'AGENT' : 'BUYER';

    /**
     * Stable id: content-based, not positional. Loading older messages above
     * used to shift every index and re-import the whole thread as new.
     * The occurrence counter disambiguates a buyer genuinely repeating themselves.
     */
    const key = `${sender}|${text}`;
    const nth = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, nth);
    const hash = createHash('sha1').update(key).digest('hex').slice(0, 16);

    out.push({
      externalId: `${hash}:${nth}`,
      sender,
      text,
      // Keep DOM order when Facebook gives us no parseable time, so messages
      // do not scramble when several are imported in the same sync.
      timestamp: parseTimestamp(row.timeHint) ?? new Date(syncedAt + index).toISOString(),
    });
  });

  return out;
}

/** Best-effort: an ISO datetime attribute, or a time we can anchor to today. */
function parseTimestamp(hint: string): string | null {
  const trimmed = hint.trim();
  if (!trimmed) return null;

  const direct = Date.parse(trimmed);
  if (!Number.isNaN(direct)) return new Date(direct).toISOString();

  const clock = trimmed.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i);
  if (clock) {
    let hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const meridiem = clock[3]?.toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    if (hours < 24 && minutes < 60) {
      const d = new Date();
      d.setHours(hours, minutes, 0, 0);
      // A time later than now must belong to yesterday.
      if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
      return d.toISOString();
    }
  }
  return null;
}

export async function sendMessage(page: Page, threadId: string, text: string): Promise<SendResult> {
  let step = 'open-thread';
  await openThread(page, threadId);

  step = 'find-composer';
  const composer = await firstVisible(page, INBOX.composer, 8000);
  if (!composer) {
    throw await captureFailure(
      page,
      'SELECTOR_NOT_FOUND',
      step,
      'Could not find the message box in the Facebook chat. Update src/automation/facebook/selectors.ts.',
    );
  }

  step = 'type-message';
  await composer.click();
  await composer.fill(text).catch(async () => {
    await composer.type(text, { delay: 15 });
  });

  step = 'send';
  const sendButton = await firstVisible(page, INBOX.sendButton, 2500);
  if (sendButton) await sendButton.click();
  else await composer.press('Enter');

  step = 'verify-sent';
  const echoed = page.getByText(text.slice(0, 60), { exact: false }).last();
  const appeared = await echoed
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!appeared) {
    throw await captureFailure(
      page,
      'SEND_NOT_VERIFIED',
      step,
      'The reply was typed but did not appear in the thread, so it cannot be confirmed as sent.',
    );
  }
  return { ok: true, externalId: null, verified: true };
}

export function threadUrl(threadId: string): string {
  return URLS.thread(threadId);
}
