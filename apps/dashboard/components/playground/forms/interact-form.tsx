'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Action, ActionType, InteractRequest } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormFooter } from './form-footer';

const ACTION_TYPES: ActionType[] = ['click', 'type', 'press', 'scroll', 'wait', 'screenshot', 'extract'];

function defaultAction(type: ActionType): Action {
  switch (type) {
    case 'navigate':
      return { type, url: '' };
    case 'click':
      return { type, selector: '' };
    case 'type':
      return { type, selector: '', text: '' };
    case 'press':
      return { type, key: '' };
    case 'scroll':
      return { type, direction: 'down' };
    case 'wait':
      return { type, milliseconds: 500 };
    case 'screenshot':
      return { type };
    case 'extract':
      return { type, prompt: '' };
  }
}

interface InteractFormProps {
  onSubmit: (request: InteractRequest) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

export function InteractForm({ onSubmit, onGetCode, loading }: InteractFormProps) {
  const [url, setUrl] = React.useState('');
  const [actions, setActions] = React.useState<Action[]>([{ type: 'click', selector: '#accept' }]);
  const [keepSessionOpen, setKeepSessionOpen] = React.useState(false);

  const updateAction = (index: number, next: Action) => {
    setActions((prev) => prev.map((action, i) => (i === index ? next : action)));
  };

  const buildRequest = React.useCallback(
    (): InteractRequest => ({ url: url.trim(), actions, keepSessionOpen }),
    [url, actions, keepSessionOpen],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (url.trim().length === 0 || actions.length === 0 || loading) return;
    onSubmit(buildRequest());
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="interact-url">URL</Label>
        <Input
          id="interact-url"
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Actions</Label>
        <div className="flex flex-col gap-2">
          {actions.map((action, index) => (
            <div key={index} className="flex flex-col gap-1.5 rounded-card border border-border p-2.5">
              <div className="flex items-center gap-2">
                <Select value={action.type} onValueChange={(value) => updateAction(index, defaultAction(value as ActionType))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="text-xs">
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setActions((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {(action.type === 'click' || action.type === 'type') && (
                <Input
                  placeholder="CSS selector"
                  className="h-8 text-xs"
                  value={action.selector}
                  onChange={(event) => updateAction(index, { ...action, selector: event.target.value })}
                />
              )}
              {action.type === 'type' && (
                <Input
                  placeholder="Text to type"
                  className="h-8 text-xs"
                  value={action.text}
                  onChange={(event) => updateAction(index, { ...action, text: event.target.value })}
                />
              )}
              {action.type === 'press' && (
                <Input
                  placeholder="Key, e.g. Enter"
                  className="h-8 text-xs"
                  value={action.key}
                  onChange={(event) => updateAction(index, { ...action, key: event.target.value })}
                />
              )}
              {action.type === 'scroll' && (
                <Select
                  value={action.direction}
                  onValueChange={(value) => updateAction(index, { ...action, direction: value as 'up' | 'down' })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="down">down</SelectItem>
                    <SelectItem value="up">up</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {action.type === 'wait' && (
                <Input
                  type="number"
                  placeholder="Milliseconds"
                  className="h-8 text-xs"
                  value={action.milliseconds}
                  onChange={(event) => updateAction(index, { ...action, milliseconds: Number(event.target.value) || 0 })}
                />
              )}
              {action.type === 'extract' && (
                <Input
                  placeholder="What to extract, e.g. the price"
                  className="h-8 text-xs"
                  value={action.prompt}
                  onChange={(event) => updateAction(index, { ...action, prompt: event.target.value })}
                />
              )}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit gap-1.5"
          onClick={() => setActions((prev) => [...prev, defaultAction('click')])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add action
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="interact-keep-open" className="text-sm font-normal">
          Keep session open
        </Label>
        <Switch id="interact-keep-open" checked={keepSessionOpen} onCheckedChange={setKeepSessionOpen} />
      </div>

      <FormFooter
        loading={loading}
        disabled={url.trim().length === 0 || actions.length === 0}
        onGetCode={() => onGetCode(buildRequest() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
