import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optional gate for the dashboard.
 *
 * The agent can open your Facebook session and message buyers as you, so if you
 * expose this app beyond localhost, set DASHBOARD_TOKEN and everything - pages
 * and API alike - requires it. Unset, the app behaves as a plain local tool.
 */
const COOKIE = 'dash_token';

export function middleware(req: NextRequest) {
  const token = process.env.DASHBOARD_TOKEN;
  if (!token) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === '/unlock' || pathname === '/api/unlock') return NextResponse.next();

  const supplied = req.cookies.get(COOKIE)?.value ?? req.headers.get('x-dashboard-token');
  if (supplied === token) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Dashboard is locked. Unlock it at /unlock, or send the x-dashboard-token header.' },
      { status: 401 },
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = '/unlock';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
