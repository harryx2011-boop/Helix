import Link from 'next/link';
import { requireProfile } from '@/lib/session';
import { listApiKeys } from '@/lib/profiles';
import { maskApiKey } from '@/lib/keys';
import { supabaseConfigured } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

const COMPOSE_FILE = `services:
  postgres:
    image: postgres:16
    ports: ["7432:5432"]

  helix-fetch:
    build: ./services/fetch
    ports: ["7401:7401"]        # TLS identity · proxy egress

  helix-extract:
    build: ./services/extract
    ports: ["7402:7402"]        # parsing · LLM · embeddings
    env_file: .env

  helix-api:
    build: ./apps/api
    ports: ["7400:7400"]
    depends_on:
      postgres: { condition: service_healthy }
      helix-fetch: { condition: service_healthy }
      helix-extract: { condition: service_healthy }
    env_file: .env`;

export default async function SelfHostGuidePage() {
  const profile = await requireProfile();
  let keyPlaceholder = 'helix-…';

  if (supabaseConfigured()) {
    const keys = await listApiKeys(profile.id);
    const defaultKey = keys.find((k) => !k.revoked_at);
    if (defaultKey) keyPlaceholder = maskApiKey(defaultKey.prefix, defaultKey.last3);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold leading-tight">Self-host guide</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The self-host build is the product — nothing is held back for the hosted tier. Run it with your own
          provider keys, on your own infrastructure.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Start the stack</CardTitle>
          <CardDescription>Health-gated startup — nothing to retry past.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-card border border-border bg-secondary p-3 font-mono text-xs leading-relaxed">
{`$ docker compose up
◇  postgres        starting
◆  postgres        healthy        1.2s
◆  helix-fetch     healthy        0.8s
◆  helix-extract   healthy        2.1s
◆  helix-api       healthy        0.6s
   dashboard  → http://localhost:3400
   api        → http://localhost:7400/v1`}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Ports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 text-left">Service</th>
                  <th className="py-1.5 text-left">Port</th>
                  <th className="py-1.5 text-left">Purpose</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                <tr className="border-b border-border/50">
                  <td className="py-1.5">dashboard</td>
                  <td className="py-1.5">3400</td>
                  <td className="py-1.5 text-muted-foreground">Marketing site + app shell</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1.5">helix-api</td>
                  <td className="py-1.5">7400</td>
                  <td className="py-1.5 text-muted-foreground">The six-endpoint API</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1.5">helix-fetch</td>
                  <td className="py-1.5">7401</td>
                  <td className="py-1.5 text-muted-foreground">TLS identity · proxy egress</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1.5">helix-extract</td>
                  <td className="py-1.5">7402</td>
                  <td className="py-1.5 text-muted-foreground">Parsing · LLM · embeddings</td>
                </tr>
                <tr>
                  <td className="py-1.5">postgres</td>
                  <td className="py-1.5">7432</td>
                  <td className="py-1.5 text-muted-foreground">State</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. docker-compose.yml</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-card border border-border bg-secondary p-3 font-mono text-xs leading-relaxed">
            {COMPOSE_FILE}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Bring your own provider keys</CardTitle>
          <CardDescription>Helix calls your models with your keys. Your provider bills you directly.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <pre className="overflow-x-auto rounded-card border border-border bg-secondary p-3 font-mono text-xs leading-relaxed">
{`HELIX_LLM_PROVIDER=openai
HELIX_LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

HELIX_SEARCH_PROVIDER=serper
SERPER_API_KEY=

HELIX_PROXY_URL=`}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5. Try a request</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-card border border-border bg-secondary p-3 font-mono text-xs leading-relaxed">
{`$ curl -X POST localhost:7400/v1/scrape \\
    -H "Authorization: Bearer ${keyPlaceholder}" \\
    -d '{"url":"https://example.com"}'
{ "success": true, "data": { "markdown": "# Example Domain…" } }`}
          </pre>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Track running instances under{' '}
        <Link href="/app/self-host/instances" className="text-primary hover:underline">
          Instances
        </Link>
        .
      </p>
    </div>
  );
}
