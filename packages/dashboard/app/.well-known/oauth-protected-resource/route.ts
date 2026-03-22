import { getOrigin } from '@/lib/request-origin'

export function GET(request: Request): Response {
  const origin = getOrigin(request)

  return Response.json({
    resource: origin,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: ['read', 'write:operator', 'write:admin'],
    resource_name: 'SCEMAS Environmental Monitoring',
  })
}
