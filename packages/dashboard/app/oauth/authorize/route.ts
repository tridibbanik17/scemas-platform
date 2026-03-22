import { oauthClients } from '@scemas/db/schema'
import { eq } from 'drizzle-orm'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session'
import { getDb } from '@/server/cached'
import { generateRandomToken } from '@/server/oauth'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const params = url.searchParams

  const responseType = params.get('response_type')
  const clientId = params.get('client_id')
  const redirectUri = params.get('redirect_uri')
  const scope = params.get('scope') ?? 'read'
  const state = params.get('state')
  const codeChallenge = params.get('code_challenge')
  const codeChallengeMethod = params.get('code_challenge_method')

  if (responseType !== 'code') {
    return Response.json(
      { error: 'unsupported_response_type', error_description: 'only code is supported' },
      { status: 400 },
    )
  }

  if (!clientId || !redirectUri || !codeChallenge) {
    return Response.json(
      { error: 'invalid_request', error_description: 'client_id, redirect_uri, and code_challenge are required' },
      { status: 400 },
    )
  }

  if (codeChallengeMethod !== 'S256') {
    return Response.json(
      { error: 'invalid_request', error_description: 'code_challenge_method must be S256' },
      { status: 400 },
    )
  }

  const db = getDb()
  const client = await db.query.oauthClients.findFirst({
    where: eq(oauthClients.clientId, clientId),
    columns: { clientName: true, redirectUris: true },
  })

  if (!client) {
    return Response.json({ error: 'invalid_client', error_description: 'unknown client_id' }, { status: 400 })
  }

  if (!client.redirectUris.includes(redirectUri)) {
    return Response.json(
      { error: 'invalid_request', error_description: 'redirect_uri does not match any registered URIs' },
      { status: 400 },
    )
  }

  const validScopes = ['read', 'write:operator', 'write:admin']
  const requestedScopes = scope.split(' ').filter(Boolean)
  if (!requestedScopes.every(s => validScopes.includes(s))) {
    return Response.json({ error: 'invalid_scope', error_description: 'unknown scope requested' }, { status: 400 })
  }

  const cookieHeader = request.headers.get('cookie')
  const token = getCookieValue(cookieHeader, SESSION_COOKIE_NAME)
  const jwtSecret = process.env.JWT_SECRET

  if (!token || !jwtSecret) {
    const returnTo = `/oauth/authorize?${params.toString()}`
    return Response.redirect(new URL(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`, url.origin).toString(), 302)
  }

  const session = await verifySessionToken(token, jwtSecret)
  if (!session) {
    const returnTo = `/oauth/authorize?${params.toString()}`
    return Response.redirect(new URL(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`, url.origin).toString(), 302)
  }

  const csrfToken = generateRandomToken(16)

  const consentParams = new URLSearchParams({
    client_id: clientId,
    client_name: client.clientName,
    redirect_uri: redirectUri,
    scope,
    state: state ?? '',
    code_challenge: codeChallenge,
    csrf: csrfToken,
  })

  const headers = new Headers()
  const csrfCookie = [
    `oauth_csrf=${csrfToken}`,
    'Path=/oauth',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=600',
  ]
  if (process.env.NODE_ENV === 'production') csrfCookie.push('Secure')
  headers.append('set-cookie', csrfCookie.join('; '))
  headers.set('location', `/oauth/consent?${consentParams.toString()}`)

  return new Response(null, { status: 302, headers })
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const segment of cookieHeader.split(/;\s*/)) {
    const [key, ...valueParts] = segment.split('=')
    if (key === name) return valueParts.join('=')
  }
  return null
}
