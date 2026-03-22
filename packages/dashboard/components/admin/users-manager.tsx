'use client'

import type { Role } from '@scemas/types'
import { MoreHorizontalCircle01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { ListPagination } from '@/components/list-pagination'
import { usePageSize } from '@/lib/settings'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

const roles = ['operator', 'admin', 'viewer'] as const
const ONE_HOUR_MS = 3_600_000

function isRole(value: string): value is Role {
  return roles.some(r => r === value)
}

export function UsersManager() {
  const utils = trpc.useUtils()
  const pageSize = usePageSize()
  const [page, setPage] = useState(0)
  const [submissionError, setSubmissionError] = useState<string | null>(null)

  const usersQuery = trpc.users.list.useQuery()
  const createUser = trpc.users.create.useMutation({
    onSuccess: async () => {
      setSubmissionError(null)
      await Promise.all([utils.users.list.invalidate(), utils.audit.list.invalidate()])
    },
    onError: error => {
      setSubmissionError(error.message)
    },
  })
  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.users.list.invalidate(), utils.audit.list.invalidate()])
    },
  })
  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: async (_, variables) => {
      utils.users.list.setData(
        undefined,
        current => current?.filter(u => u.id !== variables.userId) ?? current,
      )
      await Promise.all([utils.users.list.invalidate(), utils.audit.list.invalidate()])
    },
    onError: error => {
      setSubmissionError(error.message)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmissionError(null)

    const formData = new FormData(event.currentTarget)
    const email = formData.get('email') as string
    const username = formData.get('username') as string
    const password = formData.get('password') as string
    const role = formData.get('role') as string

    if (!isRole(role)) {
      setSubmissionError('invalid role selected')
      return
    }

    if (username.length < 3) {
      setSubmissionError('username must be at least 3 characters')
      return
    }

    if (password.length < 8) {
      setSubmissionError('password must be at least 8 characters')
      return
    }

    createUser.mutate({ email, username, password, role })
    event.currentTarget.reset()
  }

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
  const totalPages = Math.ceil(users.length / pageSize)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageUsers = users.slice(safePage * pageSize, (safePage + 1) * pageSize)

  return (
    <div className="space-y-6">
      <ActiveSessionsPanel />

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          accounts and permissions
        </div>

        <form
          className="grid gap-3 border-b border-border px-4 py-4 md:grid-cols-5"
          onSubmit={handleSubmit}
        >
          <Input name="email" placeholder="email" type="email" required />
          <Input name="username" placeholder="username" minLength={3} required />
          <Input name="password" placeholder="password" type="password" minLength={8} required />
          <NativeSelect className="w-full" defaultValue="operator" name="role">
            {roles.map(r => (
              <NativeSelectOption key={r} value={r}>
                {r}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button disabled={createUser.isPending} type="submit">
            {createUser.isPending ? <Spinner /> : 'create account'}
          </Button>
        </form>

        {submissionError ? (
          <p className="px-4 py-2 text-sm text-destructive" role="alert">
            {submissionError}
          </p>
        ) : null}

        {users.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
            no accounts exist yet. use the form above to create one.
          </p>
        ) : (
          <>
            <div className="divide-y divide-border">
              {pageUsers.map(account => (
                <AccountRow
                  key={account.id}
                  account={account}
                  deleteUser={deleteUser}
                  updateRole={updateRole}
                />
              ))}
            </div>
            <ListPagination
              onPageChange={setPage}
              page={safePage}
              pageSize={pageSize}
              totalItems={users.length}
              totalPages={totalPages}
            />
          </>
        )}
      </div>
    </div>
  )
}

type AccountData = { id: string; email: string; username: string; role: string; createdAt: Date }

function AccountRow({
  account,
  deleteUser,
  updateRole,
}: {
  account: AccountData
  deleteUser: ReturnType<typeof trpc.users.delete.useMutation>
  updateRole: ReturnType<typeof trpc.users.updateRole.useMutation>
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">
          <Link className="underline-offset-4 hover:underline" href={`/users/${account.id}`}>
            {account.username}
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">
          {account.email} · {account.role} · created {account.createdAt.toLocaleString()}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="account actions" size="sm" variant="ghost">
            <HugeiconsIcon icon={MoreHorizontalCircle01Icon} size={16} strokeWidth={1.5} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>role</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={account.role}
            onValueChange={value => {
              if (isRole(value)) updateRole.mutate({ userId: account.id, role: value })
            }}
          >
            {roles.map(role => (
              <DropdownMenuRadioItem key={role} value={role}>
                {role}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
            >
              delete account
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">delete account</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              this will permanently remove {account.username}&apos;s account and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteUser.mutate({ userId: account.id })}
            >
              {deleteUser.isPending ? <Spinner /> : 'delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ActiveSessionsPanel() {
  const utils = trpc.useUtils()
  const pageSize = usePageSize()
  const [page, setPage] = useState(0)
  const sessionsQuery = trpc.users.activeSessions.useQuery()
  const revokeSession = trpc.users.revokeSession.useMutation({
    onSuccess: async () => {
      await utils.users.activeSessions.invalidate()
    },
  })

  if (sessionsQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Spinner />
          loading sessions
        </span>
      </div>
    )
  }

  if (sessionsQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-card p-4 text-sm text-destructive">
        {sessionsQuery.error.message}
      </div>
    )
  }

  const sessions = sessionsQuery.data ?? []
  const expiringCount = sessions.filter(
    s => s.expiry.getTime() - Date.now() < ONE_HOUR_MS,
  ).length
  const totalPages = Math.ceil(sessions.length / pageSize)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageSessions = sessions.slice(
    safePage * pageSize,
    (safePage + 1) * pageSize,
  )

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">active sessions</span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground/50">
            {sessions.length}
          </span>
        </div>
        {expiringCount > 0 ? (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            {expiringCount} expiring within 1h
          </span>
        ) : null}
      </div>
      {sessions.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">no active sessions</p>
      ) : (
        <>
          <div className={`min-h-[calc(theme(spacing.14)*${pageSize})] divide-y divide-border`}>
            {pageSessions.map(session => (
              <div
                className="flex h-14 items-center justify-between px-4"
                key={session.tokenValue}
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{session.username}</p>
                  <p className="text-xs text-muted-foreground">
                    {session.role} · expires {session.expiry.toLocaleString()}
                  </p>
                </div>
                <Button
                  disabled={revokeSession.isPending}
                  onClick={() => revokeSession.mutate({ tokenValue: session.tokenValue })}
                  size="sm"
                  variant="outline"
                >
                  {revokeSession.isPending ? <Spinner /> : 'revoke'}
                </Button>
              </div>
            ))}
          </div>
          <ListPagination
            onPageChange={setPage}
            page={safePage}
            pageSize={pageSize}
            totalItems={sessions.length}
            totalPages={totalPages}
          />
        </>
      )}
    </div>
  )
}
