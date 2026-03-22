import type { ZodType } from 'zod'
import { z } from 'zod'
import { validateToken, hasScope } from './api-tokens'
import { getDb } from './cached'

type PublicCachePolicy = 'live' | 'trend' | 'metadata'

const publicCacheControlByPolicy: Record<PublicCachePolicy, string> = {
  live: 'public, max-age=30, stale-while-revalidate=30',
  trend: 'public, max-age=60, stale-while-revalidate=300',
  metadata: 'public, max-age=3600, stale-while-revalidate=86400',
}

export function createPublicApiResponse(payload: unknown, policy: PublicCachePolicy): Response {
  return Response.json(payload, {
    headers: { 'Cache-Control': publicCacheControlByPolicy[policy] },
  })
}

export function createPublicApiBadRequestResponse(message: string): Response {
  return Response.json({ error: message }, { status: 400 })
}

export function createPublicApiNotFoundResponse(message: string): Response {
  return Response.json({ error: message }, { status: 404 })
}

export function getRequestSearchParams(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries())
}

export function parsePublicApiInput<TSchema extends ZodType>(
  schema: TSchema,
  input: unknown,
): { success: true; data: z.infer<TSchema> } | { success: false; error: string } {
  const parsedInput = schema.safeParse(input)
  if (parsedInput.success) {
    return { success: true, data: parsedInput.data }
  }

  const errorMessage = parsedInput.error.issues
    .map(issue => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'request'
      return `${path}: ${issue.message}`
    })
    .join('; ')

  return { success: false, error: errorMessage || 'invalid request parameters' }
}

export type ScopedAuthResult = { tokenId: string; accountId: string; scopes: string[] }

export async function withScopedAuth(
  request: Request,
  requiredScope: string,
  handler: (auth: ScopedAuthResult) => Promise<Response>,
): Promise<Response> {
  const result = await validateToken(getDb(), request.headers.get('authorization'))
  if (!result.valid) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  if (!hasScope(result.scopes, requiredScope)) {
    return Response.json(
      { error: `insufficient scope: requires ${requiredScope}` },
      { status: 403 },
    )
  }

  return handler({ tokenId: result.tokenId, accountId: result.accountId, scopes: result.scopes })
}

export async function withApiTokenAuth(
  request: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  return withScopedAuth(request, 'read', () => handler())
}
