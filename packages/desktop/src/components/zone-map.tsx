import { useCallback, useRef, useState } from 'react'
import Map, { Marker, Popup, type MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { formatZoneName, hamiltonMonitoringRegions } from '@/lib/zones'

export type SensorPin = {
  sensorId: string
  displayName: string
  zone: string
  lat: number
  lng: number
  metricType: string
  value: number
}

type ProjectedPoint = { x: number; y: number }
type ProjectedRegion = {
  zoneId: string
  label: string
  path: string
  labelPoint: ProjectedPoint
  alertCount: number
}
type ProjectedOverlay = { width: number; height: number; regions: ProjectedRegion[] }

const HAMILTON_BOUNDS: [[number, number], [number, number]] = [
  [-80.02, 43.195],
  [-79.735, 43.285],
]
const HAMILTON_CENTER = { lng: -79.878, lat: 43.241 }

const LABEL_CHAR_WIDTH = 6.6
const LABEL_PADDING_X = 8
const LABEL_PADDING_Y = 4
const LABEL_FONT_SIZE = 11
const LABEL_HEIGHT = LABEL_FONT_SIZE + LABEL_PADDING_Y * 2
const LABEL_RADIUS = 4

export function ZoneMap({
  sensors,
  alertCounts,
}: {
  sensors: SensorPin[]
  alertCounts: Record<string, number>
}) {
  const [selected, setSelected] = useState<SensorPin | null>(null)
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)
  const [layers, setLayers] = useState({ sensors: true, zones: false })
  const [overlay, setOverlay] = useState<ProjectedOverlay | null>(null)
  const [drifted, setDrifted] = useState(false)
  const mapRef = useRef<MapRef | null>(null)

  const reproject = useCallback(() => {
    setOverlay(buildProjectedOverlay(mapRef.current, alertCounts))
    if (mapRef.current) {
      const c = mapRef.current.getCenter()
      setDrifted(
        Math.abs(c.lng - HAMILTON_CENTER.lng) > 0.05 ||
          Math.abs(c.lat - HAMILTON_CENTER.lat) > 0.05,
      )
    }
  }, [alertCounts])

  return (
    <div className="h-96 overflow-hidden rounded-lg border bg-card">
      <div className="relative size-full">
        <Map
          attributionControl={false}
          initialViewState={{ longitude: -79.878, latitude: 43.241, zoom: 10.2 }}
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          style={{ width: '100%', height: '100%' }}
          ref={mapRef}
          onLoad={e => {
            for (const layer of e.target.getStyle().layers ?? []) {
              if (layer.type === 'symbol')
                e.target.setLayoutProperty(layer.id, 'visibility', 'none')
            }
            e.target.fitBounds(HAMILTON_BOUNDS, { padding: 24, duration: 0 })
            reproject()
          }}
          onMove={reproject}
          onResize={reproject}
        >
          {layers.sensors &&
            sensors.map(sensor => (
              <Marker
                key={sensor.sensorId}
                longitude={sensor.lng}
                latitude={sensor.lat}
                onClick={e => {
                  e.originalEvent.stopPropagation()
                  setSelected(sensor)
                }}
              >
                <div
                  className="size-3 cursor-pointer rounded-full border-2 border-white shadow-sm"
                  style={{
                    backgroundColor: (alertCounts[sensor.zone] ?? 0) > 0 ? '#dc2626' : '#16a34a',
                  }}
                />
              </Marker>
            ))}

          {selected && layers.sensors && (
            <Popup
              longitude={selected.lng}
              latitude={selected.lat}
              onClose={() => setSelected(null)}
              closeOnClick={false}
              className="sensor-popup"
            >
              <div className="space-y-1 pr-4 text-xs">
                <p className="font-medium">{selected.displayName}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{selected.sensorId}</p>
                <p>
                  {selected.metricType.replaceAll('_', ' ')}:{' '}
                  <span className="font-mono tabular-nums">{selected.value}</span>
                </p>
                <p className="text-muted-foreground">{formatZoneName(selected.zone)}</p>
              </div>
            </Popup>
          )}
        </Map>

        {layers.zones && overlay && (
          <svg
            className="absolute inset-0"
            viewBox={`0 0 ${overlay.width} ${overlay.height}`}
            preserveAspectRatio="none"
            style={{ pointerEvents: 'none' }}
          >
            {overlay.regions.map(region => {
              const isHovered = hoveredZone === region.zoneId
              const hasAlerts = region.alertCount > 0
              const labelWidth = region.label.length * LABEL_CHAR_WIDTH + LABEL_PADDING_X * 2
              return (
                <g key={region.zoneId}>
                  <path
                    d={region.path}
                    fill={hasAlerts ? '#d97706' : '#a692c3'}
                    fillOpacity={isHovered ? 0.35 : hasAlerts ? 0.22 : 0.18}
                    stroke={hasAlerts ? '#d97706' : '#a692c3'}
                    strokeLinejoin="round"
                    strokeOpacity={isHovered ? 1 : 0.8}
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    style={{
                      pointerEvents: 'fill',
                      cursor: 'pointer',
                      transition:
                        'fill-opacity 150ms ease-out, stroke-opacity 150ms ease-out, stroke-width 150ms ease-out',
                    }}
                    onMouseEnter={() => setHoveredZone(region.zoneId)}
                    onMouseLeave={() => setHoveredZone(null)}
                  />
                  <g
                    opacity={isHovered ? 1 : 0}
                    style={{ pointerEvents: 'none', transition: 'opacity 150ms ease-out' }}
                  >
                    <rect
                      fill="var(--color-card, #fff)"
                      fillOpacity={0.92}
                      height={LABEL_HEIGHT}
                      rx={LABEL_RADIUS}
                      ry={LABEL_RADIUS}
                      stroke="var(--color-border, #e5e5e5)"
                      strokeOpacity={0.6}
                      strokeWidth={1}
                      width={labelWidth}
                      x={region.labelPoint.x - labelWidth / 2}
                      y={region.labelPoint.y - LABEL_HEIGHT / 2}
                    />
                    <text
                      dominantBaseline="central"
                      fill="var(--color-foreground, #1a1a1a)"
                      fontSize={LABEL_FONT_SIZE}
                      fontWeight="500"
                      textAnchor="middle"
                      x={region.labelPoint.x}
                      y={region.labelPoint.y}
                      style={{ pointerEvents: 'none' }}
                    >
                      {region.label}
                    </text>
                  </g>
                </g>
              )
            })}
          </svg>
        )}

        <div className="absolute bottom-3 left-3 flex gap-1">
          {(['sensors', 'regions'] as const).map(layer => (
            <button
              key={layer}
              onClick={() => {
                setLayers(prev => ({
                  ...prev,
                  [layer === 'regions' ? 'zones' : layer]:
                    !prev[layer === 'regions' ? 'zones' : layer],
                }))
                if (layer === 'sensors' && layers.sensors) setSelected(null)
                if (layer === 'regions' && layers.zones) setHoveredZone(null)
              }}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                (layer === 'regions' ? layers.zones : layers.sensors)
                  ? 'border-border bg-card text-foreground shadow-sm'
                  : 'border-transparent bg-card/60 text-muted-foreground'
              }`}
            >
              {layer}
            </button>
          ))}
        </div>
        {drifted && (
          <button
            onClick={() => {
              mapRef.current?.fitBounds(HAMILTON_BOUNDS, { padding: 24, duration: 600 })
              setDrifted(false)
            }}
            className="absolute bottom-3 right-3 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm"
          >
            reset
          </button>
        )}
      </div>
    </div>
  )
}

function buildProjectedOverlay(
  mapRef: MapRef | null,
  alertCounts: Record<string, number>,
): ProjectedOverlay | null {
  if (!mapRef) return null
  const canvas = mapRef.getMap().getCanvas()
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (width === 0 || height === 0) return null

  const regions: ProjectedRegion[] = []
  for (const feature of hamiltonMonitoringRegions.features) {
    const pathSegments: string[] = []
    const allPoints: ProjectedPoint[] = []
    for (const polygon of feature.geometry.coordinates) {
      for (const ring of polygon) {
        const projected = ring.map(pt => {
          const p = mapRef.project([pt[0], pt[1]])
          return { x: p.x, y: p.y }
        })
        if (projected.length < 3) continue
        pathSegments.push(
          projected
            .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
            .join(' ') + ' Z',
        )
        allPoints.push(...projected)
      }
    }
    if (pathSegments.length === 0) continue
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity
    for (const pt of allPoints) {
      minX = Math.min(minX, pt.x)
      maxX = Math.max(maxX, pt.x)
      minY = Math.min(minY, pt.y)
      maxY = Math.max(maxY, pt.y)
    }
    regions.push({
      zoneId: feature.properties.zoneId,
      label: feature.properties.label as string,
      path: pathSegments.join(' '),
      labelPoint: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      alertCount: alertCounts[feature.properties.zoneId] ?? 0,
    })
  }
  return { width, height, regions }
}
