'use client';

import * as React from 'react';
import type { ScreenshotFormat, ScreenshotRequest } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormFooter } from './form-footer';
import { cn } from '@/lib/utils';

const FORMATS: readonly ScreenshotFormat[] = ['png', 'jpeg', 'webp'];

/** Named device sizes, so the common cases are one click rather than two numbers. */
const PRESETS = [
  { label: 'Desktop', width: 1440, height: 900 },
  { label: 'Laptop', width: 1280, height: 800 },
  { label: 'Tablet', width: 834, height: 1112 },
] as const;

type Frame = 'viewport' | 'fullPage' | 'element';

interface ScreenshotFormProps {
  url: string;
  onSubmit: (request: ScreenshotRequest) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

export function ScreenshotForm({ url, onSubmit, onGetCode, loading }: ScreenshotFormProps) {
  const [frame, setFrame] = React.useState<Frame>('fullPage');
  const [selector, setSelector] = React.useState('');
  const [format, setFormat] = React.useState<ScreenshotFormat>('png');
  const [quality, setQuality] = React.useState('80');
  const [preset, setPreset] = React.useState<number>(0);
  const [dpr, setDpr] = React.useState('1');
  const [darkMode, setDarkMode] = React.useState(false);
  const [blockAds, setBlockAds] = React.useState(true);
  const [omitBackground, setOmitBackground] = React.useState(false);
  const [waitFor, setWaitFor] = React.useState('0');

  // PNG has no lossy setting, and JPEG has no alpha. Rather than let the form
  // offer a control the server will ignore, each is hidden where it means
  // nothing — the same rule the route applies when it builds its encode options.
  const lossy = format !== 'png';
  const canBeTransparent = format !== 'jpeg';

  const canSubmit = url.trim().length > 0 && (frame !== 'element' || selector.trim().length > 0);

  const buildBody = React.useCallback((): ScreenshotRequest => {
    const size = PRESETS[preset] ?? PRESETS[0];
    const body: ScreenshotRequest = {
      url: url.trim(),
      format,
      fullPage: frame === 'fullPage',
      darkMode,
      blockAds,
    };

    if (frame === 'element') body.selector = selector.trim();
    if (lossy) {
      const q = Number.parseInt(quality, 10);
      if (Number.isFinite(q) && q > 0) body.quality = q;
    }
    if (canBeTransparent && omitBackground) body.omitBackground = true;

    const scale = Number.parseFloat(dpr);
    body.viewport = {
      width: size.width,
      height: size.height,
      ...(Number.isFinite(scale) && scale > 1 ? { dpr: scale } : {}),
    };

    const wait = Number.parseInt(waitFor, 10);
    if (Number.isFinite(wait) && wait > 0) body.waitFor = wait;

    return body;
  }, [url, format, frame, selector, lossy, quality, canBeTransparent, omitBackground, preset, dpr, darkMode, blockAds, waitFor]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || loading) return;
    onSubmit(buildBody());
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <p className="text-xs text-muted-foreground">Reads the URL from the prompt box above.</p>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Capture</legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['fullPage', 'Full page'],
              ['viewport', 'Viewport'],
              ['element', 'Element'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={frame === value}
              onClick={() => setFrame(value)}
              className={cn(
                'rounded-card border px-3 py-2 text-sm font-medium transition-colors duration-fast',
                frame === value
                  ? 'border-violet bg-violet-8 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {frame === 'element' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="screenshot-selector">CSS selector</Label>
          <Input
            id="screenshot-selector"
            value={selector}
            placeholder="#pricing-table"
            onChange={(event) => setSelector(event.target.value)}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            A selector matching nothing captures the viewport and says so in the warnings, rather than
            returning the page as though it were the element.
          </p>
        </div>
      )}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Format</legend>
        <div className="grid grid-cols-3 gap-2">
          {FORMATS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={format === value}
              onClick={() => setFormat(value)}
              className={cn(
                'rounded-card border px-3 py-2 text-sm font-medium transition-colors duration-fast',
                format === value
                  ? 'border-violet bg-violet-8 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary',
              )}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>
      </fieldset>

      {lossy && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="screenshot-quality">Quality</Label>
          <Input
            id="screenshot-quality"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={quality}
            onChange={(event) => setQuality(event.target.value)}
          />
        </div>
      )}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Device size</legend>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((size, index) => (
            <button
              key={size.label}
              type="button"
              aria-pressed={preset === index}
              onClick={() => setPreset(index)}
              className={cn(
                'rounded-card border px-3 py-2 text-sm font-medium transition-colors duration-fast',
                preset === index
                  ? 'border-violet bg-violet-8 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary',
              )}
            >
              {size.label}
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {(PRESETS[preset] ?? PRESETS[0]).width} × {(PRESETS[preset] ?? PRESETS[0]).height}
        </p>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="screenshot-dpr">Pixel ratio</Label>
          <Input
            id="screenshot-dpr"
            type="number"
            inputMode="decimal"
            min={1}
            max={3}
            step={1}
            value={dpr}
            onChange={(event) => setDpr(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="screenshot-wait">Wait (ms)</Label>
          <Input
            id="screenshot-wait"
            type="number"
            inputMode="numeric"
            min={0}
            max={30000}
            value={waitFor}
            onChange={(event) => setWaitFor(event.target.value)}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Page</legend>
        {(
          [
            ['blockAds', 'Block ads and cookie banners', blockAds, setBlockAds, true],
            ['darkMode', 'Emulate dark mode', darkMode, setDarkMode, true],
            ['omitBackground', 'Transparent background', omitBackground, setOmitBackground, canBeTransparent],
          ] as const
        ).map(([id, label, value, setValue, enabled]) => (
          <label
            key={id}
            className={cn(
              'flex items-center gap-2 text-sm',
              enabled ? 'text-foreground' : 'cursor-not-allowed text-muted-foreground/40',
            )}
            title={enabled ? undefined : 'JPEG has no alpha channel.'}
          >
            <input
              type="checkbox"
              checked={enabled && value}
              disabled={!enabled}
              onChange={(event) => setValue(event.target.checked)}
              className="h-4 w-4 rounded border-border accent-violet"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <FormFooter
        loading={loading}
        disabled={!canSubmit}
        onGetCode={() => onGetCode(buildBody() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
