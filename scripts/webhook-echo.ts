// webhook echo server for testing DispatchAlertNotifications (SRS CP-C3)
// usage: bun run scripts/webhook-echo.ts [--port <number>]
//
// logs every incoming request. POST bodies are pretty-printed as JSON.
// paste the URL (e.g. http://localhost:9999/webhook) into the subscription
// settings webhook URL field, then seed with --spike to trigger alerts.

const port = parsePort(process.argv.slice(2))

const server = Bun.serve({
  port,
  fetch: async (req) => {
    const ts = new Date().toISOString()
    const method = req.method
    const url = new URL(req.url).pathname

    if (method === 'POST') {
      const body = await req.json().catch(() => null)
      const severity = body?.alert?.severity
      const severityLabel =
        severity === 3 ? 'CRITICAL' : severity === 2 ? 'WARNING' : severity === 1 ? 'LOW' : '???'

      console.log(`\n${ts}  ${method} ${url}`)

      if (body?.type === 'alert.triggered' && body?.alert) {
        const a = body.alert
        console.log(
          `  ${severityLabel} — ${a.metricType} at ${a.triggeredValue} in ${a.zone} (sensor ${a.sensorId})`,
        )
        console.log(`  alert id: ${a.id}`)
        console.log(`  created:  ${a.createdAt}`)
      } else {
        console.log(JSON.stringify(body, null, 2))
      }
    } else {
      console.log(`${ts}  ${method} ${url}`)
    }

    return new Response('ok')
  },
})

console.log(`webhook echo listening on http://localhost:${server.port}`)
console.log(`paste http://localhost:${server.port}/webhook into subscription settings\n`)
console.log('waiting for incoming webhooks... (ctrl-c to stop)\n')

function parsePort(args: string[]): number {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      const n = Number(args[i + 1])
      if (Number.isFinite(n) && n > 0 && n < 65536) return n
      console.error(`invalid port: ${args[i + 1]}`)
      process.exit(1)
    }
  }
  return 9999
}
