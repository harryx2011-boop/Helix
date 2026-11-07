export const BRAND_MARKS = {
  windows: { src: '/marks/windows.svg' },
  macos: { src: '/marks/apple.svg', mono: true },
  linux: { src: '/marks/linux.svg' },
  'claude-code': { src: '/agents/claude-code.png' },
  'claude-desktop': { src: '/agents/claude-code.png' },
  codex: { src: '/agents/codex.png' },
  cursor: { src: '/agents/cursor.png' },
} as const;

export type BrandId = keyof typeof BRAND_MARKS;

export function isBrandId(id: string): id is BrandId {
  return id in BRAND_MARKS;
}
