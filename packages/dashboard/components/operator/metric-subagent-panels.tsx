'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { MetricPanelData } from '@/lib/metric-panels'
import { ListPagination } from '@/components/list-pagination'
import { formatZoneName } from '@/lib/zones'

export { buildMetricSubagentPanels } from '@/lib/metric-panels'
export type { MetricPanelData } from '@/lib/metric-panels'

const ZONES_PER_PAGE = 5
const ZONE_ROW_HEIGHT = 'h-14'

export function MetricSubagentPanels({
  panels,
  showZoneLinks = true,
}: {
  panels: MetricPanelData[]
  showZoneLinks?: boolean
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {panels.map(panel => (
        <article className="rounded-lg border border-border bg-card p-4" key={panel.metricType}>
          <div className="mb-4 space-y-1">
            <p className="text-xs uppercase text-muted-foreground">{panel.title}</p>
            <p className="font-mono text-3xl tabular-nums">
              {panel.averageValue}{' '}
              <span className="text-sm text-muted-foreground">{panel.unit}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              latest reading window: {panel.latestTime}
            </p>
          </div>

          <ZoneList
            metricType={panel.metricType}
            showZoneLinks={showZoneLinks}
            unit={panel.unit}
            zones={panel.zones}
          />
        </article>
      ))}
    </div>
  )
}

function ZoneList({
  zones,
  metricType,
  unit,
  showZoneLinks,
}: {
  zones: MetricPanelData['zones']
  metricType: string
  unit: string
  showZoneLinks: boolean
}) {
  const [page, setPage] = useState(0)

  if (zones.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        no telemetry has been recorded for this subagent yet
      </p>
    )
  }

  const totalPages = Math.ceil(zones.length / ZONES_PER_PAGE)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageZones = zones.slice(safePage * ZONES_PER_PAGE, (safePage + 1) * ZONES_PER_PAGE)

  const emptySlots = ZONES_PER_PAGE - pageZones.length

  return (
    <div className="flex flex-col">
      <div>
        {pageZones.map((zone, i) => {
          const row = (
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate font-medium">{formatZoneName(zone.zone)}</p>
              <p className="text-xs text-muted-foreground">{zone.sensorCount} sensors</p>
            </div>
          )
          const value = (
            <div className="shrink-0 text-right">
              <p className="font-mono tabular-nums">
                {zone.averageValue} {unit}
              </p>
              <p className="text-xs text-muted-foreground">latest {zone.latestValue}</p>
            </div>
          )
          const cls = `flex items-center justify-between px-3 text-sm transition-colors hover:bg-muted/50 ${ZONE_ROW_HEIGHT} ${i < pageZones.length - 1 ? 'border-b border-border/40' : ''}`

          return showZoneLinks ? (
            <Link className={cls} href={`/metrics/${zone.zone}`} key={`${metricType}-${zone.zone}`}>
              {row}
              {value}
            </Link>
          ) : (
            <div className={cls} key={`${metricType}-${zone.zone}`}>
              {row}
              {value}
            </div>
          )
        })}
        {emptySlots > 0
          ? Array.from({ length: emptySlots }, (_, i) => (
              <div
                className={`${i < emptySlots - 1 ? 'border-b border-border/40' : ''} ${ZONE_ROW_HEIGHT}`}
                key={`empty-${i}`}
              />
            ))
          : null}
      </div>
      <ListPagination
        onPageChange={setPage}
        page={safePage}
        pageSize={ZONES_PER_PAGE}
        totalItems={zones.length}
        totalPages={totalPages}
      />
    </div>
  )
}
