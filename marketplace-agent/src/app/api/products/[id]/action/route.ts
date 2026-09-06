import { NextResponse } from 'next/server';
import * as repo from '@/db/repo';
import { generateListing } from '@/ai/listingGenerator';
import { nowIso } from '@/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = repo.getProduct(id);
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');

  switch (action) {
    case 'generate': {
      const draft = await generateListing({
        title: product.title,
        description: product.description,
        askingPrice: product.askingPrice,
        pickupArea: product.pickupArea,
        availability: product.availability,
        photoCount: product.photos.length,
      });
      repo.updateProduct(id, {
        generatedTitle: draft.title,
        generatedDescription: draft.description,
        approvedAt: null,
      });
      repo.logEvent({
        type: 'LISTING_GENERATED',
        productId: id,
        message:
          draft.source === 'claude'
            ? 'Claude generated the listing copy. Review it before publishing.'
            : 'Generated listing copy from your own text (Claude API key not set).',
        meta: { warnings: draft.warnings },
      });
      return NextResponse.json({ draft, product: repo.getProduct(id) });
    }

    case 'saveDraft': {
      repo.updateProduct(id, {
        generatedTitle: String(body.title || product.generatedTitle || product.title),
        generatedDescription: String(body.description || product.generatedDescription || product.description),
      });
      return NextResponse.json({ product: repo.getProduct(id) });
    }

    case 'approveAndPublish': {
      if (!product.generatedTitle) {
        return NextResponse.json(
          { error: 'Generate the listing first, then approve it.' },
          { status: 400 },
        );
      }
      repo.updateProduct(id, { approvedAt: nowIso() });
      repo.logEvent({
        type: 'LISTING_APPROVED',
        productId: id,
        message: `You approved the listing for "${product.title}".`,
      });
      const cmd = repo.enqueueCommand('PUBLISH_LISTING', { productId: id });
      return NextResponse.json({ queued: cmd.id, product: repo.getProduct(id) });
    }

    case 'retryPublish': {
      const cmd = repo.enqueueCommand('RETRY_LISTING', { productId: id });
      repo.logEvent({ type: 'PUBLISH_RETRY', productId: id, message: 'Retrying the publish action.' });
      return NextResponse.json({ queued: cmd.id });
    }

    case 'toggleAi': {
      const next = !product.aiEnabled;
      repo.updateProduct(id, { aiEnabled: next });
      repo.logEvent({
        type: 'PRODUCT_AI_TOGGLED',
        productId: id,
        message: `AI replies ${next ? 'enabled' : 'disabled'} for "${product.title}".`,
      });
      return NextResponse.json({ product: repo.getProduct(id) });
    }

    case 'setStatus': {
      const status = String(body.status || '');
      const allowed = ['DRAFT', 'PUBLISHING', 'ACTIVE', 'FAILED', 'PAUSED', 'SOLD'];
      if (!allowed.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      repo.setProductStatus(id, status as any);
      repo.logEvent({ type: 'PRODUCT_STATUS', productId: id, message: `"${product.title}" marked ${status}.` });
      if (status === 'SOLD') {
        for (const convo of repo.listConversations().filter((c) => c.productId === id)) {
          repo.updateConversation(convo.id, { status: 'SOLD', aiEnabled: false });
        }
      }
      return NextResponse.json({ product: repo.getProduct(id) });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
