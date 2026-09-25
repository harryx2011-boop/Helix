'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { HelixApiError, type DiffGranularity, type DiffResponse, type DiffSide, type JsonDiff, type TextDiff } from '@/lib/api';
import { runDiff } from '@/lib/checks';
import { PillButton } from '@/components/shared/pill-button';
import {
  CheckPanel,
  ErrorNote,
  FieldLabel,
  KeyNote,
  ResultRow,
  RunLabel,
  Verdict,
  inputClass,
  needsKey,
  useCheckKey,
} from './check-shell';

type SideKind = 'text' | 'url';
type Mode = 'text' | 'json';

const GRANULARITIES: DiffGranularity[] = ['word', 'line', 'character'];

function isJsonDiff(diff: TextDiff | JsonDiff): diff is JsonDiff {
  return diff.granularity === 'json';
}

function SideInput({
  id,
  label,
  kind,
  onKindChange,
  value,
  onValueChange,
  mode,
}: {
  id: string;
  label: string;
  kind: SideKind;
  onKindChange: (kind: SideKind) => void;
  value: string;
  onValueChange: (value: string) => void;
  mode: Mode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {mode === 'text' && (
          <div className="flex gap-1">
            {(['text', 'url'] as SideKind[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onKindChange(option)}
                aria-pressed={kind === option}
                className={cn(
                  'rounded-pill px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors duration-150 ease-out',
                  kind === option ? 'bg-m-ink/[0.078] text-m-ink' : 'text-m-ink/48 hover:text-m-ink',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
      {mode === 'text' && kind === 'url' ? (
        <input
          id={id}
          type="url"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="https://example.com/page"
          className={inputClass}
        />
      ) : (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          rows={8}
          placeholder={mode === 'json' ? '{ "price": 49 }' : 'Paste text…'}
          className={cn(inputClass, 'resize-y')}
        />
      )}
    </div>
  );
}

function TextDiffView({ diff }: { diff: TextDiff }) {
  const unchanged = diff.added === 0 && diff.removed === 0;
  return (
    <CheckPanel>
      <Verdict
        tone={unchanged ? 'good' : 'warn'}
        headline={unchanged ? 'Identical' : 'Changed'}
        detail={
          unchanged
            ? 'Nothing differs at this granularity.'
            : `${diff.added} added, ${diff.removed} removed · ${Math.round(diff.changeRatio * 100)}% changed`
        }
      />
      {diff.coarse && (
        <ResultRow label="Note">
          Too long to trace token by token; counts are an upper bound.
        </ResultRow>
      )}
      {diff.truncated ? (
        <ResultRow label="Note">The diff exceeded 128KB, so the detail was dropped. Counts above still hold.</ResultRow>
      ) : (
        <div className="max-h-[28rem] overflow-auto px-5 py-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed">
            {diff.ops.map((op, index) => (
              <span
                key={index}
                className={cn(
                  op.op === 'insert' && 'bg-success/[0.14] text-m-ink',
                  op.op === 'delete' && 'bg-destructive/[0.12] text-m-ink line-through decoration-destructive/40',
                  op.op === 'equal' && 'text-m-ink/56',
                )}
              >
                {op.text}
              </span>
            ))}
          </pre>
        </div>
      )}
    </CheckPanel>
  );
}

function JsonDiffView({ diff }: { diff: JsonDiff }) {
  const unchanged = diff.fields.length === 0;
  return (
    <CheckPanel>
      <Verdict
        tone={unchanged ? 'good' : 'warn'}
        headline={unchanged ? 'Identical' : `${diff.fields.length} field${diff.fields.length === 1 ? '' : 's'} changed`}
        detail={unchanged ? 'Every field matches.' : `${Math.round(diff.changeRatio * 100)}% of fields differ.`}
      />
      {diff.fields.map((field) => (
        <ResultRow key={field.path} label={field.path}>
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="text-destructive line-through decoration-destructive/40">
              {field.before === undefined ? '—' : JSON.stringify(field.before)}
            </span>
            <span className="text-m-ink/40" aria-hidden>
              →
            </span>
            <span className="text-success">{field.after === undefined ? '—' : JSON.stringify(field.after)}</span>
          </span>
        </ResultRow>
      ))}
    </CheckPanel>
  );
}

export function DiffCheck() {
  const { apiKey, ready } = useCheckKey();
  const [mode, setMode] = React.useState<Mode>('text');
  const [granularity, setGranularity] = React.useState<DiffGranularity>('word');
  const [beforeKind, setBeforeKind] = React.useState<SideKind>('text');
  const [afterKind, setAfterKind] = React.useState<SideKind>('text');
  const [before, setBefore] = React.useState('');
  const [after, setAfter] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<DiffResponse | null>(null);

  const blocked = needsKey(apiKey) && ready;

  function side(kind: SideKind, value: string): DiffSide {
    return kind === 'url' ? { url: value.trim() } : { text: value };
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (mode === 'json') {
        let parsedBefore: unknown;
        let parsedAfter: unknown;
        try {
          parsedBefore = JSON.parse(before);
          parsedAfter = JSON.parse(after);
        } catch {
          setError('Both sides must be valid JSON.');
          return;
        }
        setResult(await runDiff({ mode: 'json', before: parsedBefore, after: parsedAfter }, apiKey));
      } else {
        setResult(
          await runDiff(
            { mode: 'text', before: side(beforeKind, before), after: side(afterKind, after), granularity },
            apiKey,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof HelixApiError ? err.message : 'That diff could not run.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose font-sans text-[15px] leading-relaxed text-m-ink/72">
        Compare two things right now — text, or two URLs the server reads for you. This is the same diff{' '}
        <Link href="/app/playground?tab=monitor" className="text-violet underline underline-offset-2">
          Monitor
        </Link>{' '}
        runs on every check, without creating a monitor that outlives the request.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1">
            {(['text', 'json'] as Mode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                aria-pressed={mode === option}
                className={cn(
                  'rounded-pill px-3 py-1.5 font-mono text-[12px] uppercase tracking-wide transition-colors duration-150 ease-out',
                  mode === option ? 'bg-m-ink/[0.078] text-m-ink' : 'text-m-ink/48 hover:text-m-ink',
                )}
              >
                {option}
              </button>
            ))}
          </div>
          {mode === 'text' && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] uppercase tracking-wide text-m-ink/56">by</span>
              {GRANULARITIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setGranularity(option)}
                  aria-pressed={granularity === option}
                  className={cn(
                    'rounded-pill px-2.5 py-1 font-mono text-[11px] transition-colors duration-150 ease-out',
                    granularity === option ? 'bg-m-ink/[0.078] text-m-ink' : 'text-m-ink/48 hover:text-m-ink',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <SideInput
            id="diff-before"
            label="Before"
            kind={beforeKind}
            onKindChange={setBeforeKind}
            value={before}
            onValueChange={setBefore}
            mode={mode}
          />
          <SideInput
            id="diff-after"
            label="After"
            kind={afterKind}
            onKindChange={setAfterKind}
            value={after}
            onValueChange={setAfter}
            mode={mode}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <PillButton type="submit" variant="primary" disabled={busy || blocked}>
            <RunLabel busy={busy}>Compare</RunLabel>
          </PillButton>
          {blocked && <KeyNote />}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </form>

      {result?.success === false && (
        <CheckPanel>
          <Verdict tone="bad" headline="Could not diff" detail={result.failure.detail ?? String(result.failure.reason)} />
        </CheckPanel>
      )}

      {result?.success &&
        (isJsonDiff(result.diff) ? <JsonDiffView diff={result.diff} /> : <TextDiffView diff={result.diff} />)}
    </div>
  );
}
