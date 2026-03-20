'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, startTransition, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

export function LoginForm() {
  const router = useRouter()
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const login = trpc.auth.login.useMutation({
    onSuccess: result => {
      setSubmissionError(null)
      startTransition(() => {
        router.replace(result.redirectTo)
        router.refresh()
      })
    },
    onError: error => {
      setSubmissionError(error.message)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmissionError(null)

    const formData = new FormData(event.currentTarget)
    const email = formData.get('email')
    const password = formData.get('password')

    if (typeof email !== 'string' || typeof password !== 'string') {
      setSubmissionError('login form submission was malformed')
      return
    }

    login.mutate({ email, password })
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="email">
          email
        </label>
        <Input
          autoComplete="email"
          id="email"
          name="email"
          placeholder="operator@scemas.local"
          required
          type="email"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="password">
          password
        </label>
        <Input
          autoComplete="current-password"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>

      {submissionError ? (
        <p className="text-sm text-destructive" role="alert">
          {submissionError}
        </p>
      ) : null}

      <Button className="w-full" disabled={login.isPending} type="submit">
        {login.isPending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            signing in
          </span>
        ) : (
          'sign in'
        )}
      </Button>

      <p className="text-sm text-muted-foreground">
        need an account?{' '}
        <Link className="text-foreground underline underline-offset-4" href="/sign-up">
          create one
        </Link>
      </p>
    </form>
  )
}
