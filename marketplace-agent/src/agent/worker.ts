/**
 * The agent process. Run with: npm run agent  (real Facebook)
 *                             npm run mock-agent (fake marketplace)
 *
 * The web UI never drives the browser directly - it queues commands in SQLite
 * and this process executes them, so the Facebook session stays in one place
 * on the user's machine.
 */
import { loadEnv } from '@/lib/env';

loadEnv();
import * as repo from '@/db/repo';
import { UPLOADS_DIR } from '@/db';
import path from 'node:path';
import fs from 'node:fs';
import { createAdapter, currentMode } from '@/automation';
import { AutomationError, type MarketplaceAdapter } from '@/automation/MarketplaceAdapter';
import { runMessageAgent } from '@/ai/messageAgent';
import type { AgentCommand, Platform } from '@/lib/types';

const pollMs = () => Number(process.env.POLL_INTERVAL_MS || 15000);
const commandMs = () => Number(process.env.COMMAND_INTERVAL_MS || 1500);

export class AgentWorker {
  private adapter: MarketplaceAdapter | null = null;
  private mode: Platform;
  private stopped = false;
  private lastPoll = 0;
  private busy = false;

  constructor(mode: Platform = currentMode()) {
    this.mode = mode;
  }

  /* ------------------------------------------------------------ browser */

  private async ensureBrowser(): Promise<MarketplaceAdapter> {
    if (!this.adapter || !this.adapter.isOpen()) {
      this.adapter = createAdapter(this.mode);
      // Real Facebook must be headed - the user has to be able to log in and
      // complete any verification themselves. Mock mode defaults to headless.
      const headless =
        process.env.HEADLESS === '1'
          ? true
          : process.env.HEADLESS === '0'
            ? false
            : this.mode === 'mock';
      await this.adapter.launch({ headless });
      repo.setAgentState({ browserOpen: true });
      repo.logEvent({
        type: 'BROWSER_OPENED',
        message:
          this.mode === 'facebook'
            ? 'Opened the Facebook browser. Log into Facebook in the browser window if prompted.'
            : 'Opened the mock marketplace browser.',
      });
    }
    return this.adapter;
  }

  private async closeBrowser(): Promise<void> {
    await this.adapter?.close();
    this.adapter = null;
    repo.setAgentState({ browserOpen: false, loggedIn: false });
    repo.logEvent({ type: 'BROWSER_CLOSED', message: 'Browser closed.' });
  }

  /** Returns the adapter only when the marketplace is usable right now. */
  private async readyAdapter(): Promise<MarketplaceAdapter | null> {
    const adapter = await this.ensureBrowser();
    const ready = await adapter.ensureReady();
    if (ready.ready) {
      repo.setAgentState({ loggedIn: true, needsVerification: false, lastError: null });
      return adapter;
    }
    repo.setAgentState({
      loggedIn: false,
      needsVerification: ready.reason === 'VERIFICATION_REQUIRED',
      lastError: ready.detail,
    });
    repo.logEvent({
      type: ready.reason === 'VERIFICATION_REQUIRED' ? 'VERIFICATION_REQUIRED' : 'LOGIN_REQUIRED',
      level: 'warn',
      message:
        ready.reason === 'VERIFICATION_REQUIRED'
          ? 'Facebook requires manual verification. Complete it in the browser, then resume the agent.'
          : ready.detail,
    });
    return null;
  }

  /* ---------------------------------------------------------- publishing */

  async publishProduct(productId: string): Promise<void> {
    const product = repo.getProduct(productId);
    if (!product) return;

    if (!product.approvedAt) {
      repo.logEvent({
        type: 'PUBLISH_BLOCKED',
        level: 'warn',
        productId,
        message: 'Listing has not been approved yet. Approve it in the dashboard first.',
      });
      return;
    }

    let listing = repo.getListingForProduct(productId, this.mode);
    if (!listing) listing = repo.createListing(productId, this.mode);

    repo.setProductStatus(productId, 'PUBLISHING');
    repo.updateListing(listing.id, { status: 'PUBLISHING', attempts: listing.attempts + 1, errorMessage: null });
    repo.noteActivity(`Publishing "${product.title}"`);
    repo.logEvent({ type: 'PUBLISH_STARTED', productId, message: `Publishing "${product.title}".` });

    const adapter = await this.readyAdapter();
    if (!adapter) {
      repo.updateListing(listing.id, {
        status: 'FAILED',
        errorMessage: repo.getAgentState().lastError || 'Marketplace is not ready.',
      });
      repo.setProductStatus(productId, 'FAILED');
      return;
    }

    const photoPaths = product.photos
      .map((p) => path.join(UPLOADS_DIR, path.basename(p)))
      .filter((p) => fs.existsSync(p));

    try {
      const result = await adapter.publishListing({
        productId,
        title: product.generatedTitle || product.title,
        description: product.generatedDescription || product.description,
        price: product.askingPrice,
        category: product.category,
        location: product.pickupArea,
        photoPaths,
      });
      repo.updateListing(listing.id, {
        status: 'ACTIVE',
        externalId: result.externalId,
        externalUrl: result.externalUrl,
        publishedAt: result.publishedAt,
        errorMessage: null,
      });
      repo.setProductStatus(productId, 'ACTIVE');
      repo.noteActivity(`Published "${product.title}"`);
      repo.logEvent({
        type: 'LISTING_PUBLISHED',
        productId,
        message: `${product.title} listing published.`,
        meta: { url: result.externalUrl, verified: result.verified },
      });
    } catch (err) {
      this.recordAutomationFailure(err, listing.id, productId);
    }
  }

