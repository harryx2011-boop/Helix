import { AsciiNoise } from '@/components/shared/ascii-fields';

export function PlaceholderScreen({ title, note }: { title: string; note: string }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden text-center">
      <AsciiNoise
        cols={120}
        rows={16}
        seed={10}
        tone="app"
        className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 opacity-40 md:block [mask-image:radial-gradient(ellipse_at_center,transparent_26%,black_52%,transparent_78%)]"
      />
      {/* Solid backing: the shell paints a grid with drifting markers behind every screen. */}
      <div className="relative flex flex-col items-center gap-2 bg-background px-8 py-6">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">{note}</p>
      </div>
    </div>
  );
}
