"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import { getExamEvents, getExamStrategies, toggleExamStrategyCompleted } from "@/src/lib/supabase";
import { dayDiff } from "@/src/lib/dateUtils";

// ─── Types ────────────────────────────────────────────────────────────────────
type ExamType    = "midterm" | "final";
type FilterType  = "all" | "major" | "elective";
type SortType    = "score_desc" | "score_asc" | "range_narrow";
type ExamEventLite = { subject_name: string; exam_type: string; exam_date: string };

type ExamEntry = {
  id: string;
  subject_name: string;
  is_major: boolean;
  credits: number;
  study_range: string;
  my_score: number | null;
  average_score: number | null;
  is_completed: boolean;
};

// ─── Priority formula (shared with grades page) ───────────────────────────────
type RangeLevel  = "좁음" | "보통" | "넓음";
type ScoreStatus = "잘봄" | "평균대" | "망함" | "미입력";

function classifyStudyRange(range: string): { label: RangeLevel; score: number } {
  const lines = range.trim().split("\n").filter((l) => l.trim()).length;
  if (lines > 1) {
    if (lines <= 2) return { label: "좁음", score: 3 };
    if (lines <= 5) return { label: "보통", score: 2 };
    return { label: "넓음", score: 1 };
  }
  if (range.trim().length < 25) return { label: "좁음", score: 3 };
  if (range.trim().length <= 70) return { label: "보통", score: 2 };
  return { label: "넓음", score: 1 };
}

function classifyScoreStatus(my: number | null, avg: number | null): { label: ScoreStatus; score: number } {
  if (my == null || avg == null) return { label: "미입력", score: 2 };
  if (my >= avg + 10) return { label: "잘봄",  score: 2 };
  if (my <  avg - 10) return { label: "망함",  score: 1 };
  return { label: "평균대", score: 3 };
}

function calcPriorityScore(item: ExamEntry, finalWeightPct: number): number {
  const majorW  = item.is_major ? 1.5 : 1.0;
  const creditW = item.credits / 3;
  const range   = classifyStudyRange(item.study_range).score;
  const status  = classifyScoreStatus(item.my_score, item.average_score).score;
  const finalB  = finalWeightPct >= 60 ? 1 : finalWeightPct <= 40 ? -1 : 0;
  const gap     = item.my_score != null && item.average_score != null ? item.average_score - item.my_score : 0;
  const gapD    = gap <= 0 ? 0 : gap <= 15 ? -1 : 4;
  return Math.round((majorW * creditW * (range + status + finalB) - gapD) * 100) / 100;
}

function scoreToGradeLetter(score?: number | null): string {
  if (score == null) return "—";
  if (score >= 90) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "C+";
  if (score >= 65) return "C";
  if (score >= 60) return "D+";
  return "F";
}

