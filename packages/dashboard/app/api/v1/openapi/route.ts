import { buildOpenApiSpec } from '@scemas/types/openapi'
import { createPublicApiResponse } from '@/server/public-api'

export async function GET(): Promise<Response> {
  return createPublicApiResponse(buildOpenApiSpec(), 'metadata')
}
