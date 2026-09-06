import { NextResponse } from 'next/server';
import * as repo from '@/db/repo';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ conversations: repo.listConversations() });
}
