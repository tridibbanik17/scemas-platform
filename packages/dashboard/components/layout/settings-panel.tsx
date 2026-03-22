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
import {
  PAGE_SIZE_OPTIONS,
  PUBLIC_PAGE_SIZE_OPTIONS,
  REFRESH_INTERVAL_OPTIONS,
  useSettings,
  usePublicSettings,
  type PageSizeOption,
  type PublicPageSizeOption,
  type RefreshIntervalOption,
} from '@/lib/settings'

type SettingsPanelProps = { open: boolean; onOpenChange: (open: boolean) => void; role: string }

export function SettingsPanel({ open, onOpenChange, role }: SettingsPanelProps) {
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

          {role !== 'viewer' ? (
            <>
              <Separator />
              <PageSizeSection />
            </>
          ) : null}

          {role === 'viewer' ? (
            <>
              <Separator />
              <PublicDisplaySection />
            </>
          ) : null}

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

function PublicDisplaySection() {
  const publicPageSize = usePublicSettings(s => s.pageSize)
  const setPublicPageSize = usePublicSettings(s => s.setPageSize)
  const refreshInterval = usePublicSettings(s => s.refreshInterval)
  const setRefreshInterval = usePublicSettings(s => s.setRefreshInterval)

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-medium text-muted-foreground">public display</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground/50 text-pretty">
          controls the public air quality display for all visitors.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">regions per page</p>
          <Select
            value={String(publicPageSize)}
            onValueChange={v => setPublicPageSize(Number(v) as PublicPageSizeOption)}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLIC_PAGE_SIZE_OPTIONS.map(size => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">refresh interval</p>
          <Select
            value={String(refreshInterval)}
            onValueChange={v => setRefreshInterval(Number(v) as RefreshIntervalOption)}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH_INTERVAL_OPTIONS.map(interval => (
                <SelectItem key={interval} value={String(interval)}>
                  {interval}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  )
}
