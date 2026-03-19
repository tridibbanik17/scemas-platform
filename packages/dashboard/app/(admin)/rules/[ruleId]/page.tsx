import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'

import { thresholdRules } from '@scemas/db/schema'

import { getDb } from '@/server/cached'

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
      <h1 className="text-xl font-semibold text-balance">edit rule</h1>
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
