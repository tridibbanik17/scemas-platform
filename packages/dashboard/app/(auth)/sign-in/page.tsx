import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/login-form'

export const metadata: Metadata = { title: 'sign in' }

// LoginToSCEMAS boundary (AccessManager)
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : undefined

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-balance">SCEMAS</h1>
      </div>
      <LoginForm returnTo={returnTo} />
    </div>
  )
}
