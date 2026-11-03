export const CHECK_TABS = ['robots', 'diff', 'pdf', 'selector'] as const;
export type CheckTab = (typeof CHECK_TABS)[number];

export function isCheckTab(value: string): value is CheckTab {
  return (CHECK_TABS as readonly string[]).includes(value);
}

export const TAB_LABELS: Record<CheckTab, string> = {
  robots: 'Robots',
  diff: 'Diff',
  pdf: 'PDF',
  selector: 'Selector',
};