const STATUS_STYLE: Record<ScoreStatus, string> = {
  잘봄:   "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  평균대: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800",
  망함:   "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
  미입력: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

const GRADES_META_KEY = "smartgrade_grades_meta";
type EntryMeta = { finalWeightPct: number };

function loadGradesMeta(): Record<string, EntryMeta> {
  try { return JSON.parse(localStorage.getItem(GRADES_META_KEY) || "{}"); }
  catch { return {}; }
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ["#0ea5e9","#8b5cf6","#10b981","#f59e0b","#f43f5e"];

function Confetti() {
  const pieces = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      left: `${(i * 1.67) % 100}%`,
      delay: `${(i * 50) % 2000}ms`,
      dur: `${1500 + (i * 37) % 1000}ms`,
    })), []);

  return (
    <>
      <style>{`@keyframes cf{0%{transform:translateY(-20px) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(540deg);opacity:0}}`}</style>
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {pieces.map((p) => (
          <div key={p.id} style={{
            position: "absolute", left: p.left, top: 0, width: 10, height: 10,
            backgroundColor: p.color, borderRadius: 2,
            animation: `cf ${p.dur} ease-in forwards`,
            animationDelay: p.delay,
          }} />
        ))}
      </div>
    </>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="flex gap-4 rounded-[1.75rem] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="h-12 w-12 flex-shrink-0 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-700" />
      <div className="flex-1 space-y-2">
        <div className="h-5 w-1/2 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-3/4 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="h-2 w-full animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PriorityPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ExamType>("midterm");
  const [filter, setFilter]       = useState<FilterType>("all");
  const [sort, setSort]           = useState<SortType>("score_desc");
  const [entries, setEntries]     = useState<ExamEntry[]>([]);
  const [entryMeta, setEntryMeta] = useState<Record<string, EntryMeta>>({});
  const [examEvents, setExamEvents] = useState<ExamEventLite[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [expiredOpen, setExpiredOpen]   = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType]       = useState<"success" | "error">("success");

  const todayLabel = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${["일","월","화","수","목","금","토"][d.getDay()]}요일)`;
  }, []);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg); setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [strategiesRes, eventsRes] = await Promise.all([
      getExamStrategies(user.id, activeTab),
      getExamEvents(user.id),
    ]);
    setEntries(strategiesRes.error ? [] : ((strategiesRes.data ?? []) as ExamEntry[]));
    setExamEvents(eventsRes.error ? [] : (eventsRes.data ?? []) as ExamEventLite[]);
    setLoading(false);
  }, [user, activeTab]);

  useEffect(() => { setEntryMeta(loadGradesMeta()); }, []);
  useEffect(() => { if (user) fetchEntries(); }, [user, activeTab]);

  // ─── Derived data ────────────────────────────────────────────────────────────

  // subject_name + exam_type → 가장 최근 exam_date 맵
  const examDateMap = useMemo(() => {
    const map: Record<string, string> = {};
    examEvents.forEach((e) => {
      const key = `${e.subject_name}|${e.exam_type}`;
      if (!map[key] || e.exam_date > map[key]) map[key] = e.exam_date.slice(0, 10);
    });
    return map;
  }, [examEvents]);

  const scored = useMemo(() =>
    entries.map((item) => {
      const fwp      = entryMeta[item.id]?.finalWeightPct ?? 50;
      const pScore   = calcPriorityScore(item, fwp);
      const range    = classifyStudyRange(item.study_range);
      const status   = classifyScoreStatus(item.my_score, item.average_score);
      const examDate = examDateMap[`${item.subject_name}|${activeTab}`] ?? null;
      const isExpired = examDate !== null && dayDiff(examDate) < 0;
      return { ...item, _score: pScore, _range: range, _status: status, _examDate: examDate, _isExpired: isExpired };
    }),
  [entries, entryMeta, examDateMap, activeTab]);

  const filterFn = (e: typeof scored[0]) =>
    filter === "all" ? true : filter === "major" ? e.is_major : !e.is_major;

  // 진행 중 목록 — 만료 항목 제외
  const sorted = useMemo(() => {
    const base = scored.filter((e) => !e._isExpired && filterFn(e));
    if (sort === "score_desc") return [...base].sort((a, b) => b._score - a._score);
    if (sort === "score_asc")  return [...base].sort((a, b) => a._score - b._score);
    return [...base].sort((a, b) => b._range.score - a._range.score);
  }, [scored, filter, sort]);

  // 만료 항목 — 만료일 오름차순
  const expiredSorted = useMemo(() =>
    scored
      .filter((e) => e._isExpired && filterFn(e))
      .sort((a, b) => (a._examDate ?? "").localeCompare(b._examDate ?? "")),
  [scored, filter]);

  const totalCount     = entries.length;
  const completedCount = useMemo(() => entries.filter((e) => e.is_completed).length, [entries]);
  const topSubject     = useMemo(() => sorted.find((e) => !e.is_completed)?.subject_name ?? "—", [sorted]);

  // Confetti: 만료 제외 항목 전체 완료 시
  useEffect(() => {
    if (sorted.length > 0 && sorted.every((e) => e.is_completed)) {
      setShowConfetti(true);
      window.setTimeout(() => setShowConfetti(false), 3500);
    }
  }, [sorted]);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleToggleCompleted = async (id: string, current: boolean) => {
    if (!user) return;
    setSaving(true);
    const res = await toggleExamStrategyCompleted(id, !current);
    if (res.error) showToast("상태 변경에 실패했습니다.", "error");
    else { await fetchEntries(); if (!current) showToast("학습 완료! 🎉", "success"); }
    setSaving(false);
  };

  const handleFocusStart = (subjectName: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("priority_timer_subject", subjectName);
    }
    router.push("/timer");
  };

  // ─── Guard ───────────────────────────────────────────────────────────────────
  if (authLoading) return <LoadingCard />;
  if (!user) {
    return (
      <div className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <p className="text-slate-600 dark:text-slate-300">로그인 후 공부 우선순위를 확인하세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showConfetti && <Confetti />}

      {/* ── 헤더 ────────────────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">🔥 공부 우선순위</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">오늘의 공부 우선순위</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{todayLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={fetchEntries} disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? "animate-spin" : ""}>
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              우선순위 새로고침
            </button>
            <Link href="/grades"
              className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
              성적 관리로 이동
            </Link>
          </div>
        </div>

        {/* 3 stat 카드 */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {([
            { label: "전체 과목",    value: String(totalCount),     color: "text-slate-900 dark:text-slate-100" },
            { label: "학습 완료",    value: String(completedCount), color: "text-emerald-600 dark:text-emerald-400" },
            { label: "오늘 집중 추천", value: topSubject,             color: "text-sky-600 dark:text-sky-400" },
          ] as const).map((s) => (
            <div key={s.label} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-950">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
              <p className={`mt-1 truncate text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* 중간/기말 탭 */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-full border border-slate-200 p-1 dark:border-slate-700">
            {(["midterm", "final"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setActiveTab(t)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${activeTab === t ? "bg-sky-600 text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}>
                {t === "midterm" ? "중간고사" : "기말고사"}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── 필터 + 정렬 ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 필터 탭 */}
        <div className="flex overflow-hidden rounded-full border border-slate-200 p-1 dark:border-slate-700">
          {([
            { key: "all",      label: "전체" },
            { key: "major",    label: "전공만" },
            { key: "elective", label: "교양만" },
          ] as const).map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === f.key ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* 정렬 드롭다운 */}
        <div className="relative ml-auto">
          <select value={sort} onChange={(e) => setSort(e.target.value as SortType)}
            className="appearance-none rounded-3xl border border-slate-200 bg-white px-5 py-2.5 pr-10 text-sm font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <option value="score_desc">우선순위 높은 순</option>
            <option value="score_asc">우선순위 낮은 순</option>
            <option value="range_narrow">시험 범위 좁은 순</option>
          </select>
          <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {/* ── 우선순위 카드 리스트 ──────────────────────────────── */}
      <div className="space-y-4">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-[1.75rem] border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
            <span className="text-4xl">📚</span>
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300">등록된 과목이 없어요</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">성적 관리 페이지에서 과목을 추가해보세요!</p>
            </div>
            <Link href="/grades" className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">
              성적 관리로 이동
            </Link>
          </div>
        ) : (
          sorted.map((item, index) => {
            const rank       = index + 1;
            const isTop      = rank === 1 && !item.is_completed;
            const myPct      = Math.min((item.my_score ?? 0), 100);
            const avgPct     = Math.min((item.average_score ?? 0), 100);
            const diff       = item.my_score != null && item.average_score != null ? item.my_score - item.average_score : null;
            const grade      = scoreToGradeLetter(item.my_score);
            const fwp        = entryMeta[item.id]?.finalWeightPct ?? 50;
            const finalBonus = fwp >= 60 ? "+1" : fwp <= 40 ? "-1" : "±0";

            return (
              <div key={item.id}
                className={`overflow-hidden rounded-[1.75rem] border transition ${
                  item.is_completed
                    ? "border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-950"
                    : isTop
                    ? "border-amber-400 bg-white shadow-md dark:border-amber-600 dark:bg-slate-900"
                    : "border-slate-200 bg-white shadow-sm hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                }`}>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* 순위 번호 */}
                    <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold ${
                      item.is_completed ? "bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
                      : rank === 1 ? "bg-amber-400 text-white"
                      : rank === 2 ? "bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-200"
                      : rank === 3 ? "bg-amber-700 text-white"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}>
                      {rank}
                    </div>

                    {/* 본문 */}
                    <div className="min-w-0 flex-1 space-y-3">
                      {/* 제목 행 */}
                      <div className="flex flex-wrap items-center gap-2">
                        {isTop && (
                          <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                            🔥 지금 당장 공부하세요!
                          </span>
                        )}
                        <p className={`text-lg font-semibold ${item.is_completed ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
                          {item.subject_name}
                        </p>
                        {/* 전공/교양 */}
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${item.is_major ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                          {item.is_major ? "전공" : "교양"}
                        </span>
                        {/* 성적 상태 */}
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[item._status.label]}`}>
                          {item._status.label}
                        </span>
                        {/* 예상 등급 */}
                        {grade !== "—" && (
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                            예상 {grade}
                          </span>
                        )}
                        {/* Priority Score */}
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                          P {item._score.toFixed(1)}
                        </span>
                      </div>

                      {/* 점수 바 */}
                      {(item.my_score != null || item.average_score != null) && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>
                              내 점수 <strong className="text-sky-600 dark:text-sky-400">{item.my_score ?? "—"}</strong>
                              {diff != null && (
                                <span className={`ml-1 font-semibold ${diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                  ({diff >= 0 ? `+${diff}` : diff})
                                </span>
                              )}
                            </span>
                            <span>평균 {item.average_score ?? "—"}</span>
                          </div>
                          <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            {/* 평균 바 (회색) */}
                            <div className="absolute inset-y-0 left-0 rounded-full bg-slate-400 dark:bg-slate-500"
                              style={{ width: `${avgPct}%` }} />
                            {/* 내 점수 바 (파란색) */}
                            <div className="absolute inset-y-0 left-0 rounded-full bg-sky-500 transition-all"
                              style={{ width: `${myPct}%` }} />
                          </div>
                        </div>
                      )}

                      {/* 시험 범위 + 기말 비중 */}
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">범위</span>
                          {item._range.label}
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {item.study_range ? item.study_range.slice(0, 30) + (item.study_range.length > 30 ? "…" : "") : "미입력"}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">기말 비중</span>
                          {fwp}%
                          <span className={`font-semibold ${fwp >= 60 ? "text-emerald-600" : fwp <= 40 ? "text-rose-600" : "text-slate-400"}`}>
                            ({finalBonus})
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">학점</span>
                          {item.credits}학점
                        </span>
                      </div>
                    </div>

                    {/* 버튼 영역 */}
                    <div className="flex flex-col items-end gap-2">
                      {/* 집중 시작 */}
                      {!item.is_completed && (
                        <button type="button" onClick={() => handleFocusStart(item.subject_name)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                          </svg>
                          집중 시작
                        </button>
                      )}
                      {/* 학습 완료 체크 */}
                      <button type="button"
                        onClick={() => handleToggleCompleted(item.id, item.is_completed)}
                        disabled={saving}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          item.is_completed
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        }`}>
                        {item.is_completed ? (
                          <><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>완료됨</>
                        ) : (
                          <><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>학습 완료</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── 기간 만료 섹션 ──────────────────────────────────── */}
      {expiredSorted.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpiredOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">⏰</span>
              <span>기간 만료</span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {expiredSorted.length}
              </span>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`shrink-0 transition-transform duration-300 ${expiredOpen ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          <div className={`grid transition-all duration-300 ease-in-out ${expiredOpen ? "grid-rows-[1fr] pt-3" : "grid-rows-[0fr]"}`}>
            <div className="min-h-0 overflow-hidden">
              <div className="space-y-3">
                {expiredSorted.map((item) => {
                  const diff      = item.my_score != null && item.average_score != null ? item.my_score - item.average_score : null;
                  const myPct     = Math.min((item.my_score ?? 0), 100);
                  const avgPct    = Math.min((item.average_score ?? 0), 100);
                  return (
                    <div key={item.id}
                      className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white opacity-60 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="p-5">
                        <div className="flex items-start gap-4">
                          {/* 만료 아이콘 */}
                          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                          </div>

                          {/* 본문 */}
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                만료
                              </span>
                              <p className="text-base font-semibold text-slate-400 line-through dark:text-slate-500">
                                {item.subject_name}
                              </p>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                                {item.is_major ? "전공" : "교양"}
                              </span>
                              {item._examDate && (
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                  {item._examDate} 시험 완료
                                </span>
                              )}
                            </div>

                            {/* 점수 바 (흐리게) */}
                            {(item.my_score != null || item.average_score != null) && (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                                  <span>
                                    내 점수 <strong>{item.my_score ?? "—"}</strong>
                                    {diff != null && (
                                      <span className="ml-1">({diff >= 0 ? `+${diff}` : diff})</span>
                                    )}
                                  </span>
                                  <span>평균 {item.average_score ?? "—"}</span>
                                </div>
                                <div className="relative h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                  <div className="absolute inset-y-0 left-0 rounded-full bg-slate-300 dark:bg-slate-600" style={{ width: `${avgPct}%` }} />
                                  <div className="absolute inset-y-0 left-0 rounded-full bg-slate-400 dark:bg-slate-500" style={{ width: `${myPct}%` }} />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 학습 완료 토글 */}
                          <button type="button"
                            onClick={() => handleToggleCompleted(item.id, item.is_completed)}
                            disabled={saving}
                            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                              item.is_completed
                                ? "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            {item.is_completed ? (
                              <><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>완료됨</>
                            ) : (
                              <><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>완료 처리</>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMessage ? <ToastMessage message={toastMessage} type={toastType} /> : null}
    </div>
  );
}
