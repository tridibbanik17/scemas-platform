// PublicUserAgent digital signage display
// ProvidePublicAPI boundary: shows aggregated AQI per zone
// auto-refreshes via the versioned public REST API
// ABSTRACTION: raw sensor data, device IDs, operator metadata are stripped
// public users and third-party developers see this same view

import { ZoneAqiGrid } from '@/components/public/zone-aqi-grid'

export default function PublicDisplayPage() {
  return (
    <div className="space-y-6">
      <ZoneAqiGrid />
    </div>
  )
}
