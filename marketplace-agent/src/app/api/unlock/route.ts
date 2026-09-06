import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const expected = process.env.DASHBOARD_TOKEN;
  if (!expected) return NextResponse.json({ ok: true, note: 'No token is configured.' });

  const body = await req.json().catch(() => ({}));
  if (String(body.token || '') !== expected) {
    return NextResponse.json({ error: 'Wrong token.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('dash_token', expected, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
