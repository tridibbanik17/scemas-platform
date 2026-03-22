import { Button } from '@/components/ui/button'

const SCOPE_LABELS: Record<string, string> = {
  read: 'read environmental data, alerts, and feed status',
  'write:operator': 'acknowledge alerts and perform operator actions',
  'write:admin': 'full administrative access',
}

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const clientName = (params.client_name as string) ?? 'unknown application'
  const scope = (params.scope as string) ?? 'read'
  const scopes = scope.split(' ').filter(Boolean)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">authorize access</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{clientName}</span> wants to access your
          SCEMAS account.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">permissions requested:</p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {scopes.map(s => (
            <li key={s} className="flex items-start gap-2">
              <span className="mt-0.5 text-foreground">-</span>
              <span>{SCOPE_LABELS[s] ?? s}</span>
            </li>
          ))}
        </ul>
      </div>

      <form action="/oauth/authorize/decision" method="POST" className="flex gap-3">
        <input type="hidden" name="client_id" value={(params.client_id as string) ?? ''} />
        <input type="hidden" name="redirect_uri" value={(params.redirect_uri as string) ?? ''} />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="state" value={(params.state as string) ?? ''} />
        <input type="hidden" name="code_challenge" value={(params.code_challenge as string) ?? ''} />
        <input type="hidden" name="csrf" value={(params.csrf as string) ?? ''} />

        <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">
          deny
        </Button>
        <Button type="submit" name="decision" value="allow" className="flex-1">
          allow
        </Button>
      </form>
    </div>
  )
}
