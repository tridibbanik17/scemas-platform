'use client'

import { useState } from 'react'
import { ListPagination } from '@/components/list-pagination'
import { usePageSize } from '@/lib/settings'
import { SeverityBadge } from '@/components/ui/severity-badge'

type SensorFeedItem = {
  key: string
  displayName: string
  regionLabel: string
  wardLabel: string
  metricType: string
  value: number
}

export function PaginatedSensorFeed({ items }: { items: SensorFeedItem[] }) {
  const pageSize = usePageSize()
  const [page, setPage] = useState(0)
  const totalPages = Math.ceil(items.length / pageSize)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageItems = items.slice(safePage * pageSize, (safePage + 1) * pageSize)

  return (
    <>
      <div className="space-y-px pb-2 text-sm text-muted-foreground">
        {pageItems.map(item => (
          <div
            className="flex items-start justify-between gap-3 px-4 py-2"
            key={item.key}
          >
            <div className="min-w-0">
              <p className="truncate text-foreground">{item.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {item.regionLabel} · {item.wardLabel}
              </p>
            </div>
            <span className="shrink-0 font-mono tabular-nums">
              {item.metricType.replaceAll('_', ' ')}{' '}
              <span className="text-foreground">{item.value}</span>
            </span>
          </div>
        ))}
      </div>
      <ListPagination
        onPageChange={setPage}
        page={safePage}
        pageSize={pageSize}
        totalItems={items.length}
        totalPages={totalPages}
      />
    </>
  )
}

type AlertFeedItem = {
  id: string
  severity: number
  zone: string
  metricType: string
  triggeredValue: number
}

export function PaginatedAlertFeed({ items }: { items: AlertFeedItem[] }) {
  if (items.length === 0) {
    return <p className="px-4 pb-4 text-sm text-muted-foreground">no active alerts right now</p>
  }

  const scrollable = items.length > 8

  return (
    <div className="relative min-h-0 flex-1">
      <div className="absolute inset-0 space-y-1.5 overflow-y-auto px-4 pb-3 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map(alert => (
          <div
            className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
            key={alert.id}
          >
            <span className="flex items-center gap-2">
              <SeverityBadge severity={alert.severity} />
              <span className="truncate font-medium">{alert.zone}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {alert.metricType.replaceAll('_', ' ')} at{' '}
              <span className="font-mono tabular-nums">{alert.triggeredValue}</span>
            </span>
          </div>
        ))}
      </div>
      {scrollable ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
          style={{
            background: 'linear-gradient(to bottom, transparent, var(--color-card))',
          }}
        />
      ) : null}
    </div>
  )
}
