'use client';

import * as React from 'react';
import { Plus, Trash2 } from '@/components/icons/lucide';
import type { Action, ActionType, InteractRequest } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormFooter } from './form-footer';

const ACTION_TYPES: ActionType[] = ['navigate', 'click', 'type', 'press', 'scroll', 'wait', 'screenshot', 'executeJavascript', 'extract'];

function defaultAction(type: ActionType): Action {
  switch (type) {
    case 'navigate':
      return { type, url: '' };
    case 'click':
      return { type, selector: '' };
    case 'type':
      return { type, selector: '', text: '' };
    case 'press':
      return { type, key: 'Enter' };
    case 'scroll':
      return { type, direction: 'down' };
    case 'wait':
      return { type, milliseconds: 500 };
    case 'screenshot':
      return { type };
    case 'executeJavascript':
      return { type, script: '' };
    case 'extract':
      return { type, prompt: '' };
  }
}

function actionComplete(action: Action): boolean {
  switch (action.type) {
    case 'navigate':
      return action.url.trim().length > 0;
    case 'click':
      return action.selector.trim().length > 0;
    case 'type':
      return action.selector.trim().length > 0;
    case 'press':
      return action.key.trim().length > 0;
    case 'wait':
      return action.selector !== undefined ? action.selector.trim().length > 0 : true;
    case 'executeJavascript':
      return action.script.trim().length > 0;
    case 'extract':
      return action.prompt.trim().length > 0;
    case 'scroll':
    case 'screenshot':
      return true;
  }
}

interface InteractFormProps {
  url: string;
  onSubmit: (request: InteractRequest) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

/** Form for POST /v1/interact, built from the InteractRequest schema in openapi.yaml. */
export function InteractForm({ url, onSubmit, onGetCode, loading }: InteractFormProps) {
  const [sessionId, setSessionId] = React.useState('');
  const [actions, setActions] = React.useState<Action[]>([
    { type: 'click', selector: '#accept-cookies' },
    { type: 'screenshot' },
  ]);
  const [keepSessionOpen, setKeepSessionOpen] = React.useState(false);

  const updateAction = (index: number, next: Action) => {
    setActions((prev) => prev.map((action, i) => (i === index ? next : action)));
  };

  const buildRequest = React.useCallback((): InteractRequest => {
    const request: InteractRequest = { actions, keepSessionOpen };
    if (url.trim().length > 0) request.url = url.trim();
    if (sessionId.trim().length > 0) request.sessionId = sessionId.trim();
    return request;
  }, [url, sessionId, actions, keepSessionOpen]);

  const hasTarget = url.trim().length > 0 || sessionId.trim().length > 0;
  const ready = hasTarget && actions.length > 0 && actions.every(actionComplete);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || loading) return;
    onSubmit(buildRequest());
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="interact-session">Session ID</Label>
        <Input
          id="interact-session"
          placeholder="sess_… from an earlier run"
          className="font-mono text-xs"
          value={sessionId}
          onChange={(event) => setSessionId(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Actions</Label>
        <div className="flex flex-col gap-2">
          {actions.map((action, index) => (
            <div key={index} className="flex flex-col gap-1.5 rounded-card border border-border p-2.5">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground">{index}</span>
                <Select value={action.type} onValueChange={(value) => updateAction(index, defaultAction(value as ActionType))}>
                  <SelectTrigger className="h-8 text-xs" aria-label={`Action ${index} type`}>
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
                  aria-label={`Remove action ${index}`}
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setActions((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {action.type === 'navigate' && (
                <Input
                  type="url"
                  placeholder="https://example.com/page"
                  className="h-8 text-xs"
                  value={action.url}
                  onChange={(event) => updateAction(index, { ...action, url: event.target.value })}
                />
              )}
              {(action.type === 'click' || action.type === 'type') && (
                <Input
                  placeholder="CSS selector"
                  className="h-8 font-mono text-xs"
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
                  className="h-8 font-mono text-xs"
                  value={action.key}
                  onChange={(event) => updateAction(index, { ...action, key: event.target.value })}
                />
              )}
              {action.type === 'scroll' && (
                <div className="flex gap-2">
                  <Select
                    value={action.direction}
                    onValueChange={(value) => updateAction(index, { ...action, direction: value as 'up' | 'down' })}
                  >
                    <SelectTrigger className="h-8 text-xs" aria-label="Scroll direction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="down">down</SelectItem>
                      <SelectItem value="up">up</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={20000}
                    placeholder="Pixels (blank: one viewport)"
                    className="h-8 text-xs"
                    value={action.amount ?? ''}
                    onChange={(event) => {
                      const next = { ...action };
                      const amount = Number(event.target.value);
                      if (event.target.value === '' || !Number.isFinite(amount) || amount <= 0) delete next.amount;
                      else next.amount = Math.floor(amount);
                      updateAction(index, next);
                    }}
                  />
                </div>
              )}
              {action.type === 'wait' && (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={30000}
                    placeholder="Milliseconds"
                    className="h-8 text-xs"
                    value={action.milliseconds ?? ''}
                    onChange={(event) => updateAction(index, { ...action, milliseconds: Number(event.target.value) || 0 })}
                  />
                  <Input
                    placeholder="or wait for selector"
                    className="h-8 font-mono text-xs"
                    value={action.selector ?? ''}
                    onChange={(event) => {
                      const next = { ...action };
                      if (event.target.value.length === 0) delete next.selector;
                      else next.selector = event.target.value;
                      updateAction(index, next);
                    }}
                  />
                </div>
              )}
              {action.type === 'screenshot' && (
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`interact-fullpage-${index}`} className="text-xs font-normal text-muted-foreground">
                    Full page
                  </Label>
                  <Switch
                    id={`interact-fullpage-${index}`}
                    checked={action.fullPage === true}
                    onCheckedChange={(checked) => updateAction(index, { ...action, fullPage: checked })}
                  />
                </div>
              )}
              {action.type === 'executeJavascript' && (
                <Input
                  placeholder="document.title"
                  className="h-8 font-mono text-xs"
                  value={action.script}
                  onChange={(event) => updateAction(index, { ...action, script: event.target.value })}
                />
              )}
              {action.type === 'extract' && (
                <Input
                  placeholder="What to extract, e.g. the price of the first result"
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
          disabled={actions.length >= 50}
          onClick={() => setActions((prev) => [...prev, defaultAction('click')])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add action
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="interact-keep-open" className="text-sm font-normal">
            Keep session open
          </Label>
          <span className="text-xs text-muted-foreground">Returns a session ID and a live view. Closes on idle or hard timeout.</span>
        </div>
        <Switch id="interact-keep-open" checked={keepSessionOpen} onCheckedChange={setKeepSessionOpen} />
      </div>

      <FormFooter
        loading={loading}
        disabled={!ready}
        onGetCode={() => onGetCode(buildRequest() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
