export default function RolesLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <div className="mb-8">
        <div className="shimmer h-7 w-64 rounded-md" />
        <div className="shimmer mt-2 h-4 w-96 rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex h-[172px] flex-col gap-3 rounded-card border border-p-line bg-p-surface p-5">
            <div className="shimmer h-10 w-10 rounded-card" />
            <div className="shimmer h-4 w-2/3 rounded-md" />
            <div className="shimmer h-3 w-full rounded-md" />
            <div className="shimmer h-3 w-4/5 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
