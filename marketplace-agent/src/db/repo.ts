import { db, id, nowIso } from './index';
import type {
  AgentCommand,
  AgentCommandType,
  AgentEvent,
  AgentState,
  Conversation,
  ConversationStatus,
  Lead,
  Listing,
  ListingStatus,
  Message,
  MessageSender,
  Platform,
  Product,
  ProductStatus,
} from '@/lib/types';

/* ------------------------------------------------------------------ rows */

type Row = Record<string, any>;

function toProduct(r: Row): Product {
  return {
    ...r,
    photos: JSON.parse(r.photos || '[]'),
    aiEnabled: !!r.aiEnabled,
  } as Product;
}

function toConversation(r: Row): Conversation {
  return { ...r, aiEnabled: !!r.aiEnabled, humanTakeover: !!r.humanTakeover } as Conversation;
}

/* --------------------------------------------------------------- product */

export interface CreateProductInput {
  title: string;
  description: string;
  photos: string[];
  askingPrice: number;
  minimumPrice: number;
  pickupArea: string;
  availability: string;
  category?: string;
  condition?: string;
}

export function createProduct(input: CreateProductInput): Product {
  const ts = nowIso();
  const pid = id('prod');
  db()
    .prepare(
      `INSERT INTO products (id, userId, title, description, photos, askingPrice, minimumPrice,
        pickupArea, availability, category, condition, status, aiEnabled, createdAt, updatedAt)
       VALUES (@id, 'local-user', @title, @description, @photos, @askingPrice, @minimumPrice,
        @pickupArea, @availability, @category, @condition, 'DRAFT', 1, @ts, @ts)`,
    )
    .run({
      id: pid,
      title: input.title,
      description: input.description,
      photos: JSON.stringify(input.photos),
      askingPrice: input.askingPrice,
      minimumPrice: input.minimumPrice,
      pickupArea: input.pickupArea,
      availability: input.availability,
      category: input.category || 'Electronics',
      condition: input.condition || 'Used - good',
      ts,
    });
  return getProduct(pid)!;
}

export function getProduct(pid: string): Product | null {
  const r = db().prepare('SELECT * FROM products WHERE id = ?').get(pid) as Row | undefined;
  return r ? toProduct(r) : null;
}

export function listProducts(): Product[] {
  return (db().prepare('SELECT * FROM products ORDER BY createdAt DESC').all() as Row[]).map(
    toProduct,
  );
}

export function updateProduct(pid: string, patch: Partial<Product>): Product | null {
  const allowed = [
    'title',
    'description',
    'askingPrice',
    'minimumPrice',
    'pickupArea',
    'availability',
    'category',
    'condition',
    'status',
    'generatedTitle',
    'generatedDescription',
    'approvedAt',
  ] as const;
  const sets: string[] = [];
  const params: Row = { id: pid, updatedAt: nowIso() };
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = @${key}`);
      params[key] = patch[key];
    }
  }
  if (patch.photos !== undefined) {
    sets.push('photos = @photos');
    params.photos = JSON.stringify(patch.photos);
  }
  if (patch.aiEnabled !== undefined) {
    sets.push('aiEnabled = @aiEnabled');
    params.aiEnabled = patch.aiEnabled ? 1 : 0;
  }
  if (!sets.length) return getProduct(pid);
  db()
    .prepare(`UPDATE products SET ${sets.join(', ')}, updatedAt = @updatedAt WHERE id = @id`)
    .run(params);
  return getProduct(pid);
}

export function deleteProduct(pid: string): void {
  // Conversations keep their history; they just lose the product link.
  db().prepare('UPDATE conversations SET productId = NULL WHERE productId = ?').run(pid);
  db().prepare('DELETE FROM listings WHERE productId = ?').run(pid);
  db().prepare('DELETE FROM products WHERE id = ?').run(pid);
}

export function setProductStatus(pid: string, status: ProductStatus): void {
  db()
    .prepare('UPDATE products SET status = ?, updatedAt = ? WHERE id = ?')
    .run(status, nowIso(), pid);
}

/* --------------------------------------------------------------- listing */

export function createListing(productId: string, platform: Platform): Listing {
  const ts = nowIso();
  const lid = id('list');
  db()
    .prepare(
      `INSERT INTO listings (id, productId, platform, status, attempts, createdAt, updatedAt)
       VALUES (?, ?, ?, 'DRAFT', 0, ?, ?)`,
    )
    .run(lid, productId, platform, ts, ts);
  return getListing(lid)!;
}

export function getListing(lid: string): Listing | null {
  return (db().prepare('SELECT * FROM listings WHERE id = ?').get(lid) as Listing) || null;
}

export function getListingForProduct(productId: string, platform?: Platform): Listing | null {
  const sql = platform
    ? 'SELECT * FROM listings WHERE productId = ? AND platform = ? ORDER BY createdAt DESC LIMIT 1'
    : 'SELECT * FROM listings WHERE productId = ? ORDER BY createdAt DESC LIMIT 1';
  const args = platform ? [productId, platform] : [productId];
  return (db().prepare(sql).get(...args) as Listing) || null;
}

export function listListings(): Listing[] {
  return db().prepare('SELECT * FROM listings ORDER BY createdAt DESC').all() as Listing[];
}

export function updateListing(lid: string, patch: Partial<Listing>): Listing | null {
  const allowed = [
    'externalUrl',
    'externalId',
    'status',
    'errorMessage',
    'screenshotPath',
    'htmlPath',
    'attempts',
    'publishedAt',
  ] as const;
  const sets: string[] = [];
  const params: Row = { id: lid, updatedAt: nowIso() };
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = @${key}`);
      params[key] = patch[key];
    }
  }
  if (!sets.length) return getListing(lid);
  db()
    .prepare(`UPDATE listings SET ${sets.join(', ')}, updatedAt = @updatedAt WHERE id = @id`)
    .run(params);
  return getListing(lid);
}

