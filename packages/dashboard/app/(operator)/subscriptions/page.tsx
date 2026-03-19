import { SubscriptionManager } from '@/components/operator/subscription-manager'
import { getDb } from '@/server/cached'
import { serverTrpc, HydrateClient } from '@/lib/trpc-server'

// ManageAlertSubscriptions boundary (innovative feature)
export default async function SubscriptionsPage() {
  const db = getDb()
  const devices = await db.query.devices.findMany({
    columns: { zone: true },
  })
  const availableZones = Array.from(new Set(devices.map(device => device.zone))).sort()

  await serverTrpc.subscriptions.get.prefetch()

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-balance">alert subscriptions</h1>
      <p className="text-sm text-muted-foreground text-pretty">personalize which alerts you receive</p>
      <HydrateClient>
        <SubscriptionManager availableZones={availableZones} />
      </HydrateClient>
    </div>
  )
}
