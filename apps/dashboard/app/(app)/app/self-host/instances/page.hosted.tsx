import Link from 'next/link';
import { ActivitySquare } from 'lucide-react';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import type { InstanceRow } from '@/lib/supabase/types';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AddInstanceDialog } from '@/components/app/add-instance-dialog';
import { InstanceRowActions } from '@/components/app/instance-row-actions';
import { HealthPill } from '@/components/app/health-pill';

export const dynamic = 'force-dynamic';

export default async function InstancesPage() {
  const profile = await requireProfile();
  let instances: Omit<InstanceRow, 'key_ciphertext' | 'key_iv'>[] = [];

  if (supabaseConfigured()) {
    const { data } = await supabaseAdmin()
      .from('instances')
      .select('id, profile_id, name, base_url, last_health, last_checked_at, created_at')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: true });
    instances = (data as Omit<InstanceRow, 'key_ciphertext' | 'key_iv'>[]) ?? [];
  }

  return (
    <div className="relative flex flex-col gap-6 bg-background p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold leading-tight">Instances</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your own self-hosted Helix instances. Health is probed from your browser against{' '}
            <code className="font-mono text-xs">/v1/health</code>.
          </p>
        </div>
        <AddInstanceDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          {instances.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <ActivitySquare className="h-5 w-5 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">No instances added yet.</p>
              <AddInstanceDialog />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Base URL</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Last checked</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.map((instance) => (
                  <TableRow key={instance.id}>
                    <TableCell className="font-medium">{instance.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{instance.base_url}</TableCell>
                    <TableCell>
                      <HealthPill lastHealth={instance.last_health} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {instance.last_checked_at ? new Date(instance.last_checked_at).toLocaleString() : 'never'}
                    </TableCell>
                    <TableCell>
                      <InstanceRowActions instanceId={instance.id} baseUrl={instance.base_url} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Need the raw health detail (services, providers)?{' '}
        <Link href="/app/self-host/health" className="text-primary hover:underline">
          Health detail
        </Link>
        .
      </p>
    </div>
  );
}
