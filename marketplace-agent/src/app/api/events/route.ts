import { NextResponse } from 'next/server';
import * as repo from '@/db/repo';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get('limit') || 100);
  return NextResponse.json({ events: repo.listEvents(Math.min(limit, 500)) });
}
