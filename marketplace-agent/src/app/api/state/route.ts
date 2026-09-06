import { NextResponse } from 'next/server';
import * as repo from '@/db/repo';

export const dynamic = 'force-dynamic';

export async function GET() {
  const products = repo.listProducts();
  const listings = repo.listListings();
  const conversations = repo.listConversations();
  const leads = repo.listLeads();
  const events = repo.listEvents(60);
  const agent = repo.getAgentState();

  const listingByProduct = new Map(listings.map((l) => [l.productId, l]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const leadByConvo = new Map(leads.map((l) => [l.conversationId, l]));

  const conversationViews = conversations.map((c) => {
    const messages = repo.listMessages(c.id);
    return {
      ...c,
      productTitle: c.productId ? (productById.get(c.productId)?.title ?? null) : null,
      lead: leadByConvo.get(c.id) ?? null,
      lastMessage: messages[messages.length - 1] ?? null,
      // The hot-lead card shows what the BUYER last said, not our own reply.
      lastBuyerMessage: [...messages].reverse().find((m) => m.sender === 'BUYER') ?? null,
    };
  });

  const hotLeads = conversationViews.filter((c) => c.status === 'HOT_LEAD');

  return NextResponse.json({
    agent: {
      ...agent,
      workerAlive:
        agent.workerAlive &&
        !!agent.heartbeatAt &&
        Date.now() - new Date(agent.heartbeatAt).getTime() < 20000,
    },
    stats: {
      totalProducts: products.length,
      activeListings: listings.filter((l) => l.status === 'ACTIVE').length,
      activeConversations: conversations.filter(
        (c) => !['CLOSED', 'SPAM', 'SOLD'].includes(c.status),
      ).length,
      hotLeads: hotLeads.length,
      sales: products.filter((p) => p.status === 'SOLD').length,
    },
    products: products.map((p) => ({ ...p, listing: listingByProduct.get(p.id) ?? null })),
    conversations: conversationViews,
    hotLeads,
    events,
  });
}
