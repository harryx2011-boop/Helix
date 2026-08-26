import * as React from 'react';

/**
 * Minimal JSON pretty-printer with token coloring: keys stay foreground,
 * strings take the primary token, punctuation and literals go muted.
 */
export function SchemaJson({ value, className }: { value: unknown; className?: string }) {
  const text = React.useMemo(() => JSON.stringify(value, null, 2), [value]);
  const tokens = React.useMemo(() => tokenize(text), [text]);

  return (
    <pre className={className}>
      {tokens.map((token, i) => (
        <span key={i} className={tokenClass(token.type)}>
          {token.text}
        </span>
      ))}
    </pre>
  );
}

type TokenType = 'key' | 'string' | 'punctuation' | 'literal';

interface Token {
  type: TokenType;
  text: string;
}

function tokenClass(type: TokenType): string {
  switch (type) {
    case 'key':
      return 'text-foreground';
    case 'string':
      return 'text-primary';
    case 'literal':
      return 'text-muted-foreground';
    case 'punctuation':
    default:
      return 'text-muted-foreground';
  }
}

const TOKEN_PATTERN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null|-?\d+(?:\.\d+)?)\b|([{}[\],:])/g;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'punctuation', text: text.slice(lastIndex, match.index) });
    }
    const [, quoted, colon, literal, punct] = match;
    if (quoted !== undefined) {
      tokens.push({ type: colon ? 'key' : 'string', text: quoted });
      if (colon) tokens.push({ type: 'punctuation', text: colon });
    } else if (literal !== undefined) {
      tokens.push({ type: 'literal', text: literal });
    } else if (punct !== undefined) {
      tokens.push({ type: 'punctuation', text: punct });
    }
    lastIndex = TOKEN_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: 'punctuation', text: text.slice(lastIndex) });
  }
  return tokens;
}
