'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { formatZoneName } from '@/lib/zones'

type NavItem = { href: string; label: string }

export function HeaderBreadcrumbs({ navItems }: { navItems: NavItem[] }) {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0) return null

  const rootItem = navItems.find(
    item => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )

  const crumbs: Array<{ label: string; href?: string }> = []

  if (rootItem) {
    crumbs.push({ label: rootItem.label, href: rootItem.href })

    const extra = segments.slice(1)
    for (let i = 0; i < extra.length; i++) {
      const seg = extra[i]
      const href = `/${segments.slice(0, i + 2).join('/')}`
      const isLast = i === extra.length - 1
      crumbs.push({ label: formatSegment(seg), href: isLast ? undefined : href })
    }
  }

  if (crumbs.length === 0) return null

  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
      {crumbs.map((crumb, i) => (
        <span className="flex items-center gap-1" key={crumb.label}>
          {i > 0 ? <span>/</span> : null}
          {crumb.href ? (
            <Link className="hover:text-foreground transition-colors" href={crumb.href}>
              {crumb.label}
            </Link>
          ) : (
            <span className="text-foreground">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

function formatSegment(segment: string): string {
  try {
    return formatZoneName(segment)
  } catch {
    return segment.replaceAll('_', ' ').replaceAll('-', ' ')
  }
}
