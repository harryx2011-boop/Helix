export type FieldTone = 'marketing' | 'app';

export const FIELD_TONE: Record<FieldTone, { body: string; accent: string }> = {
  marketing: { body: 'text-m-ink/24', accent: 'text-violet-48' },
  app: { body: 'text-foreground/20', accent: 'text-primary/60' },
};
