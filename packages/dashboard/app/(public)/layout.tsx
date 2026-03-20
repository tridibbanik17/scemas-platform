import { cookies } from 'next/headers'
import Link from 'next/link'
import { SignOutForm } from '@/components/layout/sign-out-form'
import { Button } from '@/components/ui/button'
import { SESSION_COOKIE_NAME } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const hasSession = (await cookies()).has(SESSION_COOKIE_NAME)

  return (
    <div className="dark min-h-dvh bg-background text-foreground">
      <header className="flex items-center justify-between px-8 py-4">
        <h1 className="text-2xl font-semibold text-balance">SCEMAS</h1>
        <div className="flex items-center gap-3">
          <p className="font-mono text-sm text-muted-foreground">Hamilton, ON</p>
          {hasSession ? (
            <SignOutForm label="sign out" variant="secondary" />
          ) : (
            <Button asChild size="sm" variant="secondary">
              <Link href="/sign-in">sign in</Link>
            </Button>
          )}
        </div>
      </header>
      <main className="px-8 pb-8">{children}</main>
    </div>
  )
}
