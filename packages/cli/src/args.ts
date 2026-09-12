/**
 * Minimal argv parser: `--flag`, `--flag value`, `--flag=value`, `-k value`,
 * repeated flags collect into arrays. Small enough that a dependency would cost
 * more than it saves.
 */

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string[] | boolean>;
}

const ALIASES: Record<string, string> = { k: 'key', h: 'help', v: 'version' };

function parseBoolean(name: string, inline: string): boolean {
  if (inline === 'true') return true;
  if (inline === 'false') return false;
  throw new Error(`--${name} takes no value`);
}

export function parseArgs(argv: readonly string[], valued: ReadonlySet<string>): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string[] | boolean> = {};

  const push = (name: string, value: string): void => {
    const existing = flags[name];
    if (Array.isArray(existing)) existing.push(value);
    else flags[name] = [value];
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('-') || arg === '-') {
      positional.push(arg);
      continue;
    }

    let name = arg.replace(/^--?/, '');
    let inline: string | undefined;
    const eq = name.indexOf('=');
    if (eq !== -1) {
      inline = name.slice(eq + 1);
      name = name.slice(0, eq);
    }
    name = ALIASES[name] ?? name;

    if (valued.has(name)) {
      let value = inline;
      if (value === undefined) {
        const next = argv[i + 1];
        if (next?.startsWith('--')) throw new Error(`--${name} requires a value`);
        if (next === undefined) throw new Error(`--${name} needs a value`);
        value = argv[++i];
      }
      push(name, value!);
    } else {
      flags[name] = inline === undefined ? true : parseBoolean(name, inline);
    }
  }

  return { positional, flags };
}

export function flagValue(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[name];
  return Array.isArray(value) ? value[value.length - 1] : undefined;
}

export function flagValues(parsed: ParsedArgs, name: string): string[] {
  const value = parsed.flags[name];
  return Array.isArray(value) ? value : [];
}

export function flagSet(parsed: ParsedArgs, name: string): boolean {
  const value = parsed.flags[name];
  return Array.isArray(value) ? value.length > 0 : value === true;
}
