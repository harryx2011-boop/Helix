export default function RoleLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="shimmer h-11 w-11 rounded-card" />
          <div className="flex-1">
            <div className="shimmer h-6 w-56 rounded-md" />
            <div className="shimmer mt-2 h-4 w-80 rounded-md" />
          </div>
        </div>
        <div className="shimmer h-9 w-56 rounded-card" />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div className="shimmer h-[480px] rounded-panel" />
        <div className="flex flex-col gap-6">
          <div className="shimmer h-40 rounded-panel" />
          <div className="shimmer h-40 rounded-panel" />
        </div>
      </div>
    </div>
  );
}
