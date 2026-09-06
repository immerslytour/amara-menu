import fs from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { PROFILE_DIR } from '@/db';
import type { Platform } from '@/lib/types';
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
import { AutomationError } from '../MarketplaceAdapter';
import * as listing from './listing';
import * as messaging from './messaging';
import { goto, openMarketplace } from './navigation';
import { URLS } from './selectors';
import { checkReady } from './verification';

/**
 * Real Facebook Marketplace, driven through the normal website UI in a
 * persistent Chromium profile.
 *
 * - The user logs in themselves; we never see or store their password.
 * - The session lives on this machine in data/browser-profile.
 * - Security challenges are reported, never bypassed.
 */
export class FacebookMarketplaceAdapter implements MarketplaceAdapter {
  readonly platform: Platform = 'facebook';
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launch(opts: { headless?: boolean } = {}): Promise<void> {
    if (this.context) return;
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    // Headed by default: the user must be able to log in and complete any
    // verification Facebook asks for.
    this.context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: opts.headless ?? false,
      viewport: { width: 1400, height: 950 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    this.context.on('close', () => {
      this.context = null;
      this.page = null;
    });
    await goto(this.page, URLS.home, 'open-facebook');
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
    this.context = null;
    this.page = null;
  }

  isOpen(): boolean {
    return !!this.context;
  }

  private requirePage(): Page {
    if (!this.page) {
      throw new AutomationError(
        'BROWSER_NOT_STARTED',
        'require-page',
        'The Facebook browser is not open. Click "Open Facebook Browser" first.',
      );
    }
    return this.page;
  }

  async focusForHuman(): Promise<void> {
    const page = this.requirePage();
    await page.bringToFront().catch(() => {});
    await goto(page, URLS.home, 'focus-for-human');
  }

  async ensureReady(): Promise<ReadyState> {
    if (!this.page) return { ready: false, reason: 'BROWSER_CLOSED', detail: 'The Facebook browser is not open.' };
    const page = this.page;
    try {
      await openMarketplace(page);
    } catch (err) {
      if (err instanceof AutomationError && err.code === 'NOT_LOGGED_IN') {
        return { ready: false, reason: 'NOT_LOGGED_IN', detail: err.message };
      }
      if (err instanceof AutomationError && err.code === 'VERIFICATION_REQUIRED') {
        return { ready: false, reason: 'VERIFICATION_REQUIRED', detail: err.message };
      }
      throw err;
    }
    return checkReady(page);
  }

  publishListing(input: ListingInput): Promise<PublishResult> {
    return listing.publishListing(this.requirePage(), input);
  }

  verifyListing(ref: {
    externalId?: string | null;
    externalUrl?: string | null;
    title: string;
  }): Promise<ListingVerification> {
    return listing.verifyListing(this.requirePage(), ref);
  }

  markListingSold(ref: {
    externalId?: string | null;
    externalUrl?: string | null;
    title: string;
  }): Promise<SoldResult> {
    return listing.markListingSold(this.requirePage(), ref);
  }

  fetchConversations(): Promise<ConversationSnapshot[]> {
    return messaging.fetchConversations(this.requirePage());
  }

  fetchMessages(conversationExternalId: string): Promise<MessageSnapshot[]> {
    return messaging.fetchMessages(this.requirePage(), conversationExternalId);
  }

  sendMessage(conversationExternalId: string, text: string): Promise<SendResult> {
    return messaging.sendMessage(this.requirePage(), conversationExternalId, text);
  }

  async openConversation(conversationExternalId: string): Promise<void> {
    const page = this.requirePage();
    await page.bringToFront().catch(() => {});
    await goto(page, messaging.threadUrl(conversationExternalId), 'open-conversation');
  }

  /** Which listing a thread belongs to (used to attach conversations to products). */
  getConversationListingId(conversationExternalId: string): Promise<string | null> {
    return messaging.getThreadListingId(this.requirePage(), conversationExternalId);
  }
}
