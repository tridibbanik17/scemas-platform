import { alerts } from '@scemas/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'

import { SeverityBadge } from '@/components/ui/severity-badge'
import { getDb } from '@/server/cached'
import { AlertActions } from './alert-actions'

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ alertId: string }>
}) {
  const { alertId } = await params
  const db = getDb()
  const alert = await db.query.alerts.findFirst({
    where: eq(alerts.id, alertId),
  })

  if (!alert) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-balance">alert detail</h1>
      <div className="rounded-lg border border-border bg-card p-4">
        <dl className="grid gap-4 md:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">zone</dt>
            <dd className="mt-1 text-sm">{alert.zone}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">metric</dt>
            <dd className="mt-1 text-sm">{alert.metricType.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">severity</dt>
            <dd className="mt-1 text-sm"><SeverityBadge severity={alert.severity} /></dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">status</dt>
            <dd className="mt-1 text-sm">{alert.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">triggered value</dt>
            <dd className="mt-1 text-sm">{alert.triggeredValue}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">opened</dt>
            <dd className="mt-1 text-sm">{alert.createdAt.toLocaleString()}</dd>
          </div>
        </dl>
      </div>
      <AlertActions alertId={alert.id} currentStatus={alert.status} />
    </div>
  )
}
