export default function LeaderboardPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">👥 친구 리더보드</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">소셜 랭킹</h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">친구들과 경쟁하며 학습 동기를 높일 수 있는 기본 틀입니다.</p>

        <div className="mt-8 grid gap-4">
          {[
            { rank: 1, name: "한별", points: 1280 },
            { rank: 2, name: "지우", points: 1160 },
            { rank: 3, name: "민재", points: 980 },
          ].map((user) => (
            <div key={user.rank} className="flex items-center justify-between rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
              <div>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{user.rank}위 {user.name}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">최근 공부 점수</p>
              </div>
              <span className="rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-200">{user.points}P</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
