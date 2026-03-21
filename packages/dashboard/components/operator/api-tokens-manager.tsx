'use client'

import { useState } from 'react'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

export function ApiTokensManager() {
  const utils = trpc.useUtils()
  const tokensQuery = trpc.apiTokens.list.useQuery()
  const createMutation = trpc.apiTokens.create.useMutation({
    onSuccess: () => utils.apiTokens.list.invalidate(),
  })
  const revokeMutation = trpc.apiTokens.revoke.useMutation({
    onSuccess: () => utils.apiTokens.list.invalidate(),
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [revealedToken, setRevealedToken] = useState<string | null>(null)

  async function handleCreate() {
    if (!label.trim()) return
    const result = await createMutation.mutateAsync({ label: label.trim() })
    setRevealedToken(result.token)
    setLabel('')
    setCreateOpen(false)
  }

  const tokens = tokensQuery.data ?? []

  return (
    <div className="space-y-4">
      {/* generate button */}
      <Button
        className="bg-emerald-600 text-white hover:bg-emerald-600/80 dark:bg-emerald-600 dark:hover:bg-emerald-600/80"
        onClick={() => setCreateOpen(true)}
        size="sm"
      >
        generate token
      </Button>

      {/* create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>generate api token</DialogTitle>
            <DialogDescription>
              tokens are valid for 90 days. you can have up to 5 active tokens.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            disabled={createMutation.isPending}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="label (e.g. monitoring script)"
            value={label}
          />
          {createMutation.error && (
            <p className="text-xs text-destructive">{createMutation.error.message}</p>
          )}
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} size="sm" variant="outline">
              cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-600/80 dark:bg-emerald-600 dark:hover:bg-emerald-600/80"
              disabled={!label.trim() || createMutation.isPending}
              onClick={handleCreate}
              size="sm"
            >
              {createMutation.isPending ? 'generating...' : 'generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* token reveal dialog */}
      <Dialog
        open={revealedToken !== null}
        onOpenChange={open => {
          if (!open) setRevealedToken(null)
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>token created</DialogTitle>
            <DialogDescription>copy this token now. it will not be shown again.</DialogDescription>
          </DialogHeader>
          <div className="relative overflow-hidden rounded border border-border bg-muted/50">
            {revealedToken && (
              <div className="absolute right-2 top-1.5 z-10">
                <CopyButton value={revealedToken} />
              </div>
            )}
            <pre className="overflow-x-auto p-3 pr-10 font-mono text-xs leading-relaxed select-all">
              {revealedToken}
            </pre>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealedToken(null)} size="sm" variant="outline">
              done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* token list */}
      {tokensQuery.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Spinner />
          loading tokens
        </div>
      ) : tokens.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">no tokens yet.</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {tokens.map(token => (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5" key={token.id}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs text-foreground/80">{token.prefix}</code>
                  <span className="truncate text-xs text-muted-foreground">{token.label}</span>
                  <TokenStatus expiresAt={token.expiresAt} />
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground/60">
                  {token.accountUsername && <span>{token.accountUsername}</span>}
                  <span>created {formatDate(token.createdAt)}</span>
                  <span>expires {formatDate(token.expiresAt)}</span>
                  {token.lastUsedAt && <span>used {formatDate(token.lastUsedAt)}</span>}
                </div>
              </div>
              <Button
                disabled={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate({ tokenId: token.id })}
                size="xs"
                variant="outline"
              >
                revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TokenStatus({ expiresAt }: { expiresAt: string }) {
  if (new Date(expiresAt) < new Date()) {
    return (
      <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
        expired
      </span>
    )
  }

  return (
    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
      active
    </span>
  )
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  const month = date.toLocaleString('en', { month: 'short' }).toLowerCase()
  return `${month} ${date.getDate()}`
}
