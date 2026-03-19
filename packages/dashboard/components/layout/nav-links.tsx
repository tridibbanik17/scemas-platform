'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

type NavItem = {
  href: string
  label: string
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <ul className="space-y-0.5 text-sm">
      {items.map(item => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <li key={item.href}>
            <Link
              className={cn(
                'block px-3 py-2 transition-colors',
                isActive
                  ? 'bg-foreground/5 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              href={item.href}
            >
              {item.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
