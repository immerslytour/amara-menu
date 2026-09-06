import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { UPLOADS_DIR, id } from '@/db';
import * as repo from '@/db/repo';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ products: repo.listProducts() });
}

export async function POST(req: Request) {
  const form = await req.formData();

  const title = String(form.get('title') || '').trim();
  const description = String(form.get('description') || '').trim();
  const askingPrice = Number(form.get('askingPrice'));
  const minimumPrice = Number(form.get('minimumPrice'));
  const pickupArea = String(form.get('pickupArea') || '').trim();
  const availability = String(form.get('availability') || '').trim();
  const category = String(form.get('category') || 'Electronics');
  const condition = String(form.get('condition') || 'Used - good');

  const errors: string[] = [];
  if (!title) errors.push('Title is required.');
  if (!Number.isFinite(askingPrice) || askingPrice <= 0) errors.push('Asking price must be a positive number.');
  if (!Number.isFinite(minimumPrice) || minimumPrice <= 0) errors.push('Minimum price must be a positive number.');
  if (Number.isFinite(askingPrice) && Number.isFinite(minimumPrice) && minimumPrice > askingPrice) {
    errors.push('Minimum price cannot be higher than the asking price.');
  }
  if (!pickupArea) errors.push('Pickup area is required.');
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const photos: string[] = [];
  for (const entry of form.getAll('photos')) {
    if (!(entry instanceof File) || !entry.size) continue;
    const ext = path.extname(entry.name) || '.jpg';
    const name = `${id('photo')}${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(await entry.arrayBuffer()));
    photos.push(name);
  }

  const product = repo.createProduct({
    title,
    description,
    photos,
    askingPrice,
    minimumPrice,
    pickupArea,
    availability,
    category,
    condition,
  });
  repo.logEvent({
    type: 'PRODUCT_CREATED',
    productId: product.id,
    message: `Product "${product.title}" created.`,
  });
  return NextResponse.json({ product });
}
