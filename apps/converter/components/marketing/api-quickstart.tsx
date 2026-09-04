'use client';

import { useId, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { API_BASE, ENDPOINTS, type FormatOp } from '@/lib/formats';

type Lang = 'curl' | 'node' | 'python';

const OPS: { op: FormatOp; label: string; summary: string }[] = [
  { op: 'convert', label: 'Convert', summary: 'file + to. Video and audio, any pair in the manifest.' },
  { op: 'compress', label: 'Compress', summary: 'file + target size or preset (email, discord, web, archive).' },
  { op: 'gif', label: 'GIF', summary: 'file + fps + width. Video or an image set in, GIF out.' },
  { op: 'image', label: 'Image', summary: 'file + to, plus optional resize and quality.' },
];

const LANGS: { id: Lang; label: string }[] = [
  { id: 'curl', label: 'curl' },
  { id: 'node', label: 'Node' },
  { id: 'python', label: 'Python' },
];

type Field = { name: string; value: string };

const FIELDS: Record<FormatOp, { file: string; fields: Field[] }> = {
  convert: { file: 'input.mov', fields: [{ name: 'to', value: 'mp4' }, { name: 'options', value: '{"crf":23}' }] },
  compress: { file: 'input.mp4', fields: [{ name: 'preset', value: 'web' }] },
  gif: { file: 'clip.mp4', fields: [{ name: 'fps', value: '15' }, { name: 'width', value: '480' }] },
  image: { file: 'photo.heic', fields: [{ name: 'to', value: 'jpg' }, { name: 'resize', value: '1600' }, { name: 'quality', value: '82' }] },
};

function snippet(op: FormatOp, lang: Lang): string {
  const url = `${API_BASE}${ENDPOINTS[op]}`;
  const { file, fields } = FIELDS[op];
  if (lang === 'curl') {
    const lines = [
      `curl -X POST ${url} \\`,
      `  -H "Authorization: Bearer $HELIX_KEY" \\`,
      `  -F "file=@${file}" \\`,
      ...fields.map((f) => `  -F '${f.name}=${f.value}' \\`),
    ];
    const last = lines.pop()?.replace(/ \\$/, '') ?? '';
    return [...lines, last, '# 202 {"id":"cv_8f2","status":"queued"}'].join('\n');
  }
  if (lang === 'node') {
    return [
      `import { openAsBlob } from 'node:fs';`,
      ``,
      `const form = new FormData();`,
      `form.set('file', await openAsBlob('${file}'), '${file}');`,
      ...fields.map((f) => `form.set('${f.name}', '${f.value}');`),
      ``,
      `const res = await fetch('${url}', {`,
      `  method: 'POST',`,
      `  headers: { Authorization: \`Bearer \${process.env.HELIX_KEY}\` },`,
      `  body: form,`,
      `});`,
      `const { id } = await res.json(); // { id, status: 'queued' }`,
    ].join('\n');
  }
  return [
    `import os, requests`,
    ``,
    `r = requests.post(`,
    `    "${url}",`,
    `    headers={"Authorization": f"Bearer {os.environ['HELIX_KEY']}"},`,
    `    files={"file": open("${file}", "rb")},`,
    `    data={${fields.map((f) => `"${f.name}": ${JSON.stringify(f.value)}`).join(', ')}},`,
    `)`,
    `job = r.json()  # {"id": "cv_8f2", "status": "queued"}`,
  ].join('\n');
}

function followUp(lang: Lang): string {
  const base = API_BASE;
  if (lang === 'curl') {
    return [
      `curl -N ${base}/v1/jobs/cv_8f2/events -H "Authorization: Bearer $HELIX_KEY"`,
      `# data {"pct":12,"fps":48,"eta":31,"status":"running"}`,
      `# data {"status":"done","url":"/v1/jobs/cv_8f2/download","size":8412934}`,
      `curl -o out ${base}/v1/jobs/cv_8f2/download -H "Authorization: Bearer $HELIX_KEY"`,
    ].join('\n');
  }
  if (lang === 'node') {
    return [
      `const events = await fetch(\`${base}/v1/jobs/\${id}/events\`, { headers });`,
      `for await (const chunk of events.body) {`,
      `  // data {"pct":12,"fps":48,"eta":31,"status":"running"}`,
      `  // data {"status":"done","url":"/v1/jobs/cv_8f2/download","size":8412934}`,
      `}`,
      `const out = await fetch(\`${base}/v1/jobs/\${id}/download\`, { headers });`,
    ].join('\n');
  }
  return [
    `with requests.get(f"${base}/v1/jobs/{job['id']}/events", headers=headers, stream=True) as s:`,
    `    for line in s.iter_lines():`,
    `        pass  # data {"pct":12,"fps":48,"eta":31,"status":"running"}`,
    `out = requests.get(f"${base}/v1/jobs/{job['id']}/download", headers=headers)`,
  ].join('\n');
}

function CodeBlock({ code, title }: { code: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative rounded-card border border-p-line bg-p-code">
      <div className="flex items-center justify-between border-b border-p-line px-4">
        <span className="font-mono text-caption text-p-ink-3">{title}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : `Copy ${title}`}
          aria-live="polite"
          className="inline-flex h-11 items-center gap-1.5 rounded-pill px-2 text-caption font-medium text-p-ink-2 transition-colors duration-150 ease-out hover:text-p-ink active:scale-[0.98]"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-blue" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-note leading-relaxed text-p-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Real per-operation requests from CONVERTER-CONTRACT §5 in curl, Node and
 * Python. Pin `op` to show a single operation (the docs pages do this).
 */
export function ApiQuickstart({ op: pinned }: { op?: FormatOp }) {
  const [op, setOp] = useState<FormatOp>(pinned ?? 'convert');
  const [lang, setLang] = useState<Lang>('curl');
  const id = useId();
  const current = OPS.find((o) => o.op === op) ?? OPS[0]!;

  return (
    <div className="space-y-4">
      {!pinned && (
        <div role="tablist" aria-label="Operation" className="flex flex-wrap gap-2">
          {OPS.map((o) => {
            const selected = o.op === op;
            return (
              <button
                key={o.op}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${id}-panel`}
                onClick={() => setOp(o.op)}
                className={`inline-flex h-11 items-center rounded-pill border px-4 text-sm font-medium transition-colors duration-150 ease-out active:scale-[0.98] ${
                  selected
                    ? 'border-p-ink bg-p-ink text-p-bg'
                    : 'border-p-line-2 text-p-ink-2 hover:bg-p-code hover:text-p-ink'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      <div id={`${id}-panel`} role={pinned ? undefined : 'tabpanel'} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-p-ink-2">
            <span className="font-mono text-p-ink">POST {ENDPOINTS[op]}</span>
            <span className="mx-2 text-p-ink-3">·</span>
            {current.summary}
          </p>
          <div role="tablist" aria-label="Language" className="flex gap-1 rounded-pill bg-p-code p-1">
            {LANGS.map((l) => {
              const selected = l.id === lang;
              return (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setLang(l.id)}
                  className={`inline-flex h-9 min-w-[44px] items-center justify-center rounded-pill px-3 text-note font-medium transition-colors duration-150 ease-out ${
                    selected ? 'bg-p-surface text-p-ink shadow-card-sm' : 'text-p-ink-2 hover:text-p-ink'
                  }`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        <CodeBlock code={snippet(op, lang)} title={`${op}.${lang === 'curl' ? 'sh' : lang === 'node' ? 'mjs' : 'py'}`} />
        <CodeBlock code={followUp(lang)} title="then: progress and download" />
      </div>
    </div>
  );
}
