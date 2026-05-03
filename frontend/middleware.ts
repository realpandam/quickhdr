import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MAINTENANCE_MODE = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';

export function middleware(request: NextRequest) {
  if (!MAINTENANCE_MODE) {
    return NextResponse.next();
  }

  // Povol přístup k maintenance stránce samotné
  if (request.nextUrl.pathname === '/maintenance') {
    return NextResponse.next();
  }

  // Přesměruj vše ostatní na /maintenance
  return NextResponse.rewrite(new URL('/maintenance', request.url));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)',
  ],
};