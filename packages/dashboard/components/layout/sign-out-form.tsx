import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SESSION_COOKIE_NAME } from '@/lib/session'

type SignOutFormProps = {
  className?: string
  label?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
}

export function SignOutForm({
  className,
  label = 'sign out',
  variant = 'outline',
}: SignOutFormProps) {
  return (
    <form action={signOut}>
      <Button className={className} type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  )
}

async function signOut() {
  'use server'

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
    expires: new Date(0),
    secure: process.env.NODE_ENV === 'production',
  })

  redirect('/sign-in')
}
