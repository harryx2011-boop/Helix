import { Wallet } from 'lucide-react';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import type { UsageDailyRow } from '@/lib/supabase/types';
import { endpointById } from '@/lib/catalog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CharChart } from '@/components/app/char-chart';
import { BudgetField } from '@/components/app/budget-field';

export const dynamic = 'force-dynamic';

const DAYS = 30;

function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function shortLabel(day: string): string {
  const [, m, d] = day.split('-');
  return `${m}/${d}`;
}

function formatUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

export default async function UsagePage() {
  const profile = await requireProfile();
  const labels = lastNDays(DAYS);
  const since = labels[0];

  let rows: UsageDailyRow[] = [];
  if (supabaseConfigured()) {
    const { data } = await supabaseAdmin()
      .from('usage_daily')
      .select('*')
      .eq('profile_id', profile.id)
      .gte('day', since)
      .order('day', { ascending: true });
    rows = (data as UsageDailyRow[]) ?? [];
  }

  const requestsByDay = new Map<string, number>();
  const costByDay = new Map<string, number>();
  const byEndpoint = new Map<string, { endpoint: string; requests: number; costUsd: number }>();
  const byProvider = new Map<string, number>();
  let monthToDateUsd = 0;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);

  for (const row of rows) {
    const day = row.day.slice(0, 10);
    requestsByDay.set(day, (requestsByDay.get(day) ?? 0) + row.requests);
    costByDay.set(day, (costByDay.get(day) ?? 0) + Number(row.est_provider_cost_usd));

    const existing = byEndpoint.get(row.endpoint) ?? { endpoint: row.endpoint, requests: 0, costUsd: 0 };
    existing.requests += row.requests;
    existing.costUsd += Number(row.est_provider_cost_usd);
    byEndpoint.set(row.endpoint, existing);

    if (day >= monthStart) monthToDateUsd += Number(row.est_provider_cost_usd);
  }

  const requestSeries = [{ label: 'requests', values: labels.map((d) => requestsByDay.get(d) ?? 0) }];
  const spendSeries = [{ label: 'est. spend', values: labels.map((d) => Number((costByDay.get(d) ?? 0).toFixed(4))) }];
  const endpointRows = Array.from(byEndpoint.values()).sort((a, b) => b.requests - a.requests);
  const chartLabels = labels.map(shortLabel);
  const budgetUsd = profile.monthly_budget_usd;
  const budgetRatio = budgetUsd && budgetUsd > 0 ? Math.min(1, monthToDateUsd / budgetUsd) : null;

  return (
    <div className="relative flex flex-col gap-6 bg-background p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold leading-tight">Usage</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This is where billing lives. Every cost below is an estimate of what your own provider will bill you
          — Helix takes no margin on it.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Month-to-date est. provider spend</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-medium tracking-wide">{formatUsd(monthToDateUsd)}</span>
            <span className="ml-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground">est.</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Requests, last {DAYS} days</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-medium tracking-wide">
              {labels.reduce((sum, d) => sum + (requestsByDay.get(d) ?? 0), 0)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
              Monthly budget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BudgetField initialBudgetUsd={budgetUsd} />
            {budgetRatio !== null && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-pill bg-secondary">
                <div className="h-full bg-primary" style={{ width: `${budgetRatio * 100}%` }} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Requests per day</CardTitle>
          <CardDescription>Last {DAYS} days</CardDescription>
        </CardHeader>
        <CardContent>
          <CharChart series={requestSeries} labels={chartLabels} formatKind="count" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Est. provider spend per day</CardTitle>
          <CardDescription>EST. · last {DAYS} days</CardDescription>
        </CardHeader>
        <CardContent>
          <CharChart series={spendSeries} labels={chartLabels} formatKind="usd" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-endpoint breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {endpointRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests recorded in this range yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Est. spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpointRows.map((row) => (
                  <TableRow key={row.endpoint}>
                    <TableCell className="font-mono text-sm">{endpointById(row.endpoint)?.name ?? row.endpoint}</TableCell>
                    <TableCell className="font-mono text-sm">{row.requests}</TableCell>
                    <TableCell className="font-mono text-sm">{formatUsd(row.costUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
