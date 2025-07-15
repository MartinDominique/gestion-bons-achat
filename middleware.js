import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  const protectedPaths = ['/bons-achat', '/soumissions'];
  const path = req.nextUrl.pathname;

  // non connecté → /login
  if (!session && protectedPaths.some(p => path.startsWith(p))) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // déjà connecté → /bons-achat
  if (session && path === '/login') {
    return NextResponse.redirect(new URL('/bons-achat', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/login', '/bons-achat', '/soumissions'],
};
