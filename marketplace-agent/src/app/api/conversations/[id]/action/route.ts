import { NextResponse } from 'next/server';
import * as repo from '@/db/repo';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const convo = repo.getConversation(id);
  if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');

  switch (action) {
    case 'toggleAi': {
      const next = !convo.aiEnabled;
      repo.updateConversation(id, { aiEnabled: next, humanTakeover: next ? false : convo.humanTakeover });
      repo.logEvent({
        type: 'CONVERSATION_AI_TOGGLED',
        conversationId: id,
        message: `AI replies ${next ? 'resumed' : 'paused'} for ${convo.buyerName}.`,
      });
      return NextResponse.json({ conversation: repo.getConversation(id) });
    }

    case 'takeOver': {
      repo.updateConversation(id, { aiEnabled: false, humanTakeover: true });
      repo.logEvent({
        type: 'HUMAN_TOOK_OVER',
        conversationId: id,
        message: `You took over the conversation with ${convo.buyerName}.`,
      });
      return NextResponse.json({ conversation: repo.getConversation(id) });
    }

    case 'openChat': {
      const cmd = repo.enqueueCommand('OPEN_CONVERSATION', { conversationId: id });
      return NextResponse.json({ queued: cmd.id });
    }

    case 'send': {
      const text = String(body.text || '').trim();
      if (!text) return NextResponse.json({ error: 'Message is empty' }, { status: 400 });
      const cmd = repo.enqueueCommand('SEND_MESSAGE', { conversationId: id, text });
      return NextResponse.json({ queued: cmd.id });
    }

    case 'markSold': {
      repo.updateConversation(id, { status: 'SOLD', aiEnabled: false });
      if (convo.productId) {
        repo.setProductStatus(convo.productId, 'SOLD');
        for (const other of repo.listConversations().filter((c) => c.productId === convo.productId && c.id !== id)) {
          repo.updateConversation(other.id, { status: 'CLOSED', aiEnabled: false });
        }
      }
      repo.logEvent({
        type: 'MARKED_SOLD',
        conversationId: id,
        productId: convo.productId,
        message: `Marked sold to ${convo.buyerName}${convo.agreedPrice ? ` for $${convo.agreedPrice}` : ''}.`,
      });
      return NextResponse.json({ conversation: repo.getConversation(id) });
    }

    case 'close': {
      repo.updateConversation(id, { status: 'CLOSED', aiEnabled: false });
      return NextResponse.json({ conversation: repo.getConversation(id) });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
