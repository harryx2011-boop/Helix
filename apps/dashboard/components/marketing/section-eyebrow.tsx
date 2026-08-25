/** `[ 01 / 05 ] · LABEL // Sub //` mono eyebrow used at the top of every landing section (WEBSITE.md §4). */
export function SectionEyebrow({ step, label, sub }: { step: string; label: string; sub: string }) {
  return (
    <p className="font-mono text-[12px] uppercase tracking-wide text-m-ink/48">
      [ {step} ] · {label} <span className="text-m-ink/48">{'// '}{sub}{' //'}</span>
    </p>
  );
}
