'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserProfile, useClerk } from '@clerk/nextjs';
import { toast } from 'sonner';
import { User, SlidersHorizontal, KeyRound, BarChart3, Settings2, Check, Copy } from 'lucide-react';
import { PageFrame, FrameRow, FrameHeading } from '@/components/app/page-frame';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CharChart } from '@/components/app/char-chart';
import { ProvidersPanel } from '@/components/app/providers/providers-panel';
import { ENDPOINTS } from '@/lib/catalog';
import { PUBLIC_API_URL } from '@/lib/mode';
import { cn } from '@/lib/utils';
import type { ProfileRow } from '@/lib/supabase/types';

const ROLES = ['Engineer', 'Founder', 'Researcher', 'Data/ML', 'Other'] as const;
const USE_CASES = ['Agent tools', 'Research pipeline', 'RAG / search index', 'Monitoring', 'Lead/CRM enrichment', 'Internal tooling'] as const;
const PROVIDERS = ['Anthropic', 'OpenAI', 'Google', 'OpenRouter', 'Local (Ollama/vLLM)', 'Not sure yet'] as const;
const DEPLOY_INTENTS = ['Hosted', 'Self-host', 'Both'] as const;

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { id: 'providers', label: 'Providers', icon: KeyRound },
  { id: 'statistics', label: 'Statistics', icon: BarChart3 },
  { id: 'advanced', label: 'Advanced', icon: Settings2 },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isTabId(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value);
}

