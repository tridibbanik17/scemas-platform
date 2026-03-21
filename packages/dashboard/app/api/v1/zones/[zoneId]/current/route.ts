import { getManager } from '@/server/cached'
import {
  createPublicApiNotFoundResponse,
  createPublicApiResponse,
  withApiTokenAuth,
} from '@/server/public-api'

type ZoneRouteContext = { params: Promise<{ zoneId: string }> }

export async function GET(request: Request, { params }: ZoneRouteContext): Promise<Response> {
  return withApiTokenAuth(request, async () => {
    const { zoneId } = await params
    const manager = getManager()
    const zone = await manager.getPublicZoneCurrent(zoneId)

    if (!zone) {
      return createPublicApiNotFoundResponse(`unknown zone: ${zoneId}`)
    }

    return createPublicApiResponse(zone, 'live')
  })
}
