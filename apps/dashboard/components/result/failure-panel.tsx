import { AlertTriangle, ArrowUpCircle, Ban, Clock, FileQuestion, Globe, ServerOff, ShieldOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FailureReason, FetchFailure } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { FetchLadder } from '@/components/ladder/fetch-ladder';

interface ReasonCopy {
  icon: LucideIcon;
  title: string;
  explanation: string;
  /** A concrete next step, not a generic "try again" — this is what the plan calls the important part. */
  nextStep: (failure: FetchFailure) => string;
}

const REASON_COPY: Record<FailureReason, ReasonCopy> = {
  blocked: {
    icon: Ban,
    title: 'Blocked',
    explanation: 'The origin server or a security layer in front of it refused the request outright.',
    nextStep: (f) =>
      f.escalationAvailable
        ? 'A higher tier, a different browser profile, or your own proxy may get past this. Try tier `chromium` with a residential proxy.'
        : 'The fetch ladder is exhausted for this profile. A different proxy exit IP is the remaining lever — this is not something a higher tier alone will fix.',
  },
  challenge: {
    icon: ShieldOff,
    title: 'Bot challenge',
    explanation:
      'The response was an interstitial (Cloudflare, DataDome, PerimeterX, or similar) — never returned as content, per Helix’s failure semantics.',
    nextStep: (f) =>
      f.escalationAvailable
        ? 'Challenges are usually cleared by a real browser. Retry with tier `chromium`, and pair it with a proxy if the IP itself is flagged.'
        : 'Already at the highest tier and still challenged. Rotate the browser profile or proxy exit IP — the challenge is keyed to the identity, not the tier.',
  },
  timeout: {
    icon: Clock,
    title: 'Timeout',
    explanation: 'The page did not finish loading within the configured timeout.',
    nextStep: () =>
      'Raise `timeout` (up to 300000ms), or move to a browser tier — `plain`/`tls` timeouts are often a slow or JS-gated page that a renderer handles fine.',
  },
  dns: {
    icon: Globe,
    title: 'DNS resolution failed',
    explanation: 'The hostname could not be resolved.',
    nextStep: () => 'Check the URL for typos, and confirm the domain resolves outside Helix (e.g. `dig` or `nslookup`).',
  },
  tls: {
    icon: ShieldOff,
    title: 'TLS handshake failed',
    explanation: 'The secure connection could not be established — an expired, self-signed, or misconfigured certificate is the usual cause.',
    nextStep: () => 'Verify the certificate in a browser first. If it is genuinely broken upstream, there is no tier that works around it.',
  },
  http_error: {
    icon: AlertTriangle,
    title: 'HTTP error',
    explanation: 'The server responded with an error status, or the fetch ladder was exhausted without a usable response.',
    nextStep: (f) =>
      f.statusCode
        ? `Status ${f.statusCode} came back from the origin. If this is a transient 5xx, retry; if 4xx, the URL or request shape is likely wrong.`
        : 'No tier produced a usable response. Confirm the URL loads in a normal browser before retrying.',
  },
  empty: {
    icon: FileQuestion,
    title: 'No extractable content',
    explanation: 'The page returned a response, but nothing usable could be extracted from it.',
    nextStep: () =>
      'Likely a JS-rendered page fetched at a non-browser tier. Set tier to `lightpanda` or `chromium` so content renders before extraction runs.',
  },
  robots_denied: {
    icon: Ban,
    title: 'Disallowed by robots.txt',
    explanation: 'This URL is disallowed by the site’s robots.txt, and Helix respects it by default.',
    nextStep: () =>
      'This is a policy stop, not a technical failure — no tier or proxy changes it. Crawl requests expose `respectRobots: false` if you have permission to override it for this site.',
  },
  unsupported_type: {
    icon: FileQuestion,
    title: 'Unsupported content type',
    explanation: 'The resource at this URL is not a type Helix knows how to read.',
    nextStep: () => 'Confirm the URL points at an HTML page or a supported document type (PDF, Office).',
  },
  unsafe_url: {
    icon: Ban,
    title: 'URL not allowed',
    explanation:
      'The URL points at the Helix instance itself, a private network, or a link-local address. The browser only opens public http and https addresses.',
    nextStep: () => 'Use a publicly routable hostname. Redirects and subresources to private addresses are dropped as well.',
  },
  session_closed: {
    icon: ServerOff,
    title: 'Session closed during the run',
    explanation: 'The session was closed, by a DELETE or by its timeout, while these actions were still running.',
    nextStep: () => 'Open a new session. Check `expiresAt` before sending a long run; the hard timeout closes a session even mid-request.',
  },
  service_unavailable: {
    icon: ServerOff,
    title: 'Service unavailable',
    // Deliberately points at Helix's own infrastructure, not the target site.
    // Reporting this as a block would send an operator chasing an anti-bot
    // problem that does not exist — the fetch never left the building.
    explanation:
      'A Helix service was unreachable, so the fetch could not be attempted. This is an infrastructure problem on your side, not a response from the target site.',
    nextStep: () =>
      'Check that the fetch and extract services are running — see the Health screen. If you are running the API alone, start the full stack with `docker compose up`.',
  },
};

export function FailurePanel({ failure }: { failure: FetchFailure }) {
  const copy = REASON_COPY[failure.reason];
  const Icon = copy.icon;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{copy.title}</h3>
            <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
              {failure.reason}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{copy.explanation}</p>
          {failure.detail && (
            <p className="font-mono text-xs text-muted-foreground/80">{failure.detail}</p>
          )}
        </div>
      </div>

      {failure.detectedBy && failure.detectedBy.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Signals that fired</span>
          <div className="flex flex-wrap gap-1.5">
            {failure.detectedBy.map((signal) => (
              <Badge key={signal} variant="secondary" className="font-mono text-[11px]">
                {signal}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {failure.tiersAttempted && failure.tiersAttempted.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Tiers attempted</span>
          <FetchLadder tiersAttempted={failure.tiersAttempted} />
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md border border-border bg-card p-3">
        <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-foreground">Next step</span>
          <p className="text-sm text-muted-foreground leading-relaxed">{copy.nextStep(failure)}</p>
        </div>
      </div>
    </div>
  );
}
