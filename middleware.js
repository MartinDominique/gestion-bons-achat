// middleware.js
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(req) {
  let res = NextResponse.next()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return req.cookies.get(name)?.value
        },
        set(name, value, options) {
          req.cookies.set({ name, value, ...options })
          res = NextResponse.next({ request: { headers: req.headers } })
          res.cookies.set({ name, value, ...options })
        },
        remove(name, options) {
          req.cookies.set({ name, value: '', ...options })
          res = NextResponse.next({ request: { headers: req.headers } })
          res.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  const protectedPaths = ['/bons-achat', '/soumissions']
  const path = req.nextUrl.pathname

  // Si pas de session et tentative d'accès aux pages protégées
  if (!session && protectedPaths.some(p => path.startsWith(p))) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Si déjà connecté et va sur /login, rediriger vers bons-achat
  if (session && path === '/login') {
    return NextResponse.redirect(new URL('/bons-achat', req.url))
  }

  return res
}

export const config = {
  matcher: ['/login', '/bons-achat/:path*', '/soumissions/:path*']
}
