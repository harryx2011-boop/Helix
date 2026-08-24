export function JsonView({ data }: { data: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-secondary p-3 font-mono text-xs leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
