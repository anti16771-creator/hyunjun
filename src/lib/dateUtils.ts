/**
 * 오늘 기준 일수 차이를 반환합니다.
 * 양수 = 미래 (D-N), 0 = 오늘 (D-0), 음수 = 과거 (D+N)
 * YYYY-MM-DD 또는 ISO 8601 datetime 문자열 모두 허용합니다.
 */
export function dayDiff(dateStr: string): number {
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const b = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * 마감이 아직 지나지 않은 날짜인지 확인합니다.
 * D-0 (오늘 마감) 포함, D+1 이상은 false.
 */
export function isUpcoming(dateStr: string): boolean {
  return dayDiff(dateStr) >= 0;
}

/** D-DAY 레이블 문자열을 반환합니다. */
export function ddayLabel(days: number): string {
  if (days === 0) return "D-0 오늘 마감!";
  if (days < 0)  return `D+${Math.abs(days)}`;
  return `D-${days}`;
}

/** D-DAY에 따른 Tailwind 색상 클래스를 반환합니다. */
export function ddayColor(days: number): string {
  if (days < 0)  return "text-slate-400 dark:text-slate-500";
  if (days === 0) return "text-rose-600 font-bold dark:text-rose-400";
  if (days <= 3) return "text-rose-600 dark:text-rose-400";
  if (days <= 7) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-500";
}

/** D-DAY 배지 레이블과 클래스 쌍을 반환합니다. */
export function deadlineBadge(days: number): { label: string; cls: string } {
  if (days < 0)   return { label: "기간 만료",      cls: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700" };
  if (days === 0) return { label: "오늘 마감!",     cls: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800" };
  if (days <= 3)  return { label: `D-${days} 긴급`, cls: "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800" };
  if (days <= 7)  return { label: `D-${days} 주의`, cls: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800" };
  return              { label: `D-${days}`,        cls: "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-500 dark:border-emerald-800" };
}
