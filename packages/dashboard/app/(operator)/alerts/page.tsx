import { AlertsManager } from '@/components/operator/alerts-manager'
import { serverTrpc, HydrateClient } from '@/lib/trpc-server'

// HandleActiveAlerts boundary (AlertingManager)
export default async function AlertsPage() {
  void serverTrpc.alerts.list.prefetch({ limit: 50 })

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-balance">alerts</h1>
      <p className="text-sm text-muted-foreground text-pretty">
        triage the live queue, acknowledge what has an owner, and resolve what has actually been handled
      </p>
      <HydrateClient>
        <AlertsManager />
      </HydrateClient>
    </div>
  )
}
