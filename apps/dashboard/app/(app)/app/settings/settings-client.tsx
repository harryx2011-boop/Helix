'use client';

import * as React from 'react';
import { UserProfile, useClerk } from '@clerk/nextjs';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { CharChart } from '@/components/app/char-chart';
import { ENDPOINTS } from '@/lib/catalog';
import type { ProfileRow } from '@/lib/supabase/types';

const ROLES = ['Engineer', 'Founder', 'Researcher', 'Data/ML', 'Other'] as const;
const USE_CASES = ['Agent tools', 'Research pipeline', 'RAG / search index', 'Monitoring', 'Lead/CRM enrichment', 'Internal tooling'] as const;
const PROVIDERS = ['Anthropic', 'OpenAI', 'Google', 'OpenRouter', 'Local (Ollama/vLLM)', 'Not sure yet'] as const;
const DEPLOY_INTENTS = ['Hosted', 'Self-host', 'Both'] as const;

function PreferencesTab({ profile }: { profile: ProfileRow }) {
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
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Re-edit your onboarding answers. Saving regenerates your SKILL.md.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label>What best describes you?</Label>
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

        <div className="flex flex-col gap-2">
          <Label>What are you building?</Label>
          <div className="flex flex-wrap gap-3">
            {USE_CASES.map((uc) => (
              <label key={uc} className="flex items-center gap-2 text-sm">
                <Checkbox checked={useCases.includes(uc)} onCheckedChange={() => toggleUseCase(uc)} />
                {uc}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Which LLM provider will you bring?</Label>
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

        <div className="flex flex-col gap-2">
          <Label>How will you run Helix?</Label>
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

        <div className="flex flex-col gap-2">
          <Label>Which endpoints will you use?</Label>
          <div className="flex flex-col gap-1.5">
            {ENDPOINTS.filter((e) => e.product).map((e) => (
              <label key={e.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selected.includes(e.id)} onCheckedChange={() => toggleEndpoint(e.id)} />
                {e.name}
                <span className="text-xs text-muted-foreground">{e.tagline}</span>
              </label>
            ))}
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-fit gap-2">
          {saving && <span className="h-3.5 w-3.5 animate-spin rounded-pill border-2 border-primary-foreground/40 border-t-primary-foreground" />}
          Save preferences
        </Button>
      </CardContent>
    </Card>
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

function StatisticsTab() {
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const tierTotal = stats.tierDistribution.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Runs by endpoint</CardTitle>
        </CardHeader>
        <CardContent>
          <CharChart
            series={[{ label: 'runs', values: stats.byEndpoint.map((e) => e.total) }]}
            labels={stats.byEndpoint.map((e) => e.endpoint)}
            height={8}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Success rate</CardTitle>
        </CardHeader>
        <CardContent>
          <span className="font-mono text-2xl text-foreground">{(stats.successRate * 100).toFixed(1)}%</span>
          <span className="ml-2 text-sm text-muted-foreground">of {stats.totalRuns} runs</span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Tier distribution</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
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
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Spend by provider</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
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
        </CardContent>
      </Card>
    </div>
  );
}

function DangerZoneTab() {
  const { signOut } = useClerk();
  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

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
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Danger zone
        </CardTitle>
        <CardDescription>Deletes your Helix account, API keys, and usage history. This cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent>
        {confirming ? (
          <div className="flex items-center gap-2">
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
              {deleting && <span className="h-3.5 w-3.5 animate-spin rounded-pill border-2 border-destructive-foreground/40 border-t-destructive-foreground" />}
              Confirm delete account
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={deleting}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            Delete account
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsClient({ profile }: { profile: ProfileRow }) {
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <Tabs defaultValue="profile">
        <TabsList className="rounded-pill">
          <TabsTrigger value="profile" className="rounded-pill">
            Profile
          </TabsTrigger>
          <TabsTrigger value="preferences" className="rounded-pill">
            Preferences
          </TabsTrigger>
          <TabsTrigger value="statistics" className="rounded-pill">
            Statistics
          </TabsTrigger>
          <TabsTrigger value="danger" className="rounded-pill">
            Danger zone
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="pt-4">
          <Card>
            <CardContent className="p-0">
              <UserProfile
                routing="hash"
                appearance={{ elements: { rootBox: 'w-full', card: 'shadow-none border-none bg-transparent w-full' } }}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="preferences" className="pt-4">
          <PreferencesTab profile={profile} />
        </TabsContent>
        <TabsContent value="statistics" className="pt-4">
          <StatisticsTab />
        </TabsContent>
        <TabsContent value="danger" className="pt-4">
          <DangerZoneTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
