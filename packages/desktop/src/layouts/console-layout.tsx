import { Outlet, Link, useRouterState, useNavigate } from '@tanstack/react-router'
import { useHealth } from '@/lib/tauri'
import { useAuthStore } from '@/store/auth'

const operatorNav = [
  { label: 'dashboard', path: '/dashboard' },
  { label: 'alerts', path: '/alerts' },
  { label: 'metrics', path: '/metrics' },
  { label: 'subscriptions', path: '/subscriptions' },
]

const adminNav = [
  { label: 'rules', path: '/rules' },
  { label: 'users', path: '/users' },
  { label: 'devices', path: '/devices' },
  { label: 'reports', path: '/reports' },
  { label: 'health', path: '/health' },
  { label: 'audit', path: '/audit' },
]

export function ConsoleLayout() {
  const user = useAuthStore(s => s.user)
  const clearSession = useAuthStore(s => s.clearSession)
  const health = useHealth()
  const location = useRouterState({ select: s => s.location })
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'
  const connected = health.data != null

  const navItems = isAdmin ? adminNav : operatorNav

  const handleSignOut = () => {
    clearSession()
    navigate({ to: '/sign-in' })
  }

  return (
    <div className="flex h-dvh">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div
          data-tauri-drag-region
          className="h-8 shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
        <nav className="flex-1 overflow-y-auto p-3">
          {navItems.map(item => (
            <NavItem key={item.path} {...item} active={location.pathname.startsWith(item.path)} />
          ))}
        </nav>

        <div className="space-y-2 border-t p-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span
                className={`size-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
              />
              {connected ? 'connected' : 'disconnected'}
            </div>
            <Link
              to="/settings"
              className={`rounded-md px-2 py-1 transition-colors ${
                location.pathname === '/settings'
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/70 hover:text-foreground'
              }`}
            >
              settings
            </Link>
            <button
              onClick={handleSignOut}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          data-tauri-drag-region
          className="flex h-10 shrink-0 items-center gap-0.5 border-b px-2"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div
            className="flex items-center gap-0.5"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button
              onClick={() => window.history.back()}
              className="inline-flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground"
              aria-label="go back"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 3L5 8l5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              onClick={() => window.history.forward()}
              className="inline-flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground"
              aria-label="go forward"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <span className="ml-2 text-[11px] text-muted-foreground/70">{location.pathname}</span>
        </div>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function NavItem({ label, path, active }: { label: string; path: string; active: boolean }) {
  return (
    <Link
      to={path}
      className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
      }`}
    >
      {label}
    </Link>
  )
}
