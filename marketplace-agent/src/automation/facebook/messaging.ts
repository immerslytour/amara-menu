import type { Page } from 'playwright';
import { INBOX, LISTING_PAGE, URLS } from './selectors';
import { firstVisible } from './locators';
import { captureFailure } from '../diagnostics';
import { openInbox, openThread } from './navigation';
import type { ConversationSnapshot, MessageSnapshot, SendResult } from '../MarketplaceAdapter';

/** Reading the Marketplace inbox and replying, through the normal chat UI. */

export async function fetchConversations(page: Page): Promise<ConversationSnapshot[]> {
  await openInbox(page);
  await page.waitForTimeout(2000);

  const links = page.locator(INBOX.threadLink);
  const count = Math.min(await links.count(), 40);
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
      // The inbox row shows the item title; the listing id is resolved when the
      // thread itself is opened.
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
  const link = page.locator(INBOX.threadListingLink).first();
  if (!(await link.isVisible().catch(() => false))) return null;
  const href = (await link.getAttribute('href')) || '';
  return href.match(LISTING_PAGE.itemUrlPattern)?.[1] ?? null;
}

export async function fetchMessages(page: Page, threadId: string): Promise<MessageSnapshot[]> {
  await openThread(page, threadId);
  await page.waitForTimeout(2000);

  /**
   * Facebook marks the seller's own messages with an aria-label / "You sent"
   * prefix. We read the accessible text of each row and infer the sender from
   * it, which survives class-name churn.
   */
  const rows = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[role="row"]'));
    return nodes
      .map((n, idx) => {
        const label = n.getAttribute('aria-label') || '';
        const text = (n as HTMLElement).innerText || '';
        return { idx, label, text: text.trim() };
      })
      .filter((r) => r.text.length > 0);
  });

  const out: MessageSnapshot[] = [];
  for (const row of rows) {
    const combined = `${row.label} ${row.text}`;
    const mine = /\byou sent\b/i.test(combined);
    const text = row.text.replace(/^You sent\s*/i, '').split('\n')[0].trim();
    if (!text) continue;
    out.push({
      externalId: `${threadId}:${row.idx}:${text.slice(0, 24)}`,
      sender: mine ? 'AGENT' : 'BUYER',
      text,
      timestamp: new Date().toISOString(),
    });
  }
  return out;
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