export function setListingStatus(lid: string, status: ListingStatus, errorMessage?: string): void {
  db()
    .prepare('UPDATE listings SET status = ?, errorMessage = ?, updatedAt = ? WHERE id = ?')
    .run(status, errorMessage ?? null, nowIso(), lid);
}

export function findListingByExternalId(platform: Platform, externalId: string): Listing | null {
  return (
    (db()
      .prepare('SELECT * FROM listings WHERE platform = ? AND externalId = ?')
      .get(platform, externalId) as Listing) || null
  );
}

/* ---------------------------------------------------------- conversation */

export function upsertConversation(input: {
  platform: Platform;
  externalId: string;
  buyerName: string;
  productId: string | null;
}): Conversation {
  const existing = db()
    .prepare('SELECT * FROM conversations WHERE platform = ? AND externalId = ?')
    .get(input.platform, input.externalId) as Row | undefined;
  if (existing) {
    if (!existing.productId && input.productId) {
      db()
        .prepare('UPDATE conversations SET productId = ?, updatedAt = ? WHERE id = ?')
        .run(input.productId, nowIso(), existing.id);
      return getConversation(existing.id)!;
    }
    return toConversation(existing);
  }
  const ts = nowIso();
  const cid = id('conv');
  db()
    .prepare(
      `INSERT INTO conversations (id, productId, platform, externalId, buyerName, status,
         leadScore, aiEnabled, humanTakeover, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'NEW', 0, 1, 0, ?, ?)`,
    )
    .run(cid, input.productId, input.platform, input.externalId, input.buyerName, ts, ts);
  return getConversation(cid)!;
}

export function getConversation(cid: string): Conversation | null {
  const r = db().prepare('SELECT * FROM conversations WHERE id = ?').get(cid) as Row | undefined;
  return r ? toConversation(r) : null;
}

export function findConversationByExternalId(platform: Platform, externalId: string): Conversation | null {
  const r = db()
    .prepare('SELECT * FROM conversations WHERE platform = ? AND externalId = ?')
    .get(platform, externalId) as Row | undefined;
  return r ? toConversation(r) : null;
}

export function listConversations(): Conversation[] {
  return (
    db().prepare('SELECT * FROM conversations ORDER BY COALESCE(lastMessageAt, createdAt) DESC').all() as Row[]
  ).map(toConversation);
}

