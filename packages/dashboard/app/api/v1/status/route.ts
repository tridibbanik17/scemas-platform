import { getManager } from '@/server/cached'
import { createPublicApiResponse, withApiTokenAuth } from '@/server/public-api'

export async function GET(request: Request): Promise<Response> {
  return withApiTokenAuth(request, async () => {
    const manager = getManager()
    return createPublicApiResponse(await manager.getPublicFeedStatus(), 'live')
  })
}
