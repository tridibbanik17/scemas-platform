'use client'

import type { Comparison, MetricType, ThresholdRule } from '@scemas/types'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { ListPagination } from '@/components/list-pagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Spinner } from '@/components/ui/spinner'
import { usePageSize } from '@/lib/settings'
import { trpc } from '@/lib/trpc'
import { formatZoneName, zoneOptions } from '@/lib/zones'

const metricTypes = ['temperature', 'humidity', 'air_quality', 'noise_level'] as const
const comparisons = ['gt', 'gte', 'lt', 'lte'] as const

export function RulesManager() {
  const utils = trpc.useUtils()
  const pageSize = usePageSize()
  const [page, setPage] = useState(0)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const rulesQuery = trpc.rules.list.useQuery()
  const createRule = trpc.rules.create.useMutation({
    onSuccess: createdRule => {
      setSubmissionError(null)
      utils.rules.list.setData(undefined, currentRules => prependRule(currentRules, createdRule))
    },
    onError: error => {
      setSubmissionError(error.message)
    },
  })
  const editRule = trpc.rules.edit.useMutation({
    onSuccess: (editedRule, variables) => {
      setSubmissionError(null)
      setEditingId(null)
      utils.rules.list.setData(
        undefined,
        currentRules =>
          currentRules?.map(rule => (rule.id === variables.id ? editedRule : rule)) ?? currentRules,
      )
      void utils.rules.list.invalidate()
    },
    onError: error => {
      setSubmissionError(error.message)
    },
  })
  const updateRule = trpc.rules.update.useMutation({
    onSuccess: (_, variables) => {
      setSubmissionError(null)
      utils.rules.list.setData(
        undefined,
        currentRules =>
          currentRules?.map(rule =>
            rule.id === variables.id ? { ...rule, ruleStatus: variables.ruleStatus } : rule,
          ) ?? currentRules,
      )
      void utils.rules.list.invalidate()
    },
    onError: error => {
      setSubmissionError(error.message)
    },
  })
  const deleteRule = trpc.rules.delete.useMutation({
    onSuccess: (_, variables) => {
      setSubmissionError(null)
      utils.rules.list.setData(
        undefined,
        currentRules => currentRules?.filter(rule => rule.id !== variables.id) ?? currentRules,
      )
      void utils.rules.list.invalidate()
    },
    onError: error => {
      setSubmissionError(error.message)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmissionError(null)

    const formData = new FormData(event.currentTarget)
    const metricType = formData.get('metricType') as string
    const thresholdValue = formData.get('thresholdValue') as string
    const comparison = formData.get('comparison') as string
    const zone = formData.get('zone') as string

    if (!isMetricType(metricType) || !isComparison(comparison)) {
      setSubmissionError('rule form contained an invalid metric or comparison')
      return
    }

    const parsedThresholdValue = Number(thresholdValue)
    if (!Number.isFinite(parsedThresholdValue) || parsedThresholdValue <= 0) {
      setSubmissionError('threshold value must be a positive number')
      return
    }

    createRule.mutate({
      metricType,
      thresholdValue: parsedThresholdValue,
      comparison,
      zone: zone.trim() ? zone.trim() : null,
    })

    event.currentTarget.reset()
  }

  if (rulesQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Spinner />
          loading rules
        </span>
      </div>
    )
  }

  if (rulesQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-card p-4 text-sm text-destructive">
        {rulesQuery.error.message}
      </div>
    )
  }

  const rules = rulesQuery.data ?? []
  const totalPages = Math.ceil(rules.length / pageSize)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageRules = rules.slice(safePage * pageSize, (safePage + 1) * pageSize)

  return (
    <div className="space-y-6">
      <form
        className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-5"
        onSubmit={handleSubmit}
      >
        <NativeSelect className="w-full" defaultValue="temperature" name="metricType">
          {metricTypes.map(mt => (
            <NativeSelectOption key={mt} value={mt}>
              {mt.replaceAll('_', ' ')}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect className="w-full" defaultValue="gt" name="comparison">
          {comparisons.map(c => (
            <NativeSelectOption key={c} value={c}>
              {c}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <Input
          min="1"
          name="thresholdValue"
          placeholder="threshold value"
          step="0.1"
          type="number"
        />
        <NativeSelect className="w-full" defaultValue="" name="zone">
          <NativeSelectOption value="">all regions</NativeSelectOption>
          {zoneOptions.map(z => (
            <NativeSelectOption key={z.id} value={z.id}>
              {z.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button disabled={createRule.isPending} type="submit">
          {createRule.isPending ? <Spinner /> : 'create rule'}
        </Button>
      </form>

      {submissionError ? (
        <p className="text-sm text-destructive" role="alert">
          {submissionError}
        </p>
      ) : null}

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">active rulebook</div>
        {rules.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
            no threshold rules have been defined yet. use the form above to create one.
          </p>
        ) : (
          <>
            <div className="divide-y divide-border">
              {pageRules.map(rule =>
                editingId === rule.id ? (
                  <RuleEditRow
                    key={rule.id}
                    onCancel={() => setEditingId(null)}
                    onSave={values => editRule.mutate({ id: rule.id, ...values })}
                    rule={rule}
                    saving={editRule.isPending}
                  />
                ) : (
                  <div
                    className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between"
                    key={rule.id}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        <Link
                          className="underline-offset-4 hover:underline"
                          href={`/rules/${rule.id}`}
                        >
                          {rule.metricType.replaceAll('_', ' ')}
                        </Link>{' '}
                        {rule.comparison}{' '}
                        <span className="font-mono tabular-nums">{rule.thresholdValue}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        scope: {rule.zone ? formatZoneName(rule.zone) : 'all regions'} | status:{' '}
                        {rule.ruleStatus}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button onClick={() => setEditingId(rule.id)} type="button" variant="outline">
                        edit
                      </Button>
                      <Button
                        disabled={updateRule.isPending}
                        onClick={() =>
                          updateRule.mutate({
                            id: rule.id,
                            ruleStatus: rule.ruleStatus === 'active' ? 'inactive' : 'active',
                          })
                        }
                        type="button"
                        variant="outline"
                      >
                        {rule.ruleStatus === 'active' ? 'pause' : 'activate'}
                      </Button>
                      <Button
                        disabled={deleteRule.isPending}
                        onClick={() => deleteRule.mutate({ id: rule.id })}
                        type="button"
                        variant="destructive"
                      >
                        delete
                      </Button>
                    </div>
                  </div>
                ),
              )}
            </div>
            <ListPagination
              onPageChange={setPage}
              page={safePage}
              pageSize={pageSize}
              totalItems={rules.length}
              totalPages={totalPages}
            />
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
    metricType: MetricType
    thresholdValue: number
    comparison: Comparison
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
      <NativeSelect
        className="w-full"
        value={metricType}
        onChange={e => setMetricType(e.target.value as MetricType)}
      >
        {metricTypes.map(mt => (
          <NativeSelectOption key={mt} value={mt}>
            {mt.replaceAll('_', ' ')}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        className="w-full"
        value={comparison}
        onChange={e => setComparison(e.target.value as Comparison)}
      >
        {comparisons.map(c => (
          <NativeSelectOption key={c} value={c}>
            {c}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Input
        min="1"
        onChange={e => setThresholdValue(e.target.value)}
        step="0.1"
        type="number"
        value={thresholdValue}
      />
      <NativeSelect className="w-full" value={zone} onChange={e => setZone(e.target.value)}>
        <NativeSelectOption value="">all regions</NativeSelectOption>
        {zoneOptions.map(z => (
          <NativeSelectOption key={z.id} value={z.id}>
            {z.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button disabled={saving} onClick={handleSave} type="button">
        {saving ? <Spinner /> : 'save'}
      </Button>
      <Button disabled={saving} onClick={onCancel} type="button" variant="outline">
        cancel
      </Button>
    </div>
  )
}

function isMetricType(value: string): value is MetricType {
  return metricTypes.some(metricType => metricType === value)
}

function isComparison(value: string): value is Comparison {
  return comparisons.some(comparison => comparison === value)
}

function prependRule(
  currentRules: ThresholdRule[] | undefined,
  createdRule: ThresholdRule,
): ThresholdRule[] {
  if (!currentRules) {
    return [createdRule]
  }

  return [createdRule, ...currentRules.filter(rule => rule.id !== createdRule.id)]
}
