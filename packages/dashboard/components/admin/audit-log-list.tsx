'use client'

import { useState } from 'react'
import { ListPagination } from '@/components/list-pagination'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

const PAGE_SIZE = 10

export function AuditLogList() {
  const [page, setPage] = useState(0)
  const auditQuery = trpc.audit.list.useQuery({ limit: 50 })

  if (auditQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Spinner />
          loading audit logs
        </span>
      </div>
    )
  }

  if (auditQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-card p-4 text-sm text-destructive">
        {auditQuery.error.message}
      </div>
    )
  }

  const logs = auditQuery.data ?? []
  const totalPages = Math.ceil(logs.length / PAGE_SIZE)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageLogs = logs.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3 text-sm font-medium">
        recent audit events
      </div>
      {logs.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
          no audit events have been recorded yet
        </p>
      ) : (
        <>
          <div className="divide-y divide-border">
            {pageLogs.map(log => (
              <div className="space-y-2 px-4 py-4" key={log.id}>
                <p className="text-sm font-medium">{log.action}</p>
                <p className="text-xs text-muted-foreground">
                  actor: {log.userId ?? 'system'} | {log.createdAt.toLocaleString()}
                </p>
                <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
                  {formatAuditDetails(log.details)}
                </pre>
              </div>
            ))}
          </div>
          <ListPagination
            onPageChange={setPage}
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={logs.length}
            totalPages={totalPages}
          />
        </>
      )}
    </div>
  )
}

function formatAuditDetails(details: unknown): string {
  if (details === null || details === undefined) {
    return 'no structured details recorded'
  }

  if (typeof details === 'string') {
    return details
  }

  return JSON.stringify(details, null, 2)
}
