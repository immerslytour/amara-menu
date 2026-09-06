import type { Platform } from '@/lib/types';
import type { MarketplaceAdapter } from './MarketplaceAdapter';
import { FacebookMarketplaceAdapter } from './facebook/FacebookMarketplaceAdapter';
import { MockMarketplaceAdapter } from './mock/MockMarketplaceAdapter';

export function createAdapter(mode: Platform): MarketplaceAdapter {
  return mode === 'facebook' ? new FacebookMarketplaceAdapter() : new MockMarketplaceAdapter();
}

export function currentMode(): Platform {
  return process.env.MARKETPLACE_MODE === 'facebook' ? 'facebook' : 'mock';
}
