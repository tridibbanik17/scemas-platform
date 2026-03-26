import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { createAppRouter } from './router'
import { useAuthStore } from './store/auth'

declare global {
  interface Window {
    __traySignOut?: () => void
  }
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1 } },
})

const router = createAppRouter(queryClient)

// expose sign-out for tray menu (called via window.eval from rust)
window.__traySignOut = () => {
  useAuthStore.getState().clearSession()
  window.history.pushState({}, '', '/sign-in')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DragRegion />
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

function DragRegion() {
  return (
    <div
      data-tauri-drag-region
      className="fixed inset-x-0 top-0 z-50 h-12"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    />
  )
}
