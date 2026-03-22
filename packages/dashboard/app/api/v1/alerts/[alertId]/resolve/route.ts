import { resolveAlert } from '@/server/handlers/alerts'
import { withScopedAuth } from '@/server/public-api'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ alertId: string }> },
): Promise<Response> {
  return withScopedAuth(request, 'write:operator', async auth => {
    const { alertId } = await params
    const result = await resolveAlert(alertId, auth.accountId)

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 })
    }

    return Response.json({ success: true })
  })
}
