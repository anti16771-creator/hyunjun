"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import {
  createPlannerItem,
  deletePlannerItem,
  getPlannerItems,
  getUserTimetableSubjects,
  togglePlannerCompleted,
} from "@/src/lib/supabase";
import { dayDiff, deadlineBadge } from "@/src/lib/dateUtils";

// ─── Types ────────────────────────────────────────────────────────────────────
type Priority = "high" | "normal" | "low";
type SortOrder = "due" | "created" | "priority";
type FilterTab = "all" | "incomplete" | "complete";

type PlannerItem = {
  id: string;
  title: string;
  due_date: string;
  is_completed: boolean;
  created_at?: string;
};
type TaskMeta = {
  subject: string;
  priority: Priority;
  memo: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const PLANNER_META_KEY = "smartgrade_planner_meta";

const PRIORITY_CONFIG: Record<Priority, { label: string; activeBadge: string; dot: string }> = {
  high:   { label: "높음", activeBadge: "bg-rose-100 text-rose-700 border-rose-200",   dot: "bg-rose-500" },
  normal: { label: "보통", activeBadge: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  low:    { label: "낮음", activeBadge: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
};

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadMeta(): Record<string, TaskMeta> {
  try { return JSON.parse(localStorage.getItem(PLANNER_META_KEY) || "{}"); }
  catch { return {}; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex gap-4">
        <div className="h-14 w-14 flex-shrink-0 animate-pulse rounded-[1.25rem] bg-slate-200 dark:bg-slate-700" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-5 w-2/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-1/2 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="h-3 w-1/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PlannerPage() {
  const { user, loading: authLoading } = useAuth();

  // Data
  const [planner, setPlanner]     = useState<PlannerItem[]>([]);
  const [taskMeta, setTaskMeta]   = useState<Record<string, TaskMeta>>({});
  const [subjects, setSubjects]   = useState<string[]>([]);

  // Form
  const [title, setTitle]               = useState("");
  const [dueDate, setDueDate]           = useState("");
  const [subjectInput, setSubjectInput] = useState("");
  const [priority, setPriority]         = useState<Priority>("normal");
  const [dueDateError, setDueDateError] = useState(false);

  // UI
  const [filterTab, setFilterTab]           = useState<FilterTab>("all");
  const [sortOrder, setSortOrder]           = useState<SortOrder>("due");
  const [expandedId, setExpandedId]         = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Async
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType]       = useState<"success" | "error">("success");

  const titleRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const persistMeta = useCallback((meta: Record<string, TaskMeta>) => {
    localStorage.setItem(PLANNER_META_KEY, JSON.stringify(meta));
    setTaskMeta(meta);
  }, []);

  // ─── Fetch ──────────────────────────────────────────────────────────────────
  const fetchPlanner = async () => {
    if (!user) return;
    setLoading(true);
    const res = await getPlannerItems(user.id);
    setPlanner(res.error ? [] : (res.data ?? []));
    setLoading(false);
  };

  const fetchSubjects = async () => {
    if (!user) return;
    const res = await getUserTimetableSubjects(user.id);
    if (!res.error) {
      const list = Array.from(
        new Set((res.data ?? []).map((i: { subject: string }) => i.subject).filter(Boolean)),
      ) as string[];
      setSubjects(list);
    }
  };

  useEffect(() => {
    setTaskMeta(loadMeta());
    if (!user) { setLoading(false); return; }
    fetchPlanner();
    fetchSubjects();
  }, [user]);

  // ─── CRUD ───────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!user) { showToast("로그인이 필요합니다.", "error"); return; }
    if (!title.trim()) { showToast("과제명을 입력해주세요.", "error"); return; }
    if (!dueDate) { setDueDateError(true); return; }
    setDueDateError(false);

    setSaving(true);
    const res = await createPlannerItem({ user_id: user.id, title: title.trim(), due_date: dueDate });
    if (res.error) {
      showToast("과제 추가에 실패했습니다.", "error");
    } else {
      const newId = (res.data as any)?.[0]?.id as string | undefined;
      if (newId) {
        const newMeta = { ...taskMeta, [newId]: { subject: subjectInput, priority, memo: "" } };
        persistMeta(newMeta);
      }
      setTitle("");
      setDueDate("");
      setPriority("normal");
      await fetchPlanner();
      showToast("과제가 추가되었습니다.", "success");
      titleRef.current?.focus();
    }
    setSaving(false);
  };

  const handleToggle = async (id: string, isCompleted: boolean) => {
    if (!user) { showToast("로그인이 필요합니다.", "error"); return; }
    setSaving(true);
    const res = await togglePlannerCompleted(id, !isCompleted);
    if (res.error) showToast("상태 업데이트에 실패했습니다.", "error");
    else {
      await fetchPlanner();
      showToast(isCompleted ? "과제를 미완료로 변경했습니다." : "과제 완료! 🎉", "success");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!user) { showToast("로그인이 필요합니다.", "error"); return; }
    setSaving(true);
    const res = await deletePlannerItem(id);
    if (res.error) {
      showToast("삭제에 실패했습니다.", "error");
    } else {
      const newMeta = { ...taskMeta };
      delete newMeta[id];
      persistMeta(newMeta);
      setDeleteConfirmId(null);
      setExpandedId((prev) => (prev === id ? null : prev));
      await fetchPlanner();
      showToast("과제가 삭제되었습니다.", "success");
    }
    setSaving(false);
  };

  const handleMemoChange = (id: string, memo: string) => {
    const cur = taskMeta[id] || { subject: "", priority: "normal" as Priority, memo: "" };
    persistMeta({ ...taskMeta, [id]: { ...cur, memo } });
  };

  // ─── Derived values ──────────────────────────────────────────────────────────
  const totalCount     = planner.length;
  const completedCount = useMemo(() => planner.filter((i) => i.is_completed).length, [planner]);
  const incompleteCount = totalCount - completedCount;
  const completionPct  = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  const todayDeadlines = useMemo(
    () => planner.filter((i) => !i.is_completed && dayDiff(i.due_date) === 0),
    [planner],
  );

  const filteredAndSorted = useMemo(() => {
    let items = [...planner];
    if (filterTab === "complete") {
      items = items.filter((i) => i.is_completed);
    } else if (filterTab === "incomplete") {
      // 미완료 + 마감 안 지난 항목만 표시
      items = items.filter((i) => !i.is_completed && dayDiff(i.due_date) >= 0);
    } else {
      // 전체: 완료된 항목 + 마감 안 지난 미완료 항목
      items = items.filter((i) => i.is_completed || dayDiff(i.due_date) >= 0);
    }

    if (sortOrder === "due") {
      items.sort((a, b) => a.due_date.localeCompare(b.due_date));
    } else if (sortOrder === "created") {
      items.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    } else {
      items.sort((a, b) => {
        const pa = PRIORITY_ORDER[taskMeta[a.id]?.priority ?? "normal"];
        const pb = PRIORITY_ORDER[taskMeta[b.id]?.priority ?? "normal"];
        return pa - pb;
      });
    }
    return items;
  }, [planner, filterTab, sortOrder, taskMeta]);

  // ─── Guards ──────────────────────────────────────────────────────────────────
  if (authLoading) return <LoadingCard />;
  if (!user) {
    return (
      <div className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <p className="text-base text-slate-600 dark:text-slate-300">로그인 후 과제 마감일 관리를 시작하세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 요약 헤더 ────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">📋 플래너</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">과제 마감일 관리</h1>
        </div>

        {/* 3 stat 카드 */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {([
            { label: "전체",   value: totalCount,      color: "text-slate-900 dark:text-slate-100" },
            { label: "미완료", value: incompleteCount,  color: "text-rose-600 dark:text-rose-400" },
            { label: "완료",   value: completedCount,   color: "text-emerald-600 dark:text-emerald-400" },
          ] as const).map((s) => (
            <div key={s.label} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 py-4 text-center dark:border-slate-700 dark:bg-slate-950">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* 완료율 프로그레스 바 */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">전체 완료율</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">{completionPct}%</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>

        {/* 오늘 마감 알림 배너 */}
        {todayDeadlines.length > 0 && (
          <div className="mt-4 flex items-start gap-3 rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/40 dark:bg-rose-950/30">
            <span className="mt-0.5 flex-shrink-0 text-base">🔴</span>
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
              오늘 마감 {todayDeadlines.length}개&nbsp;—&nbsp;
              {todayDeadlines.map((i) => i.title || "제목 없음").join(", ")}
            </p>
          </div>
        )}
      </section>

      {/* ── 과제 입력 폼 ────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">새 과제 추가</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {/* 과제명 — Enter로 추가 */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="과제명을 입력하고 Enter"
            className="col-span-full rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />

          {/* 과목 선택 드롭다운 */}
          <div className="relative">
            <select
              value={subjectInput}
              onChange={(e) => setSubjectInput(e.target.value)}
              className="w-full appearance-none rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 pr-10 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="">과목 선택 (선택)</option>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {/* 마감일 + 인라인 에러 */}
          <div>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => { setDueDate(e.target.value); setDueDateError(false); }}
              className={`w-full rounded-3xl border px-5 py-4 text-slate-900 outline-none transition dark:text-slate-100 dark:bg-slate-950 ${
                dueDateError
                  ? "border-rose-400 bg-rose-50 focus:border-rose-500 dark:border-rose-600 dark:bg-rose-950/20"
                  : "border-slate-200 bg-slate-50 focus:border-sky-500 dark:border-slate-700"
              }`}
            />
            {dueDateError && (
              <p className="ml-3 mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                마감일을 입력해주세요
              </p>
            )}
          </div>
        </div>

        {/* 우선순위 버튼 그룹 + 추가 버튼 */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">우선순위</span>
          {(["high", "normal", "low"] as Priority[]).map((p) => {
            const cfg = PRIORITY_CONFIG[p];
            const active = priority === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                  active
                    ? cfg.activeBadge
                    : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${active ? cfg.dot : "bg-slate-300 dark:bg-slate-600"}`} />
                {cfg.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !title.trim()}
            className="ml-auto rounded-3xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            과제 추가하기
          </button>
        </div>
      </section>

      {/* ── 과제 목록 ────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
        {/* 필터 탭 + 정렬 드롭다운 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex overflow-hidden rounded-full border border-slate-200 p-1 dark:border-slate-700">
            {([
              { key: "all",        label: "전체" },
              { key: "incomplete", label: "미완료" },
              { key: "complete",   label: "완료" },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterTab(tab.key)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  filterTab === tab.key
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="appearance-none rounded-3xl border border-slate-200 bg-slate-50 px-5 py-2.5 pr-10 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
            >
              <option value="due">마감일순</option>
              <option value="created">등록순</option>
              <option value="priority">우선순위순</option>
            </select>
            <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {/* 리스트 본문 */}
        <div className="mt-6">
          {loading ? (
            <div className="space-y-4">
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </div>
          ) : filteredAndSorted.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-[1.75rem] border border-slate-200 bg-slate-50 py-12 text-center dark:border-slate-800 dark:bg-slate-950">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-300">등록된 과제가 없어요</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">위 폼에서 새 과제를 추가해보세요!</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAndSorted.map((item) => {
                const meta       = taskMeta[item.id] ?? { subject: "", priority: "normal" as Priority, memo: "" };
                const dueDays    = dayDiff(item.due_date);
                const badge      = deadlineBadge(dueDays);
                const pCfg       = PRIORITY_CONFIG[meta.priority ?? "normal"];
                const isExpanded = expandedId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`overflow-hidden rounded-[1.75rem] border transition ${
                      item.is_completed
                        ? "border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-950"
                        : "border-slate-200 bg-white shadow-sm hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                    }`}
                  >
                    {/* 카드 헤더 (클릭 → 메모 토글) */}
                    <div
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer p-5"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedId(isExpanded ? null : item.id); }}
                    >
                      <div className="flex items-start gap-4">
                        {/* D-day 뱃지 */}
                        <div className={`flex-shrink-0 rounded-[1rem] px-3 py-2 text-center ${
                          item.is_completed
                            ? "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                            : dueDays === 0
                            ? "bg-rose-600 text-white"
                            : dueDays < 0
                            ? "bg-slate-600 text-white dark:bg-slate-700"
                            : "bg-slate-900 text-white dark:bg-slate-700"
                        }`}>
                          <p className="text-base font-extrabold leading-none">
                            {item.is_completed
                              ? "✓"
                              : dueDays === 0 ? "D-0"
                              : dueDays < 0 ? `D+${Math.abs(dueDays)}`
                              : `D-${dueDays}`}
                          </p>
                          <p className="mt-0.5 text-[10px] opacity-75">마감</p>
                        </div>

                        {/* 본문 */}
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`text-base font-semibold ${
                              item.is_completed
                                ? "line-through text-slate-400 dark:text-slate-500"
                                : "text-slate-900 dark:text-slate-100"
                            }`}>
                              {item.title || "제목 없음"}
                            </p>
                            {/* 우선순위 태그 */}
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${pCfg.activeBadge}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${pCfg.dot}`} />
                              {pCfg.label}
                            </span>
                            {/* 마감 상태 태그 */}
                            {!item.is_completed && (
                              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
                                {badge.label}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                            {meta.subject && (
                              <span className="font-medium text-sky-600 dark:text-sky-400">{meta.subject}</span>
                            )}
                            <span>마감 {item.due_date}</span>
                          </div>
                        </div>

                        {/* 펼치기 아이콘 */}
                        <svg
                          className={`mt-1 flex-shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                          xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>

                    {/* 메모 + 액션 (펼쳐질 때) */}
                    {isExpanded && (
                      <div
                        className="border-t border-slate-200 px-5 pb-5 pt-4 dark:border-slate-800"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">메모</label>
                        <textarea
                          value={meta.memo ?? ""}
                          onChange={(e) => handleMemoChange(item.id, e.target.value)}
                          rows={3}
                          placeholder="과제 메모를 남겨보세요..."
                          className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {/* 완료 체크 */}
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                            <input
                              type="checkbox"
                              checked={item.is_completed}
                              onChange={() => handleToggle(item.id, item.is_completed)}
                              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span>{item.is_completed ? "완료됨" : "완료 표시"}</span>
                          </label>
                          {/* 삭제 (모달 트리거) */}
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(item.id)}
                            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── 삭제 확인 모달 ───────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/40">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600 dark:text-rose-400">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">삭제하시겠어요?</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">이 과제가 영구적으로 삭제됩니다.</p>
              </div>
              <div className="flex w-full gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteConfirmId)}
                  disabled={saving}
                  className="flex-1 rounded-3xl bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMessage ? <ToastMessage message={toastMessage} type={toastType} /> : null}
    </div>
  );
}
