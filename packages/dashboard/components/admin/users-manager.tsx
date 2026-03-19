'use client'

import Link from 'next/link'
import { useState } from 'react'

import { ListPagination } from '@/components/list-pagination'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

const roles = ['operator', 'admin', 'viewer'] as const
const PAGE_SIZE = 10

export function UsersManager() {
  const utils = trpc.useUtils()
  const [page, setPage] = useState(0)
  const usersQuery = trpc.users.list.useQuery()
  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.users.list.invalidate(),
        utils.audit.list.invalidate(),
      ])
    },
  })

  if (usersQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Spinner />
          loading users
        </span>
      </div>
    )
  }

  if (usersQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-card p-4 text-sm text-destructive">
        {usersQuery.error.message}
      </div>
    )
  }

  const users = usersQuery.data ?? []
  const totalPages = Math.ceil(users.length / PAGE_SIZE)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageUsers = users.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  )

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3 text-sm font-medium">
        accounts and permissions
      </div>
      {users.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
          no accounts exist yet
        </p>
      ) : (
        <>
          <div className="divide-y divide-border">
            {pageUsers.map(account => (
              <div className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between" key={account.id}>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    <Link className="underline-offset-4 hover:underline" href={`/users/${account.id}`}>
                      {account.username}
                    </Link>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {account.email} | created {account.createdAt.toLocaleString()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {roles.map(role => (
                    <Button
                      disabled={updateRole.isPending}
                      key={role}
                      onClick={() => updateRole.mutate({ userId: account.id, role })}
                      size="sm"
                      type="button"
                      variant={account.role === role ? 'default' : 'outline'}
                    >
                      {role}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <ListPagination
            onPageChange={setPage}
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={users.length}
            totalPages={totalPages}
          />
        </>
      )}
    </div>
  )
}
