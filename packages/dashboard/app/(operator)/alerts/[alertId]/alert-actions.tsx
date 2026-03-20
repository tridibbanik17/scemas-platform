'use client'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

type AlertActionsProps = {
  alertId: string
  currentStatus: string
}

export function AlertActions({ alertId, currentStatus }: AlertActionsProps) {
  const utils = trpc.useUtils()
  const acknowledgeAlert = trpc.alerts.acknowledge.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.alerts.list.invalidate(),
        utils.alerts.get.invalidate({ id: alertId }),
      ])
    },
  })
  const resolveAlert = trpc.alerts.resolve.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.alerts.list.invalidate(),
        utils.alerts.get.invalidate({ id: alertId }),
      ])
    },
  })

  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={acknowledgeAlert.isPending || currentStatus !== 'active'}
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
        disabled={resolveAlert.isPending || currentStatus === 'resolved'}
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
    </div>
  )
}
