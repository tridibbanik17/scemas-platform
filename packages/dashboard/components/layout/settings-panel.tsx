'use client'

import { ApiTokensManager } from '@/components/operator/api-tokens-manager'
import { DisplayNameForm } from '@/components/operator/display-name-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { PAGE_SIZE_OPTIONS, useSettings, type PageSizeOption } from '@/lib/settings'

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

          <PageSizeSection />

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

function PageSizeSection() {
  const pageSize = useSettings(s => s.pageSize)
  const setPageSize = useSettings(s => s.setPageSize)

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-medium text-muted-foreground">items per page</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground/50 text-pretty">
          applies to all paginated lists across the dashboard.
        </p>
      </div>
      <Select
        value={String(pageSize)}
        onValueChange={v => setPageSize(Number(v) as PageSizeOption)}
      >
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZE_OPTIONS.map(size => (
            <SelectItem key={size} value={String(size)}>
              {size} items
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </section>
  )
}
