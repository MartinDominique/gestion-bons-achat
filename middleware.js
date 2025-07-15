import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  // Chemins protégés
  const protectedPaths = ['/bons-achat', '/soumissions'];

  const path = req.nextUrl.pathname;

  // 1) Pas connecté ET on demande une page protégée → /login
  if (!session && protectedPaths.some(p => path.startsWith(p))) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // 2) Déjà connecté ET on va sur /login → /bons-achat
  if (session && path === '/login') {
    return NextResponse.redirect(new URL('/bons-achat', req.url));
  }

  return res;
}

// Le middleware ne s’exécute que sur ces routes
export const config = {
  matcher: ['/login', '/bons-achat', '/soumissions'],
};
