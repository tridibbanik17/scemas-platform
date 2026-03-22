import { oauthCodes } from '@scemas/db/schema'
import { eq } from 'drizzle-orm'
import { getDb } from '@/server/cached'
import { hashToken, verifyPkceS256, createTokenPair, refreshTokenPair } from '@/server/oauth'

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? ''
  let params: URLSearchParams

  if (contentType.includes('application/x-www-form-urlencoded')) {
    params = new URLSearchParams(await request.text())
  } else if (contentType.includes('application/json')) {
    const body = await request.json()
    params = new URLSearchParams(body as Record<string, string>)
  } else {
    return oauthError('invalid_request', 'content-type must be application/x-www-form-urlencoded or application/json')
  }

  const grantType = params.get('grant_type')

  if (grantType === 'authorization_code') {
    return handleAuthorizationCode(params)
  }

  if (grantType === 'refresh_token') {
    return handleRefreshToken(params)
  }

  return oauthError('unsupported_grant_type', 'only authorization_code and refresh_token are supported')
}

async function handleAuthorizationCode(params: URLSearchParams): Promise<Response> {
  const code = params.get('code')
  const redirectUri = params.get('redirect_uri')
  const clientId = params.get('client_id')
  const codeVerifier = params.get('code_verifier')

  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return oauthError('invalid_request', 'code, redirect_uri, client_id, and code_verifier are required')
  }

  const db = getDb()
  const codeHash = await hashToken(code)

  const row = await db.query.oauthCodes.findFirst({
    where: eq(oauthCodes.codeHash, codeHash),
    columns: {
      id: true,
      clientId: true,
      accountId: true,
      redirectUri: true,
      scope: true,
      codeChallenge: true,
      expiresAt: true,
      usedAt: true,
    },
  })

  if (!row) {
    return oauthError('invalid_grant', 'unknown authorization code')
  }

  if (row.usedAt) {
    return oauthError('invalid_grant', 'authorization code has already been used')
  }

  if (row.expiresAt < new Date()) {
    return oauthError('invalid_grant', 'authorization code has expired')
  }

  if (row.clientId !== clientId) {
    return oauthError('invalid_grant', 'client_id mismatch')
  }

  if (row.redirectUri !== redirectUri) {
    return oauthError('invalid_grant', 'redirect_uri mismatch')
  }

  const pkceValid = await verifyPkceS256(codeVerifier, row.codeChallenge)
  if (!pkceValid) {
    return oauthError('invalid_grant', 'code_verifier does not match code_challenge')
  }

  await db.update(oauthCodes).set({ usedAt: new Date() }).where(eq(oauthCodes.id, row.id))

  const tokens = await createTokenPair(db, {
    clientId: row.clientId,
    accountId: row.accountId,
    scope: row.scope,
  })

  return Response.json(
    {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      scope: row.scope,
    },
    { headers: { 'cache-control': 'no-store', pragma: 'no-cache' } },
  )
}

async function handleRefreshToken(params: URLSearchParams): Promise<Response> {
  const refreshToken = params.get('refresh_token')
  const clientId = params.get('client_id')

  if (!refreshToken || !clientId) {
    return oauthError('invalid_request', 'refresh_token and client_id are required')
  }

  const db = getDb()
  const result = await refreshTokenPair(db, refreshToken, clientId)

  if (!result.ok) {
    return oauthError('invalid_grant', result.error)
  }

  return Response.json(
    {
      access_token: result.accessToken,
      token_type: 'Bearer',
      expires_in: result.expiresIn,
      refresh_token: result.refreshToken,
      scope: result.scope,
    },
    { headers: { 'cache-control': 'no-store', pragma: 'no-cache' } },
  )
}

function oauthError(error: string, description: string, status = 400): Response {
  return Response.json({ error, error_description: description }, { status })
}
