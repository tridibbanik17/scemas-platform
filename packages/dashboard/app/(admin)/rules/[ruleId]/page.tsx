import { thresholdRules } from '@scemas/db/schema'
import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RuleActions } from '@/components/admin/rule-actions'
import { HydrateClient } from '@/lib/trpc-server'
import { getDb } from '@/server/cached'

export default async function RuleDetailPage({ params }: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await params
  const db = getDb()
  const rule = await db.query.thresholdRules.findFirst({ where: eq(thresholdRules.id, ruleId) })

  if (!rule) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          href="/rules"
        >
          back to rules
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-balance">rule detail</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {rule.metricType.replaceAll('_', ' ')} {rule.comparison} {rule.thresholdValue}, scope:{' '}
            {rule.zone ?? 'all zones'}
          </p>
        </div>
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
