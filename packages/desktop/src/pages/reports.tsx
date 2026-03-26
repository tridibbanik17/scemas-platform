import { useState, useMemo } from 'react'
import { useTauriQuery, useTauriMutation } from '@/lib/tauri'
import { useAuthStore } from '@/store/auth'

type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed'

interface HazardReport {
  id: string
  zone: string
  category: string
  description: string
  status: ReportStatus
  contactEmail: string | null
  reportedBy: string | null
  reviewedBy: string | null
  reviewNote: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

const STATUS_FILTERS = ['all', 'pending', 'reviewing', 'resolved', 'dismissed'] as const

const CATEGORY_LABELS: Record<string, string> = {
  environmental_hazard: 'hazard',
  system_misuse: 'misuse',
  inappropriate_content: 'content',
  other: 'other',
}

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-700',
  reviewing: 'bg-blue-500/15 text-blue-700',
  resolved: 'bg-green-500/15 text-green-700',
  dismissed: 'bg-muted text-muted-foreground',
}

export function ReportsPage() {
  const user = useAuthStore(s => s.user)
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')

  const reports = useTauriQuery<HazardReport[]>('reports_list', {
    status: statusFilter !== 'all' ? statusFilter : undefined,
    limit: 100,
  })

  const updateStatus = useTauriMutation<{
    args: { id: string; status: string; reviewNote: string | null; reviewedBy: string | null }
  }>('reports_update_status', ['reports_list'])

  const filtered = useMemo(() => reports.data ?? [], [reports.data])

  function handleAction(id: string, status: ReportStatus) {
    updateStatus.mutate(
      { args: { id, status, reviewNote: reviewNote.trim() || null, reviewedBy: user?.id ?? null } },
      {
        onSuccess: () => {
          setExpandedId(null)
          setReviewNote('')
        },
      },
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-balance">hazard reports</h1>
        <p className="text-sm text-muted-foreground">
          review and triage environmental hazard reports submitted by public users and operators
        </p>
      </div>

      <div className="flex items-center gap-2">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'border border-input hover:bg-accent'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {reports.isLoading ? (
        <p className="text-sm text-muted-foreground">loading...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {statusFilter === 'all' ? 'no reports submitted yet' : `no ${statusFilter} reports`}
          </p>
          {statusFilter !== 'all' && (
            <button
              onClick={() => setStatusFilter('all')}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              view all reports
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(report => (
            <div key={report.id} className="rounded-lg border">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                onClick={() => {
                  setExpandedId(expandedId === report.id ? null : report.id)
                  setReviewNote('')
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_CLS[report.status] ?? ''}`}
                  >
                    {report.status}
                  </span>
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium">
                    {CATEGORY_LABELS[report.category] ?? report.category}
                  </span>
                  <span className="truncate text-sm font-medium">
                    {report.zone.replaceAll('_', ' ')}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(report.createdAt).toLocaleString()}
                </span>
              </button>

              {expandedId === report.id && (
                <div className="border-t px-4 py-3 space-y-3">
                  <p className="text-sm text-pretty">{report.description}</p>

                  {report.contactEmail && (
                    <p className="text-xs text-muted-foreground">contact: {report.contactEmail}</p>
                  )}

                  {report.reviewNote && (
                    <p className="text-xs text-muted-foreground">
                      review note: {report.reviewNote}
                    </p>
                  )}

                  {(report.status === 'pending' || report.status === 'reviewing') && (
                    <div className="space-y-2">
                      <textarea
                        value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)}
                        placeholder="review note (optional)"
                        rows={2}
                        maxLength={500}
                        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        {report.status === 'pending' && (
                          <button
                            disabled={updateStatus.isPending}
                            onClick={() => handleAction(report.id, 'reviewing')}
                            className="h-8 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
                          >
                            start review
                          </button>
                        )}
                        <button
                          disabled={updateStatus.isPending}
                          onClick={() => handleAction(report.id, 'resolved')}
                          className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          resolve
                        </button>
                        <button
                          disabled={updateStatus.isPending}
                          onClick={() => handleAction(report.id, 'dismissed')}
                          className="h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
                        >
                          dismiss
                        </button>
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
