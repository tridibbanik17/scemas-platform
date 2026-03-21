'use client'

// ReportEnvironmentalHazard admin triage view (SRS CP-C3)

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { trpc } from '@/lib/trpc'
import { formatZoneName } from '@/lib/zones'

const statusFilters = ['all', 'pending', 'reviewing', 'resolved', 'dismissed'] as const

const categoryLabels: Record<string, string> = {
  environmental_hazard: 'hazard',
  system_misuse: 'misuse',
  inappropriate_content: 'content',
  other: 'other',
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  reviewing: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  resolved: 'bg-green-500/15 text-green-700 dark:text-green-400',
  dismissed: 'bg-muted text-muted-foreground',
}

export function ReportsManager() {
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')

  const { data: reports, refetch } = trpc.reports.list.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 100,
  })

  const updateStatus = trpc.reports.updateStatus.useMutation({
    onSuccess: () => {
      refetch()
      setExpandedId(null)
      setReviewNote('')
    },
  })

  function handleAction(id: string, status: 'reviewing' | 'resolved' | 'dismissed') {
    updateStatus.mutate({ id, status, reviewNote: reviewNote.trim() || null })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {statusFilters.map(s => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      {!reports || reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-sm text-muted-foreground">no reports found</p>
          {statusFilter !== 'all' && (
            <Button variant="ghost" size="sm" onClick={() => setStatusFilter('all')}>
              view all reports
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(report => (
            <div key={report.id} className="rounded-lg border border-border bg-card">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => {
                  setExpandedId(expandedId === report.id ? null : report.id)
                  setReviewNote('')
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="outline" className={statusColors[report.status]}>
                    {report.status}
                  </Badge>
                  <Badge variant="secondary">
                    {categoryLabels[report.category] ?? report.category}
                  </Badge>
                  <span className="truncate text-sm font-medium">
                    {formatZoneName(report.zone)}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(report.createdAt).toLocaleString()}
                </span>
              </button>

              {expandedId === report.id && (
                <div className="border-t border-border px-4 py-3 space-y-3">
                  <p className="text-sm text-pretty">{report.description}</p>

                  {report.contactEmail && (
                    <p className="text-xs text-muted-foreground">
                      contact: {report.contactEmail}
                    </p>
                  )}

                  {report.reviewNote && (
                    <p className="text-xs text-muted-foreground">
                      review note: {report.reviewNote}
                    </p>
                  )}

                  {(report.status === 'pending' || report.status === 'reviewing') && (
                    <div className="space-y-2">
                      <Textarea
                        value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)}
                        placeholder="review note (optional)"
                        rows={2}
                        maxLength={500}
                      />
                      <div className="flex gap-2">
                        {report.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updateStatus.isPending}
                            onClick={() => handleAction(report.id, 'reviewing')}
                          >
                            start review
                          </Button>
                        )}
                        <Button
                          size="sm"
                          disabled={updateStatus.isPending}
                          onClick={() => handleAction(report.id, 'resolved')}
                        >
                          resolve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={updateStatus.isPending}
                          onClick={() => handleAction(report.id, 'dismissed')}
                        >
                          dismiss
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
