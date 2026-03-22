import { getDb } from '@/server/cached'
import { revokeByTokenHash } from '@/server/oauth'

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? ''
  let params: URLSearchParams

  if (contentType.includes('application/x-www-form-urlencoded')) {
    params = new URLSearchParams(await request.text())
  } else if (contentType.includes('application/json')) {
    const body = await request.json()
    params = new URLSearchParams(body as Record<string, string>)
  } else {
    return new Response(null, { status: 200 })
  }

  const token = params.get('token')
  if (!token) {
    return new Response(null, { status: 200 })
  }

  const db = getDb()
  await revokeByTokenHash(db, token)

  return new Response(null, { status: 200 })
}
