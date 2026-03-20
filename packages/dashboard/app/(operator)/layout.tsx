import { AgentShell } from '@/components/layout/agent-shell'
import { SubscriptionDrawer } from '@/components/operator/subscription-drawer'
import { normalizeZoneIds } from '@/lib/zones'
import { getDb } from '@/server/cached'

export const dynamic = 'force-dynamic'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const db = getDb()
  const devices = await db.query.devices.findMany({ columns: { zone: true } })
  const availableZones = normalizeZoneIds(devices.map(device => device.zone))

  return (
    <AgentShell
      navItems={[
        { href: '/dashboard', label: 'dashboard' },
        { href: '/alerts', label: 'alerts' },
        { href: '/metrics', label: 'metrics' },
      ]}
      navExtra={<SubscriptionDrawer availableZones={availableZones} />}
      title="SCEMAS"
    >
      {children}
    </AgentShell>
  )
}
