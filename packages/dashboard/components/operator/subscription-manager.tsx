'use client'

import type { MetricType, Severity } from '@scemas/types'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'
import { formatZoneName } from '@/lib/zones'

const metricTypes = ['temperature', 'humidity', 'air_quality', 'noise_level'] as const
const severityOptions = [
  { value: 1, label: 'low and above' },
  { value: 2, label: 'warning and above' },
  { value: 3, label: 'critical only' },
] as const

type SubscriptionManagerProps = { availableZones: string[]; onSaved?: () => void }

export function SubscriptionManager({ availableZones, onSaved }: SubscriptionManagerProps) {
  const utils = trpc.useUtils()
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const subscriptionQuery = trpc.subscriptions.get.useQuery()
  const updateSubscription = trpc.subscriptions.update.useMutation({
    onSuccess: async () => {
      setSubmissionError(null)
      await utils.subscriptions.get.invalidate()
      onSaved?.()
    },
    onError: error => {
      setSubmissionError(error.message)
    },
  })

  if (subscriptionQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Spinner />
          loading alert subscriptions
        </span>
      </div>
    )
  }

  if (subscriptionQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-card p-4 text-sm text-destructive">
        {subscriptionQuery.error.message}
      </div>
    )
  }

  const subscription = subscriptionQuery.data
  const selectedMetricTypes = subscription?.metricTypes ?? []
  const selectedZones = subscription?.zones ?? []

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmissionError(null)

    const formData = new FormData(event.currentTarget)
    const minSeverity = Number(formData.get('minSeverity'))
    const parsedMinSeverity = parseSeverity(minSeverity)
    if (!parsedMinSeverity) {
      setSubmissionError('minimum severity must be a number')
      return
    }

    updateSubscription.mutate({
      metricTypes: formData.getAll('metricTypes').filter(isMetricType),
      zones: formData.getAll('zones').filter(isString),
      minSeverity: parsedMinSeverity,
    })
  }

  return (
    <form className="space-y-6 rounded-lg border border-border bg-card p-4" onSubmit={handleSubmit}>
      <div className="space-y-3">
        <h2 className="text-sm font-medium">metric filters</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {metricTypes.map(metricType => (
            <label className="flex items-center gap-2 text-sm" key={metricType}>
              <input
                defaultChecked={selectedMetricTypes.includes(metricType)}
                name="metricTypes"
                type="checkbox"
                value={metricType}
              />
              {metricType.replaceAll('_', ' ')}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">region filters</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {availableZones.map(zone => (
            <label className="flex items-center gap-2 text-sm" key={zone}>
              <input
                defaultChecked={selectedZones.includes(zone)}
                name="zones"
                type="checkbox"
                value={zone}
              />
              {formatZoneName(zone)}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="minSeverity">
          minimum severity
        </label>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={`${subscription?.minSeverity ?? 1}`}
          id="minSeverity"
          name="minSeverity"
        >
          {severityOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {submissionError ? (
        <p className="text-sm text-destructive" role="alert">
          {submissionError}
        </p>
      ) : null}

      <Button disabled={updateSubscription.isPending} type="submit">
        {updateSubscription.isPending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            saving preferences
          </span>
        ) : (
          'save subscriptions'
        )}
      </Button>
    </form>
  )
}

function isString(value: FormDataEntryValue): value is string {
  return typeof value === 'string'
}

function isMetricType(value: FormDataEntryValue): value is MetricType {
  return isString(value) && metricTypes.some(metricType => metricType === value)
}

function parseSeverity(value: number): Severity | null {
  if (value === 1 || value === 2 || value === 3) {
    return value
  }

  return null
}
