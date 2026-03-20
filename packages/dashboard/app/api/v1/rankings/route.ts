import { PublicRankingsQuerySchema } from '@scemas/types'
import { getManager } from '@/server/cached'
import {
  createPublicApiBadRequestResponse,
  createPublicApiResponse,
  getRequestSearchParams,
  parsePublicApiInput,
} from '@/server/public-api'

export async function GET(request: Request): Promise<Response> {
  const parsedInput = parsePublicApiInput(
    PublicRankingsQuerySchema,
    getRequestSearchParams(request),
  )

  if (!parsedInput.success) {
    return createPublicApiBadRequestResponse(parsedInput.error)
  }

  const manager = getManager()
  const rankings = await manager.getPublicRankings(parsedInput.data)

  return createPublicApiResponse(rankings, 'trend')
}
