'use client'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

type RuleActionsProps = {
  ruleId: string
  ruleStatus: string
}

export function RuleActions({ ruleId, ruleStatus }: RuleActionsProps) {
  const router = useRouter()
  const utils = trpc.useUtils()

  const updateRule = trpc.rules.update.useMutation({
    onSuccess: () => {
      router.refresh()
      void utils.rules.list.invalidate()
    },
  })

  const deleteRule = trpc.rules.delete.useMutation({
    onSuccess: () => {
      void utils.rules.list.invalidate()
      router.push('/rules')
    },
  })

  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={updateRule.isPending}
        onClick={() =>
          updateRule.mutate({
            id: ruleId,
            ruleStatus: ruleStatus === 'active' ? 'inactive' : 'active',
          })
        }
        variant="outline"
      >
        {updateRule.isPending ? <Spinner /> : ruleStatus === 'active' ? 'pause rule' : 'activate rule'}
      </Button>
      <Button
        disabled={deleteRule.isPending}
        onClick={() => deleteRule.mutate({ id: ruleId })}
        variant="destructive"
      >
        {deleteRule.isPending ? <Spinner /> : 'delete rule'}
      </Button>
    </div>
  )
}
