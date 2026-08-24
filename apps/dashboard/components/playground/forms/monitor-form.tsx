'use client';

import * as React from 'react';
import type { MonitorGranularity, MonitorRequest } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormFooter } from './form-footer';

const SCHEDULE_PRESETS: { value: string; label: string }[] = [
  { value: '0 * * * *', label: 'Hourly' },
  { value: '0 */6 * * *', label: 'Every 6 hours' },
  { value: '0 9 * * *', label: 'Daily at 9:00' },
  { value: '0 9 * * 1-5', label: 'Weekdays at 9:00' },
  { value: 'custom', label: 'Custom cron' },
];

type Sensitivity = NonNullable<MonitorRequest['sensitivity']>;

const SENSITIVITY_OPTIONS: { value: Sensitivity; label: string }[] = [
  { value: 'any', label: 'Any change' },
  { value: 'significant', label: 'Significant only (ignores timestamps and tracking noise)' },
];

const GRANULARITY_OPTIONS: { value: MonitorGranularity; label: string }[] = [
  { value: 'word', label: 'Word' },
  { value: 'line', label: 'Line' },
  { value: 'character', label: 'Character' },
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
  const [sensitivity, setSensitivity] = React.useState<Sensitivity>('significant');
  const [granularity, setGranularity] = React.useState<MonitorGranularity>('word');
  const [keywordDisappears, setKeywordDisappears] = React.useState('');
  const [webhook, setWebhook] = React.useState('');

  const schedule = preset === 'custom' ? customSchedule.trim() : preset;

  const buildRequest = React.useCallback((): MonitorRequest => {
    const request: MonitorRequest = { url: url.trim(), schedule, sensitivity };
    if (granularity !== 'word') request.diff = { granularity };
    if (keywordDisappears.trim().length > 0) request.trigger = { keywordDisappears: keywordDisappears.trim() };
    if (webhook.trim().length > 0) request.webhook = webhook.trim();
    return request;
  }, [url, schedule, sensitivity, granularity, keywordDisappears, webhook]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (url.trim().length === 0 || schedule.length === 0 || loading) return;
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
            aria-label="Cron expression"
            placeholder="0 9 * * 1-5"
            value={customSchedule}
            onChange={(event) => setCustomSchedule(event.target.value)}
            className="font-mono text-xs"
          />
        )}
        <p className="text-xs text-muted-foreground">Checks cannot run more often than the instance minimum (hourly by default).</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="monitor-sensitivity">Sensitivity</Label>
          <Select value={sensitivity} onValueChange={(value) => setSensitivity(value as Sensitivity)}>
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
          <Label htmlFor="monitor-granularity">Diff granularity</Label>
          <Select value={granularity} onValueChange={(value) => setGranularity(value as MonitorGranularity)}>
            <SelectTrigger id="monitor-granularity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRANULARITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="monitor-keyword">Only when this phrase disappears (optional)</Label>
        <Input
          id="monitor-keyword"
          type="text"
          placeholder="Out of stock"
          value={keywordDisappears}
          onChange={(event) => setKeywordDisappears(event.target.value)}
        />
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
        disabled={url.trim().length === 0 || schedule.length === 0}
        onGetCode={() => onGetCode(buildRequest() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
