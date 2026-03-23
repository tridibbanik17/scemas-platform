import { Container, getContainer } from '@cloudflare/containers'

interface Env {
  ENGINE: DurableObjectNamespace<ScemaEngine>
  DATABASE_URL: string
  JWT_SECRET: string
  DEVICE_AUTH_SECRET: string
}

type RequiredContainerEnvKey = 'DATABASE_URL' | 'JWT_SECRET' | 'DEVICE_AUTH_SECRET'

const REQUIRED_CONTAINER_ENV_KEYS: RequiredContainerEnvKey[] = [
  'DATABASE_URL',
  'JWT_SECRET',
  'DEVICE_AUTH_SECRET',
]

export class ScemaEngine extends Container<Env> {
  defaultPort = 3001
  requiredPorts = [3001]
  sleepAfter = '30s'
  pingEndpoint = '/internal/health'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const missingEnvKeys = getMissingContainerEnvKeys(env)
    if (missingEnvKeys.length > 0) {
      console.error('container bootstrap configuration invalid', { missingEnvKeys })

      return Response.json(
        {
          error: `container bootstrap configuration invalid: missing ${missingEnvKeys.join(', ')}`,
        },
        { status: 500 },
      )
    }

    const container = getContainer(env.ENGINE)
    try {
      await container.startAndWaitForPorts({
        ports: 3001,
        startOptions: { envVars: buildContainerEnv(env) },
        cancellationOptions: { portReadyTimeoutMS: 30_000 },
      })

      return await container.fetch(request)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown container startup failure'
      console.error('container bootstrap failed', { message })
      return Response.json({ error: `container bootstrap failed: ${message}` }, { status: 503 })
    }
  },
}

function buildContainerEnv(env: Env): Record<string, string> {
  return {
    DATABASE_URL: env.DATABASE_URL,
    JWT_SECRET: env.JWT_SECRET,
    DEVICE_AUTH_SECRET: env.DEVICE_AUTH_SECRET,
    DEVICE_CATALOG_PATH: 'data/hamilton-sensor-catalog.json',
    RUST_LOG: 'info',
    RUST_PORT: '3001',
  }
}

function getMissingContainerEnvKeys(env: Env): RequiredContainerEnvKey[] {
  return REQUIRED_CONTAINER_ENV_KEYS.filter(key => getContainerEnvValue(env, key) === null)
}

function getContainerEnvValue(env: Env, key: RequiredContainerEnvKey): string | null {
  const value = env[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}
