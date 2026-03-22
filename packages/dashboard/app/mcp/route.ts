import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '@/server/mcp-server'
import { validateToken } from '@/server/api-tokens'
import { validateOAuthToken } from '@/server/oauth'
import { getDb } from '@/server/cached'

const TOKEN_PREFIX = 'sk-scemas-'

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const origin = url.origin
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-authorization-server"`,
      },
    })
  }

  const bearerToken = authHeader.slice(7)
  const db = getDb()

  let accountId: string
  let scopes: string[]

  if (bearerToken.startsWith(TOKEN_PREFIX)) {
    const result = await validateToken(db, authHeader)
    if (!result.valid) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.status,
        headers: {
          'content-type': 'application/json',
          'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-authorization-server"`,
        },
      })
    }
    accountId = result.accountId
    scopes = result.scopes
  } else {
    const result = await validateOAuthToken(db, bearerToken)
    if (!result.valid) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.status,
        headers: {
          'content-type': 'application/json',
          'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-authorization-server"`,
        },
      })
    }
    accountId = result.accountId
    scopes = result.scopes
  }

  const server = createMcpServer({ accountId, scopes })
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export { handle as GET, handle as POST, handle as DELETE }
