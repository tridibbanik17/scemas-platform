'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

export function DisplayNameForm() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const meQuery = trpc.auth.me.useQuery()
  const updateName = trpc.auth.updateDisplayName.useMutation({
    onSuccess: () => {
      setError(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
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
    <form className="flex max-w-sm gap-2" onSubmit={handleSave}>
      <Input
        defaultValue={meQuery.data?.username ?? ''}
        disabled={updateName.isPending || meQuery.isLoading}
        name="username"
        placeholder="display name"
      />
      <Button
        className="bg-emerald-600 text-white hover:bg-emerald-600/80 dark:bg-emerald-600 dark:hover:bg-emerald-600/80"
        disabled={updateName.isPending}
        size="sm"
        type="submit"
      >
        {updateName.isPending ? <Spinner /> : saved ? 'saved' : 'save'}
      </Button>
      {error ? <p className="self-center text-xs text-destructive">{error}</p> : null}
    </form>
  )
}
