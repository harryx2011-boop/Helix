/**
 * Fixed language set for fenced-code highlighting: common web/scripting
 * languages plus the shapes Helix itself deals in (curl, yaml/json for
 * openapi, bash for setup snippets). An unknown fence tag falls back to
 * plain text rather than pulling in Shiki's full grammar bundle.
 */
export const SHIKI_LANGS = [
  'javascript',
  'jsx',
  'typescript',
  'tsx',
  'json',
  'yaml',
  'bash',
  'shell',
  'python',
  'html',
  'css',
  'markdown',
  'sql',
  'diff',
  'toml',
  'http',
] as const;

export type ShikiLang = (typeof SHIKI_LANGS)[number];

const ALIASES: Record<string, ShikiLang> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  curl: 'bash',
};

/** Normalizes a fence-tag language to one Shiki has loaded, or `undefined` for plain fallback. */
export function resolveShikiLang(lang: string | undefined): ShikiLang | undefined {
  if (!lang) return undefined;
  const normalized = lang.toLowerCase();
  if ((SHIKI_LANGS as readonly string[]).includes(normalized)) return normalized as ShikiLang;
  return ALIASES[normalized];
}
