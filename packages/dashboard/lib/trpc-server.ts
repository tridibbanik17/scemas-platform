import 'server-only'
import { createHydrationHelpers } from '@trpc/react-query/rsc'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { resolveSessionUser } from '@/lib/session'
import { getDb } from '@/server/cached'
import { getJwtSecret } from '@/server/env'
import { appRouter, type AppRouter } from '@/server/router'
import { createCallerFactory } from '@/server/trpc'
import { makeQueryClient } from './query-client'

export const getQueryClient = cache(makeQueryClient)

const serverCallerFactory = createCallerFactory(appRouter)

const caller = serverCallerFactory(async () => {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore
    .getAll()
    .map(c => `${c.name}=${c.value}`)
    .join('; ')
  const user = await resolveSessionUser(cookieHeader, getJwtSecret())

  return { db: getDb(), user, resHeaders: new Headers() }
})

export const { trpc: serverTrpc, HydrateClient } = createHydrationHelpers<AppRouter>(
  caller,
  getQueryClient,
)
