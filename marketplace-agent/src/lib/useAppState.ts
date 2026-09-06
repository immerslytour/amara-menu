'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, Conversation, Lead, Listing, Message, Product } from './types';

export interface ConversationView extends Conversation {
  productTitle: string | null;
  lead: Lead | null;
  lastMessage: Message | null;
  lastBuyerMessage: Message | null;
}

export interface ProductView extends Product {
  listing: Listing | null;
}

export interface AppState {
  agent: {
    running: boolean;
    mode: string;
    workerAlive: boolean;
    browserOpen: boolean;
    loggedIn: boolean;
    needsVerification: boolean;
    lastActivity: string | null;
    lastActivityAt: string | null;
    lastError: string | null;
  };
  stats: {
    totalProducts: number;
    activeListings: number;
    activeConversations: number;
    hotLeads: number;
    sales: number;
  };
  products: ProductView[];
  conversations: ConversationView[];
  hotLeads: ConversationView[];
  events: AgentEvent[];
}

/** Polls the server every few seconds. Deliberately not a websocket - simple wins. */
export function useAppState(intervalMs = 3000) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (!res.ok) throw new Error(`state request failed (${res.status})`);
      const json = (await res.json()) as AppState;
      if (alive.current) {
        setState(json);
        setError(null);
      }
    } catch (err) {
      if (alive.current) setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [refresh, intervalMs]);

  return { state, error, refresh };
}

export async function post(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}
