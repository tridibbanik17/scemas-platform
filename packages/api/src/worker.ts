import { Container, getContainer } from '@cloudflare/containers'

interface Env {
  ENGINE: DurableObjectNamespace<ScemaEngine>
  DATABASE_URL: string
  JWT_SECRET: string
  DEVICE_AUTH_SECRET: string
}

export class ScemaEngine extends Container<Env> {
  defaultPort = 3001
  requiredPorts = [3001]
  sleepAfter = '30s'
  pingEndpoint = 'container/internal/health'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
    DEVICE_CATALOG_PATH: 'data/hamilton-sensors.json',
    RUST_LOG: 'info',
    RUST_PORT: '3001',
  }
}
