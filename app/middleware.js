import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';

export async function middleware(req) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const { data: { session } } = await supabase.auth.getSession();

  // si pas de session et on essaye d'accéder à /bons-achat ou /soumissions
  if (!session && req.nextUrl.pathname.startsWith('/(protected)')) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  // si déjà connecté et on va sur /login, redirige vers /bons-achat
  if (session && req.nextUrl.pathname === '/login') {
    const homeUrl = new URL('/bons-achat', req.url);
    return NextResponse.redirect(homeUrl);
  }

  return res;
}

// Appliquer le middleware seulement sur ces chemins
export const config = {
  matcher: ['/login', '/(protected)/(.*)'],
};
