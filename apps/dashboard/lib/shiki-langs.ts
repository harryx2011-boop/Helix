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

export function resolveShikiLang(lang: string | undefined): ShikiLang | undefined {
  if (!lang) return undefined;
  const normalized = lang.toLowerCase();
  if ((SHIKI_LANGS as readonly string[]).includes(normalized)) return normalized as ShikiLang;
  return ALIASES[normalized];
}
