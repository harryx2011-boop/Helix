'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Braces, Code2, SquareTerminal, Terminal } from 'lucide-react';
import { FrameBand } from './section-frame';
import { CodePanel, CodeBlock } from './code-panel';
import { AnimatedCode } from './animated-code';

type SetupLang = 'python' | 'node' | 'curl' | 'cli';

interface LangTab {
  id: SetupLang;
  label: string;
  icon: typeof Code2;
  panelLabel: string;
  snippet: string;
}

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

const CLI_INIT_SNIPPET = 'npx -y @helix/cli@latest init --all -k helix-YOUR_KEY';
const MCP_SNIPPET =
  'claude mcp add --transport http helix \\\n  https://mcp.helix.dev/v1 \\\n  --header "Authorization: Bearer $HELIX_API_KEY"';
const AGENT_ONBOARDING_SNIPPET = 'curl -s https://helix.dev/agent-onboarding/SKILL.md';

/** Tabbed request/response for the SDK/CLI, plus agent-wiring and onboarding panels. Replaces the SDK/MCP/CLI card grid. */
export function SetupGuides() {
  const [active, setActive] = React.useState<SetupLang>('python');
  const [wireMode, setWireMode] = React.useState<'skill' | 'mcp'>('skill');
  const tab = LANG_TABS.find((t) => t.id === active) ?? LANG_TABS[0]!;
  const wireSnippet = wireMode === 'skill' ? CLI_INIT_SNIPPET : MCP_SNIPPET;

  return (
    <section className="bg-m-bg-lighter px-6 py-16 sm:px-10">
      <FrameBand step="03" total="06" label="SETUP" sub="Connect it your way" />

      <div className="py-16">
        <div data-reveal>
          <h2 className="max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
            Connect it however <span className="text-violet">your agent already works.</span>
          </h2>
          <p className="mt-3 max-w-[520px] text-[16px] leading-relaxed text-m-ink/72">
            SDK, MCP or the CLI. Same envelope back, whichever door you use.
          </p>
        </div>

        <div data-reveal className="mt-10 flex flex-wrap gap-1 rounded-pill border border-m-border-muted bg-m-surface p-1">
          {LANG_TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                aria-pressed={isActive}
                className={`flex items-center gap-1.5 rounded-pill px-3.5 py-2 font-mono text-[13px] transition-colors duration-150 ease-out ${
                  isActive ? 'bg-violet-12 text-violet' : 'text-m-ink/56 hover:text-m-ink/80'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>

        <div data-reveal className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CodePanel chrome="terminal" label={tab.panelLabel} copyText={tab.snippet}>
            <AnimatedCode key={`setup-${active}`} code={tab.snippet} mode="reveal" lineMs={45} playOnView className="text-foreground" />
          </CodePanel>
          <CodePanel chrome="terminal" label="response">
            <AnimatedCode key={`setup-res-${active}`} code={SCRAPE_RESPONSE} mode="scramble" resolveMs={1800} playOnView className="text-foreground" />
          </CodePanel>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div data-reveal className="rounded-panel border border-m-border-muted bg-m-surface p-5 shadow-card-sm">
            <h3 className="text-[16px] font-medium leading-tight tracking-tight text-m-ink">One command.</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-m-ink/64">
              Wire Claude Code, Cursor, Codex or Windsurf to a Helix instance: MCP config and a SKILL.md, written for you.
            </p>

            <div className="mt-4">
              <CodePanel
                chrome="terminal"
                label="shell"
                copyText={wireSnippet}
                tabs={
                  <div className="flex items-center gap-1 rounded-pill bg-white/[0.06] p-0.5">
                    {(['skill', 'mcp'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setWireMode(m)}
                        aria-pressed={wireMode === m}
                        className={`rounded-pill px-2 py-1 font-mono text-[12px] transition-colors duration-150 ease-out ${
                          wireMode === m ? 'bg-violet-12 text-violet' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {m === 'skill' ? 'Skill' : 'MCP'}
                      </button>
                    ))}
                  </div>
                }
              >
                <CodeBlock dark>{wireSnippet}</CodeBlock>
              </CodePanel>
            </div>

            <Link
              href="/docs/cli"
              className="group mt-4 flex w-fit items-center gap-1.5 text-[13px] font-medium text-violet transition-colors duration-150 ease-out hover:text-violet-hover"
            >
              View the CLI docs
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>

          <div data-reveal className="rounded-panel border border-m-border-muted bg-m-surface p-5 shadow-card-sm">
            <h3 className="text-[16px] font-medium leading-tight tracking-tight text-m-ink">Agent onboarding.</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-m-ink/64">
              Are you an AI agent? Fetch this skill to get a key and the request shapes.
            </p>

            <div className="mt-4">
              <CodePanel chrome="terminal" label="cURL" copyText={AGENT_ONBOARDING_SNIPPET}>
                <CodeBlock dark>{AGENT_ONBOARDING_SNIPPET}</CodeBlock>
              </CodePanel>
            </div>

            <Link
              href="/agent-onboarding/SKILL.md"
              className="group mt-4 flex w-fit items-center gap-1.5 text-[13px] font-medium text-violet transition-colors duration-150 ease-out hover:text-violet-hover"
            >
              View the skill
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
