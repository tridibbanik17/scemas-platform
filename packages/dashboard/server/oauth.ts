import type { Database } from '@scemas/db'
import { oauthTokens } from '@scemas/db/schema'
import { eq } from 'drizzle-orm'

export const TOKEN_EXPIRY = { access: 900, refresh: 604_800 } as const

export function generateRandomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return toHex(buffer)
}

export async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return toHex(new Uint8Array(digest))
}

export async function verifyPkceS256(verifier: string, challenge: string): Promise<boolean> {
  const encoded = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const hashed = base64UrlEncode(new Uint8Array(digest))
  return hashed === challenge
}

export type OAuthValidationResult =
  | { valid: true; tokenId: string; accountId: string; scopes: string[] }
  | { valid: false; status: number; error: string }

export async function validateOAuthToken(
  db: Database,
  bearerToken: string,
): Promise<OAuthValidationResult> {
  const tokenHash = await hashToken(bearerToken)

  const row = await db.query.oauthTokens.findFirst({
    where: eq(oauthTokens.accessTokenHash, tokenHash),
    columns: {
      id: true,
      accountId: true,
      scope: true,
      accessExpiresAt: true,
      revokedAt: true,
    },
  })

  if (!row) {
    return { valid: false, status: 401, error: 'invalid token' }
  }

  if (row.revokedAt) {
    return { valid: false, status: 401, error: 'token has been revoked' }
  }

  if (row.accessExpiresAt < new Date()) {
    return { valid: false, status: 401, error: 'token has expired' }
  }

  const scopes = row.scope.split(' ').filter(Boolean)
  return { valid: true, tokenId: row.id, accountId: row.accountId, scopes }
}

export async function createTokenPair(
  db: Database,
  params: { clientId: string; accountId: string; scope: string },
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const accessToken = generateRandomToken(32)
  const refreshToken = generateRandomToken(32)
  const [accessHash, refreshHash] = await Promise.all([
    hashToken(accessToken),
    hashToken(refreshToken),
  ])

  const now = new Date()
  await db.insert(oauthTokens).values({
    accessTokenHash: accessHash,
    refreshTokenHash: refreshHash,
    clientId: params.clientId,
    accountId: params.accountId,
    scope: params.scope,
    accessExpiresAt: new Date(now.getTime() + TOKEN_EXPIRY.access * 1000),
    refreshExpiresAt: new Date(now.getTime() + TOKEN_EXPIRY.refresh * 1000),
  })

  return { accessToken, refreshToken, expiresIn: TOKEN_EXPIRY.access }
}

export async function refreshTokenPair(
  db: Database,
  rawRefreshToken: string,
  clientId: string,
): Promise<
  | { ok: true; accessToken: string; refreshToken: string; expiresIn: number; scope: string }
  | { ok: false; error: string }
> {
  const tokenHash = await hashToken(rawRefreshToken)

  const row = await db.query.oauthTokens.findFirst({
    where: eq(oauthTokens.refreshTokenHash, tokenHash),
    columns: {
      id: true,
      clientId: true,
      accountId: true,
      scope: true,
      refreshExpiresAt: true,
      revokedAt: true,
    },
  })

  if (!row) {
    return { ok: false, error: 'invalid refresh token' }
  }

  if (row.revokedAt) {
    return { ok: false, error: 'refresh token has been revoked' }
  }

  if (row.refreshExpiresAt && row.refreshExpiresAt < new Date()) {
    return { ok: false, error: 'refresh token has expired' }
  }

  if (row.clientId !== clientId) {
    return { ok: false, error: 'client_id mismatch' }
  }

  await db.update(oauthTokens).set({ revokedAt: new Date() }).where(eq(oauthTokens.id, row.id))

  const pair = await createTokenPair(db, {
    clientId: row.clientId,
    accountId: row.accountId,
    scope: row.scope,
  })

  return { ok: true, ...pair, scope: row.scope }
}

export async function revokeByTokenHash(
  db: Database,
  rawToken: string,
): Promise<void> {
  const tokenHash = await hashToken(rawToken)

  const byAccess = await db.query.oauthTokens.findFirst({
    where: eq(oauthTokens.accessTokenHash, tokenHash),
    columns: { id: true, revokedAt: true },
  })

  if (byAccess && !byAccess.revokedAt) {
    await db.update(oauthTokens).set({ revokedAt: new Date() }).where(eq(oauthTokens.id, byAccess.id))
    return
  }

  const byRefresh = await db.query.oauthTokens.findFirst({
    where: eq(oauthTokens.refreshTokenHash, tokenHash),
    columns: { id: true, revokedAt: true },
  })

  if (byRefresh && !byRefresh.revokedAt) {
    await db.update(oauthTokens).set({ revokedAt: new Date() }).where(eq(oauthTokens.id, byRefresh.id))
  }
}

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
