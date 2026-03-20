import { TRPCError } from '@trpc/server'
import { getInternalRustUrl } from './env'

type WorkerServiceBinding = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export async function callRustEndpoint(
  path: string,
  options: RequestInit,
): Promise<{ data: unknown; status: number }> {
  const request = buildRustRequest(path, options)
  let response: Response

  try {
    response = await request.fetcher(request.url, request.init)
  } catch (error) {
    console.error('rust proxy fetch failed', {
      path,
      target: request.target,
      error: error instanceof Error ? error.message : 'unknown error',
    })
    throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'rust engine is unavailable' })
  }

  if (!response.ok) {
    console.error('rust proxy returned non-ok status', {
      path,
      target: request.target,
      status: response.status,
    })
  }

  return { data: await readJsonBody(response), status: response.status }
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

function buildRustRequest(
  path: string,
  options: RequestInit,
): {
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  init: RequestInit
  target: string
  url: string
} {
  const init = { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }

  const serviceBinding = getRustServiceBinding()
  if (serviceBinding) {
    return {
      fetcher: serviceBinding.fetch.bind(serviceBinding),
      init,
      target: 'service-binding:SCEMAS_API',
      url: `https://scemas-api${path}`,
    }
  }

  const rustUrl = getInternalRustUrl()
  return { fetcher: fetch, init, target: rustUrl, url: `${rustUrl}${path}` }
}

function getRustServiceBinding(): WorkerServiceBinding | null {
  if (typeof globalThis.caches === 'undefined') {
    return null
  }

  try {
    const { getCloudflareContext } = require('@opennextjs/cloudflare')
    const context = getCloudflareContext()

    if (!isCloudflareRuntimeContext(context)) {
      return null
    }

    const env = context.env
    if (!env) {
      return null
    }

    const binding = env.SCEMAS_API
    return isWorkerServiceBinding(binding) ? binding : null
  } catch {
    return null
  }
}

function isCloudflareRuntimeContext(value: unknown): value is { env?: Record<string, unknown> } {
  return typeof value === 'object' && value !== null
}

function isWorkerServiceBinding(value: unknown): value is WorkerServiceBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fetch' in value &&
    typeof value.fetch === 'function'
  )
}
