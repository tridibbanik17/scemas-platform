import { Outlet, useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '@/store/auth'

export function PublicLayout() {
  const user = useAuthStore(s => s.user)
  const clearSession = useAuthStore(s => s.clearSession)
  const navigate = useNavigate()

  const handleSignOut = () => {
    clearSession()
    navigate({ to: '/sign-in' })
  }

  return (
    <div className="flex h-dvh flex-col">
      <div
        data-tauri-drag-region
        className="flex h-12 shrink-0 items-center justify-end gap-4 border-b px-4 text-xs"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span
          className="text-muted-foreground"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {user?.email}
        </span>
        <button
          onClick={handleSignOut}
          className="text-muted-foreground hover:text-foreground"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          sign out
        </button>
      </div>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