export function updateConversation(cid: string, patch: Partial<Conversation>): Conversation | null {
  const allowed = ['productId', 'buyerName', 'status', 'leadScore', 'agreedPrice', 'lastMessageAt'] as const;
  const sets: string[] = [];
  const params: Row = { id: cid, updatedAt: nowIso() };
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = @${key}`);
      params[key] = patch[key];
    }
  }
  for (const key of ['aiEnabled', 'humanTakeover'] as const) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = @${key}`);
      params[key] = patch[key] ? 1 : 0;
    }
  }
  if (!sets.length) return getConversation(cid);
  db()
    .prepare(`UPDATE conversations SET ${sets.join(', ')}, updatedAt = @updatedAt WHERE id = @id`)
    .run(params);
  return getConversation(cid);
}

/* -------------------------------------------------------------- messages */

export function addMessage(input: {
  conversationId: string;
  sender: MessageSender;
  text: string;
  timestamp?: string;
  externalId?: string | null;
}): Message | null {
  const ts = nowIso();
  const mid = id('msg');
  try {
    db()
      .prepare(
        `INSERT INTO messages (id, conversationId, externalId, sender, text, timestamp, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        mid,
        input.conversationId,
        input.externalId ?? null,
        input.sender,
        input.text,
        input.timestamp || ts,
        ts,
      );
  } catch (err: any) {
    // duplicate externalId => message already recorded
    if (String(err?.message || '').includes('UNIQUE')) return null;
    throw err;
  }
  db()
    .prepare('UPDATE conversations SET lastMessageAt = ?, updatedAt = ? WHERE id = ?')
    .run(input.timestamp || ts, ts, input.conversationId);
  return db().prepare('SELECT * FROM messages WHERE id = ?').get(mid) as Message;
}

export function listMessages(conversationId: string): Message[] {
  return db()
    .prepare('SELECT * FROM messages WHERE conversationId = ? ORDER BY timestamp ASC, createdAt ASC')
    .all(conversationId) as Message[];
}

export function hasMessageWithExternalId(conversationId: string, externalId: string): boolean {
  const r = db()
    .prepare('SELECT 1 FROM messages WHERE conversationId = ? AND externalId = ?')
    .get(conversationId, externalId);
  return !!r;
}

/* ------------------------------------------------------------------ lead */

export function upsertLead(input: {
  conversationId: string;
  score: number;
  status: ConversationStatus;
  reason: string;
}): Lead {
  const ts = nowIso();
  const existing = db()
    .prepare('SELECT * FROM leads WHERE conversationId = ?')
    .get(input.conversationId) as Lead | undefined;
  if (existing) {
    db()
      .prepare('UPDATE leads SET score = ?, status = ?, reason = ?, updatedAt = ? WHERE id = ?')
      .run(input.score, input.status, input.reason, ts, existing.id);
    return db().prepare('SELECT * FROM leads WHERE id = ?').get(existing.id) as Lead;
  }
  const lid = id('lead');
  db()
    .prepare(
      `INSERT INTO leads (id, conversationId, score, status, reason, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(lid, input.conversationId, input.score, input.status, input.reason, ts, ts);
  return db().prepare('SELECT * FROM leads WHERE id = ?').get(lid) as Lead;
}

export function getLead(conversationId: string): Lead | null {
  return (
    (db().prepare('SELECT * FROM leads WHERE conversationId = ?').get(conversationId) as Lead) ||
    null
  );
}

export function listLeads(): Lead[] {
  return db().prepare('SELECT * FROM leads ORDER BY score DESC, updatedAt DESC').all() as Lead[];
}

/* ----------------------------------------------------------------- event */

export function logEvent(input: {
  type: string;
  message: string;
  level?: 'info' | 'warn' | 'error';
  productId?: string | null;
  conversationId?: string | null;
  meta?: unknown;
}): AgentEvent {
  const ts = nowIso();
  const eid = id('evt');
  db()
    .prepare(
      `INSERT INTO agent_events (id, type, level, productId, conversationId, message, meta, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      eid,
      input.type,
      input.level || 'info',
      input.productId ?? null,
      input.conversationId ?? null,
      input.message,
      input.meta === undefined ? null : JSON.stringify(input.meta),
      ts,
    );
  return db().prepare('SELECT * FROM agent_events WHERE id = ?').get(eid) as AgentEvent;
}

export function listEvents(limit = 100): AgentEvent[] {
  return db()
    .prepare('SELECT * FROM agent_events ORDER BY createdAt DESC, rowid DESC LIMIT ?')
    .all(limit) as AgentEvent[];
}

/* ----------------------------------------------------------------- state */

export function getAgentState(): AgentState {
  const r = db().prepare('SELECT * FROM agent_state WHERE id = 1').get() as Row;
  return {
    running: !!r.running,
    mode: r.mode,
    workerAlive: !!r.workerAlive,
    browserOpen: !!r.browserOpen,
    loggedIn: !!r.loggedIn,
    needsVerification: !!r.needsVerification,
    lastActivity: r.lastActivity,
    lastActivityAt: r.lastActivityAt,
    lastError: r.lastError,
    heartbeatAt: r.heartbeatAt,
  };
}

export function setAgentState(patch: Partial<AgentState>): AgentState {
  const sets: string[] = [];
  const params: Row = {};
  const boolKeys = ['running', 'workerAlive', 'browserOpen', 'loggedIn', 'needsVerification'] as const;
  for (const key of boolKeys) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = @${key}`);
      params[key] = patch[key] ? 1 : 0;
    }
  }
  for (const key of ['mode', 'lastActivity', 'lastActivityAt', 'lastError', 'heartbeatAt'] as const) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = @${key}`);
      params[key] = patch[key];
    }
  }
  if (sets.length) db().prepare(`UPDATE agent_state SET ${sets.join(', ')} WHERE id = 1`).run(params);
  return getAgentState();
}

export function noteActivity(text: string): void {
  setAgentState({ lastActivity: text, lastActivityAt: nowIso() });
}

/* -------------------------------------------------------------- commands */

export function enqueueCommand(type: AgentCommandType, payload: Record<string, unknown> = {}): AgentCommand {
  const ts = nowIso();
  const cid = id('cmd');
  db()
    .prepare(
      `INSERT INTO agent_commands (id, type, payload, status, createdAt, updatedAt)
       VALUES (?, ?, ?, 'PENDING', ?, ?)`,
    )
    .run(cid, type, JSON.stringify(payload), ts, ts);
  return getCommand(cid)!;
}

export function getCommand(cid: string): AgentCommand | null {
  const r = db().prepare('SELECT * FROM agent_commands WHERE id = ?').get(cid) as Row | undefined;
  return r ? ({ ...r, payload: JSON.parse(r.payload || '{}') } as AgentCommand) : null;
}

export function takeNextCommand(): AgentCommand | null {
  const r = db()
    .prepare("SELECT * FROM agent_commands WHERE status = 'PENDING' ORDER BY createdAt ASC LIMIT 1")
    .get() as Row | undefined;
  if (!r) return null;
  db()
    .prepare("UPDATE agent_commands SET status = 'RUNNING', updatedAt = ? WHERE id = ?")
    .run(nowIso(), r.id);
  return { ...r, payload: JSON.parse(r.payload || '{}'), status: 'RUNNING' } as AgentCommand;
}

export function finishCommand(cid: string, status: 'DONE' | 'FAILED', result?: string): void {
  db()
    .prepare('UPDATE agent_commands SET status = ?, result = ?, updatedAt = ? WHERE id = ?')
    .run(status, result ?? null, nowIso(), cid);
}

export function pendingCommandCount(): number {
  const r = db()
    .prepare("SELECT COUNT(*) AS n FROM agent_commands WHERE status IN ('PENDING','RUNNING')")
    .get() as Row;
  return r.n as number;
}

/**
 * Records a message read back from the marketplace.
 *
 * Replies we just sent are already stored locally without an external id, so
 * adopt those rather than inserting a duplicate when the thread is re-read.
 */
export function recordSyncedMessage(input: {
  conversationId: string;
  sender: MessageSender;
  text: string;
  timestamp: string;
  externalId: string;
}): Message | null {
  if (input.sender !== 'BUYER') {
    const existing = db()
      .prepare(
        `SELECT * FROM messages
          WHERE conversationId = ? AND externalId IS NULL AND text = ? AND sender IN ('AGENT','HUMAN')
          ORDER BY createdAt ASC LIMIT 1`,
      )
      .get(input.conversationId, input.text) as Message | undefined;
    if (existing) {
      db().prepare('UPDATE messages SET externalId = ? WHERE id = ?').run(input.externalId, existing.id);
      return null;
    }
  }
  return addMessage(input);
}
