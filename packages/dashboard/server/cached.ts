import { createDb, createDbWorker } from '@scemas/db'
import { cache } from 'react'
import { createDataDistributionManager } from './data-distribution-manager'
import { getDatabaseUrl } from './env'

type HyperdriveBinding = { connectionString: string }

type CloudflareRuntimeContext = { env?: { HYPERDRIVE?: unknown } }

function getWorkerDatabaseUrl(): string | null {
  if (typeof globalThis.caches === 'undefined') {
    return null
  }

  try {
    const { getCloudflareContext } = require('@opennextjs/cloudflare')
    const context = getCloudflareContext()

    if (!isCloudflareRuntimeContext(context)) {
      return null
    }

    const hyperdrive = context.env?.HYPERDRIVE
    return isHyperdriveBinding(hyperdrive) ? hyperdrive.connectionString : null
  } catch {
    return null
  }
}

function isCloudflareWorker(): boolean {
  return typeof globalThis.caches !== 'undefined'
}

function isCloudflareRuntimeContext(value: unknown): value is CloudflareRuntimeContext {
  return typeof value === 'object' && value !== null
}

function isHyperdriveBinding(value: unknown): value is HyperdriveBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    'connectionString' in value &&
    typeof value.connectionString === 'string' &&
    value.connectionString.length > 0
  )
}

export const getDb = cache(() => {
  const workerDatabaseUrl = getWorkerDatabaseUrl()
  if (workerDatabaseUrl) {
    return createDbWorker(workerDatabaseUrl)
  }

  const databaseUrl = getDatabaseUrl()

  if (isCloudflareWorker()) {
    return createDbWorker(databaseUrl)
  }

  return createDb(databaseUrl)
})

export const getManager = cache(() => createDataDistributionManager(getDb()))
