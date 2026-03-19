import {
  drizzle,
  type PostgresJsDatabase,
} from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'
import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema> & { $client: Sql }

declare global {
  var __scemasDb: Database | undefined
  var __scemasDbClient: Sql | undefined
  var __scemasDbUrl: string | undefined
}

export function createDb(connectionString: string): Database {
  if (
    globalThis.__scemasDb &&
    globalThis.__scemasDbClient &&
    globalThis.__scemasDbUrl === connectionString
  ) {
    return globalThis.__scemasDb
  }

  const client = postgres(connectionString, { prepare: false })
  const db = drizzle(client, { schema })

  globalThis.__scemasDb = db
  globalThis.__scemasDbClient = client
  globalThis.__scemasDbUrl = connectionString

  return db
}
