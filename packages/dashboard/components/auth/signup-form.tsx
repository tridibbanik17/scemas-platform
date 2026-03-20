'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, startTransition, useState } from 'react'
import { BackendStatus } from '@/components/backend-status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

export function SignupForm() {
  const router = useRouter()
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const signup = trpc.auth.signup.useMutation({
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
    const username = formData.get('username')
    const email = formData.get('email')
    const password = formData.get('password')

    if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      setSubmissionError('signup form submission was malformed')
      return
    }

    signup.mutate({ username, email, password })
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="username">
          username
        </label>
        <Input
          autoComplete="username"
          id="username"
          name="username"
          placeholder="city-operator"
          required
        />
      </div>

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
          autoComplete="new-password"
          id="password"
          minLength={8}
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

      <Button className="w-full" disabled={signup.isPending} type="submit">
        {signup.isPending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            creating account
          </span>
        ) : (
          'create account'
        )}
      </Button>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          already have an account?{' '}
          <Link className="text-foreground underline underline-offset-4" href="/sign-in">
            sign in
          </Link>
        </p>
        <BackendStatus />
      </div>
    </form>
  )
}
