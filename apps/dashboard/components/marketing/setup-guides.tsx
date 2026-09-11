'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Bot, Braces, Code2, Plug, SquareTerminal, Terminal } from 'lucide-react';
import { FrameBand } from './section-frame';
import { AsciiOrbit } from './ascii-fields';
import { CodePanel, CodeBlock } from './code-panel';
import { AnimatedCode } from './animated-code';
import { Segmented } from './segmented';
import { SKILL_MD_PATH, setupPrompt } from '@/lib/setup-prompt';

type SetupLang = 'python' | 'node' | 'curl' | 'cli' | 'agent';

interface LangTab {
  id: SetupLang;
  label: string;
  icon: typeof Code2;
  panelLabel: string;
  snippet: string;
}

const CLI_INIT_SNIPPET = 'npx -y @helix/cli@latest init --all -k helix-YOUR_KEY';
const MCP_SNIPPET =
  'claude mcp add --transport http helix \\\n  https://mcp.helix.dev/v1 \\\n  --header "Authorization: Bearer $HELIX_API_KEY"';
type FetchMode = 'skill' | 'llms';
const FETCH_SNIPPET: Record<FetchMode, string> = {
  skill: 'curl -s https://helix.dev/agent-onboarding/SKILL.md',
  llms: 'curl -s https://helix.dev/llms.txt',
};
const FETCH_LINK: Record<FetchMode, { href: string; label: string }> = {
  skill: { href: SKILL_MD_PATH, label: 'View SKILL.md' },
  llms: { href: '/llms.txt', label: 'View llms.txt' },
};

/** The two-option pill that sits in a terminal panel's chrome. */
function PanelToggle<T extends string>({ options, value, onChange }: { options: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-pill bg-white/[0.06] p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`rounded-pill px-2 py-1 font-mono text-[12px] transition-colors duration-150 ease-out ${
            value === o.id ? 'bg-violet-12 text-violet' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const WIRE_OPTIONS = [
  { id: 'skill', label: 'Skill' },
  { id: 'mcp', label: 'MCP' },
] as const;
const FETCH_OPTIONS = [
  { id: 'skill', label: 'SKILL.md' },
  { id: 'llms', label: 'llms.txt' },
] as const;

const LANG_TABS: LangTab[] = [
  {
    id: 'python',
    label: 'Python',
    icon: Code2,
    panelLabel: 'main.py',
    snippet: `# pip install helix-sdk
from helix import Helix

app = Helix(api_key="helix-YOUR_KEY")
page = app.scrape("https://example.com/pricing", formats=["markdown"])
print(page.markdown)`,
  },
  {
    id: 'node',
    label: 'Node.js',
    icon: Braces,
    panelLabel: 'index.ts',
    snippet: `// npm install @helix/sdk
import Helix from '@helix/sdk';

const app = new Helix({ apiKey: 'helix-YOUR_KEY' });
const page = await app.scrape('https://example.com/pricing', { formats: ['markdown'] });
console.log(page.markdown);`,
  },
  {
    id: 'curl',
    label: 'cURL',
    icon: Terminal,
    panelLabel: 'shell',
    snippet: `curl -X POST http://localhost:7400/v1/scrape \\
  -H "Authorization: Bearer helix-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/pricing","formats":["markdown"]}'`,
  },
  {
    id: 'cli',
    label: 'CLI',
    icon: SquareTerminal,
    panelLabel: 'shell',
    snippet: `npx -y @helix/cli@latest scrape https://example.com/pricing --format markdown`,
  },
  {
    id: 'agent',
    label: 'Agent',
    icon: Bot,
    panelLabel: 'shell',
    snippet: CLI_INIT_SNIPPET,
  },
];

const SCRAPE_RESPONSE = `{
  "success": true,
  "data": {
    "markdown": "# Pricing\\n...",
    "json": { "plans": [{ "name": "Pro", "monthlyPrice": 79 }] },
    "metadata": { "statusCode": 200, "tier": "plain" }
  },
  "warnings": []
}`;

