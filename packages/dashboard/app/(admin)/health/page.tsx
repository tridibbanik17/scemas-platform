import { ingestionFailures, platformStatus } from '@scemas/db/schema'
import { desc, eq } from 'drizzle-orm'
// MonitorSCEMASPlatformStatus boundary (DataDistributionManager)
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveSessionUser, sessionLandingPath } from '@/lib/session'
import { getDb } from '@/server/cached'
import { getJwtSecret } from '@/server/env'
import { callRustEndpoint } from '@/server/rust-client'
import { IngestionFunnelWrapper, PlatformHealthWrapper } from './health-charts'

type IngestionHealth = { total_received: number; total_accepted: number; total_rejected: number }

export default async function HealthPage() {
  const db = getDb()
  const [statusRows, failureRows, ingestionHealth] = await Promise.all([
    db.query.platformStatus.findMany({ orderBy: [desc(platformStatus.time)], limit: 10 }),
    db.query.ingestionFailures.findMany({
      where: eq(ingestionFailures.status, 'pending'),
      orderBy: [desc(ingestionFailures.createdAt)],
      limit: 10,
    }),
    fetchIngestionHealth(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-balance">platform health</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          ingestion pipeline throughput, downstream failure tracking, and platform status over time
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">ingestion counters</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          received <span className="font-mono tabular-nums">{ingestionHealth.total_received}</span>,
          accepted <span className="font-mono tabular-nums">{ingestionHealth.total_accepted}</span>,
          rejected <span className="font-mono tabular-nums">{ingestionHealth.total_rejected}</span>
        </p>
        <div className="mt-4">
          <IngestionFunnelWrapper stats={ingestionHealth} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-sm font-medium">durable downstream failures</h2>
        {failureRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            no unresolved ingest failures are recorded
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            {failureRows.map(row => (
              <div className="rounded-md border border-border/60 p-3" key={row.id}>
                <p className="font-medium">
                  {row.stage} | {row.sensorId} | {row.metricType}
                </p>
                <p className="text-xs text-muted-foreground">
                  zone {row.zone} | opened {row.createdAt.toLocaleString()}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{row.error}</p>
                <form action={resolveIngestionFailureAction} className="mt-3">
                  <input name="failureId" type="hidden" value={row.id} />
                  <button
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    type="submit"
                  >
                    mark resolved
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-sm font-medium">platform status history</h2>
        <PlatformHealthWrapper
          data={statusRows.map(row => ({
            time: row.time.toISOString(),
            latencyMs: row.latencyMs ?? 0,
            errorRate: row.errorRate ?? 0,
          }))}
        />
      </div>
    </div>
  )
}

async function fetchIngestionHealth(): Promise<IngestionHealth> {
  try {
    const { data, status } = await callRustEndpoint('/internal/health', { method: 'GET' })

    if (status >= 400) {
      return { total_received: 0, total_accepted: 0, total_rejected: 0 }
    }

    if (!isRecord(data)) {
      return { total_received: 0, total_accepted: 0, total_rejected: 0 }
    }

    return {
      total_received: getNumericField(data, 'total_received'),
      total_accepted: getNumericField(data, 'total_accepted'),
      total_rejected: getNumericField(data, 'total_rejected'),
    }
  } catch {
    return { total_received: 0, total_accepted: 0, total_rejected: 0 }
  }
}

function getNumericField(payload: Record<string, unknown>, key: string): number {
  if (!(key in payload)) {
    return 0
  }

  const value = payload[key]
  return typeof value === 'number' ? value : 0
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
}

async function resolveIngestionFailureAction(formData: FormData) {
  'use server'

  await requireAdminUser()

  const rawFailureId = formData.get('failureId')
  const failureId =
    typeof rawFailureId === 'string' ? Number.parseInt(rawFailureId, 10) : Number.NaN

  if (!Number.isInteger(failureId) || failureId <= 0) {
    throw new Error('invalid ingestion failure id')
  }

  await getDb()
    .update(ingestionFailures)
    .set({ status: 'resolved', resolvedAt: new Date() })
    .where(eq(ingestionFailures.id, failureId))

  revalidatePath('/health')
}

async function requireAdminUser() {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ')

  const user = await resolveSessionUser(cookieHeader, getJwtSecret())
  if (!user) {
    redirect('/sign-in')
  }

  if (user.role !== 'admin') {
    redirect(sessionLandingPath(user.role))
  }

  return user
}
