// AuthorizeIoTDevices boundary: admin device management
// register, update, and revoke IoT sensor devices

import { devices, auditLogs } from '@scemas/db/schema'
import { RegisterDeviceSchema, UpdateDeviceSchema } from '@scemas/types'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { formatZoneName, normalizeZoneId } from '@/lib/zones'
import { router, adminProcedure } from '../trpc'
import { callRustEndpoint, extractRustErrorMessage } from '../rust-client'
import { TRPCError } from '@trpc/server'

export const devicesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.devices.findMany({
      orderBy: [desc(devices.registeredAt)],
    })
    return rows.map(d => ({
      ...d,
      zoneName: formatZoneName(d.zone),
    }))
  }),

  get: adminProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      return ctx.db.query.devices.findFirst({
        where: eq(devices.deviceId, input.deviceId),
      })
    }),

  register: adminProcedure.input(RegisterDeviceSchema).mutation(async ({ input, ctx }) => {
    const zone = normalizeZoneId(input.zone) ?? input.zone
    const { data, status } = await callRustEndpoint('/internal/devices/register', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: input.deviceId,
        deviceType: input.deviceType,
        zone,
        adminId: ctx.user.id,
      }),
    })

    if (status !== 200) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: extractRustErrorMessage(data) ?? 'failed to register device',
      })
    }

    return data
  }),

  update: adminProcedure.input(UpdateDeviceSchema).mutation(async ({ input, ctx }) => {
    const zone = input.zone ? (normalizeZoneId(input.zone) ?? input.zone) : undefined
    const { data, status } = await callRustEndpoint(
      `/internal/devices/${encodeURIComponent(input.deviceId)}/update`,
      {
        method: 'POST',
        body: JSON.stringify({
          deviceId: input.deviceId,
          deviceType: input.deviceType,
          zone,
          status: input.status,
          adminId: ctx.user.id,
        }),
      },
    )

    if (status !== 200) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: extractRustErrorMessage(data) ?? 'failed to update device',
      })
    }

    return data
  }),

  revoke: adminProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const { data, status } = await callRustEndpoint(
        `/internal/devices/${encodeURIComponent(input.deviceId)}/revoke`,
        {
          method: 'POST',
          body: JSON.stringify({ deviceId: input.deviceId, adminId: ctx.user.id }),
        },
      )

      if (status !== 200) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: extractRustErrorMessage(data) ?? 'failed to revoke device',
        })
      }

      return { success: true }
    }),
})
