export default function AchievementsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">🏆 뱃지 & 레벨</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">학습 성과</h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">달성한 업적과 다음 레벨 목표를 확인할 수 있는 화면입니다.</p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { title: "첫 집중 세션", description: "첫 뽀모도로를 완수하세요.", status: "완료" },
            { title: "주간 출석", description: "일주일 연속 학습 달성", status: "진행중" },
            { title: "A+ 챌린지", description: "GPA 4.3 이상 유지", status: "목표" },
          ].map((item) => (
            <div key={item.title} className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
              <span className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
