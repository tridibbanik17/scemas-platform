'use client'

import { BackendStatus, useBackendPing } from '@/components/backend-status'

export function SidebarStatus() {
  const { ok, loading } = useBackendPing()
  return <BackendStatus ok={ok} loading={loading} />
}
