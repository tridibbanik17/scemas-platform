const DEFAULT_INTERNAL_RUST_URL = 'http://localhost:3001'

export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set')
  }
  return databaseUrl
}

export function getJwtSecret(): string {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not set')
  }
  return jwtSecret
}

export function getInternalRustUrl(): string {
  return process.env.INTERNAL_RUST_URL ?? DEFAULT_INTERNAL_RUST_URL
}

export function getDeviceAuthSecret(): string {
  const deviceAuthSecret = process.env.DEVICE_AUTH_SECRET
  if (!deviceAuthSecret) {
    throw new Error('DEVICE_AUTH_SECRET not set')
  }
  return deviceAuthSecret
}

export function buildDeviceAuthToken(): string {
  return getDeviceAuthSecret()
}
