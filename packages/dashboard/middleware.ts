// Next.js middleware: JWT validation + role-based routing
// mirrors the Authenticating state in the data distribution state chart:
// ValidateToken → AuthorizeRole → grant/deny

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, sessionLandingPath, verifySessionToken } from '@/lib/session'

// routes that require authentication (any role)
const protectedPaths = ['/dashboard', '/alerts', '/subscriptions', '/metrics']

// routes that require admin role
const adminPaths = ['/rules', '/users', '/devices', '/reports', '/health', '/audit']

const publicPaths = ['/sign-in', '/sign-up', '/display', '/api']
const authPaths = ['/sign-in', '/sign-up']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const jwtSecret = process.env.JWT_SECRET
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path))

  if (!jwtSecret) {
    if (isPublicPath) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  if (!token) {
    if (isPublicPath) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  const session = await verifySessionToken(token, jwtSecret)
  if (!session) {
    if (isPublicPath) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  if (authPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.redirect(new URL(sessionLandingPath(session.role), request.url))
  }

  if (adminPaths.some(path => pathname.startsWith(path)) && session.role !== 'admin') {
    return NextResponse.redirect(new URL(sessionLandingPath(session.role), request.url))
  }

  if (protectedPaths.some(path => pathname.startsWith(path)) && session.role === 'viewer') {
    return NextResponse.redirect(new URL(sessionLandingPath(session.role), request.url))
  }

  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
