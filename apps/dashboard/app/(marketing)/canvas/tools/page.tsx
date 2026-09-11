import type { Metadata } from 'next';
import { CanvasToolsLoader } from '@/components/marketing/canvas/tools-loader';
import { CANVAS_NAME, TOOL_CONFIRMED, TOOL_READONLY, TOOL_TOTAL } from '@/lib/canvas';

export const metadata: Metadata = {
  title: `Tools — ${CANVAS_NAME}`,
  description: `All ${TOOL_TOTAL} ${CANVAS_NAME} tools, with parameters, access and which of them ask before changing Canvas.`,
};

export default function CanvasToolsPage() {
  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <section className="animate-fade-up">
        <h1 className="text-[32px] font-normal leading-[1.08] tracking-tighter lg:text-[40px]">
          {TOOL_TOTAL} tools.
        </h1>
        <p className="mt-4 max-w-[640px] text-[16px] leading-relaxed text-m-ink/72">
          Every tool the server registers, with its parameters. {TOOL_READONLY} only read. The {TOOL_CONFIRMED} that
          change Canvas return a preview first and do nothing until called again with{' '}
          <code className="font-mono text-[14px] text-m-ink">confirm=true</code>.
        </p>
      </section>

      <div className="mt-10 animate-fade-up [animation-delay:60ms]">
        <CanvasToolsLoader />
      </div>
    </div>
  );
}
