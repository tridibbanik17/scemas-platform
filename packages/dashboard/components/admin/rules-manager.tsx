'use client'

import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import type { Comparison, MetricType, ThresholdRule } from '@scemas/types'

import { ListPagination } from '@/components/list-pagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

const metricTypes = ['temperature', 'humidity', 'air_quality', 'noise_level'] as const
const comparisons = ['gt', 'gte', 'lt', 'lte'] as const
const PAGE_SIZE = 10

export function RulesManager() {
  const utils = trpc.useUtils()
  const [page, setPage] = useState(0)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const rulesQuery = trpc.rules.list.useQuery()
  const createRule = trpc.rules.create.useMutation({
    onSuccess: async createdRule => {
      setSubmissionError(null)
      utils.rules.list.setData(undefined, currentRules =>
        prependRule(currentRules, createdRule),
      )
      await utils.rules.list.invalidate()
    },
    onError: error => {
      setSubmissionError(error.message)
    },
  })
  const updateRule = trpc.rules.update.useMutation({
    onSuccess: async (_, variables) => {
      setSubmissionError(null)
      utils.rules.list.setData(undefined, currentRules =>
        currentRules?.map(rule =>
          rule.id === variables.id
            ? { ...rule, ruleStatus: variables.ruleStatus }
            : rule,
        ) ?? currentRules,
      )
      await utils.rules.list.invalidate()
    },
    onError: error => {
      setSubmissionError(error.message)
    },
  })
  const deleteRule = trpc.rules.delete.useMutation({
    onSuccess: async (_, variables) => {
      setSubmissionError(null)
      utils.rules.list.setData(undefined, currentRules =>
        currentRules?.filter(rule => rule.id !== variables.id) ?? currentRules,
      )
      await utils.rules.list.invalidate()
    },
    onError: error => {
      setSubmissionError(error.message)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmissionError(null)

    const formData = new FormData(event.currentTarget)
    const metricType = formData.get('metricType')
    const thresholdValue = formData.get('thresholdValue')
    const comparison = formData.get('comparison')
    const zone = formData.get('zone')

    if (
      typeof metricType !== 'string' ||
      typeof thresholdValue !== 'string' ||
      typeof comparison !== 'string' ||
      typeof zone !== 'string'
    ) {
      setSubmissionError('rule submission was malformed')
      return
    }

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
  const totalPages = Math.ceil(rules.length / PAGE_SIZE)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageRules = rules.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  )

  return (
    <div className="space-y-6">
      <form className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-5" onSubmit={handleSubmit}>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="temperature" name="metricType">
          {metricTypes.map(metricType => (
            <option key={metricType} value={metricType}>
              {metricType.replaceAll('_', ' ')}
            </option>
          ))}
        </select>

        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="gt" name="comparison">
          {comparisons.map(comparison => (
            <option key={comparison} value={comparison}>
              {comparison}
            </option>
          ))}
        </select>

        <Input min="1" name="thresholdValue" placeholder="threshold value" step="0.1" type="number" />
        <Input name="zone" placeholder="optional zone override" />
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
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          active rulebook
        </div>
        {rules.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
            no threshold rules have been defined yet. use the form above to create one.
          </p>
        ) : (
          <>
          <div className="divide-y divide-border">
            {pageRules.map(rule => (
              <div className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between" key={rule.id}>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    <Link className="underline-offset-4 hover:underline" href={`/rules/${rule.id}`}>
                      {rule.metricType.replaceAll('_', ' ')}
                    </Link>{' '}
                    {rule.comparison}{' '}
                      <span className="font-mono tabular-nums">{rule.thresholdValue}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    scope: {rule.zone ?? 'all zones'} | status: {rule.ruleStatus}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    disabled={updateRule.isPending}
                    onClick={() =>
                      updateRule.mutate({
                        id: rule.id,
                        ruleStatus: rule.ruleStatus === 'active' ? 'inactive' : 'active',
                      })}
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
            ))}
          </div>
          <ListPagination
            onPageChange={setPage}
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={rules.length}
            totalPages={totalPages}
          />
          </>
        )}
      </div>
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
