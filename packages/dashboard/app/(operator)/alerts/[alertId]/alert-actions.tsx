'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

type AlertActionsProps = { alertId: string; currentStatus: string }

const statusStyles: Record<string, string> = {
  active: 'bg-destructive/10 text-destructive',
  acknowledged: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  resolved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
}

export function AlertActions({ alertId, currentStatus }: AlertActionsProps) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [status, setStatus] = useState(currentStatus)

  const acknowledgeAlert = trpc.alerts.acknowledge.useMutation({
    onSuccess: () => {
      setStatus('acknowledged')
      void utils.alerts.list.invalidate()
      startTransition(() => router.refresh())
    },
  })
  const resolveAlert = trpc.alerts.resolve.useMutation({
    onSuccess: () => {
      setStatus('resolved')
      void utils.alerts.list.invalidate()
      startTransition(() => router.refresh())
    },
  })

  return (
    <div className="flex items-center gap-2">
      <span
        className={`rounded px-1.5 py-px text-xs font-medium ${statusStyles[status] ?? statusStyles.active}`}
      >
        {status}
      </span>
      {status !== 'resolved' ? (
        <>
          <Button
            disabled={acknowledgeAlert.isPending || status !== 'active'}
            onClick={() => acknowledgeAlert.mutate({ id: alertId })}
            variant="outline"
          >
            {acknowledgeAlert.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Spinner /> acknowledging
              </span>
            ) : (
              'acknowledge'
            )}
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-600/80 dark:bg-emerald-600 dark:hover:bg-emerald-600/80"
            disabled={resolveAlert.isPending}
            onClick={() => resolveAlert.mutate({ id: alertId })}
          >
            {resolveAlert.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Spinner /> resolving
              </span>
            ) : (
              'resolve'
            )}
          </Button>
        </>
      ) : null}
    </div>
  )
}