  private recordAutomationFailure(err: unknown, listingId: string, productId: string): void {
    const auto = err instanceof AutomationError ? err : null;
    const message = auto ? auto.message : (err as Error).message;
    repo.updateListing(listingId, {
      status: 'FAILED',
      errorMessage: message,
      screenshotPath: auto?.screenshotPath ?? null,
      htmlPath: auto?.htmlPath ?? null,
    });
    repo.setProductStatus(productId, 'FAILED');
    repo.setAgentState({
      lastError: message,
      needsVerification: auto?.code === 'VERIFICATION_REQUIRED',
    });
    repo.logEvent({
      type: 'AUTOMATION_FAILED',
      level: 'error',
      productId,
      message,
      meta: { step: auto?.step, code: auto?.code, screenshot: auto?.screenshotPath, html: auto?.htmlPath },
    });
  }

  /* ------------------------------------------------------------ messages */

  async checkMessages(): Promise<void> {
    const adapter = await this.readyAdapter();
    if (!adapter) return;

    repo.noteActivity('Checked Marketplace messages');
    let snapshots;
    try {
      snapshots = await adapter.fetchConversations();
    } catch (err) {
      const auto = err instanceof AutomationError ? err : null;
      repo.setAgentState({ lastError: auto?.message || (err as Error).message });
      repo.logEvent({
        type: 'AUTOMATION_FAILED',
        level: 'error',
        message: `Could not read the inbox: ${auto?.message || (err as Error).message}`,
        meta: { step: auto?.step, screenshot: auto?.screenshotPath },
      });
      return;
    }

    for (const snap of snapshots) {
      const productId = this.resolveProductId(snap.listingExternalId, snap.listingTitle);
      const convo = repo.upsertConversation({
        platform: this.mode,
        externalId: snap.externalId,
        buyerName: snap.buyerName,
        productId,
      });

      let messages;
      try {
        messages = await adapter.fetchMessages(snap.externalId);
      } catch (err) {
        repo.logEvent({
          type: 'AUTOMATION_FAILED',
          level: 'error',
          conversationId: convo.id,
          message: `Could not read the conversation with ${snap.buyerName}: ${(err as Error).message}`,
        });
        continue;
      }

      let newBuyerMessages = 0;
      for (const m of messages) {
        if (repo.hasMessageWithExternalId(convo.id, m.externalId)) continue;
        const added = repo.recordSyncedMessage({
          conversationId: convo.id,
          sender: m.sender,
          text: m.text,
          timestamp: m.timestamp,
          externalId: m.externalId,
        });
        if (added && m.sender === 'BUYER') {
          newBuyerMessages++;
          repo.logEvent({
            type: 'BUYER_MESSAGE',
            conversationId: convo.id,
            productId: convo.productId,
            message: `New message from ${convo.buyerName}.`,
            meta: { text: m.text },
          });
        }
      }

      if (!newBuyerMessages) continue;

      const result = await runMessageAgent({
        conversationId: convo.id,
        deliver: async (text) => {
          try {
            const sent = await adapter.sendMessage(snap.externalId, text);
            return { ok: sent.ok, verified: sent.verified };
          } catch (err) {
            const auto = err instanceof AutomationError ? err : null;
            return { ok: false, verified: false, error: auto?.message || (err as Error).message };
          }
        },
      });

      if (result.skipped) {
        repo.logEvent({
          type: 'AI_SKIPPED',
          conversationId: convo.id,
          message: `AI did not reply: ${result.skipped}`,
        });
      }
      if (result.error) {
        repo.logEvent({
          type: 'AI_ERROR',
          level: 'error',
          conversationId: convo.id,
          message: `AI could not reply: ${result.error}`,
        });
      }
    }
  }

  private resolveProductId(listingExternalId: string | null, listingTitle: string | null): string | null {
    if (listingExternalId) {
      const listing = repo.findListingByExternalId(this.mode, listingExternalId);
      if (listing) return listing.productId;
    }
    if (listingTitle) {
      const match = repo
        .listProducts()
        .find(
          (p) =>
            (p.generatedTitle || p.title).toLowerCase() === listingTitle.toLowerCase() ||
            p.title.toLowerCase() === listingTitle.toLowerCase(),
        );
      if (match) return match.id;
    }
    return null;
  }

