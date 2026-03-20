import { accounts, auditLogs } from '@scemas/db/schema'
import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { UserDetailForm } from '@/components/admin/user-detail-form'
import { HydrateClient } from '@/lib/trpc-server'
import { getDb } from '@/server/cached'

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const db = getDb()
  const [account, recentLogs] = await Promise.all([
    db.query.accounts.findFirst({ where: eq(accounts.id, userId) }),
    db.query.auditLogs.findMany({
      where: eq(auditLogs.userId, userId),
      orderBy: [desc(auditLogs.createdAt)],
      limit: 10,
    }),
  ])

  if (!account) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          href="/users"
        >
          back to users
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-balance">{account.username}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          edit account details, reset password, or remove this account
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <HydrateClient>
          <UserDetailForm
            userId={account.id}
            initialUsername={account.username}
            initialEmail={account.email}
            role={account.role}
            createdAt={account.createdAt.toLocaleString()}
          />
        </HydrateClient>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-medium">recent account activity</h2>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              no audit events are associated with this account yet
            </p>
          ) : (
            <div className="space-y-3">
              {recentLogs.map(log => (
                <div className="rounded-md border border-border/60 p-3" key={log.id}>
                  <p className="text-sm font-medium">{log.action}</p>
                  <p className="text-xs text-muted-foreground">{log.createdAt.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
