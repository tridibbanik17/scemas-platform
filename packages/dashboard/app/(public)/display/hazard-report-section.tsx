'use client'

// client boundary for the hazard report form on the public display page

import { HazardReportForm } from '@/components/public/hazard-report-form'
import { trpc } from '@/lib/trpc'

export function HazardReportSection() {
  const { data: zones } = trpc.public.getZoneList.useQuery()

  if (!zones || zones.length === 0) return null

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium">see something concerning?</p>
        <p className="text-xs text-muted-foreground text-pretty">
          report environmental hazards, system misuse, or inappropriate content
        </p>
      </div>
      <HazardReportForm zones={zones} />
    </div>
  )
}
