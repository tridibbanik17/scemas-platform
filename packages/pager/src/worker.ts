import { renderPage } from './page'

interface Env {
  PAGER: DurableObjectNamespace<PagerRoom>
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

export class PagerRoom implements DurableObject {
  state: DurableObjectState
  events: Array<{ id: string; receivedAt: string; payload: unknown }> = []
  html: string

  constructor(state: DurableObjectState) {
    this.state = state
    this.html = renderPage()
    this.state.getWebSockets().forEach(ws => ws.accept())
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (url.pathname === '/ws') {
      const [client, server] = Object.values(new WebSocketPair())
      this.state.acceptWebSocket(server)
      if (this.events.length > 0) {
        server.send(JSON.stringify(this.events))
      }
      return new Response(null, { status: 101, webSocket: client })
    }

    if (request.method === 'POST' && url.pathname === '/webhook') {
      const payload = await request.json().catch(() => null)
      const event = {
        id: crypto.randomUUID(),
        receivedAt: new Date().toISOString(),
        payload,
      }

      this.events.unshift(event)
      if (this.events.length > 200) this.events.length = 200

      const msg = JSON.stringify(event)
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(msg)
        } catch {}
      }

      return new Response('ok', { headers: CORS_HEADERS })
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      return new Response(this.html, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    return new Response('not found', { status: 404 })
  }

  webSocketMessage() {}
  webSocketClose(ws: WebSocket) {
    ws.close()
  }
  webSocketError() {}
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.PAGER.idFromName('singleton')
    const stub = env.PAGER.get(id)
    return stub.fetch(request)
  },
}
