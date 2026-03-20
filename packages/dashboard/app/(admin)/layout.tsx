import { AgentShell } from '@/components/layout/agent-shell'

export const dynamic = 'force-dynamic'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgentShell
      navItems={[
        { href: '/rules', label: 'threshold rules' },
        { href: '/users', label: 'users' },
        { href: '/health', label: 'platform health' },
        { href: '/audit', label: 'audit logs' },
      ]}
      subtitle="system admin"
      title="SCEMAS"
    >
      {children}
    </AgentShell>
  )
}
