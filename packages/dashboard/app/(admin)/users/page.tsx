import { UsersManager } from '@/components/admin/users-manager'
import { serverTrpc, HydrateClient } from '@/lib/trpc-server'

// ManageSecurityPermissions boundary (AccessManager, admin-only)
export default async function UsersPage() {
  void serverTrpc.users.list.prefetch()

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-balance">user management</h1>
      <p className="text-sm text-muted-foreground text-pretty">
        manage which dashboard each account can reach and which control surfaces they can touch
      </p>
      <HydrateClient>
        <UsersManager />
      </HydrateClient>
    </div>
  )
}
