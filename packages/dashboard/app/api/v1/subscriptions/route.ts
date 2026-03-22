import { UpdateAlertSubscriptionSchema } from '@scemas/types'
import { getDb } from '@/server/cached'
import { getSubscription, upsertSubscription } from '@/server/handlers/subscriptions'
import { withScopedAuth, parsePublicApiInput } from '@/server/public-api'

export async function GET(request: Request): Promise<Response> {
  return withScopedAuth(request, 'read', async auth => {
    const db = getDb()
    const subscription = await getSubscription(db, auth.accountId)
    return Response.json(subscription)
  })
}

export async function PUT(request: Request): Promise<Response> {
  return withScopedAuth(request, 'write:operator', async auth => {
    const body = await request.json()
    const parsed = parsePublicApiInput(UpdateAlertSubscriptionSchema, body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }

    const db = getDb()
    const result = await upsertSubscription(db, auth.accountId, parsed.data)
    return Response.json(result)
  })
}
