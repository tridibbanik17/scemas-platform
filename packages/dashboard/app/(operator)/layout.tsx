import { AgentShell } from '@/components/layout/agent-shell'

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AgentShell
      navItems={[
        { href: '/dashboard', label: 'dashboard' },
        { href: '/alerts', label: 'alerts' },
        { href: '/subscriptions', label: 'subscriptions' },
        { href: '/metrics', label: 'metrics' },
      ]}
      subtitle="city operator"
      title="SCEMAS"
    >
      {children}
    </AgentShell>
  )
}