/** Tabbed request/response for the SDK, CLI and agent wiring, then one onboarding band for coding agents. */
export function SetupGuides() {
  const [active, setActive] = React.useState<SetupLang>('python');
  const [wireMode, setWireMode] = React.useState<'skill' | 'mcp'>('skill');
  const [fetchMode, setFetchMode] = React.useState<FetchMode>('skill');
  const tab = LANG_TABS.find((t) => t.id === active) ?? LANG_TABS[0]!;
  const isAgent = tab.id === 'agent';
  const snippet = isAgent ? (wireMode === 'skill' ? CLI_INIT_SNIPPET : MCP_SNIPPET) : tab.snippet;

  return (
    <section className="bg-m-bg-lighter px-6 py-16 sm:px-10">
      <FrameBand step="04" icon={Plug} />

      <div className="py-16">
        <div data-reveal className="relative">
          <AsciiOrbit
            cols={44}
            rows={17}
            seed={67}
            className="absolute -top-6 right-0 hidden lg:block [mask-image:linear-gradient(to_right,transparent,black_30%,black_85%,transparent)]"
          />
          <div className="relative">
            <h2 className="max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
              Connect it however <span className="text-violet">your agent already works.</span>
            </h2>
            <p className="mt-3 max-w-[520px] text-[16px] leading-relaxed text-m-ink/72">
              SDK, MCP or the CLI. Same envelope back, whichever door you use.
            </p>
          </div>
        </div>

        <div data-reveal className="mt-10">
          <Segmented
            items={LANG_TABS.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))}
            value={active}
            onChange={setActive}
            aria-label="Setup language"
          />
        </div>

        <div data-reveal className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CodePanel
            chrome="terminal"
            label={tab.panelLabel}
            copyText={snippet}
            tabs={isAgent ? <PanelToggle options={WIRE_OPTIONS} value={wireMode} onChange={setWireMode} /> : undefined}
          >
            <AnimatedCode
              key={`setup-${active}-${isAgent ? wireMode : ''}`}
              code={snippet}
              mode="reveal"
              lineMs={45}
              playOnView
              className="text-foreground"
            />
          </CodePanel>
          <CodePanel chrome="terminal" label="[ .JSON ]" lines={SCRAPE_RESPONSE.split('\n').length}>
            <AnimatedCode key={`setup-res-${active}`} code={SCRAPE_RESPONSE} mode="scramble" resolveMs={1800} playOnView className="text-foreground" />
          </CodePanel>
        </div>

        <div
          data-reveal
          className="mt-5 grid grid-cols-1 divide-y divide-m-border-muted overflow-hidden rounded-panel border border-m-border-muted bg-m-surface shadow-card-sm lg:grid-cols-2 lg:divide-x lg:divide-y-0"
        >
          <div className="flex min-w-0 flex-col p-5 sm:p-6">
            <p className="text-[15px] leading-relaxed">
              <span className="font-medium text-m-ink">Paste this into your coding agent.</span>{' '}
              <span className="text-m-ink/64">It installs the skill, checks for a key without printing it, and smoke-tests one request.</span>
            </p>
            <div className="mt-4 flex-1">
              <CodePanel chrome="terminal" label="setup prompt" copyText={setupPrompt()}>
                <div className="max-h-[188px] overflow-y-auto [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:whitespace-pre-wrap">
                  <CodeBlock dark>{setupPrompt()}</CodeBlock>
                </div>
              </CodePanel>
            </div>
            <Link
              href="/docs/agents"
              className="group mt-4 flex w-fit items-center gap-1.5 text-[13px] font-medium text-violet transition-colors duration-150 ease-out hover:text-violet-hover"
            >
              View the docs
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>

          <div className="flex min-w-0 flex-col p-5 sm:p-6">
            <p className="text-[15px] leading-relaxed">
              <span className="font-medium text-m-ink">Already an agent reading this page?</span>{' '}
              <span className="text-m-ink/64">Fetch the skill directly, or the index of every page here as markdown.</span>
            </p>
            <div className="mt-4 flex-1">
              <CodePanel
                chrome="terminal"
                label="shell"
                copyText={FETCH_SNIPPET[fetchMode]}
                tabs={<PanelToggle options={FETCH_OPTIONS} value={fetchMode} onChange={setFetchMode} />}
              >
                <AnimatedCode key={`fetch-${fetchMode}`} code={FETCH_SNIPPET[fetchMode]} mode="reveal" lineMs={45} playOnView className="text-foreground" />
              </CodePanel>
            </div>
            <Link
              href={FETCH_LINK[fetchMode].href}
              className="group mt-4 flex w-fit items-center gap-1.5 text-[13px] font-medium text-violet transition-colors duration-150 ease-out hover:text-violet-hover"
            >
              {FETCH_LINK[fetchMode].label}
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
