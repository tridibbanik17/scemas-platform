import { AgentShell } from '@/components/layout/agent-shell'

export const dynamic = 'force-dynamic'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgentShell
      navItems={[
        { href: '/display', label: 'air quality' },
        { href: '/api-explorer', label: 'api' },
      ]}
      title="SCEMAS"
    >
      {children}
    </AgentShell>
  )
}
