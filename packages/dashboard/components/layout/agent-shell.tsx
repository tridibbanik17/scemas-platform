import type { ReactNode } from 'react'
import { accounts } from '@scemas/db/schema'
import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { SESSION_COOKIE_NAME, resolveSessionUser } from '@/lib/session'
import { getDb } from '@/server/cached'
import { getJwtSecret } from '@/server/env'
import { AccountPopover } from './account-popover'
import { HeaderBreadcrumbs } from './header-breadcrumbs'
import { NavLinks } from './nav-links'
import { SidebarStatus } from './sidebar-status'

type AgentNavItem = { href: string; label: string }

type AgentShellProps = {
  title: string
  navItems?: AgentNavItem[]
  navExtra?: ReactNode
  children: ReactNode
}

export async function AgentShell({ title, navItems = [], navExtra, children }: AgentShellProps) {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'
  const hasSession = cookieStore.has(SESSION_COOKIE_NAME)

  const cookieHeader = cookieStore
    .getAll()
    .map(c => `${c.name}=${c.value}`)
    .join('; ')
  const sessionUser = await resolveSessionUser(cookieHeader, getJwtSecret())
  const account = sessionUser
    ? await getDb().query.accounts.findFirst({
        where: eq(accounts.id, sessionUser.id),
        columns: { username: true, email: true, role: true },
      })
    : null

  return (
    <SidebarProvider className="h-dvh !min-h-0 overflow-hidden" defaultOpen={defaultOpen}>
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader className="px-4 pt-4">
          <h2 className="text-lg font-semibold text-balance">{title}</h2>
        </SidebarHeader>

        <SidebarContent>
          {navItems.length > 0 ? (
            <SidebarGroup>
              <SidebarGroupContent>
                <NavLinks items={navItems} />
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
          {navExtra ? (
            <SidebarGroup>
              <SidebarGroupContent className="px-2">{navExtra}</SidebarGroupContent>
            </SidebarGroup>
          ) : null}
        </SidebarContent>

        <SidebarFooter className="px-2 pb-3">
          {account ? (
            <AccountPopover username={account.username} email={account.email} />
          ) : (
            <Button asChild className="w-full justify-center" variant="outline">
              <Link href="/sign-in">sign in</Link>
            </Button>
          )}
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="flex min-h-0 flex-col overflow-hidden">
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <HeaderBreadcrumbs navItems={navItems} />
          </div>
          <SidebarStatus />
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-6">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
