import { TRPCError } from '@trpc/server'

import { getInternalRustUrl } from './env'

const RUST_URL = getInternalRustUrl()

export async function callRustEndpoint(
  path: string,
  options: RequestInit,
): Promise<{ data: unknown; status: number }> {
  let response: Response

  try {
    response = await fetch(`${RUST_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch {
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'rust engine is unavailable',
    })
  }

  return {
    data: await readJsonBody(response),
    status: response.status,
  }
}

export function extractRustErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return null
  }

  return typeof payload.error === 'string' ? payload.error : null
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}
