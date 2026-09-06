import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { UPLOADS_DIR } from '@/db';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const safe = path.basename(name);
  const full = path.join(UPLOADS_DIR, safe);
  if (!full.startsWith(UPLOADS_DIR) || !fs.existsSync(full)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = fs.readFileSync(full);
  return new NextResponse(new Uint8Array(body), {
    headers: { 'content-type': TYPES[path.extname(safe).toLowerCase()] || 'application/octet-stream' },
  });
}
