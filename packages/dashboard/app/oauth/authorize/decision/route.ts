import { oauthCodes } from '@scemas/db/schema'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session'
import { getDb } from '@/server/cached'
import { generateRandomToken, hashToken } from '@/server/oauth'

export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData()
  const decision = formData.get('decision') as string
  const clientId = formData.get('client_id') as string
  const redirectUri = formData.get('redirect_uri') as string
  const scope = formData.get('scope') as string
  const state = formData.get('state') as string
  const codeChallenge = formData.get('code_challenge') as string
  const csrf = formData.get('csrf') as string

  if (!clientId || !redirectUri || !codeChallenge) {
    return Response.json({ error: 'invalid_request' }, { status: 400 })
  }

  const cookieHeader = request.headers.get('cookie')
  const csrfCookie = getCookieValue(cookieHeader, 'oauth_csrf')
  if (!csrfCookie || csrfCookie !== csrf) {
    return Response.json({ error: 'invalid_request', error_description: 'CSRF validation failed' }, { status: 403 })
  }

  const sessionToken = getCookieValue(cookieHeader, SESSION_COOKIE_NAME)
  const jwtSecret = process.env.JWT_SECRET
  if (!sessionToken || !jwtSecret) {
    return Response.json({ error: 'access_denied', error_description: 'not authenticated' }, { status: 401 })
  }

  const session = await verifySessionToken(sessionToken, jwtSecret)
  if (!session) {
    return Response.json({ error: 'access_denied', error_description: 'invalid session' }, { status: 401 })
  }

  const redirect = new URL(redirectUri)

  if (decision !== 'allow') {
    redirect.searchParams.set('error', 'access_denied')
    if (state) redirect.searchParams.set('state', state)

    return new Response(null, {
      status: 302,
      headers: { location: redirect.toString(), 'set-cookie': clearCsrfCookie() },
    })
  }

  const code = generateRandomToken(32)
  const codeHash = await hashToken(code)

  const db = getDb()
  await db.insert(oauthCodes).values({
    codeHash,
    clientId,
    accountId: session.sub,
    redirectUri,
    scope: scope || 'read',
    codeChallenge,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  })

  redirect.searchParams.set('code', code)
  if (state) redirect.searchParams.set('state', state)

  return new Response(null, {
    status: 302,
    headers: { location: redirect.toString(), 'set-cookie': clearCsrfCookie() },
  })
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const segment of cookieHeader.split(/;\s*/)) {
    const [key, ...valueParts] = segment.split('=')
    if (key === name) return valueParts.join('=')
  }
  return null
}

function clearCsrfCookie(): string {
  return 'oauth_csrf=; Path=/oauth; HttpOnly; SameSite=Lax; Max-Age=0'
}
