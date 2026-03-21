import { devices } from '@scemas/db/schema'
import { AlertsManager } from '@/components/operator/alerts-manager'
import { serverTrpc, HydrateClient } from '@/lib/trpc-server'
import { normalizeZoneIds } from '@/lib/zones'
import { getDb } from '@/server/cached'

// HandleActiveAlerts boundary (AlertingManager)
export default async function AlertsPage() {
  const db = getDb()
  const [, deviceRows] = await Promise.all([
    serverTrpc.alerts.list.prefetch({ limit: 200 }),
    db.query.devices.findMany({ columns: { zone: true } }),
  ])
  const availableZones = normalizeZoneIds(deviceRows.map(d => d.zone))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-balance">alerts</h1>
      <p className="text-sm text-muted-foreground text-pretty">
        triage the live queue, acknowledge what has an owner, and resolve what has actually been
        handled
      </p>
      <HydrateClient>
        <AlertsManager availableZones={availableZones} />
      </HydrateClient>
    </div>
  )
}
