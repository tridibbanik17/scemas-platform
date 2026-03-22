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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'

type TokenScope = 'read' | 'write:operator' | 'write:admin'

const ALL_SCOPE_OPTIONS: {
  value: TokenScope
  label: string
  description: string
  minRole: string
}[] = [
  {
    value: 'read',
    label: 'read',
    description: 'read-only access to all endpoints',
    minRole: 'viewer',
  },
  {
    value: 'write:operator',
    label: 'write:operator',
    description: 'read + acknowledge/resolve alerts',
    minRole: 'operator',
  },
  {
    value: 'write:admin',
    label: 'write:admin',
    description: 'full access including rule management',
    minRole: 'admin',
  },
]

const ROLE_RANK: Record<string, number> = { viewer: 0, operator: 1, admin: 2 }

const SCOPE_EXPANSION: Record<TokenScope, TokenScope[]> = {
  read: ['read'],
  'write:operator': ['read', 'write:operator'],
  'write:admin': ['read', 'write:operator', 'write:admin'],
}

function scopeOptionsForRole(role: string) {
  const rank = ROLE_RANK[role] ?? 0
  return ALL_SCOPE_OPTIONS.filter(opt => (ROLE_RANK[opt.minRole] ?? 0) <= rank)
}

function expandScopes(scope: TokenScope): TokenScope[] {
  return SCOPE_EXPANSION[scope] ?? [scope]
}

export function ApiTokensManager() {
  const utils = trpc.useUtils()
  const meQuery = trpc.auth.me.useQuery()
  const userRole = meQuery.data?.role ?? 'viewer'
  const availableScopes = scopeOptionsForRole(userRole)
  const tokensQuery = trpc.apiTokens.list.useQuery()
  const createMutation = trpc.apiTokens.create.useMutation({
    onSuccess: () => utils.apiTokens.list.invalidate(),
  })
  const revokeMutation = trpc.apiTokens.revoke.useMutation({
    onSuccess: () => utils.apiTokens.list.invalidate(),
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [scope, setScope] = useState<TokenScope>('read')
  const [revealedToken, setRevealedToken] = useState<string | null>(null)

  async function handleCreate() {
    if (!label.trim()) return
    const result = await createMutation.mutateAsync({
      label: label.trim(),
      scopes: expandScopes(scope),
    })
    setRevealedToken(result.token)
    setLabel('')
    setScope('read')
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
        <DialogContent className="sm:max-w-md">
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
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">scope</label>
            <Select
              disabled={createMutation.isPending}
              onValueChange={v => setScope(v as TokenScope)}
              value={scope}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableScopes.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="font-mono text-xs">{opt.label}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {opt.description}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            <pre className="truncate p-3 pr-10 font-mono text-xs leading-relaxed select-all">
              {revealedToken}
            </pre>
          </div>
          <DialogFooter className="mt-2">
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
            <TokenRow
              key={token.id}
              token={token}
              onRevoke={() => revokeMutation.mutate({ tokenId: token.id })}
              revoking={revokeMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TokenRow({
  token,
  onRevoke,
  revoking,
}: {
  token: {
    id: string
    prefix: string
    label: string
    accountUsername?: string
    scopes: string[]
    expiresAt: string
    createdAt: string
    lastUsedAt: string | null
  }
  onRevoke: () => void
  revoking: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="font-mono text-xs text-foreground/80">{token.prefix}</code>
          <span className="truncate text-xs text-muted-foreground">{token.label}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground/60">
          {token.accountUsername && <span>{token.accountUsername}</span>}
          <span>created {formatDate(token.createdAt)}</span>
          <span>expires {formatDate(token.expiresAt)}</span>
          {token.lastUsedAt && <span>used {formatDate(token.lastUsedAt)}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="token details"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              type="button"
            >
              <svg className="size-4" fill="currentColor" viewBox="0 0 16 16">
                <circle cx="4" cy="8" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="12" cy="8" r="1.5" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              scopes
            </DropdownMenuLabel>
            <div className="flex flex-wrap gap-1.5 px-2 pb-2">
              {token.scopes.map((s: string) => (
                <span
                  className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                  key={s}
                >
                  {s}
                </span>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button disabled={revoking} onClick={onRevoke} size="xs" variant="outline">
          revoke
        </Button>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  const month = date.toLocaleString('en', { month: 'short' }).toLowerCase()
  return `${month} ${date.getDate()}`
}
