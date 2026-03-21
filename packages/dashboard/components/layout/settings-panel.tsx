'use client'

import { ApiTokensManager } from '@/components/operator/api-tokens-manager'
import { DisplayNameForm } from '@/components/operator/display-name-form'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type SettingsPanelProps = { open: boolean; onOpenChange: (open: boolean) => void }

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle>settings</SheetTitle>
          <SheetDescription>account preferences and API token management.</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-6 pb-6">
          <section className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground">display name</h3>
            <DisplayNameForm />
          </section>

          <Separator />

          <section className="space-y-3">
            <div>
              <h3 className="text-xs font-medium text-muted-foreground">api tokens</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground/50">
                bearer tokens for the public REST API. valid for 90 days.
              </p>
            </div>
            <ApiTokensManager />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
