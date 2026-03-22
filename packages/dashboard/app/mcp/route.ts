import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '@/server/mcp-server'
import { validateToken } from '@/server/api-tokens'
import { validateOAuthToken } from '@/server/oauth'
import { getDb } from '@/server/cached'
import { getOrigin } from '@/lib/request-origin'

const TOKEN_PREFIX = 'sk-scemas-'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'WWW-Authenticate',
} as const

function corsify(response: Response): Response {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    response.headers.set(k, v)
  }
  return response
}

async function handle(request: Request): Promise<Response> {
  const origin = getOrigin(request)
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return corsify(new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    }))
  }

  const bearerToken = authHeader.slice(7)
  const db = getDb()

  let accountId: string
  let scopes: string[]

  if (bearerToken.startsWith(TOKEN_PREFIX)) {
    const result = await validateToken(db, authHeader)
    if (!result.valid) {
      return corsify(new Response(JSON.stringify({ error: result.error }), {
        status: result.status,
        headers: {
          'content-type': 'application/json',
          'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        },
      }))
    }
    accountId = result.accountId
    scopes = result.scopes
  } else {
    const result = await validateOAuthToken(db, bearerToken)
    if (!result.valid) {
      return corsify(new Response(JSON.stringify({ error: result.error }), {
        status: result.status,
        headers: {
          'content-type': 'application/json',
          'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        },
      }))
    }
    accountId = result.accountId
    scopes = result.scopes
  }

  const server = createMcpServer({ accountId, scopes })
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)
  return corsify(await transport.handleRequest(request))
}

export { handle as GET, handle as POST, handle as DELETE }
