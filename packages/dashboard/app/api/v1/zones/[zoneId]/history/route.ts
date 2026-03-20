import { PublicZoneHistoryQuerySchema } from '@scemas/types'
import { isKnownZoneId, normalizeZoneId } from '@/lib/zones'
import { getManager } from '@/server/cached'
import {
  createPublicApiBadRequestResponse,
  createPublicApiNotFoundResponse,
  createPublicApiResponse,
  getRequestSearchParams,
  parsePublicApiInput,
} from '@/server/public-api'

type ZoneRouteContext = { params: Promise<{ zoneId: string }> }

export async function GET(request: Request, { params }: ZoneRouteContext): Promise<Response> {
  const { zoneId } = await params
  const normalizedZoneId = normalizeZoneId(zoneId)

  if (!isKnownZoneId(normalizedZoneId)) {
    return createPublicApiNotFoundResponse(`unknown zone: ${zoneId}`)
  }

  const parsedInput = parsePublicApiInput(PublicZoneHistoryQuerySchema, {
    zoneId: normalizedZoneId,
    ...getRequestSearchParams(request),
  })

  if (!parsedInput.success) {
    return createPublicApiBadRequestResponse(parsedInput.error)
  }

  const manager = getManager()
  const history = await manager.getPublicZoneHistory(parsedInput.data)

  return createPublicApiResponse(history, 'trend')
}
