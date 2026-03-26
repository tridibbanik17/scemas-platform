import { type FormEvent, useState, useMemo } from 'react'
import { useSettings } from '@/lib/settings'
import { useTauriQuery, useTauriMutation } from '@/lib/tauri'

type Role = 'admin' | 'operator' | 'viewer'

interface User {
  id: string
  email: string
  username: string
  role: Role
  createdAt: string
}

interface ActiveSession {
  tokenValue: string
  username: string
  role: string
  expiry: string
}

const ROLES: Role[] = ['operator', 'admin', 'viewer']

export function UsersPage() {
  const pageSize = useSettings(s => s.pageSize)
  const users = useTauriQuery<User[]>('users_list', {})
  const sessions = useTauriQuery<ActiveSession[]>('users_active_sessions', {})

  const createUser = useTauriMutation<{ email: string; username: string; password: string }>(
    'auth_signup',
    ['users_list'],
  )
  const updateRole = useTauriMutation<{ args: { userId: string; role: Role } }>(
    'users_update_role',
    ['users_list'],
  )
  const deleteUser = useTauriMutation<{ args: { userId: string } }>('users_delete', ['users_list'])
  const revokeSession = useTauriMutation<{ args: { tokenValue: string } }>('users_revoke_session', [
    'users_active_sessions',
  ])

  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [sessionPage, setSessionPage] = useState(0)
  const [userPage, setUserPage] = useState(0)

  const allSessions = sessions.data ?? []
  const allUsers = users.data ?? []

  const sessionSlice = useMemo(() => {
    const start = sessionPage * pageSize
    return { items: allSessions.slice(start, start + pageSize), total: allSessions.length, start }
  }, [allSessions, sessionPage, pageSize])

  const userSlice = useMemo(() => {
    const start = userPage * pageSize
    return { items: allUsers.slice(start, start + pageSize), total: allUsers.length, start }
  }, [allUsers, userPage, pageSize])

  function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmissionError(null)
    const fd = new FormData(event.currentTarget)
    createUser.mutate(
      {
        email: String(fd.get('email')),
        username: String(fd.get('username')),
        password: String(fd.get('password')),
      },
      {
        onSuccess: () => {
          setSubmissionError(null)
          ;(event.target as HTMLFormElement).reset()
        },
        onError: () => setSubmissionError('failed to create account'),
      },
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-balance">user management</h1>
        <p className="text-sm text-muted-foreground">
          manage which dashboard each account can reach and which control surfaces they can touch
        </p>
      </div>

      {/* active sessions */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className="text-sm font-medium">active sessions</span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground/50">
            {allSessions.length}
          </span>
        </div>
        {sessions.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">loading sessions...</p>
        ) : allSessions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">no active sessions</p>
        ) : (
          <>
            <div className="divide-y">
              {sessionSlice.items.map(s => (
                <div key={s.tokenValue} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{s.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.role} · expires {new Date(s.expiry).toLocaleString()}
                    </p>
                  </div>
                  <button
                    disabled={revokeSession.isPending}
                    onClick={() => revokeSession.mutate({ args: { tokenValue: s.tokenValue } })}
                    className="h-7 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
                  >
                    revoke
                  </button>
                </div>
              ))}
            </div>
            <Pagination
              start={sessionSlice.start}
              count={sessionSlice.items.length}
              total={sessionSlice.total}
              onPrev={() => setSessionPage(p => Math.max(0, p - 1))}
              onNext={() => setSessionPage(p => p + 1)}
              hasNext={sessionSlice.start + pageSize < sessionSlice.total}
              hasPrev={sessionPage > 0}
            />
          </>
        )}
      </div>

      {/* accounts */}
      <div className="rounded-lg border">
        <div className="border-b px-4 py-3 text-sm font-medium">accounts and permissions</div>

        <form className="grid gap-3 border-b px-4 py-4 md:grid-cols-5" onSubmit={handleCreateUser}>
          <input
            name="email"
            type="email"
            placeholder="email"
            required
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          />
          <input
            name="username"
            placeholder="username"
            minLength={3}
            required
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          />
          <input
            name="password"
            type="password"
            placeholder="password"
            minLength={8}
            required
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          />
          <select
            name="role"
            defaultValue="operator"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {ROLES.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={createUser.isPending}
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            create account
          </button>
        </form>

        {submissionError && <p className="px-4 py-2 text-sm text-destructive">{submissionError}</p>}

        {allUsers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">no accounts yet</p>
        ) : (
          <>
            <div className="divide-y">
              {userSlice.items.map(account => (
                <div
                  key={account.id}
                  className="relative flex items-center justify-between px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{account.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {account.email} · {account.role} · created{' '}
                      {new Date(account.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpenId(menuOpenId === account.id ? null : account.id)}
                      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="actions"
                    >
                      ···
                    </button>
                    {menuOpenId === account.id && (
                      <div className="absolute right-0 top-8 z-20 w-40 rounded-md border bg-popover p-1 shadow-md">
                        <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground">
                          role
                        </p>
                        {ROLES.map(r => (
                          <button
                            key={r}
                            onClick={() => {
                              if (r !== account.role)
                                updateRole.mutate({ args: { userId: account.id, role: r } })
                              setMenuOpenId(null)
                            }}
                            className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${r === account.role ? 'text-primary font-medium' : ''}`}
                          >
                            {r}
                            {r === account.role && <span>✓</span>}
                          </button>
                        ))}
                        <div className="my-1 h-px bg-border" />
                        <button
                          onClick={() => {
                            deleteUser.mutate({ args: { userId: account.id } })
                            setMenuOpenId(null)
                          }}
                          className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
                        >
                          delete account
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              start={userSlice.start}
              count={userSlice.items.length}
              total={userSlice.total}
              onPrev={() => setUserPage(p => Math.max(0, p - 1))}
              onNext={() => setUserPage(p => p + 1)}
              hasNext={userSlice.start + pageSize < userSlice.total}
              hasPrev={userPage > 0}
            />
          </>
        )}
      </div>
    </div>
  )
}

function Pagination({
  start,
  count,
  total,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  start: number
  count: number
  total: number
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
}) {
  return (
    <div className="flex items-center justify-between border-t px-4 py-2">
      <span className="text-xs tabular-nums text-muted-foreground">
        {start + 1}–{start + count} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={!hasPrev}
          onClick={onPrev}
          className="h-7 rounded-md border border-input px-2 text-xs font-medium disabled:opacity-30 hover:bg-accent"
        >
          previous
        </button>
        <button
          disabled={!hasNext}
          onClick={onNext}
          className="h-7 rounded-md border border-input px-2 text-xs font-medium disabled:opacity-30 hover:bg-accent"
        >
          next
        </button>
      </div>
    </div>
  )
}
