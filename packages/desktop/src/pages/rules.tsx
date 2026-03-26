import { type FormEvent, useState, useMemo } from 'react'
import { useSettings } from '@/lib/settings'
import { useTauriQuery, useTauriMutation } from '@/lib/tauri'
import { useAuthStore } from '@/store/auth'

type MetricType = 'temperature' | 'humidity' | 'air_quality' | 'noise_level'
type Comparison = 'gt' | 'gte' | 'lt' | 'lte'

interface ThresholdRule {
  id: string
  metricType: MetricType
  thresholdValue: number
  comparison: Comparison
  zone: string | null
  ruleStatus: 'active' | 'inactive'
}

const metricTypes: MetricType[] = ['temperature', 'humidity', 'air_quality', 'noise_level']
const comparisons: Comparison[] = ['gt', 'gte', 'lt', 'lte']

function isMetricType(value: string): value is MetricType {
  return (metricTypes as string[]).includes(value)
}

function isComparison(value: string): value is Comparison {
  return (comparisons as string[]).includes(value)
}

export function RulesPage() {
  const user = useAuthStore(s => s.user)
  const rules = useTauriQuery<ThresholdRule[]>('rules_list', {})

  const createRule = useTauriMutation<{
    args: {
      metricType: string
      thresholdValue: number
      comparison: string
      zone?: string
      createdBy: string
    }
  }>('rules_create', ['rules_list'])

  const editRule = useTauriMutation<{
    args: {
      ruleId: string
      metricType: string
      thresholdValue: number
      comparison: string
      zone: string | null
    }
  }>('rules_edit', ['rules_list'])

  const updateStatus = useTauriMutation<{
    args: { ruleId: string; ruleStatus: 'active' | 'inactive' }
  }>('rules_update_status', ['rules_list'])

  const deleteRule = useTauriMutation<{ args: { ruleId: string } }>('rules_delete', ['rules_list'])

  const pageSize = useSettings(s => s.pageSize)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const allRules = rules.data ?? []
  const ruleSlice = useMemo(() => {
    const start = page * pageSize
    return { items: allRules.slice(start, start + pageSize), total: allRules.length, start }
  }, [allRules, page, pageSize])

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmissionError(null)

    const formData = new FormData(event.currentTarget)
    const metricType = String(formData.get('metricType'))
    const thresholdValue = String(formData.get('thresholdValue'))
    const comparison = String(formData.get('comparison'))
    const zone = String(formData.get('zone'))

    if (!isMetricType(metricType) || !isComparison(comparison)) {
      setSubmissionError('invalid metric or comparison selected')
      return
    }

    const parsed = Number(thresholdValue)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSubmissionError('threshold must be a positive number')
      return
    }

    createRule.mutate(
      {
        args: {
          metricType,
          thresholdValue: parsed,
          comparison,
          zone: zone.trim() || undefined,
          createdBy: user?.id ?? '',
        },
      },
      {
        onSuccess: () => setSubmissionError(null),
        onError: () => setSubmissionError('failed to create rule'),
      },
    )

    event.currentTarget.reset()
  }

  if (rules.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">loading rules...</p>
  }

  if (rules.isError) {
    return <p className="p-6 text-sm text-destructive">{String(rules.error)}</p>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-balance">threshold rules</h1>
        <p className="text-sm text-muted-foreground">
          define, pause, and retire the rulebook that feeds the blackboard alerting flow
        </p>
      </div>

      <form className="grid gap-3 rounded-lg border p-4 md:grid-cols-5" onSubmit={handleCreate}>
        <select
          name="metricType"
          defaultValue="temperature"
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {metricTypes.map(mt => (
            <option key={mt} value={mt}>
              {mt.replaceAll('_', ' ')}
            </option>
          ))}
        </select>

        <select
          name="comparison"
          defaultValue="gt"
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {comparisons.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <input
          name="thresholdValue"
          type="number"
          step="0.1"
          min="1"
          placeholder="threshold value"
          required
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        />

        <select
          name="zone"
          defaultValue=""
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">all regions</option>
          <option value="downtown_core">downtown core</option>
          <option value="waterfront">waterfront</option>
          <option value="industrial_zone">industrial zone</option>
          <option value="residential_east">residential east</option>
          <option value="park_district">park district</option>
        </select>

        <button
          type="submit"
          disabled={createRule.isPending}
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {createRule.isPending ? 'creating...' : 'create rule'}
        </button>
      </form>

      {submissionError && (
        <p className="text-sm text-destructive" role="alert">
          {submissionError}
        </p>
      )}

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3 text-sm font-medium">active rulebook</div>
        {allRules.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            no threshold rules have been defined yet. use the form above to create one.
          </p>
        ) : (
          <>
            <div className="divide-y">
              {ruleSlice.items.map(rule =>
                editingId === rule.id ? (
                  <RuleEditRow
                    key={rule.id}
                    rule={rule}
                    saving={editRule.isPending}
                    onSave={values => {
                      editRule.mutate(
                        { args: { ruleId: rule.id, ...values } },
                        {
                          onSuccess: () => {
                            setEditingId(null)
                            setSubmissionError(null)
                          },
                          onError: () => setSubmissionError('failed to save edit'),
                        },
                      )
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div
                    key={rule.id}
                    className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {rule.metricType.replaceAll('_', ' ')} {rule.comparison}{' '}
                        <span className="font-mono tabular-nums">{rule.thresholdValue}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        scope: {rule.zone?.replaceAll('_', ' ') ?? 'all regions'} | status:{' '}
                        {rule.ruleStatus}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingId(rule.id)}
                        className="h-8 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
                      >
                        edit
                      </button>
                      <button
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          updateStatus.mutate({
                            args: {
                              ruleId: rule.id,
                              ruleStatus: rule.ruleStatus === 'active' ? 'inactive' : 'active',
                            },
                          })
                        }
                        className="h-8 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
                      >
                        {rule.ruleStatus === 'active' ? 'pause' : 'activate'}
                      </button>
                      <button
                        disabled={deleteRule.isPending}
                        onClick={() => deleteRule.mutate({ args: { ruleId: rule.id } })}
                        className="h-8 rounded-md border border-red-500/30 bg-red-500/10 px-3 text-xs font-medium text-red-600 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        delete
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
            <div className="border-t px-4 py-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                {ruleSlice.start + 1}–{ruleSlice.start + ruleSlice.items.length} of{' '}
                {ruleSlice.total}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function RuleEditRow({
  rule,
  onSave,
  onCancel,
  saving,
}: {
  rule: ThresholdRule
  onSave: (values: {
    metricType: string
    thresholdValue: number
    comparison: string
    zone: string | null
  }) => void
  onCancel: () => void
  saving: boolean
}) {
  const [metricType, setMetricType] = useState<MetricType>(rule.metricType)
  const [comparison, setComparison] = useState<Comparison>(rule.comparison)
  const [thresholdValue, setThresholdValue] = useState(String(rule.thresholdValue))
  const [zone, setZone] = useState(rule.zone ?? '')

  function handleSave() {
    const parsed = Number(thresholdValue)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    onSave({ metricType, thresholdValue: parsed, comparison, zone: zone || null })
  }

  return (
    <div className="grid gap-3 px-4 py-4 md:grid-cols-6">
      <select
        value={metricType}
        onChange={e => {
          if (isMetricType(e.target.value)) setMetricType(e.target.value)
        }}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {metricTypes.map(mt => (
          <option key={mt} value={mt}>
            {mt.replaceAll('_', ' ')}
          </option>
        ))}
      </select>

      <select
        value={comparison}
        onChange={e => {
          if (isComparison(e.target.value)) setComparison(e.target.value)
        }}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {comparisons.map(c => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <input
        type="number"
        step="0.1"
        min="1"
        value={thresholdValue}
        onChange={e => setThresholdValue(e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
      />

      <select
        value={zone}
        onChange={e => setZone(e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        <option value="">all regions</option>
        <option value="downtown_core">downtown core</option>
        <option value="waterfront">waterfront</option>
        <option value="industrial_zone">industrial zone</option>
        <option value="residential_east">residential east</option>
        <option value="park_district">park district</option>
      </select>

      <button
        disabled={saving}
        onClick={handleSave}
        className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? 'saving...' : 'save'}
      </button>

      <button
        disabled={saving}
        onClick={onCancel}
        className="h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
      >
        cancel
      </button>
    </div>
  )
}
