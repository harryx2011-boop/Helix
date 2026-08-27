export function PlaceholderScreen({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      {/* Solid backing: the shell paints a grid with drifting markers behind every screen. */}
      <div className="relative flex flex-col items-center gap-2 bg-background px-8 py-6">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">{note}</p>
      </div>
    </div>
  );
}
