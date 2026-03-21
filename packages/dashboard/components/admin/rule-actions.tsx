'use client'

import type { Comparison, MetricType } from '@scemas/types'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { startTransition, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { zoneOptions } from '@/lib/zones'

const metricTypes = ['temperature', 'humidity', 'air_quality', 'noise_level'] as const
const comparisons = ['gt', 'gte', 'lt', 'lte'] as const

const fieldClass = cn(
  'h-7 w-full rounded-md border border-input bg-input/20 px-2 text-sm md:text-xs/relaxed',
  'transition-colors outline-none',
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
  'dark:bg-input/30',
)

type RuleActionsProps = {
  ruleId: string
  ruleStatus: string
  metricType: string
  thresholdValue: number
  comparison: string
  zone: string | null
  children: ReactNode
}

export function RuleActions({
  ruleId,
  ruleStatus,
  metricType: initialMetricType,
  thresholdValue: initialThresholdValue,
  comparison: initialComparison,
  zone: initialZone,
  children,
}: RuleActionsProps) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [editing, setEditing] = useState(false)
  const [metricType, setMetricType] = useState(initialMetricType as MetricType)
  const [comparison, setComparison] = useState(initialComparison as Comparison)
  const [thresholdValue, setThresholdValue] = useState(String(initialThresholdValue))
  const [zone, setZone] = useState(initialZone ?? '')

  const editRule = trpc.rules.edit.useMutation({
    onSuccess: () => {
      setEditing(false)
      void utils.rules.list.invalidate()
      startTransition(() => router.refresh())
    },
  })

  const updateRule = trpc.rules.update.useMutation({
    onSuccess: () => {
      startTransition(() => router.refresh())
      void utils.rules.list.invalidate()
    },
  })

  const deleteRule = trpc.rules.delete.useMutation({
    onSuccess: () => {
      void utils.rules.list.invalidate()
      startTransition(() => router.push('/rules'))
    },
  })

  function handleSave() {
    const parsed = Number(thresholdValue)
    if (!Number.isFinite(parsed) || parsed <= 0) return

    editRule.mutate({
      id: ruleId,
      metricType,
      thresholdValue: parsed,
      comparison,
      zone: zone || null,
    })
  }

  function handleCancel() {
    setMetricType(initialMetricType as MetricType)
    setComparison(initialComparison as Comparison)
    setThresholdValue(String(initialThresholdValue))
    setZone(initialZone ?? '')
    setEditing(false)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-balance">rule detail</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {initialMetricType.replaceAll('_', ' ')} {initialComparison} {initialThresholdValue},
            scope: {initialZone ? initialZone.replaceAll('_', ' ') : 'all regions'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="active:scale-[0.97]"
            onClick={() => setEditing(prev => !prev)}
            variant="outline"
          >
            {editing ? 'close' : 'edit rule'}
          </Button>
          <Button
            className="active:scale-[0.97]"
            disabled={updateRule.isPending}
            onClick={() =>
              updateRule.mutate({
                id: ruleId,
                ruleStatus: ruleStatus === 'active' ? 'inactive' : 'active',
              })
            }
            variant="outline"
          >
            {updateRule.isPending ? (
              <Spinner />
            ) : ruleStatus === 'active' ? (
              'pause rule'
            ) : (
              'activate rule'
            )}
          </Button>
          <Button
            className="active:scale-[0.97]"
            disabled={deleteRule.isPending}
            onClick={() => deleteRule.mutate({ id: ruleId })}
            variant="destructive"
          >
            {deleteRule.isPending ? <Spinner /> : 'delete rule'}
          </Button>
        </div>
      </div>

      <div className={cn('grid gap-4', editing && 'md:grid-cols-2')}>
        {children}

        {editing ? (
          <div className="space-y-5 rounded-lg border border-border bg-card p-5">
            <p className="text-sm font-medium">edit rule</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">metric</label>
                <select
                  className={fieldClass}
                  onChange={e => setMetricType(e.target.value as MetricType)}
                  value={metricType}
                >
                  {metricTypes.map(mt => (
                    <option key={mt} value={mt}>
                      {mt.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">comparison</label>
                <select
                  className={fieldClass}
                  onChange={e => setComparison(e.target.value as Comparison)}
                  value={comparison}
                >
                  {comparisons.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">threshold</label>
                <input
                  className={fieldClass}
                  min="1"
                  onChange={e => setThresholdValue(e.target.value)}
                  step="0.1"
                  type="number"
                  value={thresholdValue}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">scope</label>
                <select className={fieldClass} onChange={e => setZone(e.target.value)} value={zone}>
                  <option value="">all regions</option>
                  {zoneOptions.map(z => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="active:scale-[0.97]"
                disabled={editRule.isPending}
                onClick={handleSave}
              >
                {editRule.isPending ? <Spinner /> : 'save'}
              </Button>
              <Button
                className="active:scale-[0.97]"
                disabled={editRule.isPending}
                onClick={handleCancel}
                variant="outline"
              >
                cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
