'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState } from 'react'
import { CopyButton } from '@/components/copy-button'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

const ROW_HEIGHT = 36
const DETAIL_HEIGHT = 192

type AuditEntry = {
  id: number
  action: string
  userId: string | null
  details: unknown
  createdAt: Date
}

export function AuditLogList() {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const auditQuery = trpc.audit.list.useQuery({ limit: 200 })

  const logs = (auditQuery.data ?? []) as AuditEntry[]

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: i => (logs[i]?.id === expandedId ? ROW_HEIGHT + DETAIL_HEIGHT : ROW_HEIGHT),
    overscan: 10,
  })

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

  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <AuditHeader />
        <p className="px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
          no audit events have been recorded yet
        </p>
      </div>
    )
  }

  function handleToggle(log: AuditEntry) {
    setExpandedId(prev => (prev === log.id ? null : log.id))
    requestAnimationFrame(() => virtualizer.measure())
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <AuditHeader />
      <div className="h-[400px] overflow-y-auto md:h-[600px]" ref={scrollRef}>
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map(virtualRow => {
            const log = logs[virtualRow.index]
            const isExpanded = expandedId === log.id

            return (
              <div
                className="absolute left-0 top-0 w-full"
                key={log.id}
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                <button
                  className={`grid w-full grid-cols-[7rem_1fr_6rem] items-center border-b border-border px-4 text-left text-xs transition-colors hover:bg-muted/50 ${isExpanded ? 'bg-muted/30' : ''}`}
                  onClick={() => handleToggle(log)}
                  style={{ height: ROW_HEIGHT }}
                  type="button"
                >
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {formatTimestamp(log.createdAt)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className={`size-1.5 shrink-0 rounded-full ${actionColor(log.action)}`} />
                    <span className="truncate font-medium">{log.action}</span>
                  </span>
                  <span className="truncate text-right font-mono text-muted-foreground">
                    {log.userId ? log.userId.slice(0, 8) : 'system'}
                  </span>
                </button>

                {isExpanded ? (
                  <div
                    className="relative overflow-auto border-b border-border bg-muted/20 px-4 py-3"
                    style={{ height: DETAIL_HEIGHT }}
                  >
                    <div className="sticky right-3 top-0 z-10 float-right">
                      <CopyButton value={formatDetails(log.details)} />
                    </div>
                    <pre className="font-mono text-xs text-muted-foreground">
                      {formatDetails(log.details)}
                    </pre>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      <div className="border-t border-border px-4 py-2">
        <p className="text-xs tabular-nums text-muted-foreground">{logs.length} events</p>
      </div>
    </div>
  )
}

function AuditHeader() {
  return (
    <div className="grid grid-cols-[7rem_1fr_6rem] border-b border-border px-4 py-2 text-[11px] font-medium text-muted-foreground">
      <span>timestamp</span>
      <span>event</span>
      <span className="text-right">actor</span>
    </div>
  )
}

function formatTimestamp(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function actionColor(action: string): string {
  if (action.includes('login') || action.includes('signup')) return 'bg-emerald-500'
  if (action.includes('resolved') || action.includes('acknowledged')) return 'bg-blue-500'
  if (action.includes('denied') || action.includes('failed')) return 'bg-red-500'
  if (action.includes('created') || action.includes('updated')) return 'bg-amber-500'
  return 'bg-muted-foreground'
}

function formatDetails(details: unknown): string {
  if (details === null || details === undefined) {
    return '(no details)'
  }
  if (typeof details === 'string') {
    return details
  }
  return JSON.stringify(details, null, 2)
}
