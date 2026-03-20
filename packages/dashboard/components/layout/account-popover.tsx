'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'
import { signOut } from './sign-out-action'

type AccountPopoverProps = { username: string; email: string }

export function AccountPopover({ username, email }: AccountPopoverProps) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateName = trpc.auth.updateDisplayName.useMutation({
    onSuccess: () => {
      setEditing(false)
      setError(null)
      utils.auth.me.invalidate()
      router.refresh()
    },
    onError: err => setError(err.message),
  })

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const newName = formData.get('username')
    if (typeof newName !== 'string' || newName.trim().length === 0) return
    updateName.mutate({ username: newName.trim() })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/50"
          type="button"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {username.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{username}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0" side="top" sideOffset={8}>
        {editing ? (
          <form className="space-y-3 p-3" onSubmit={handleSave}>
            <p className="text-xs font-medium">edit display name</p>
            <Input autoFocus defaultValue={username} name="username" placeholder="display name" />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <Button disabled={updateName.isPending} size="sm" type="submit">
                {updateName.isPending ? <Spinner /> : 'save'}
              </Button>
              <Button
                onClick={() => {
                  setEditing(false)
                  setError(null)
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="py-1">
            <button
              className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
              onClick={() => setEditing(true)}
              type="button"
            >
              preferences
            </button>
            <form action={signOut}>
              <button
                className="flex w-full items-center px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-muted/50"
                type="submit"
              >
                log out
              </button>
            </form>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
