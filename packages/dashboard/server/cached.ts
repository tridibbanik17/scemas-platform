import { cache } from 'react'
import { createDb } from '@scemas/db'

import { createDataDistributionManager } from './data-distribution-manager'
import { getDatabaseUrl } from './env'

export const getDb = cache(() => createDb(getDatabaseUrl()))

export const getManager = cache(() => createDataDistributionManager(getDb()))
