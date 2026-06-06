import { type ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  description?: string;
  icon?: ReactNode;
  /** 0~1 진행률 — 하단 프로그레스 바 표시 */
  progress?: number;
  /** 우상단 배지 텍스트 (예: "45%") */
  badge?: string;
  /** 빈 상태일 때 행동 유도 문구 */
  emptyHint?: string;
  isEmpty?: boolean;
};

export default function MetricCard({ label, value, description, icon, progress, badge, emptyHint, isEmpty }: MetricCardProps) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-500 dark:bg-sky-950/50 dark:text-sky-400">
              {icon}
            </span>
          ) : null}
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{label}</p>
        </div>
        {badge && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
            {badge}
          </span>
        )}
      </div>

      <p className={`mt-3 text-3xl font-semibold ${isEmpty ? "text-slate-400 dark:text-slate-500" : "text-sky-600 dark:text-sky-400"}`}>
        {value}
      </p>

      {description ? <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{description}</p> : null}

      {progress !== undefined && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progress >= 1 ? "bg-emerald-500" : progress >= 0.6 ? "bg-sky-500" : "bg-sky-400"
              }`}
              style={{ width: `${Math.min(progress * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {isEmpty && emptyHint && (
        <p className="mt-2 text-xs font-semibold text-sky-600 dark:text-sky-400">{emptyHint}</p>
      )}
    </div>
  );
}
