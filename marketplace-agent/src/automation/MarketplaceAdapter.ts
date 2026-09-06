import type { Platform } from '@/lib/types';

export interface ListingInput {
  productId: string;
  title: string;
  description: string;
  price: number;
  category: string;
  location: string;
  photoPaths: string[];
}

export interface PublishResult {
  ok: true;
  externalId: string | null;
  externalUrl: string | null;
  publishedAt: string;
  /** Proof the adapter re-read the published listing from the page. */
  verified: ListingVerification;
}

export interface ListingVerification {
  found: boolean;
  title?: string;
  price?: number;
  url?: string;
  checkedAt: string;
}

export interface ConversationSnapshot {
  externalId: string;
  buyerName: string;
  /** Listing/product the thread is attached to, as shown by the platform. */
  listingExternalId: string | null;
  listingTitle: string | null;
  lastMessagePreview: string | null;
  unread: boolean;
}

export interface MessageSnapshot {
  externalId: string;
  sender: 'BUYER' | 'AGENT';
  text: string;
  timestamp: string;
}

export interface SendResult {
  ok: true;
  externalId: string | null;
  /** The adapter re-read the thread and found the sent text. */
  verified: boolean;
}

export type ReadyState =
  | { ready: true }
  | { ready: false; reason: 'NOT_LOGGED_IN' | 'VERIFICATION_REQUIRED' | 'BROWSER_CLOSED'; detail: string };

/**
 * Every marketplace backend (real Facebook, mock) implements this.
 * The AI layer only ever talks to this interface - it never touches Playwright.
 */
export interface MarketplaceAdapter {
  readonly platform: Platform;

  /** Launch the browser (persistent profile for real platforms). */
  launch(opts?: { headless?: boolean }): Promise<void>;
  close(): Promise<void>;
  isOpen(): boolean;

  /** Bring the browser window to the front / navigate somewhere useful for the human. */
  focusForHuman(): Promise<void>;

  /**
   * Checks login + security-challenge state. Never tries to solve a challenge:
   * it reports it so a human can handle it.
   */
  ensureReady(): Promise<ReadyState>;

  publishListing(input: ListingInput): Promise<PublishResult>;
  verifyListing(ref: { externalId?: string | null; externalUrl?: string | null; title: string }): Promise<ListingVerification>;

  fetchConversations(): Promise<ConversationSnapshot[]>;
  fetchMessages(conversationExternalId: string): Promise<MessageSnapshot[]>;
  sendMessage(conversationExternalId: string, text: string): Promise<SendResult>;
  openConversation(conversationExternalId: string): Promise<void>;
}

export type AutomationErrorCode =
  | 'SELECTOR_NOT_FOUND'
  | 'UNEXPECTED_UI'
  | 'NOT_LOGGED_IN'
  | 'VERIFICATION_REQUIRED'
  | 'PUBLISH_NOT_VERIFIED'
  | 'SEND_NOT_VERIFIED'
  | 'NAVIGATION_FAILED'
  | 'BROWSER_NOT_STARTED';

/**
 * Raised instead of "clicking around randomly" when the page does not look
 * like what the adapter expects. Carries diagnostics for the dashboard.
 */
export class AutomationError extends Error {
  code: AutomationErrorCode;
  step: string;
  screenshotPath?: string;
  htmlPath?: string;

  constructor(code: AutomationErrorCode, step: string, message: string) {
    super(message);
    this.name = 'AutomationError';
    this.code = code;
    this.step = step;
  }
}
