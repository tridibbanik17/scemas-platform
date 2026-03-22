import type { Database } from '@scemas/db'
import { apiTokens } from '@scemas/db/schema'
import { eq, isNull } from 'drizzle-orm'

const TOKEN_PREFIX = 'sk-scemas-'

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return toHex(digest)
}

export type TokenValidationResult =
  | { valid: true; tokenId: string; accountId: string; scopes: string[] }
  | { valid: false; status: number; error: string }

export async function validateToken(
  db: Database,
  authHeader: string | null,
): Promise<TokenValidationResult> {
  if (!authHeader) {
    return {
      valid: false,
      status: 401,
      error: 'missing authorization header. use Authorization: Bearer sk-scemas-...',
    }
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1].startsWith(TOKEN_PREFIX)) {
    return {
      valid: false,
      status: 401,
      error: 'invalid authorization format. use Bearer sk-scemas-...',
    }
  }

  const hash = await hashToken(parts[1])
  const row = await db.query.apiTokens.findFirst({
    where: eq(apiTokens.tokenHash, hash),
    columns: { id: true, accountId: true, scopes: true, expiresAt: true, revokedAt: true },
  })

  if (!row) {
    return { valid: false, status: 401, error: 'invalid token' }
  }

  if (row.revokedAt) {
    return { valid: false, status: 401, error: 'token has been revoked' }
  }

  if (row.expiresAt < new Date()) {
    return { valid: false, status: 401, error: 'token has expired' }
  }

  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .execute()
    .catch(() => {})

  return { valid: true, tokenId: row.id, accountId: row.accountId, scopes: row.scopes }
}

const SCOPE_HIERARCHY: Record<string, string[]> = {
  'write:admin': ['write:admin', 'write:operator', 'read'],
  'write:operator': ['write:operator', 'read'],
  read: ['read'],
}

export function hasScope(granted: string[], required: string): boolean {
  return granted.some(scope => {
    const expanded = SCOPE_HIERARCHY[scope]
    return expanded ? expanded.includes(required) : false
  })
}

export async function countActiveTokens(db: Database, accountId: string): Promise<number> {
  const rows = await db.query.apiTokens.findMany({
    where: (t, { and, eq: e, gt }) =>
      and(e(t.accountId, accountId), isNull(t.revokedAt), gt(t.expiresAt, new Date())),
    columns: { id: true },
  })
  return rows.length
}
