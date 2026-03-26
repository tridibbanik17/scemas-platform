import hamiltonMonitoringRegionsData from '../../../../data/hamilton-monitoring-regions.json'

type ZoneBoundaryFeature = {
  type: 'Feature'
  properties: { zoneId: string; label: string; [k: string]: unknown }
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
}

type ZoneBoundaryFeatureCollection = { type: 'FeatureCollection'; features: ZoneBoundaryFeature[] }

export const hamiltonMonitoringRegions: ZoneBoundaryFeatureCollection = {
  type: 'FeatureCollection',
  features: hamiltonMonitoringRegionsData.features.map(f => ({
    type: 'Feature',
    properties: f.properties,
    geometry: { type: 'MultiPolygon', coordinates: f.geometry.coordinates },
  })),
}

const zoneNameById = new Map(
  hamiltonMonitoringRegions.features.map(f => [f.properties.zoneId, f.properties.label]),
)

export function formatZoneName(zone: string): string {
  return zoneNameById.get(zone) ?? zone.replaceAll('_', ' ')
}
