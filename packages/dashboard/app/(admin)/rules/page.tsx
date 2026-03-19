import { RulesManager } from '@/components/admin/rules-manager'
import { serverTrpc, HydrateClient } from '@/lib/trpc-server'

// DefineThresholdRules boundary (AlertingManager, admin-only)
export default async function RulesPage() {
  void serverTrpc.rules.list.prefetch()

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-balance">threshold rules</h1>
      <p className="text-sm text-muted-foreground text-pretty">
        define, pause, and retire the rulebook that feeds the blackboard alerting flow
      </p>
      <HydrateClient>
        <RulesManager />
      </HydrateClient>
    </div>
  )
}
