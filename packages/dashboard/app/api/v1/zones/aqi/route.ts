import { getManager } from '@/server/cached'

export async function GET(): Promise<Response> {
  const manager = getManager()
  const zones = await manager.getPublicZoneAqi()

  return Response.json(zones, {
    headers: {
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=30',
    },
  })
}
