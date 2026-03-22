import { oauthClients } from '@scemas/db/schema'
import { generateRandomToken } from '@/server/oauth'
import { getDb } from '@/server/cached'

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_request', error_description: 'invalid JSON body' }, { status: 400 })
  }

  const clientName = body.client_name
  const redirectUris = body.redirect_uris
  const grantTypes = body.grant_types ?? ['authorization_code', 'refresh_token']
  const scope = body.scope ?? 'read'

  if (typeof clientName !== 'string' || !clientName) {
    return Response.json(
      { error: 'invalid_client_metadata', error_description: 'client_name is required' },
      { status: 400 },
    )
  }

  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every(u => typeof u === 'string')) {
    return Response.json(
      { error: 'invalid_client_metadata', error_description: 'redirect_uris must be a non-empty array of strings' },
      { status: 400 },
    )
  }

  for (const uri of redirectUris) {
    try {
      new URL(uri)
    } catch {
      return Response.json(
        { error: 'invalid_client_metadata', error_description: `invalid redirect_uri: ${uri}` },
        { status: 400 },
      )
    }
  }

  if (!Array.isArray(grantTypes) || !grantTypes.every(g => typeof g === 'string')) {
    return Response.json(
      { error: 'invalid_client_metadata', error_description: 'grant_types must be an array of strings' },
      { status: 400 },
    )
  }

  if (typeof scope !== 'string') {
    return Response.json(
      { error: 'invalid_client_metadata', error_description: 'scope must be a string' },
      { status: 400 },
    )
  }

  const clientId = generateRandomToken(16)
  const db = getDb()

  await db.insert(oauthClients).values({
    clientId,
    clientName,
    redirectUris: redirectUris as string[],
    grantTypes: grantTypes as string[],
    scope,
  })

  return Response.json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      scope,
      token_endpoint_auth_method: 'none',
    },
    { status: 201 },
  )
}
