import type { ReactNode } from 'react'

import { NavLinks } from './nav-links'
import { SignOutForm } from './sign-out-form'

type AgentNavItem = {
  href: string
  label: string
}

type AgentShellProps = {
  title: string
  subtitle: string
  navItems: AgentNavItem[]
  navExtra?: ReactNode
  children: ReactNode
}

export function AgentShell({
  title,
  subtitle,
  navItems,
  navExtra,
  children,
}: AgentShellProps) {
  return (
    <div className="flex h-dvh">
      <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-card p-4">
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-balance">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>

        <NavLinks items={navItems} />

        {navExtra ? <div className="mt-4">{navExtra}</div> : null}

        <div className="mt-auto pt-6">
          <SignOutForm className="w-full justify-center" label="sign out" variant="outline" />
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-6">{children}</div>
      </main>
    </div>
  )
}
