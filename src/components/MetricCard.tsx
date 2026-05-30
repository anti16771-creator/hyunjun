type MetricCardProps = {
  label: string;
  value: string;
  description?: string;
};

export default function MetricCard({ label, value, description }: MetricCardProps) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-4 text-4xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {description ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
    </div>
  );
}
