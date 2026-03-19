import { AuditLogList } from '@/components/admin/audit-log-list'
import { serverTrpc, HydrateClient } from '@/lib/trpc-server'

// AlertAndAuditLogDB viewer (admin-only)
export default async function AuditPage() {
  void serverTrpc.audit.list.prefetch({ limit: 50 })

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-balance">audit logs</h1>
      <p className="text-sm text-muted-foreground text-pretty">
        authentication events, device denials, alert actions, and permission changes land here
      </p>
      <HydrateClient>
        <AuditLogList />
      </HydrateClient>
    </div>
  )
}
