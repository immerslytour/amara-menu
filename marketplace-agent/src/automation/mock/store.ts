import fs from 'node:fs';
import path from 'node:path';

export interface MockListing {
  id: string;
  title: string;
  price: number;
  description: string;
  category: string;
  location: string;
  photos: string[];
  sold: boolean;
  createdAt: string;
}

export interface MockMessage {
  id: string;
  sender: 'BUYER' | 'SELLER';
  text: string;
  timestamp: string;
}

export interface MockThread {
  id: string;
  listingId: string | null;
  listingTitle: string | null;
  buyerName: string;
  messages: MockMessage[];
  unread: boolean;
}

export interface MockState {
  loggedIn: boolean;
  verificationRequired: boolean;
  /** Test hook: renders the marketplace without its "Create new listing" button. */
  breakCreateFlow: boolean;
  /** Test hook: inbox rows omit the listing id, as Facebook's do. */
  hideInboxListingId: boolean;
  listings: MockListing[];
  threads: MockThread[];
  seq: number;
}

const FILE = process.env.MOCK_STATE_FILE
  ? path.resolve(process.env.MOCK_STATE_FILE)
  : path.join(process.cwd(), 'data', 'mock-marketplace.json');

function empty(): MockState {
  return {
    loggedIn: true,
    verificationRequired: false,
    breakCreateFlow: false,
    hideInboxListingId: false,
    listings: [],
    threads: [],
    seq: 1,
  };
}

export function load(): MockState {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    return empty();
  }
}

export function save(state: MockState): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

export function reset(): MockState {
  const s = empty();
  save(s);
  return s;
}

export function nextId(state: MockState, prefix: string): string {
  state.seq += 1;
  return `${prefix}${state.seq}`;
}
