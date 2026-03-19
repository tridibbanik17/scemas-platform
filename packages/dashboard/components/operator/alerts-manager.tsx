'use client'

import Link from 'next/link'
import { useState } from 'react'

import { ListPagination } from '@/components/list-pagination'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

const PAGE_SIZE = 10

export function AlertsManager() {
  const utils = trpc.useUtils()
  const [page, setPage] = useState(0)
  const alertsQuery = trpc.alerts.list.useQuery({ limit: 50 })
  const acknowledgeAlert = trpc.alerts.acknowledge.useMutation({
    onSuccess: async () => {
      await utils.alerts.list.invalidate()
    },
  })
  const resolveAlert = trpc.alerts.resolve.useMutation({
    onSuccess: async () => {
      await utils.alerts.list.invalidate()
    },
  })

  if (alertsQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Spinner />
          loading alerts
        </span>
      </div>
    )
  }

  if (alertsQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-card p-4 text-sm text-destructive">
        {alertsQuery.error.message}
      </div>
    )
  }

  const alerts = alertsQuery.data ?? []
  const totalPages = Math.ceil(alerts.length / PAGE_SIZE)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageAlerts = alerts.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  )

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3 text-sm font-medium">
        operator alert queue
      </div>
      {alerts.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
          no alerts are active right now
        </p>
      ) : (
        <>
          <div className="divide-y divide-border">
            {pageAlerts.map(alert => (
              <div
                className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between"
                key={alert.id}
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={`/alerts/${alert.id}`}
                    >
                      {alert.zone}
                    </Link>{' '}
                    | {alert.metricType.replaceAll('_', ' ')} at{' '}
                    <span className="font-mono tabular-nums">
                      {alert.triggeredValue}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    severity {alert.severity} | status {alert.status} | opened{' '}
                    {alert.createdAt.toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    disabled={
                      acknowledgeAlert.isPending || alert.status !== 'active'
                    }
                    onClick={() => acknowledgeAlert.mutate({ id: alert.id })}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    acknowledge
                  </Button>
                  <Button
                    disabled={
                      resolveAlert.isPending || alert.status === 'resolved'
                    }
                    onClick={() => resolveAlert.mutate({ id: alert.id })}
                    size="sm"
                    type="button"
                  >
                    resolve
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <ListPagination
            onPageChange={setPage}
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={alerts.length}
            totalPages={totalPages}
          />
        </>
      )}
    </div>
  )
}
