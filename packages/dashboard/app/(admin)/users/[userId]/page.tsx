import { accounts, auditLogs } from '@scemas/db/schema'
import { desc, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'

import { getDb } from '@/server/cached'

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  const db = getDb()
  const [account, recentLogs] = await Promise.all([
    db.query.accounts.findFirst({
      where: eq(accounts.id, userId),
    }),
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
      <h1 className="text-xl font-semibold text-balance">user detail</h1>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-card p-4">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">username</dt>
              <dd>{account.username}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">email</dt>
              <dd>{account.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">role</dt>
              <dd>{account.role}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">created</dt>
              <dd>{account.createdAt.toLocaleString()}</dd>
            </div>
          </dl>
        </div>

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
                  <p className="text-xs text-muted-foreground">
                    {log.createdAt.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
