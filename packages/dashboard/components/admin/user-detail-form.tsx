'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, startTransition, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

type UserDetailFormProps = {
  userId: string
  initialUsername: string
  initialEmail: string
  role: string
  createdAt: string
}

export function UserDetailForm({
  userId,
  initialUsername,
  initialEmail,
  role,
  createdAt,
}: UserDetailFormProps) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [detailsSuccess, setDetailsSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const updateDetails = trpc.users.updateDetails.useMutation({
    onSuccess: () => {
      setDetailsError(null)
      setDetailsSuccess(true)
      startTransition(() => router.refresh())
      void utils.users.list.invalidate()
    },
    onError: error => {
      setDetailsSuccess(false)
      setDetailsError(error.message)
    },
  })

  const resetPassword = trpc.users.resetPassword.useMutation({
    onSuccess: () => {
      setPasswordError(null)
      setPasswordSuccess(true)
      void utils.audit.list.invalidate()
    },
    onError: error => {
      setPasswordSuccess(false)
      setPasswordError(error.message)
    },
  })

  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => {
      void utils.users.list.invalidate()
      startTransition(() => router.push('/users'))
    },
  })

  function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDetailsError(null)
    setDetailsSuccess(false)

    const formData = new FormData(event.currentTarget)
    const username = formData.get('username')
    const email = formData.get('email')

    if (typeof username !== 'string' || typeof email !== 'string') {
      setDetailsError('form submission was malformed')
      return
    }

    if (username.length < 3) {
      setDetailsError('username must be at least 3 characters')
      return
    }

    updateDetails.mutate({ userId, username, email })
  }

  function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)

    const formData = new FormData(event.currentTarget)
    const newPassword = formData.get('newPassword')
    const confirmPassword = formData.get('confirmPassword')

    if (typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
      setPasswordError('form submission was malformed')
      return
    }

    if (newPassword.length < 8) {
      setPasswordError('password must be at least 8 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('passwords do not match')
      return
    }

    resetPassword.mutate({ userId, newPassword })
    event.currentTarget.reset()
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-sm font-medium">account details</h2>
        <form className="space-y-4" onSubmit={handleDetailsSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground" htmlFor="username">
                username
              </label>
              <Input
                defaultValue={initialUsername}
                id="username"
                name="username"
                minLength={3}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground" htmlFor="email">
                email
              </label>
              <Input defaultValue={initialEmail} id="email" name="email" type="email" required />
            </div>
          </div>
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">role</dt>
              <dd>{role}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">created</dt>
              <dd>{createdAt}</dd>
            </div>
          </dl>
          {detailsError ? (
            <p className="text-sm text-destructive" role="alert">
              {detailsError}
            </p>
          ) : null}
          {detailsSuccess ? (
            <p className="text-sm text-muted-foreground">account details updated</p>
          ) : null}
          <Button disabled={updateDetails.isPending} type="submit">
            {updateDetails.isPending ? <Spinner /> : 'save changes'}
          </Button>
        </form>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-sm font-medium">reset password</h2>
        <form className="space-y-4" onSubmit={handlePasswordSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground" htmlFor="newPassword">
                new password
              </label>
              <Input id="newPassword" name="newPassword" type="password" minLength={8} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground" htmlFor="confirmPassword">
                confirm password
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                minLength={8}
                required
              />
            </div>
          </div>
          {passwordError ? (
            <p className="text-sm text-destructive" role="alert">
              {passwordError}
            </p>
          ) : null}
          {passwordSuccess ? (
            <p className="text-sm text-muted-foreground">password has been reset</p>
          ) : null}
          <Button disabled={resetPassword.isPending} type="submit" variant="outline">
            {resetPassword.isPending ? <Spinner /> : 'reset password'}
          </Button>
        </form>
      </div>

      <div className="flex items-center justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={deleteUser.isPending} variant="destructive">
              delete account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>delete account</AlertDialogTitle>
              <AlertDialogDescription>
                this will permanently remove this account and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => deleteUser.mutate({ userId })}
              >
                {deleteUser.isPending ? <Spinner /> : 'delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
