import type { ZodTypeAny } from 'zod'
import { z } from 'zod'

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

export function parsePublicApiInput<TSchema extends ZodTypeAny>(
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
