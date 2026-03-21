import Link from 'next/link'
import { ApiExplorer } from '@/components/public/api-explorer'
import { Separator } from '@/components/ui/separator'

export default function ApiExplorerPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-normal text-balance">public api</h1>
          <p className="text-sm text-muted-foreground/70 text-pretty">
            read-only endpoints for third-party developers and citizen integrations. zone summaries,
            per-metric history, rankings, and feed health. no authentication required.
          </p>
        </div>
        <div>
          <Link
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            href="/api/v1/openapi"
            target="_blank"
          >
            openapi spec
          </Link>
        </div>
      </div>
      <Separator />
      <ApiExplorer />
    </div>
  )
}