function SubNav({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = TABS[(index + delta + TABS.length) % TABS.length]!;
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div role="tablist" aria-label="Settings sections" className="flex flex-col gap-0.5 p-2 lg:p-3">
      {TABS.map((tab, index) => {
        const Icon = tab.icon;
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-card px-3 py-2 text-left text-[13px] font-medium transition-colors duration-150 ease-out',
              selected ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function PreferencesPanel({ profile }: { profile: ProfileRow }) {
  const [role, setRole] = React.useState(profile.role ?? '');
  const [useCases, setUseCases] = React.useState<string[]>(profile.use_cases ?? []);
  const [provider, setProvider] = React.useState(profile.llm_provider ?? '');
  const [deployIntent, setDeployIntent] = React.useState(profile.deploy_intent ?? '');
  const [selected, setSelected] = React.useState<string[]>(profile.selected_endpoints ?? []);
  const [saving, setSaving] = React.useState(false);

  const toggleUseCase = (uc: string) => {
    setUseCases((prev) => (prev.includes(uc) ? prev.filter((x) => x !== uc) : [...prev, uc]));
  };
  const toggleEndpoint = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/app/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role,
          use_cases: useCases,
          llm_provider: provider,
          deploy_intent: deployIntent,
          selected_endpoints: selected,
          complete: true,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Preferences saved. SKILL.md will regenerate on next request.');
    } catch {
      toast.error('Could not save preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FrameRow>
        <FrameHeading title="Role" description="What best describes you." />
        <div className="px-6 pb-5">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="Select one" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FrameRow>

      <FrameRow>
        <FrameHeading title="Use cases" description="What are you building." />
        <div className="flex flex-wrap gap-3 px-6 pb-5">
          {USE_CASES.map((uc) => (
            <label key={uc} className="flex items-center gap-2 text-[13px] text-foreground">
              <Checkbox checked={useCases.includes(uc)} onCheckedChange={() => toggleUseCase(uc)} />
              {uc}
            </label>
          ))}
        </div>
      </FrameRow>

      <FrameRow>
        <FrameHeading title="LLM provider" description="Which provider will you bring." />
        <div className="px-6 pb-5">
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="Select one" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FrameRow>

      <FrameRow>
        <FrameHeading title="Deployment" description="How will you run Helix." />
        <div className="px-6 pb-5">
          <Select value={deployIntent} onValueChange={setDeployIntent}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="Select one" />
            </SelectTrigger>
            <SelectContent>
              {DEPLOY_INTENTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FrameRow>

      <FrameRow>
        <FrameHeading title="Endpoints" description="Which endpoints will you use." />
        <div className="flex flex-col gap-1.5 px-6 pb-5">
          {ENDPOINTS.filter((e) => e.product).map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-[13px] text-foreground">
              <Checkbox checked={selected.includes(e.id)} onCheckedChange={() => toggleEndpoint(e.id)} />
              {e.name}
              <span className="text-xs text-muted-foreground">{e.tagline}</span>
            </label>
          ))}
        </div>
      </FrameRow>

      <FrameRow flush className="flex justify-end px-6 py-5">
        <Button onClick={handleSave} disabled={saving} className="rounded-pill">
          {saving ? 'Saving…' : 'Save preferences'}
        </Button>
      </FrameRow>
    </>
  );
}

interface StatsData {
  totalRuns: number;
  successRate: number;
  byEndpoint: { endpoint: string; total: number; success: number }[];
  tierDistribution: { tier: string; count: number }[];
  spendByProvider: { provider: string; costUsd: number }[];
}

const EMPTY_STATS: StatsData = { totalRuns: 0, successRate: 0, byEndpoint: [], tierDistribution: [], spendByProvider: [] };

function StatisticsPanel() {
  const [stats, setStats] = React.useState<StatsData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/app/usage/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => !cancelled && setStats(data ?? EMPTY_STATS))
      .catch(() => !cancelled && setStats(EMPTY_STATS))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !stats) {
    return (
      <FrameRow flush className="flex flex-col gap-3 p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </FrameRow>
    );
  }

  const tierTotal = stats.tierDistribution.reduce((sum, t) => sum + t.count, 0);

  return (
    <>
      <FrameRow>
        <FrameHeading title="Runs by endpoint" />
        <div className="px-6 pb-5">
          <CharChart
            series={[{ label: 'runs', values: stats.byEndpoint.map((e) => e.total) }]}
            labels={stats.byEndpoint.map((e) => e.endpoint)}
            height={8}
          />
        </div>
      </FrameRow>

      <FrameRow>
        <FrameHeading title="Success rate" />
        <div className="px-6 pb-5">
          <span className="font-mono text-2xl text-foreground">{(stats.successRate * 100).toFixed(1)}%</span>
          <span className="ml-2 text-sm text-muted-foreground">of {stats.totalRuns} runs</span>
        </div>
      </FrameRow>

      <FrameRow>
        <FrameHeading title="Tier distribution" />
        <div className="flex flex-col gap-1.5 px-6 pb-5">
          {stats.tierDistribution.length === 0 ? (
            <span className="text-sm text-muted-foreground">No runs yet.</span>
          ) : (
            stats.tierDistribution.map((t) => (
              <div key={t.tier} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t.tier}</span>
                <span className="font-mono">{tierTotal > 0 ? ((t.count / tierTotal) * 100).toFixed(0) : '0'}%</span>
              </div>
            ))
          )}
        </div>
      </FrameRow>

      <FrameRow flush>
        <FrameHeading title="Spend by provider" />
        <div className="flex flex-col gap-1.5 px-6 pb-5">
          {stats.spendByProvider.length === 0 ? (
            <span className="text-sm text-muted-foreground">No spend yet.</span>
          ) : (
            stats.spendByProvider.map((s) => (
              <div key={s.provider} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{s.provider}</span>
                <span className="font-mono">${s.costUsd.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </FrameRow>
    </>
  );
}

function ApiBaseUrlRow() {
  const [copied, setCopied] = React.useState(false);

  const onCopy = () => {
    navigator.clipboard.writeText(PUBLIC_API_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <FrameRow>
      <FrameHeading title="API base URL" description="The base URL your requests are sent to." />
      <div className="flex items-center gap-2 px-6 pb-5">
        <span className="flex-1 truncate rounded-card border border-border bg-secondary/40 px-3 py-2 font-mono text-sm text-foreground">
          {PUBLIC_API_URL}
        </span>
        <Button variant="outline" size="icon" onClick={onCopy} aria-label="Copy API base URL">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </FrameRow>
  );
}

function AdvancedPanel({ profile }: { profile: ProfileRow }) {
  const { signOut } = useClerk();
  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const initials = (profile.name || profile.email).slice(0, 2).toUpperCase();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/app/profile', { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await signOut({ redirectUrl: '/' });
    } catch {
      toast.error('Could not delete the account. Contact support.');
      setDeleting(false);
    }
  };

  return (
    <>
      <ApiBaseUrlRow />
      <FrameRow flush>
        <FrameHeading title="Delete account" description="Once you delete your account, there is no going back." />
        <div className="flex items-center justify-between gap-4 px-6 pb-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar>
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="truncate text-sm text-foreground">{profile.email}</span>
          </div>
          {confirming ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-pill bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? 'Deleting…' : 'Confirm delete'}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => setConfirming(true)}
              className="shrink-0 rounded-pill bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </Button>
          )}
        </div>
      </FrameRow>
    </>
  );
}

export function SettingsClient({ profile }: { profile: ProfileRow }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const active: TabId = isTabId(tabParam) ? tabParam : 'profile';

  const onChange = (id: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', id);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <PageFrame>
      <FrameRow className="flex h-44 flex-col justify-center px-6">
        <h1 className="text-[32px] font-medium leading-tight tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your profile, preferences and account</p>
      </FrameRow>

      <FrameRow flush>
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] lg:divide-x lg:divide-border">
          <div className="border-b border-border lg:border-b-0">
            <div className="flex overflow-x-auto lg:hidden">
              <SubNavMobile active={active} onChange={onChange} />
            </div>
            <div className="hidden lg:block">
              <SubNav active={active} onChange={onChange} />
            </div>
          </div>

          <div>
            {active === 'profile' && (
              <div className="p-6">
                <UserProfile
                  routing="hash"
                  appearance={{ elements: { rootBox: 'w-full', card: 'shadow-none border-none bg-transparent w-full' } }}
                />
              </div>
            )}
            {active === 'preferences' && <PreferencesPanel profile={profile} />}
            {active === 'providers' && <ProvidersPanel />}
            {active === 'statistics' && <StatisticsPanel />}
            {active === 'advanced' && <AdvancedPanel profile={profile} />}
          </div>
        </div>
      </FrameRow>
    </PageFrame>
  );
}

function SubNavMobile({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div role="tablist" aria-label="Settings sections" className="flex gap-1.5 p-3">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ease-out',
              selected ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
