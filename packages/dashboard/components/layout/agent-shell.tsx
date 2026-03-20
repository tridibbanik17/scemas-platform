import type { ReactNode } from 'react'
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
import { SESSION_COOKIE_NAME } from '@/lib/session'
import { HeaderBreadcrumbs } from './header-breadcrumbs'
import { NavLinks } from './nav-links'
import { SidebarStatus } from './sidebar-status'
import { SignOutForm } from './sign-out-form'

type AgentNavItem = { href: string; label: string }

type AgentShellProps = {
  title: string
  subtitle: string
  navItems?: AgentNavItem[]
  navExtra?: ReactNode
  children: ReactNode
}

export async function AgentShell({
  title,
  subtitle,
  navItems = [],
  navExtra,
  children,
}: AgentShellProps) {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'
  const hasSession = cookieStore.has(SESSION_COOKIE_NAME)

  return (
    <SidebarProvider className="h-dvh !min-h-0 overflow-hidden" defaultOpen={defaultOpen}>
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader className="px-4 pt-4">
          <h2 className="text-lg font-semibold text-balance">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
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

        <SidebarFooter>
          {hasSession ? (
            <SignOutForm className="w-full justify-center" label="sign out" variant="outline" />
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
