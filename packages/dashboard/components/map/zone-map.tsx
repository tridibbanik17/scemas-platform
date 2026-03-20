'use client'

import { useState } from 'react'
import Map, { Marker, Popup } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

type SensorPin = {
  sensorId: string
  zone: string
  lat: number
  lng: number
  metricType: string
  value: number
}

type ZoneMapProps = {
  sensors: SensorPin[]
  alertCounts: Record<string, number>
}

export type { SensorPin }

export function ZoneMap({ sensors, alertCounts }: ZoneMapProps) {
  const [selected, setSelected] = useState<SensorPin | null>(null)

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card" style={{ height: 400 }}>
      <Map
        initialViewState={{
          longitude: -79.87,
          latitude: 43.255,
          zoom: 12,
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        style={{ width: '100%', height: '100%' }}
      >
        {sensors.map(sensor => {
          const zoneAlerts = alertCounts[sensor.zone] ?? 0
          return (
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
                className="h-3 w-3 cursor-pointer rounded-full border-2 border-white shadow-sm"
                style={{
                  backgroundColor: zoneAlerts > 0
                    ? 'var(--color-severity-critical)'
                    : 'var(--color-severity-low)',
                }}
              />
            </Marker>
          )
        })}

        {selected && (
          <Popup
            longitude={selected.lng}
            latitude={selected.lat}
            onClose={() => setSelected(null)}
            closeOnClick={false}
          >
            <div className="space-y-1 text-xs">
              <p className="font-medium">{selected.sensorId}</p>
              <p>
                {selected.metricType.replaceAll('_', ' ')}:{' '}
                <span className="font-mono">{selected.value}</span>
              </p>
              <p className="text-muted-foreground">{selected.zone.replaceAll('_', ' ')}</p>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  )
}
