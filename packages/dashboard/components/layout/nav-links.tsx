'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'

type NavItem = {
  href: string
  label: string
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <SidebarMenu>
      {items.map(item => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton asChild data-active={isActive || undefined}>
              <Link href={item.href}>{item.label}</Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
