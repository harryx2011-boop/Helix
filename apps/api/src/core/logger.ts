export interface Log {
  trace(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export function redactUrlToken(url: string): string {
  return url.replace(/([?&]token=)[^&#]*/gi, '$1[redacted]');
}

export function redactSecrets(text: string): string {
  return text
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_*-]*\*+[A-Za-z0-9_*-]*/g, '[redacted]')
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, '[redacted]')
    .replace(/\b(?:hf|gsk)_[A-Za-z0-9]{16,}/g, '[redacted]')
    .replace(/\bhelix-[A-Za-z0-9]{16,}\b/g, '[redacted]')
    .replace(/\b(api[_-]?key|token|bearer)\b(\s*[:=]\s*|\s+)[A-Za-z0-9._*-]{8,}/gi, '$1$2[redacted]')
    .replace(/\b(key|token|secret|authorization|auth)\b(\s*[:=]\s*|\s+)[A-Fa-f0-9]{32}(?:[A-Fa-f0-9]{32})?\b/gi, '$1$2[redacted]');
}
