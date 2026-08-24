'use client';

import * as React from 'react';
import type { MonitorRequest } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormFooter } from './form-footer';

const SCHEDULE_PRESETS: { value: string; label: string }[] = [
  { value: '0 * * * *', label: 'Hourly' },
  { value: '0 9 * * *', label: 'Daily at 9am' },
  { value: '0 9 * * 1-5', label: 'Weekday mornings' },
  { value: '*/15 * * * *', label: 'Every 15 minutes' },
  { value: 'custom', label: 'Custom cron' },
];

const SENSITIVITY_OPTIONS: { value: NonNullable<MonitorRequest['sensitivity']>; label: string }[] = [
  { value: 'any', label: 'Any change' },
  { value: 'significant', label: 'Significant only (filters noise)' },
];

interface MonitorFormProps {
  onSubmit: (request: MonitorRequest) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

export function MonitorForm({ onSubmit, onGetCode, loading }: MonitorFormProps) {
  const [url, setUrl] = React.useState('');
  const [preset, setPreset] = React.useState(SCHEDULE_PRESETS[0]!.value);
  const [customSchedule, setCustomSchedule] = React.useState('0 * * * *');
  const [sensitivity, setSensitivity] = React.useState<NonNullable<MonitorRequest['sensitivity']>>('significant');
  const [webhook, setWebhook] = React.useState('');

  const schedule = preset === 'custom' ? customSchedule : preset;

  const buildRequest = React.useCallback((): MonitorRequest => {
    const request: MonitorRequest = { url: url.trim(), schedule, sensitivity };
    if (webhook.trim().length > 0) request.webhook = webhook.trim();
    return request;
  }, [url, schedule, sensitivity, webhook]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (url.trim().length === 0 || loading) return;
    onSubmit(buildRequest());
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="monitor-url">URL</Label>
        <Input
          id="monitor-url"
          type="url"
          placeholder="https://example.com/pricing"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="monitor-schedule">Schedule</Label>
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger id="monitor-schedule">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHEDULE_PRESETS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {preset === 'custom' && (
          <Input
            type="text"
            placeholder="0 9 * * 1-5"
            value={customSchedule}
            onChange={(event) => setCustomSchedule(event.target.value)}
            className="font-mono text-xs"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="monitor-sensitivity">Sensitivity</Label>
        <Select value={sensitivity} onValueChange={(value) => setSensitivity(value as NonNullable<MonitorRequest['sensitivity']>)}>
          <SelectTrigger id="monitor-sensitivity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SENSITIVITY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="monitor-webhook">Webhook (optional)</Label>
        <Input
          id="monitor-webhook"
          type="url"
          placeholder="https://your.app/webhooks/helix"
          value={webhook}
          onChange={(event) => setWebhook(event.target.value)}
        />
      </div>

      <FormFooter
        loading={loading}
        disabled={url.trim().length === 0}
        onGetCode={() => onGetCode(buildRequest() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
