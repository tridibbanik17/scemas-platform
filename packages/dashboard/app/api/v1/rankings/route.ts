import { PublicRankingsQuerySchema } from '@scemas/types'
import { getManager } from '@/server/cached'
import {
  createPublicApiBadRequestResponse,
  createPublicApiResponse,
  getRequestSearchParams,
  parsePublicApiInput,
  withApiTokenAuth,
} from '@/server/public-api'

export async function GET(request: Request): Promise<Response> {
  return withApiTokenAuth(request, async () => {
    const parsedInput = parsePublicApiInput(
      PublicRankingsQuerySchema,
      getRequestSearchParams(request),
    )

    if (!parsedInput.success) {
      return createPublicApiBadRequestResponse(parsedInput.error)
    }

    const manager = getManager()
    return createPublicApiResponse(await manager.getPublicRankings(parsedInput.data), 'trend')
  })
}
