const COMMAND = /^\/([^\s/]*)$/;

export function slashQuery(text: string): string | undefined {
  const match = text.match(COMMAND);
  return match ? match[1]! : undefined;
}

export function matchCommands<T extends { id: string; label: string }>(items: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...items];
  const starts = items.filter((item) => item.id.startsWith(q) || item.label.toLowerCase().startsWith(q));
  const contains = items.filter(
    (item) => !starts.includes(item) && (item.id.includes(q) || item.label.toLowerCase().includes(q)),
  );
  return [...starts, ...contains];
}
