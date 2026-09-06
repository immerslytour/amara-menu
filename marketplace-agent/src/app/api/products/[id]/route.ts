import { NextResponse } from 'next/server';
import * as repo from '@/db/repo';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = repo.getProduct(id);
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    product,
    listing: repo.getListingForProduct(id),
  });
}

const EDITABLE = [
  'title',
  'description',
  'pickupArea',
  'availability',
  'category',
  'condition',
] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = repo.getProduct(id);
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (typeof body[key] === 'string') patch[key] = body[key].trim();
  }

  const askingPrice = body.askingPrice === undefined ? product.askingPrice : Number(body.askingPrice);
  const minimumPrice = body.minimumPrice === undefined ? product.minimumPrice : Number(body.minimumPrice);

  const errors: string[] = [];
  if (patch.title !== undefined && !patch.title) errors.push('Title cannot be empty.');
  if (!Number.isFinite(askingPrice) || askingPrice <= 0) errors.push('Asking price must be a positive number.');
  if (!Number.isFinite(minimumPrice) || minimumPrice <= 0) errors.push('Minimum price must be a positive number.');
  if (minimumPrice > askingPrice) errors.push('Minimum price cannot be higher than the asking price.');
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });

  patch.askingPrice = askingPrice;
  patch.minimumPrice = minimumPrice;

  const updated = repo.updateProduct(id, patch as never);

  const listing = repo.getListingForProduct(id);
  const priceChanged = askingPrice !== product.askingPrice;
  repo.logEvent({
    type: 'PRODUCT_EDITED',
    productId: id,
    message: `You edited "${updated!.title}".`,
    meta: { priceChanged },
  });

  // Be honest about what an edit does and does not do.
  const warnings: string[] = [];
  if (listing?.status === 'ACTIVE' && (priceChanged || patch.title !== undefined || patch.description !== undefined)) {
    warnings.push(
      'The listing is already published. These edits apply to future replies and re-publishes only - the live marketplace listing is unchanged.',
    );
  }
  return NextResponse.json({ product: updated, warnings });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = repo.getProduct(id);
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const listing = repo.getListingForProduct(id);
  if (listing?.status === 'ACTIVE') {
    return NextResponse.json(
      {
        error:
          'This product is still listed on the marketplace. Mark it sold (which takes the listing down) before deleting it here.',
      },
      { status: 409 },
    );
  }

  repo.deleteProduct(id);
  repo.logEvent({ type: 'PRODUCT_DELETED', message: `Deleted "${product.title}".` });
  return NextResponse.json({ ok: true });
}
