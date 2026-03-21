'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SettingsPanel } from './settings-panel'
import { signOut } from './sign-out-action'

type AccountPopoverProps = { username: string; email: string }

export function AccountPopover({ username, email }: AccountPopoverProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
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
        <PopoverContent align="start" className="w-48 p-0" side="top" sideOffset={8}>
          <div className="py-1">
            <button
              className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
              onClick={() => {
                setPopoverOpen(false)
                setSettingsOpen(true)
              }}
              type="button"
            >
              settings
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
        </PopoverContent>
      </Popover>
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
