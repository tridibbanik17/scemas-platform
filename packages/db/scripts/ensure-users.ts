// creates default accounts for each role if they don't exist.
// idempotent: safe to run after every schema push.
/* eslint-disable no-await-in-loop */

import { eq } from 'drizzle-orm'
import { createDb } from '../src/client'
import { accounts } from '../src/schema'

const defaultUsers = [
  { email: 'admin@example.com', username: 'admin', password: '1234', role: 'admin' },
  { email: 'operator@example.com', username: 'operator', password: '1234', role: 'operator' },
  { email: 'viewer@example.com', username: 'viewer', password: '1234', role: 'viewer' },
  { email: 'public@example.com', username: 'public', password: '1234', role: 'viewer' },
] as const

const db = createDb(process.env.DATABASE_URL ?? 'postgres://scemas:scemas@localhost:5432/scemas')

async function ensureUsers() {
  for (const user of defaultUsers) {
    const existing = await db.query.accounts.findFirst({
      where: eq(accounts.email, user.email),
      columns: { id: true },
    })

    if (existing) {
      console.log(`[scemas] ${user.role} account exists (${user.email})`)
      continue
    }

    const passwordHash = await Bun.password.hash(user.password, 'argon2id')

    await db
      .insert(accounts)
      .values({ email: user.email, username: user.username, passwordHash, role: user.role })

    console.log(`[scemas] created ${user.role} account (${user.email} / ${user.password})`)
  }
}

await ensureUsers()
await db.$client.end()
