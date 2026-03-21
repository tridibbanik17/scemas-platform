import { getManager } from '@/server/cached'
import { createPublicApiResponse } from '@/server/public-api'

export async function GET(): Promise<Response> {
  const manager = getManager()
  return createPublicApiResponse(await manager.getPublicZoneList(), 'metadata')
}
