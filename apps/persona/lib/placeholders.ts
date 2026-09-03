/**
 * The templating engine's deterministic half (PERSONA.md §5). Pure: scan a
 * body for {{TOKENS}}, normalise the wizard-era names onto the config keys the
 * setup guides use, and substitute. No IO, safe in the browser and at build.
 */

export interface PlaceholderMeta {
  key: string;
  label: string;
  hint?: string;
  default?: string;
  /** 0-based order of first appearance in the body; the wizard asks in this order. */
  order: number;
}

const TOKEN = /\{\{\s*([A-Za-z][A-Za-z0-9_.]*)\s*\}\}/g;

/** Wizard-style tokens (Q1.1_COMPANY_NAME) and older names map onto one key set, so one saved answer fills every persona. */
const ALIASES: Record<string, string> = {
  'Q1.1_COMPANY_NAME': 'COMPANY_NAME',
  'Q1.2_HELP_URL': 'HELP_CENTER_URL',
  'Q1.3_TONE': 'TONE',
  'Q2.1_BUG_ROUTING_LOGIC': 'BUG_ROUTING',
  'Q2.2_FEEDBACK_ROUTING_LOGIC': 'FEEDBACK_ROUTING',
  'Q3.1_MAX_STEPS': 'MAX_TROUBLESHOOTING_STEPS',
  'Q3.2_MONETARY_LIMIT': 'TRANSACTION_THRESHOLD',
  'Q3.3_HANDOFF_QUEUE': 'HANDOFF_QUEUE_NAME',
  'Q4.1_AUTO_CONTEXT': 'AUTO_CONTEXT',
  'Q4.2_ACTIVE_TOOLS': 'ACTIVE_TOOLS',
  SUPPORT_HUMAN_HANDOFF_QUEUE: 'HANDOFF_QUEUE_NAME',
  'user.first_name': 'USER_FIRST_NAME',
};

const DEFAULT_LABELS: Record<string, { label: string; hint?: string; default?: string }> = {
  COMPANY_NAME: { label: 'Company or product name', hint: 'How the agent refers to you', default: 'Acme SaaS' },
  SUPPORT_EMAIL: { label: 'Support email', default: 'support@example.com' },
  HELP_CENTER_URL: { label: 'Help centre URL', default: 'https://help.example.com' },
  BUG_REPORT_URL: { label: 'Bug report URL', hint: 'Leave empty to summarise bugs for a human instead' },
  FEATURE_REQUEST_URL: { label: 'Feature request URL', hint: 'Canny, Productboard, or a form' },
  HANDOFF_QUEUE_NAME: { label: 'Human handoff queue', hint: 'Where escalations go', default: 'Tier 2 Support' },
  MAX_TROUBLESHOOTING_STEPS: { label: 'Attempts before escalating', default: '2' },
  TRANSACTION_THRESHOLD: { label: 'Transaction limit before escalating', default: '$500.00' },
  TONE: { label: 'Primary tone', hint: 'Warm and empathetic, technical and direct, casual, or formal' },
  BUG_ROUTING: { label: 'How bugs are routed', hint: 'A URL, or an instruction like "summarise and forward"' },
  FEEDBACK_ROUTING: { label: 'How feedback is routed' },
  AUTO_CONTEXT: { label: 'Session context injected automatically?', default: 'Yes' },
  ACTIVE_TOOLS: { label: 'Tools available to the agent', hint: 'Order lookup, account verification, refund trigger…' },
  USER_FIRST_NAME: { label: 'User first-name variable', hint: 'The runtime variable your platform exposes', default: '{{user.first_name}}' },
};

export function normaliseKey(raw: string): string {
  return ALIASES[raw] ?? raw;
}

/** Every placeholder in first-appearance order, merged with frontmatter metadata and built-in labels. */
export function scanPlaceholders(body: string, meta: Record<string, { label: string; hint?: string; default?: string }> = {}): PlaceholderMeta[] {
  const seen = new Map<string, PlaceholderMeta>();
  for (const match of body.matchAll(TOKEN)) {
    const key = normaliseKey(match[1]!);
    if (seen.has(key)) continue;
    const m = meta[key] ?? DEFAULT_LABELS[key] ?? { label: key.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) };
    seen.set(key, {
      key,
      label: m.label,
      ...(m.hint !== undefined ? { hint: m.hint } : {}),
      ...(m.default !== undefined ? { default: m.default } : {}),
      order: seen.size,
    });
  }
  return [...seen.values()];
}

/** Substitute filled values; unfilled tokens stay as {{KEY}} (normalised) so the reader can see what is left. */
export function fillPlaceholders(body: string, values: Record<string, string>): string {
  return body.replace(TOKEN, (_, raw: string) => {
    const key = normaliseKey(raw);
    const v = values[key];
    return v !== undefined && v !== '' ? v : `{{${key}}}`;
  });
}

/** Split a body into text and token segments, for rendering pills. */
export function segmentPlaceholders(text: string): Array<{ type: 'text'; value: string } | { type: 'token'; key: string }> {
  const out: Array<{ type: 'text'; value: string } | { type: 'token'; key: string }> = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const idx = match.index ?? 0;
    if (idx > last) out.push({ type: 'text', value: text.slice(last, idx) });
    out.push({ type: 'token', key: normaliseKey(match[1]!) });
    last = idx + match[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

export function remainingPlaceholders(placeholders: PlaceholderMeta[], values: Record<string, string>): PlaceholderMeta[] {
  return placeholders.filter((p) => !values[p.key]);
}