  /* ------------------------------------------------------------ commands */

  async handleCommand(cmd: AgentCommand): Promise<void> {
    switch (cmd.type) {
      case 'START_AGENT':
        repo.setAgentState({ running: true, lastError: null });
        repo.noteActivity('Agent started');
        repo.logEvent({ type: 'AGENT_STARTED', message: 'Agent started.' });
        await this.ensureBrowser();
        break;
      case 'STOP_AGENT':
        repo.setAgentState({ running: false });
        repo.noteActivity('Agent stopped');
        repo.logEvent({ type: 'AGENT_STOPPED', message: 'Agent stopped.' });
        break;
      case 'OPEN_BROWSER': {
        await this.ensureBrowser();
        const adapter = this.adapter!;
        await adapter.focusForHuman();
        const ready = await adapter.ensureReady();
        repo.setAgentState({
          loggedIn: ready.ready,
          needsVerification: !ready.ready && ready.reason === 'VERIFICATION_REQUIRED',
          lastError: ready.ready ? null : ready.detail,
        });
        if (!ready.ready) {
          repo.logEvent({ type: 'LOGIN_REQUIRED', level: 'warn', message: ready.detail });
        }
        break;
      }
      case 'CLOSE_BROWSER':
        await this.closeBrowser();
        break;
      case 'PUBLISH_LISTING':
      case 'RETRY_LISTING':
        await this.publishProduct(String(cmd.payload.productId));
        break;
      case 'CHECK_MESSAGES':
        await this.checkMessages();
        break;
      case 'OPEN_CONVERSATION': {
        const convo = repo.getConversation(String(cmd.payload.conversationId));
        if (!convo) throw new Error('Conversation not found.');
        await this.ensureBrowser();
        await this.adapter!.openConversation(convo.externalId);
        break;
      }
      case 'SEND_MESSAGE': {
        const convo = repo.getConversation(String(cmd.payload.conversationId));
        const text = String(cmd.payload.text || '');
        if (!convo || !text) throw new Error('Conversation or text missing.');
        const adapter = await this.readyAdapter();
        if (!adapter) throw new Error(repo.getAgentState().lastError || 'Marketplace not ready.');
        const sent = await adapter.sendMessage(convo.externalId, text);
        if (!sent.verified) throw new Error('Message could not be verified as sent.');
        repo.addMessage({ conversationId: convo.id, sender: 'HUMAN', text });
        repo.logEvent({
          type: 'HUMAN_REPLIED',
          conversationId: convo.id,
          message: 'You replied from the dashboard.',
        });
        break;
      }
      default:
        throw new Error(`Unknown command: ${cmd.type}`);
    }
  }

  /* ---------------------------------------------------------------- loop */

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const cmd = repo.takeNextCommand();
      if (cmd) {
        try {
          await this.handleCommand(cmd);
          repo.finishCommand(cmd.id, 'DONE');
        } catch (err) {
          const message = (err as Error).message;
          repo.finishCommand(cmd.id, 'FAILED', message);
          repo.setAgentState({ lastError: message });
          repo.logEvent({ type: 'COMMAND_FAILED', level: 'error', message: `${cmd.type} failed: ${message}` });
        }
        return;
      }

      const state = repo.getAgentState();
      if (state.running && Date.now() - this.lastPoll >= pollMs()) {
        this.lastPoll = Date.now();
        await this.checkMessages();
      }
    } finally {
      this.busy = false;
      repo.setAgentState({ heartbeatAt: new Date().toISOString(), workerAlive: true });
    }
  }

  async run(): Promise<void> {
    repo.setAgentState({
      workerAlive: true,
      mode: this.mode,
      browserOpen: false,
      heartbeatAt: new Date().toISOString(),
    });
    repo.logEvent({ type: 'WORKER_ONLINE', message: `Agent worker online in ${this.mode.toUpperCase()} mode.` });
    const shutdown = async () => {
      this.stopped = true;
      repo.setAgentState({ workerAlive: false, running: false, browserOpen: false });
      repo.logEvent({ type: 'WORKER_OFFLINE', message: 'Agent worker stopped.' });
      await this.closeBrowser().catch(() => {});
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    while (!this.stopped) {
      await this.tick();
      await new Promise((r) => setTimeout(r, commandMs()));
    }
  }
}

if (process.argv[1] && /worker\.ts$/.test(process.argv[1])) {
  const worker = new AgentWorker(currentMode());
  worker.run().catch((err) => {
    console.error('[agent] fatal:', err);
    repo.setAgentState({ workerAlive: false, lastError: (err as Error).message });
    process.exit(1);
  });
}
