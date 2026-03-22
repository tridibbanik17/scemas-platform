export function getOrigin(request: Request): string {
  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  const host = request.headers.get('host')
  if (host) {
    return `${proto}://${host}`
  }
  const url = new URL(request.url)
  if (url.hostname === '0.0.0.0') {
    return `${url.protocol}//localhost:${url.port}`
  }
  return url.origin
}
