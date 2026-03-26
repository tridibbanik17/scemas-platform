import { useState, useMemo } from 'react'
import { useSettings } from '@/lib/settings'
import { useTauriQuery, useTauriMutation } from '@/lib/tauri'

type DeviceStatus = 'active' | 'inactive' | 'revoked'
type MetricType = 'temperature' | 'humidity' | 'air_quality' | 'noise_level'

interface Device {
  deviceId: string
  deviceType: string
  zone: string
  zoneName?: string
  status: DeviceStatus
  registeredAt?: string
}

const metricTypes: MetricType[] = ['temperature', 'humidity', 'air_quality', 'noise_level']

const STATUS_CLS: Record<DeviceStatus, string> = {
  active: 'border-green-500/20 bg-green-500/10 text-green-700',
  inactive: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700',
  revoked: 'border-border bg-muted text-muted-foreground',
}

const metricUnits: Record<string, string> = {
  temperature: '\u00B0C',
  humidity: '%',
  air_quality: '\u00B5g/m\u00B3',
  noise_level: 'dB',
}

export function DevicesPage() {
  const devices = useTauriQuery<Device[]>('devices_list', {})

  const register = useTauriMutation<{
    args: { deviceId: string; deviceType: MetricType; zone: string }
  }>('devices_register', ['devices_list'])

  const revoke = useTauriMutation<{ args: { deviceId: string } }>('devices_revoke', [
    'devices_list',
  ])

  const [showRegister, setShowRegister] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)

  const pageSize = useSettings(s => s.pageSize)
  const [page, setPage] = useState(0)
  const [newDeviceId, setNewDeviceId] = useState('')
  const [newDeviceType, setNewDeviceType] = useState<MetricType>('temperature')
  const [newDeviceZone, setNewDeviceZone] = useState('')

  function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!newDeviceId || !newDeviceZone) return
    register.mutate(
      { args: { deviceId: newDeviceId, deviceType: newDeviceType, zone: newDeviceZone } },
      {
        onSuccess: () => {
          setShowRegister(false)
          setNewDeviceId('')
          setNewDeviceType('temperature')
          setNewDeviceZone('')
        },
      },
    )
  }

  const allDevices = devices.data ?? []
  const deviceSlice = useMemo(() => {
    const start = page * pageSize
    return { items: allDevices.slice(start, start + pageSize), total: allDevices.length, start }
  }, [allDevices, page, pageSize])

  if (devices.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">loading devices...</p>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-balance">devices</h1>
        <p className="text-sm text-muted-foreground">
          register, update, and revoke IoT sensor devices
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-mono tabular-nums">{allDevices.length}</span> registered devices
        </p>
        <button
          onClick={() => setShowRegister(!showRegister)}
          className="h-8 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
        >
          {showRegister ? 'cancel' : 'register device'}
        </button>
      </div>

      {showRegister && (
        <form onSubmit={handleRegister} className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
          <input
            value={newDeviceId}
            onChange={e => setNewDeviceId(e.target.value)}
            placeholder="device id (e.g. temp-dt-001)"
            required
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          />
          <select
            value={newDeviceType}
            onChange={e => {
              const val = e.target.value
              if ((metricTypes as string[]).includes(val)) {
                setNewDeviceType(val as MetricType)
              }
            }}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {metricTypes.map(t => (
              <option key={t} value={t}>
                {t.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <input
            value={newDeviceZone}
            onChange={e => setNewDeviceZone(e.target.value)}
            placeholder="zone (e.g. downtown_core)"
            required
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          />
          <button
            type="submit"
            disabled={register.isPending}
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {register.isPending ? 'registering...' : 'register'}
          </button>
        </form>
      )}

      {allDevices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-sm text-muted-foreground">no devices registered</p>
          {!showRegister && (
            <button
              onClick={() => setShowRegister(true)}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              register first device
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <div className="divide-y">
            {deviceSlice.items.map(device => (
              <div key={device.deviceId}>
                <div
                  role="button"
                  tabIndex={0}
                  className={`flex w-full cursor-default items-center justify-between gap-3 px-4 py-3 text-left ${
                    selectedDeviceId === device.deviceId ? 'bg-accent/50' : ''
                  }`}
                  onClick={() =>
                    setSelectedDeviceId(
                      selectedDeviceId === device.deviceId ? null : device.deviceId,
                    )
                  }
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedDeviceId(
                        selectedDeviceId === device.deviceId ? null : device.deviceId,
                      )
                    }
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLS[device.status]}`}
                    >
                      {device.status}
                    </span>
                    <span className="truncate text-sm font-medium font-mono">
                      {device.deviceId}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {device.deviceType.replaceAll('_', ' ')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {device.zoneName ?? device.zone}
                    </span>
                  </div>

                  {device.status === 'active' && (
                    <>
                      {confirmRevokeId === device.deviceId ? (
                        <div
                          className="flex items-center gap-1"
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => e.stopPropagation()}
                          role="group"
                        >
                          <button
                            onClick={() => {
                              revoke.mutate(
                                { args: { deviceId: device.deviceId } },
                                { onSuccess: () => setConfirmRevokeId(null) },
                              )
                            }}
                            disabled={revoke.isPending}
                            className="h-7 rounded-md bg-destructive px-2 text-xs font-medium text-destructive-foreground disabled:opacity-50"
                          >
                            confirm
                          </button>
                          <button
                            onClick={() => setConfirmRevokeId(null)}
                            className="h-7 rounded-md border border-input px-2 text-xs font-medium hover:bg-accent"
                          >
                            cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setConfirmRevokeId(device.deviceId)
                          }}
                          className="h-7 rounded-md border border-input px-2 text-xs font-medium hover:bg-accent"
                        >
                          revoke
                        </button>
                      )}
                    </>
                  )}
                </div>

                {selectedDeviceId === device.deviceId && (
                  <div className="border-t bg-muted/20 px-4 py-4">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">device id</p>
                        <p className="font-mono">{device.deviceId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">status</p>
                        <span
                          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLS[device.status]}`}
                        >
                          {device.status}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">metric type</p>
                        <p>
                          {device.deviceType.replaceAll('_', ' ')}{' '}
                          <span className="text-xs text-muted-foreground">
                            ({metricUnits[device.deviceType] ?? '?'})
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">zone</p>
                        <p>{device.zoneName ?? device.zone}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">zone id</p>
                        <p className="font-mono text-xs">{device.zone}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">registered</p>
                        <p className="tabular-nums">
                          {device.registeredAt
                            ? new Date(device.registeredAt).toLocaleString()
                            : 'unknown'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t px-4 py-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              {deviceSlice.start + 1}–{deviceSlice.start + deviceSlice.items.length} of{' '}
              {deviceSlice.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="h-7 rounded-md border border-input px-2 text-xs font-medium disabled:opacity-30 hover:bg-accent"
              >
                previous
              </button>
              <button
                disabled={deviceSlice.start + pageSize >= deviceSlice.total}
                onClick={() => setPage(p => p + 1)}
                className="h-7 rounded-md border border-input px-2 text-xs font-medium disabled:opacity-30 hover:bg-accent"
              >
                next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
