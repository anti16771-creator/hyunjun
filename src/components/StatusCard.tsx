type StatusCardProps = {
  title: string;
  subtitle: string;
  accent?: string;
};

export default function StatusCard({ title, subtitle, accent = "from-sky-500 to-cyan-500" }: StatusCardProps) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{title}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{subtitle}</p>
        <span className={`inline-flex rounded-full bg-gradient-to-r ${accent} px-3 py-1 text-sm font-semibold text-white`}>실시간</span>
      </div>
    </div>
  );
}
