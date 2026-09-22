/**
 * The prompt box's slash palette, as two pure functions so the matching can be
 * tested without a DOM. A lone leading slash plus one word is a command;
 * `/docs/api` or `/scrape this` is a path or a phrase and stays text.
 */
const COMMAND = /^\/([^\s/]*)$/;

export function slashQuery(text: string): string | undefined {
  const match = text.match(COMMAND);
  return match ? match[1]! : undefined;
}

/** Prefix matches first, then substring matches, each in the order given. */
export function matchCommands<T extends { id: string; label: string }>(items: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...items];
  const starts = items.filter((item) => item.id.startsWith(q) || item.label.toLowerCase().startsWith(q));
  const contains = items.filter(
    (item) => !starts.includes(item) && (item.id.includes(q) || item.label.toLowerCase().includes(q)),
  );
  return [...starts, ...contains];
}
