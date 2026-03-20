import { RoleSchema, type Role } from '@scemas/types'
import { z } from 'zod'

const JwtHeaderSchema = z.object({ alg: z.literal('HS256'), typ: z.string().optional() })

const SessionClaimsSchema = z.object({
  sub: z.string().uuid(),
  role: RoleSchema,
  exp: z.number().int().positive(),
})

const textEncoder = new TextEncoder()
const keyCache = new Map<string, Promise<CryptoKey>>()

export const SESSION_COOKIE_NAME = 'scemas-token'

export type SessionClaims = z.infer<typeof SessionClaimsSchema>

export type SessionUser = { id: string; role: Role }

export function sessionLandingPath(role: Role): string {
  if (role === 'admin') {
    return '/rules'
  }
  if (role === 'viewer') {
    return '/display'
  }
  return '/dashboard'
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionClaims | null> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts
  const header = parseJsonSegment(headerSegment, JwtHeaderSchema)
  if (!header) {
    return null
  }

  const validSignature = await verifyHmacSignature(
    `${headerSegment}.${payloadSegment}`,
    signatureSegment,
    secret,
  )

  if (!validSignature) {
    return null
  }

  const claims = parseJsonSegment(payloadSegment, SessionClaimsSchema)
  if (!claims) {
    return null
  }

  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    return null
  }

  return claims
}

export async function resolveSessionUser(
  cookieHeader: string | null,
  secret: string,
): Promise<SessionUser | null> {
  const token = getCookieValue(cookieHeader, SESSION_COOKIE_NAME)
  if (!token) {
    return null
  }

  const claims = await verifySessionToken(token, secret)
  if (!claims) {
    return null
  }

  return { id: claims.sub, role: claims.role }
}

export function serializeSessionCookie(token: string, expiresAtIso: string): string {
  const expiresAt = new Date(expiresAtIso)
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))

  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`,
  ]

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure')
  }

  return parts.join('; ')
}

export function serializeClearedSessionCookie(): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure')
  }

  return parts.join('; ')
}

export function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null
  }

  for (const segment of cookieHeader.split(/;\s*/)) {
    const [key, ...valueParts] = segment.split('=')
    if (key === name) {
      return valueParts.join('=')
    }
  }

  return null
}

async function verifyHmacSignature(
  input: string,
  signatureSegment: string,
  secret: string,
): Promise<boolean> {
  const key = await getHmacKey(secret)
  const signatureBytes = base64UrlToArrayBuffer(signatureSegment)

  return crypto.subtle.verify('HMAC', key, signatureBytes, textEncoder.encode(input))
}

function getHmacKey(secret: string): Promise<CryptoKey> {
  const cachedKey = keyCache.get(secret)
  if (cachedKey) {
    return cachedKey
  }

  const key = crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  keyCache.set(secret, key)
  return key
}

function parseJsonSegment<T>(segment: string, schema: z.ZodSchema<T>): T | null {
  try {
    const decoded = base64UrlToString(segment)
    const json = JSON.parse(decoded)
    const parsed = schema.safeParse(json)

    if (!parsed.success) {
      return null
    }

    return parsed.data
  } catch {
    return null
  }
}

function base64UrlToString(segment: string): string {
  return atob(normalizeBase64Url(segment))
}

function base64UrlToArrayBuffer(segment: string): ArrayBuffer {
  const decoded = base64UrlToString(segment)
  const buffer = new ArrayBuffer(decoded.length)
  const view = new Uint8Array(buffer)

  for (const [index, character] of Array.from(decoded).entries()) {
    view[index] = character.charCodeAt(0)
  }

  return buffer
}

function normalizeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  const remainder = normalized.length % 4

  if (remainder === 0) {
    return normalized
  }

  return `${normalized}${'='.repeat(4 - remainder)}`
}
