export default function PlaceholderPage({
  title,
  phase,
}: {
  title: string;
  phase: string;
}) {
  return (
    <div className="p-8">
      <h1 className="font-display text-2xl font-semibold text-ink-100 mb-2">
        {title}
      </h1>
      <p className="text-ink-500 text-sm">
        This section is routed and access-controlled, but its full interface
        is built in {phase}.
      </p>
    </div>
  );
}
