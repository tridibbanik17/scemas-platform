'use client'

// AuthorizeIoTDevices boundary: admin device management UI

import { useState } from 'react'
import { ListPagination } from '@/components/list-pagination'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePageSize } from '@/lib/settings'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

const metricTypes = ['temperature', 'humidity', 'air_quality', 'noise_level'] as const

const statusColors: Record<string, string> = {
  active: 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400',
  inactive: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  revoked: 'border-border bg-muted text-muted-foreground',
}

const metricUnits: Record<string, string> = {
  temperature: '\u00B0C',
  humidity: '%',
  air_quality: '\u00B5g/m\u00B3',
  noise_level: 'dB',
}

export function DevicesManager() {
  const pageSize = usePageSize()
  const [showRegister, setShowRegister] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [newDeviceId, setNewDeviceId] = useState('')
  const [newDeviceType, setNewDeviceType] = useState<string>('')
  const [newDeviceZone, setNewDeviceZone] = useState('')

  const { data: devices, refetch } = trpc.devices.list.useQuery()

  const register = trpc.devices.register.useMutation({
    onSuccess: () => {
      refetch()
      setShowRegister(false)
      setNewDeviceId('')
      setNewDeviceType('')
      setNewDeviceZone('')
    },
  })

  const revoke = trpc.devices.revoke.useMutation({ onSuccess: () => refetch() })

  function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!newDeviceId || !newDeviceType || !newDeviceZone) return
    register.mutate({
      deviceId: newDeviceId,
      deviceType: newDeviceType as 'temperature' | 'humidity' | 'air_quality' | 'noise_level',
      zone: newDeviceZone,
    })
  }

  // derived state, no effects needed
  const allDevices = devices ?? []
  const totalPages = Math.ceil(allDevices.length / pageSize)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageDevices = allDevices.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const selectedDevice = selectedDeviceId
    ? allDevices.find(d => d.deviceId === selectedDeviceId)
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-mono tabular-nums">{allDevices.length}</span> registered devices
        </p>
        <Button size="sm" variant="outline" onClick={() => setShowRegister(!showRegister)}>
          {showRegister ? 'cancel' : 'register device'}
        </Button>
      </div>

      {showRegister ? (
        <form
          onSubmit={handleRegister}
          className="rounded-lg border border-border bg-card p-4 space-y-3"
        >
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="device-id">device id</Label>
              <Input
                id="device-id"
                value={newDeviceId}
                onChange={e => setNewDeviceId(e.target.value)}
                placeholder="e.g. temp-dt-001"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="device-type">metric type</Label>
              <Select value={newDeviceType} onValueChange={setNewDeviceType}>
                <SelectTrigger id="device-type">
                  <SelectValue placeholder="select type" />
                </SelectTrigger>
                <SelectContent>
                  {metricTypes.map(t => (
                    <SelectItem key={t} value={t}>
                      {t.replaceAll('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="device-zone">zone</Label>
              <Input
                id="device-zone"
                value={newDeviceZone}
                onChange={e => setNewDeviceZone(e.target.value)}
                placeholder="e.g. downtown_core"
              />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={register.isPending}>
            {register.isPending ? 'registering...' : 'register'}
          </Button>
        </form>
      ) : null}

      {allDevices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-sm text-muted-foreground">no devices registered</p>
          {!showRegister ? (
            <Button variant="ghost" size="sm" onClick={() => setShowRegister(true)}>
              register first device
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <div className="divide-y divide-border" style={{ minHeight: `${pageSize * 3}rem` }}>
            {pageDevices.map(device => (
              <div
                key={device.deviceId}
                role="button"
                tabIndex={0}
                className={cn(
                  'flex w-full cursor-default items-center justify-between gap-3 px-4 py-3 text-left',
                  selectedDeviceId === device.deviceId ? 'bg-accent/50' : '',
                )}
                onClick={() => {
                  setSelectedDeviceId(selectedDeviceId === device.deviceId ? null : device.deviceId)
                }}
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
                    className={cn(
                      'inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
                      statusColors[device.status],
                    )}
                  >
                    {device.status}
                  </span>
                  <span className="truncate text-sm font-medium font-mono">{device.deviceId}</span>
                  <span className="text-xs text-muted-foreground">
                    {device.deviceType.replaceAll('_', ' ')}
                  </span>
                  <span className="text-xs text-muted-foreground">{device.zoneName}</span>
                </div>
                {device.status === 'active' ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={revoke.isPending}
                        onClick={e => e.stopPropagation()}
                      >
                        revoke
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={e => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-balance">revoke device</AlertDialogTitle>
                        <AlertDialogDescription className="text-pretty">
                          this will prevent <span className="font-mono">{device.deviceId}</span>{' '}
                          from submitting telemetry. the device can be re-activated later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => revoke.mutate({ deviceId: device.deviceId })}
                        >
                          revoke
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
            ))}
          </div>
          <ListPagination
            onPageChange={setPage}
            page={safePage}
            pageSize={pageSize}
            totalItems={allDevices.length}
            totalPages={totalPages}
          />
        </div>
      )}

      {selectedDevice ? <DeviceDetail device={selectedDevice} /> : null}
    </div>
  )
}

function DeviceDetail({
  device,
}: {
  device: {
    deviceId: string
    deviceType: string
    zone: string
    zoneName: string
    status: string
    registeredAt: string | Date
  }
}) {
  // derived during render, no effect
  const registeredAt =
    typeof device.registeredAt === 'string' ? new Date(device.registeredAt) : device.registeredAt

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3 text-sm font-medium">device details</div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 px-4 py-4 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">device id</p>
          <p className="font-mono">{device.deviceId}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">status</p>
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
              statusColors[device.status],
            )}
          >
            {device.status}
          </span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">metric type</p>
          <p className="text-pretty">
            {device.deviceType.replaceAll('_', ' ')}{' '}
            <span className="text-xs text-muted-foreground">
              ({metricUnits[device.deviceType] ?? '?'})
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">zone</p>
          <p className="text-pretty">{device.zoneName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">zone id</p>
          <p className="font-mono text-xs">{device.zone}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">registered</p>
          <p className="tabular-nums">{registeredAt.toLocaleString()}</p>
        </div>
      </div>
    </div>
  )
}
