/**
 * Standalone fake Marketplace website (no Facebook involved).
 * Run with: npm run mock-server
 */
import http from 'node:http';
import { URL } from 'node:url';
import { load, nextId, reset, save, type MockState, type MockThread } from './store';
import * as pages from './pages';

const PORT = Number(process.env.MOCK_PORT || 4010);

function html(res: http.ServerResponse, body: string, status = 200) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}
function json(res: http.ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

function findThreadForListing(state: MockState, listingId: string, buyerName: string): MockThread {
  const existing = state.threads.find((t) => t.listingId === listingId && t.buyerName === buyerName);
  if (existing) return existing;
  const listing = state.listings.find((l) => l.id === listingId);
  const t: MockThread = {
    id: nextId(state, 'thread'),
    listingId,
    listingTitle: listing?.title ?? null,
    buyerName,
    messages: [],
    unread: false,
  };
  state.threads.push(t);
  return t;
}

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const p = url.pathname;
    const state = load();

    // ---- control endpoints (used by tests / the buyer simulator) ----------
    if (p === '/mock/api/reset' && req.method === 'POST') {
      reset();
      return json(res, { ok: true });
    }
    if (p === '/mock/api/state') return json(res, state);
    if (p === '/mock/api/flags' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (typeof body.loggedIn === 'boolean') state.loggedIn = body.loggedIn;
      if (typeof body.verificationRequired === 'boolean')
        state.verificationRequired = body.verificationRequired;
      if (typeof body.breakCreateFlow === 'boolean') state.breakCreateFlow = body.breakCreateFlow;
      if (typeof body.hideInboxListingId === 'boolean')
        state.hideInboxListingId = body.hideInboxListingId;
      save(state);
      return json(res, { ok: true });
    }
    if (p === '/mock/api/simulate/buyer' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const listingId: string = body.listingId;
      const buyerName: string = body.buyerName || 'Buyer';
      const t = findThreadForListing(state, listingId, buyerName);
      t.messages.push({
        id: nextId(state, 'm'),
        sender: 'BUYER',
        text: String(body.text || ''),
        timestamp: new Date().toISOString(),
      });
      t.unread = true;
      save(state);
      return json(res, { ok: true, threadId: t.id });
    }
    if (p === '/mock/login' && req.method === 'POST') {
      state.loggedIn = true;
      save(state);
      res.writeHead(302, { location: '/marketplace' });
      return res.end();
    }
    if (p === '/mock/verify' && req.method === 'POST') {
      state.verificationRequired = false;
      save(state);
      res.writeHead(302, { location: '/marketplace' });
      return res.end();
    }

    // ---- gates -----------------------------------------------------------
    if (!state.loggedIn) return html(res, pages.loginPage());
    if (state.verificationRequired) return html(res, pages.verificationPage());

    // ---- app endpoints ---------------------------------------------------
    if (p === '/mock/api/listings' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const listing = {
        id: nextId(state, 'item'),
        title: String(body.title || ''),
        price: Number(String(body.price).replace(/[^0-9.]/g, '')) || 0,
        description: String(body.description || ''),
        category: String(body.category || 'Other'),
        location: String(body.location || ''),
        photos: Array.isArray(body.photos) ? body.photos : [],
        sold: false,
        createdAt: new Date().toISOString(),
      };
      state.listings.push(listing);
      save(state);
      return json(res, { id: listing.id });
    }

    const soldMatch = p.match(/^\/mock\/api\/listings\/([^/]+)\/sold$/);
    if (soldMatch && req.method === 'POST') {
      const l = state.listings.find((x) => x.id === soldMatch[1]);
      if (!l) return json(res, { error: 'not found' }, 404);
      l.sold = true;
      save(state);
      return json(res, { ok: true });
    }

    const sendMatch = p.match(/^\/mock\/api\/threads\/([^/]+)\/send$/);
    if (sendMatch && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const t = state.threads.find((x) => x.id === sendMatch[1]);
      if (!t) return json(res, { error: 'not found' }, 404);
      t.messages.push({
        id: nextId(state, 'm'),
        sender: 'SELLER',
        text: String(body.text || ''),
        timestamp: new Date().toISOString(),
      });
      t.unread = false;
      save(state);
      return json(res, { ok: true });
    }

    // ---- pages -----------------------------------------------------------
    if (p === '/' || p === '/marketplace')
      return html(res, pages.marketplaceHome(state.listings, state.breakCreateFlow));
    if (p === '/marketplace/create') return html(res, pages.chooseTypePage());
    if (p === '/marketplace/create/item') return html(res, pages.createItemPage());

    const itemMatch = p.match(/^\/marketplace\/item\/([^/]+)$/);
    if (itemMatch) {
      const l = state.listings.find((x) => x.id === itemMatch[1]);
      if (!l) return html(res, '<h1>Not found</h1>', 404);
      return html(res, pages.itemPage(l));
    }

    if (p === '/messages') {
      return html(res, pages.inboxPage([...state.threads].reverse(), state.hideInboxListingId));
    }
    const threadMatch = p.match(/^\/messages\/t\/([^/]+)$/);
    if (threadMatch) {
      const t = state.threads.find((x) => x.id === threadMatch[1]);
      if (!t) return html(res, '<h1>Not found</h1>', 404);
      if (t.unread) {
        t.unread = false;
        save(state);
      }
      return html(res, pages.threadPage(t));
    }

    return html(res, '<h1>Not found</h1>', 404);
  });
}

export function startMockServer(port = PORT): Promise<http.Server> {
  const server = createServer();
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  startMockServer().then(() => {
    console.log(`[mock-marketplace] listening on http://localhost:${PORT}`);
  });
}
