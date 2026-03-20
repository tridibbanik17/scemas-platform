// PublicUserAgent digital signage display
// ProvidePublicAPI boundary: shows aggregated AQI per monitoring region
// auto-refreshes via the versioned public REST API
// ABSTRACTION: raw sensor data, device IDs, operator metadata are stripped
// public users and third-party developers see this same view

import { MonitoringRegionDirectory } from '@/components/public/monitoring-region-directory'
import { ZoneAqiGrid } from '@/components/public/zone-aqi-grid'

export default function PublicDisplayPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-normal text-balance">public air quality display</h1>
        <p className="text-sm text-muted-foreground/70 text-pretty">
          live monitoring-region conditions grouped from hamilton&apos;s official planning-unit
          layer. the public api route stays <code>/api/v1/zones/aqi</code> for compatibility.
        </p>
      </div>
      <ZoneAqiGrid />
      <MonitoringRegionDirectory />
    </div>
  )
}
