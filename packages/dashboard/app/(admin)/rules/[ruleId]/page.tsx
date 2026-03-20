import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'

import { thresholdRules } from '@scemas/db/schema'

import { RuleActions } from '@/components/admin/rule-actions'
import { getDb } from '@/server/cached'
import { HydrateClient } from '@/lib/trpc-server'

export default async function RuleDetailPage({
  params,
}: {
  params: Promise<{ ruleId: string }>
}) {
  const { ruleId } = await params
  const db = getDb()
  const rule = await db.query.thresholdRules.findFirst({
    where: eq(thresholdRules.id, ruleId),
  })

  if (!rule) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-balance">rule detail</h1>
        <HydrateClient>
          <RuleActions ruleId={rule.id} ruleStatus={rule.ruleStatus} />
        </HydrateClient>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">metric</dt>
            <dd>{rule.metricType.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">comparison</dt>
            <dd>{rule.comparison}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">threshold</dt>
            <dd className="font-mono tabular-nums">{rule.thresholdValue}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">scope</dt>
            <dd>{rule.zone ?? 'all zones'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">status</dt>
            <dd>{rule.ruleStatus}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
