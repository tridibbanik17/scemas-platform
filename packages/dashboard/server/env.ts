const DEFAULT_INTERNAL_RUST_URL = 'http://localhost:3001'

type CloudflareRuntimeContext = { env?: Record<string, unknown> }

export function getDatabaseUrl(): string {
  return getRequiredEnv('DATABASE_URL')
}

export function getJwtSecret(): string {
  return getRequiredEnv('JWT_SECRET')
}

export function getInternalRustUrl(): string {
  return getOptionalEnv('INTERNAL_RUST_URL') ?? DEFAULT_INTERNAL_RUST_URL
}

export function getDeviceAuthSecret(): string {
  return getRequiredEnv('DEVICE_AUTH_SECRET')
}

export function buildDeviceAuthToken(): string {
  return getDeviceAuthSecret()
}

function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name)
  if (!value) {
    throw new Error(`${name} not set`)
  }
  return value
}

function getOptionalEnv(name: string): string | null {
  const runtimeValue = getCloudflareEnvValue(name)
  if (runtimeValue) {
    return runtimeValue
  }

  return process.env[name] ?? null
}

function getCloudflareEnvValue(name: string): string | null {
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

    const value = env[name]
    return typeof value === 'string' && value.length > 0 ? value : null
  } catch {
    return null
  }
}

function isCloudflareRuntimeContext(value: unknown): value is CloudflareRuntimeContext {
  return typeof value === 'object' && value !== null
}
