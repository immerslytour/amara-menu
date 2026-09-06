import { chromium, type Browser, type Page } from 'playwright';
import type {
  ConversationSnapshot,
  ListingInput,
  ListingVerification,
  MarketplaceAdapter,
  MessageSnapshot,
  PublishResult,
  ReadyState,
  SendResult,
  SoldResult,
} from '../MarketplaceAdapter';
import { captureFailure } from '../diagnostics';
import type { Platform } from '@/lib/types';

function base(): string {
  return process.env.MOCK_BASE_URL || `http://localhost:${process.env.MOCK_PORT || 4010}`;
}

/**
 * Drives the fake Marketplace with a real browser, using the same
 * accessible-selector strategy as the Facebook adapter.
 */
export class MockMarketplaceAdapter implements MarketplaceAdapter {
  readonly platform: Platform = 'mock';
  private browser: Browser | null = null;
  private page: Page | null = null;

  async launch(opts: { headless?: boolean } = {}): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({ headless: opts.headless ?? true });
    const context = await this.browser.newContext({ viewport: { width: 1280, height: 900 } });
    this.page = await context.newPage();
    await this.page.goto(`${base()}/marketplace`, { waitUntil: 'domcontentloaded' });
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.page = null;
  }

  isOpen(): boolean {
    return !!this.browser;
  }

  async focusForHuman(): Promise<void> {
    const page = this.requirePage();
    await page.goto(`${base()}/marketplace`, { waitUntil: 'domcontentloaded' });
  }

  private requirePage(): Page {
    if (!this.page) {
      throw new Error('Mock browser is not started. Click "Open Browser" first.');
    }
    return this.page;
  }

  async ensureReady(): Promise<ReadyState> {
    if (!this.page) return { ready: false, reason: 'BROWSER_CLOSED', detail: 'Browser not started' };
    const page = this.page;
    await page.goto(`${base()}/marketplace`, { waitUntil: 'domcontentloaded' });
    if (await page.getByRole('button', { name: /log in/i }).isVisible().catch(() => false)) {
      return { ready: false, reason: 'NOT_LOGGED_IN', detail: 'Mock marketplace shows the login page' };
    }
    if (await page.getByText(/security check/i).isVisible().catch(() => false)) {
      return {
        ready: false,
        reason: 'VERIFICATION_REQUIRED',
        detail: 'Mock marketplace is showing a security check',
      };
    }
    return { ready: true };
  }

  async publishListing(input: ListingInput): Promise<PublishResult> {
    const page = this.requirePage();
    let step = 'open-marketplace';
    try {
      await page.goto(`${base()}/marketplace`, { waitUntil: 'domcontentloaded' });

      step = 'click-create-new-listing';
      await page.getByRole('button', { name: /create new listing/i }).click({ timeout: 10000 });

      step = 'choose-item-for-sale';
      await page.getByRole('button', { name: /^item for sale$/i }).click({ timeout: 10000 });

      step = 'upload-photos';
      if (input.photoPaths.length) {
        await page.getByLabel('Add photos').setInputFiles(input.photoPaths, { timeout: 10000 });
      }

      step = 'fill-title';
      await page.getByLabel('Title', { exact: true }).fill(input.title);

      step = 'fill-price';
      await page.getByLabel('Price', { exact: true }).fill(String(input.price));

      step = 'fill-category';
      await page.getByLabel('Category', { exact: true }).selectOption(input.category).catch(async () => {
        await page.getByLabel('Category', { exact: true }).selectOption('Other');
      });

      step = 'fill-location';
      await page.getByLabel('Location', { exact: true }).fill(input.location);

      step = 'fill-description';
      await page.getByLabel('Description', { exact: true }).fill(input.description);

      step = 'click-next';
      await page.getByRole('button', { name: /^next$/i }).click({ timeout: 10000 });

      step = 'review';
      await page.getByRole('heading', { name: /review your listing/i }).waitFor({ timeout: 10000 });

      step = 'click-publish';
      await page.getByRole('button', { name: /^publish$/i }).click({ timeout: 10000 });

      step = 'verify-published';
      await page.waitForURL(/\/marketplace\/item\//, { timeout: 15000 });
      const externalUrl = page.url();
      const externalId = externalUrl.split('/').pop() || null;
      const verified = await this.verifyListing({ externalUrl, externalId, title: input.title });
      if (!verified.found) {
        throw await captureFailure(
          page,
          'PUBLISH_NOT_VERIFIED',
          step,
          'Publish flow finished but the listing page did not show the expected title/price.',
        );
      }
      return {
        ok: true,
        externalId,
        externalUrl,
        publishedAt: new Date().toISOString(),
        verified,
      };
    } catch (err: any) {
      if (err?.name === 'AutomationError') throw err;
      throw await captureFailure(
        page,
        'SELECTOR_NOT_FOUND',
        step,
        `Mock marketplace UI did not match expectations at step "${step}": ${err?.message}`,
      );
    }
  }

  async verifyListing(ref: {
    externalId?: string | null;
    externalUrl?: string | null;
    title: string;
  }): Promise<ListingVerification> {
    const page = this.requirePage();
    const url = ref.externalUrl || (ref.externalId ? `${base()}/marketplace/item/${ref.externalId}` : null);
    if (!url) return { found: false, checkedAt: new Date().toISOString() };
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const titleEl = page.getByTestId('listing-title');
    if (!(await titleEl.isVisible().catch(() => false))) {
      return { found: false, checkedAt: new Date().toISOString() };
    }
    const title = (await titleEl.textContent())?.trim() || '';
    const priceText = (await page.getByTestId('listing-price').textContent())?.trim() || '';
    const price = Number(priceText.replace(/[^0-9.]/g, ''));
    return {
      found: title.length > 0 && title === ref.title,
      title,
      price: Number.isFinite(price) ? price : undefined,
      url,
      checkedAt: new Date().toISOString(),
    };
  }

  async fetchConversations(): Promise<ConversationSnapshot[]> {
    const page = this.requirePage();
    await page.goto(`${base()}/messages`, { waitUntil: 'domcontentloaded' });
    const rows = page.getByTestId('thread-row');
    const count = await rows.count();
    const out: ConversationSnapshot[] = [];
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const externalId = (await row.getAttribute('data-thread-id')) || '';
      const buyerName = (await row.getByTestId('thread-buyer').textContent())?.trim() || 'Buyer';
      const listingEl = row.getByTestId('thread-listing');
      const listingExternalId = (await listingEl.getAttribute('data-listing-id')) || null;
      const listingTitle = (await listingEl.textContent())?.trim() || null;
      const lastMessagePreview = (await row.getByTestId('thread-preview').textContent())?.trim() || null;
      const unread = (await row.getByTestId('thread-unread').count()) > 0;
      if (externalId) {
        out.push({ externalId, buyerName, listingExternalId, listingTitle, lastMessagePreview, unread });
      }
    }
    return out;
  }

  async fetchMessages(conversationExternalId: string): Promise<MessageSnapshot[]> {
    const page = this.requirePage();
    await page.goto(`${base()}/messages/t/${conversationExternalId}`, { waitUntil: 'domcontentloaded' });
    const items = page.getByTestId('message');
    const count = await items.count();
    const out: MessageSnapshot[] = [];
    for (let i = 0; i < count; i++) {
      const el = items.nth(i);
      out.push({
        externalId: (await el.getAttribute('data-message-id')) || `idx-${i}`,
        sender: (await el.getAttribute('data-sender')) === 'BUYER' ? 'BUYER' : 'AGENT',
        text: (await el.textContent())?.trim() || '',
        timestamp: (await el.getAttribute('data-ts')) || new Date().toISOString(),
      });
    }
    return out;
  }

  async sendMessage(conversationExternalId: string, text: string): Promise<SendResult> {
    const page = this.requirePage();
    let step = 'open-thread';
    try {
      await page.goto(`${base()}/messages/t/${conversationExternalId}`, { waitUntil: 'domcontentloaded' });
      step = 'fill-message';
      await page.getByLabel('Message', { exact: true }).fill(text);
      step = 'click-send';
      await page.getByRole('button', { name: /^send$/i }).click({ timeout: 10000 });
      step = 'verify-sent';
      await page
        .getByTestId('message')
        .filter({ hasText: text.slice(0, 40) })
        .last()
        .waitFor({ timeout: 10000 });
      const messages = await this.fetchMessages(conversationExternalId);
      const match = [...messages].reverse().find((m) => m.sender === 'AGENT' && m.text === text);
      if (!match) {
        throw await captureFailure(page, 'SEND_NOT_VERIFIED', step, 'Sent message not found in thread.');
      }
      return { ok: true, externalId: match.externalId, verified: true };
    } catch (err: any) {
      if (err?.name === 'AutomationError') throw err;
      throw await captureFailure(page, 'SELECTOR_NOT_FOUND', step, `Send failed at "${step}": ${err?.message}`);
    }
  }

  async markListingSold(ref: {
    externalId?: string | null;
    externalUrl?: string | null;
    title: string;
  }): Promise<SoldResult> {
    const page = this.requirePage();
    const url = ref.externalUrl || (ref.externalId ? `${base()}/marketplace/item/${ref.externalId}` : null);
    if (!url) return { ok: false, verified: false, detail: 'No listing URL to mark sold.' };
    let step = 'open-listing';
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      if ((await page.getByTestId('sold-banner').count()) > 0) {
        return { ok: true, verified: true, detail: 'Listing was already marked sold.' };
      }
      step = 'click-mark-as-sold';
      await page.getByRole('button', { name: /^mark as sold$/i }).click({ timeout: 10000 });

      step = 'verify-sold';
      await page.getByTestId('sold-banner').waitFor({ timeout: 10000 });
      const state = await page.getByTestId('listing-detail').getAttribute('data-sold');
      if (state !== '1') {
        throw await captureFailure(page, 'SOLD_NOT_VERIFIED', step, 'Listing does not show as sold after clicking.');
      }
      return { ok: true, verified: true };
    } catch (err: any) {
      if (err?.name === 'AutomationError') throw err;
      throw await captureFailure(page, 'SELECTOR_NOT_FOUND', step, `Mark-as-sold failed at "${step}": ${err?.message}`);
    }
  }

  async getConversationListingId(conversationExternalId: string): Promise<string | null> {
    const page = this.requirePage();
    await page.goto(`${base()}/messages/t/${conversationExternalId}`, { waitUntil: 'domcontentloaded' });
    const el = page.getByTestId('thread-listing').first();
    if (!(await el.isVisible().catch(() => false))) return null;
    const id = await el.getAttribute('data-listing-id');
    return id || null;
  }

  async openConversation(conversationExternalId: string): Promise<void> {
    const page = this.requirePage();
    await page.goto(`${base()}/messages/t/${conversationExternalId}`, { waitUntil: 'domcontentloaded' });
  }
}
