import { NextResponse } from 'next/server';
import * as repo from '@/db/repo';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = repo.getConversation(id);
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    conversation,
    product: conversation.productId ? repo.getProduct(conversation.productId) : null,
    messages: repo.listMessages(id),
    lead: repo.getLead(id),
  });
}
