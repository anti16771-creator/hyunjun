"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoadingCard from "@/src/components/LoadingCard";
import MetricCard from "@/src/components/MetricCard";
import ToastMessage from "@/src/components/ToastMessage";
import { AuthGuard } from "@/src/components/AuthGuard";
import { useAuth } from "@/src/context/AuthContext";
import { createTimetableEntry, deleteTimetableEntry, getExamEvents, getPlannerItems, getStudyLogs, getUserTimetable } from "@/src/lib/supabase";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

// ─── 과목별 색상 팔레트 (전체 문자열로 선언 — Tailwind purge 방지) ──────────
const COLOR_PALETTE = [
  {
    cellBg: "bg-sky-100 dark:bg-sky-950/40",
    cellText: "text-sky-900 dark:text-sky-100",
    subText: "text-sky-600 dark:text-sky-400",
    borderLeft: "border-l-[4px] border-l-sky-400 dark:border-l-sky-500",
    dotBg: "bg-sky-500",
    logBar: "bg-sky-500",
    tag: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  },
  {
    cellBg: "bg-violet-100 dark:bg-violet-950/40",
    cellText: "text-violet-900 dark:text-violet-100",
    subText: "text-violet-600 dark:text-violet-400",
    borderLeft: "border-l-[4px] border-l-violet-400 dark:border-l-violet-500",
    dotBg: "bg-violet-500",
    logBar: "bg-violet-500",
    tag: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  },
  {
    cellBg: "bg-emerald-100 dark:bg-emerald-950/40",
    cellText: "text-emerald-900 dark:text-emerald-100",
    subText: "text-emerald-600 dark:text-emerald-400",
    borderLeft: "border-l-[4px] border-l-emerald-400 dark:border-l-emerald-500",
    dotBg: "bg-emerald-500",
    logBar: "bg-emerald-500",
    tag: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  {
    cellBg: "bg-amber-100 dark:bg-amber-950/40",
    cellText: "text-amber-900 dark:text-amber-100",
    subText: "text-amber-600 dark:text-amber-400",
    borderLeft: "border-l-[4px] border-l-amber-400 dark:border-l-amber-500",
    dotBg: "bg-amber-500",
    logBar: "bg-amber-500",
    tag: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  },
  {
    cellBg: "bg-rose-100 dark:bg-rose-950/40",
    cellText: "text-rose-900 dark:text-rose-100",
    subText: "text-rose-600 dark:text-rose-400",
    borderLeft: "border-l-[4px] border-l-rose-400 dark:border-l-rose-500",
    dotBg: "bg-rose-500",
    logBar: "bg-rose-500",
    tag: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  },
  {
    cellBg: "bg-orange-100 dark:bg-orange-950/40",
    cellText: "text-orange-900 dark:text-orange-100",
    subText: "text-orange-600 dark:text-orange-400",
    borderLeft: "border-l-[4px] border-l-orange-400 dark:border-l-orange-500",
    dotBg: "bg-orange-500",
    logBar: "bg-orange-500",
    tag: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  },
  {
    cellBg: "bg-teal-100 dark:bg-teal-950/40",
    cellText: "text-teal-900 dark:text-teal-100",
    subText: "text-teal-600 dark:text-teal-400",
    borderLeft: "border-l-[4px] border-l-teal-400 dark:border-l-teal-500",
    dotBg: "bg-teal-500",
    logBar: "bg-teal-500",
    tag: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
  },
  {
    cellBg: "bg-pink-100 dark:bg-pink-950/40",
    cellText: "text-pink-900 dark:text-pink-100",
    subText: "text-pink-600 dark:text-pink-400",
    borderLeft: "border-l-[4px] border-l-pink-400 dark:border-l-pink-500",
    dotBg: "bg-pink-500",
    logBar: "bg-pink-500",
    tag: "bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300",
  },
] as const;

// djb2 해시 — 과목명을 동일 색상으로 결정론적 매핑
function getSubjectColor(subject: string) {
  let h = 5381;
  for (let i = 0; i < subject.length; i++) {
    h = ((h << 5) + h + subject.charCodeAt(i)) | 0;
  }
  return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
}

function formatDateKey(date: Date) { return date.toISOString().slice(0, 10); }

function parseWeekday(value: string | number): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const normalized = String(value).trim();
  const numeric = Number(normalized.replace(/[^0-9]/g, ""));
  if (!Number.isNaN(numeric)) return numeric;
  const mapping: Record<string, number> = {
    일: 0, 일요일: 0, 월: 1, 월요일: 1, 화: 2, 화요일: 2,
    수: 3, 수요일: 3, 목: 4, 목요일: 4, 금: 5, 금요일: 5, 토: 6, 토요일: 6,
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
  };
  return mapping[normalized] ?? 0;
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "";
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 5) return "방금 전";
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  return `${Math.floor(diff / 3600)}시간 전`;
}

// ─── 잔디 그래프 helpers ─────────────────────────────────────────────────────
function grassColor(minutes: number): string {
  if (minutes === 0)   return "bg-slate-100 dark:bg-slate-800";
  if (minutes < 30)    return "bg-sky-100 dark:bg-sky-900/50";
  if (minutes < 60)    return "bg-sky-300 dark:bg-sky-700";
  return "bg-sky-500";
}

const DOW_KO = ["일","월","화","수","목","금","토"] as const;
const MONTH_KO = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"] as const;

export default function Home() {
  const { user, localProfile, loading: authLoading } = useAuth();

  const [schedule, setSchedule]               = useState<{ id: string; subject: string; weekday: number; period: string }[]>([]);
  const [studyLogs, setStudyLogs]             = useState<{ id: string; date: string; minutes: number; subject: string }[]>([]);
  const [todayAgendaCount, setTodayAgendaCount] = useState(0);

  // 폼 상태
  const [subject, setSubject]   = useState("");
  const [weekday, setWeekday]   = useState(1);
  const [period, setPeriod]     = useState("1교시");

  // 인라인 셀 편집
  const [inlineCell, setInlineCell]       = useState<{ weekday: number; period: number } | null>(null);
  const [inlineSubject, setInlineSubject] = useState("");
  const inlineRef = useRef<HTMLInputElement>(null);

  // 삭제 확인
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 동기화
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncing, setSyncing]       = useState(false);

  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType]       = useState<"success" | "error">("success");

  const todayKey     = useMemo(() => formatDateKey(new Date()), []);
  const todayWeekday = useMemo(() => new Date().getDay(), []);
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0] as const;

  // 요일별 날짜 계산 (이번 주)
  const weekDates = useMemo(() => {
    const today    = new Date();
    const todayDay = today.getDay();
    const result: Record<number, string> = {};
    ([1, 2, 3, 4, 5, 6, 0] as number[]).forEach((wd) => {
      const d = new Date(today);
      d.setDate(today.getDate() + (wd - todayDay));
      result[wd] = `${d.getMonth() + 1}/${d.getDate()}`;
    });
    return result;
  }, []);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg); setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // ─── 통계 ─────────────────────────────────────────────────────────────────
  const studyBreakdown = useMemo(() => {
    const todayLogs = studyLogs.filter((i) => i.date === todayKey);
    const grouped   = todayLogs.reduce<Record<string, number>>((acc, i) => {
      const s = String(i.subject || "미등록 과목");
      acc[s] = (acc[s] ?? 0) + Number(i.minutes || 0);
      return acc;
    }, {});
    return Object.entries(grouped).map(([subject, minutes]) => ({ subject, minutes })).sort((a, b) => b.minutes - a.minutes);
  }, [studyLogs, todayKey]);

  const focusTargetMinutes = 180;
  const todayFocusMinutes  = useMemo(
    () => studyLogs.filter((i) => i.date === todayKey).reduce((s, i) => s + (i.minutes || 0), 0),
    [studyLogs, todayKey],
  );
  const focusProgress = Math.min(todayFocusMinutes / focusTargetMinutes, 1);
  const focusHours    = Math.floor(todayFocusMinutes / 60);
  const focusMinutes  = todayFocusMinutes % 60;
  const donutR        = 40;
  const donutCirc     = 2 * Math.PI * donutR;
  const donutOffset   = donutCirc * (1 - focusProgress);
  const maxStudyMin   = useMemo(() => Math.max(...studyBreakdown.map((s) => s.minutes), 1), [studyBreakdown]);

  const todayClasses = useMemo(
    () => schedule.filter((i) => i.weekday === todayWeekday).length,
    [schedule, todayWeekday],
  );

  // ─── 잔디 그래프 ─────────────────────────────────────────────────────────
  const [grassTooltip, setGrassTooltip] = useState<{ date: string; minutes: number; x: number; y: number } | null>(null);

  // 날짜별 집중 분 합계 맵
  const dailyMinutes = useMemo(() => {
    const map: Record<string, number> = {};
    studyLogs.forEach((l) => { map[l.date] = (map[l.date] ?? 0) + (Number(l.minutes) || 0); });
    return map;
  }, [studyLogs]);

  // 12주 × 7일 격자 (일~토 행, 주 열 — 왼쪽이 과거)
  const grassWeeks = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayDow = today.getDay(); // 0=일, 6=토
    // 이번 주 일요일 기준으로 11주 전 일요일 = startSunday
    const startSunday = new Date(today);
    startSunday.setDate(today.getDate() - todayDow - 11 * 7);

    // startSunday ~ today + 토요일까지 padding → 12 × 7 = 84 cells
    type Cell = { date: string; minutes: number; placeholder: boolean };
    const cells: Cell[] = [];
    const d = new Date(startSunday);
    while (d <= today) {
      const key = d.toISOString().slice(0, 10);
      cells.push({ date: key, minutes: dailyMinutes[key] ?? 0, placeholder: false });
      d.setDate(d.getDate() + 1);
    }
    // 마지막 주 채우기
    const rem = cells.length % 7;
    if (rem > 0) {
      for (let i = 0; i < 7 - rem; i++) cells.push({ date: "", minutes: 0, placeholder: true });
    }

    // 7개씩 묶어 주(열) 배열로
    const weeks: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    // 각 주의 첫 날짜 (월 레이블용)
    return weeks;
  }, [dailyMinutes]);

  // 현재 연속 스트릭
  const currentStreak = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayKey = today.toISOString().slice(0, 10);
    let streak = 0;
    const d = new Date(today);
    // 오늘 공부 없으면 어제부터 체크
    if (!(dailyMinutes[todayKey] ?? 0)) d.setDate(d.getDate() - 1);
    for (let i = 0; i < 365; i++) {
      const key = d.toISOString().slice(0, 10);
      if ((dailyMinutes[key] ?? 0) > 0) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }, [dailyMinutes]);

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [ttRes, logRes, plannerRes, examRes] = await Promise.all([
        getUserTimetable(user.id),
        getStudyLogs(user.id),
        getPlannerItems(user.id),
        getExamEvents(user.id),
      ]);

      if (!ttRes.error) {
        setSchedule(
          (ttRes.data ?? []).map((item: any) => ({
            id: String(item.id),
            subject: String(item.subject ?? ""),
            weekday: parseWeekday(item.weekday),
            period: String(item.period ?? ""),
          })),
        );
      } else {
        console.error("시간표 에러:", ttRes.error);
        setSchedule([]);
      }

      if (!logRes.error) {
        setStudyLogs(
          (logRes.data ?? []).map((item: any) => ({
            id: String(item.id),
            date: String(item.date ?? ""),
            minutes: Number(item.minutes ?? 0),
            subject: String(item.subject ?? ""),
          })),
        );
      } else {
        console.error("로그 에러:", logRes.error);
        setStudyLogs([]);
      }

      const plannerDue = (plannerRes.data ?? []).filter((i: any) => String(i.due_date) === todayKey).length;
      const examDue    = (examRes.data ?? []).filter((i: any) => String(i.exam_date) === todayKey).length;
      setTodayAgendaCount(plannerDue + examDue);
      setError("");
      setLastSyncAt(new Date());
    } catch (err) {
      console.error("fetchData error", err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
      showToast("데이터를 불러오는 중 오류가 발생했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }, [user, todayKey, showToast]);

  useEffect(() => {
    if (!user) { setSchedule([]); setStudyLogs([]); setLoading(false); return; }
    fetchData();
  }, [user]);

  // ─── 폼 저장 ──────────────────────────────────────────────────────────────
  const handleAddSchedule = async () => {
    if (authLoading) return;
    if (!subject.trim() || !user) { setError("로그인 후에 시간표를 저장할 수 있습니다."); return; }
    setSaving(true);
    try {
      const result = await createTimetableEntry({ user_id: user.id, subject: subject.trim(), weekday: String(weekday), period });
      if (result.error) {
        showToast((result.error as any).message || "시간표 저장에 실패했습니다.", "error");
      } else {
        setSubject(""); await fetchData();
        showToast("시간표가 저장되었습니다.", "success");
      }
    } catch (err: any) {
      showToast(err?.message || "저장 중 오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  // ─── 인라인 저장 ──────────────────────────────────────────────────────────
  const handleInlineSave = useCallback(async (wd: number, pi: number, sub: string) => {
    if (!sub.trim() || !user) { setInlineCell(null); setInlineSubject(""); return; }
    setSaving(true);
    try {
      const result = await createTimetableEntry({ user_id: user.id, subject: sub.trim(), weekday: String(wd), period: `${pi}교시` });
      if (result.error) {
        showToast(result.error.message || "저장에 실패했습니다.", "error");
      } else {
        setInlineCell(null); setInlineSubject("");
        await fetchData();
        showToast("수업이 추가되었습니다.", "success");
      }
    } catch { showToast("저장 중 오류가 발생했습니다.", "error"); }
    finally { setSaving(false); }
  }, [user, fetchData, showToast]);

  // ─── 삭제 ─────────────────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    try {
      const result = await deleteTimetableEntry(id);
      if (result.error) showToast("삭제에 실패했습니다.", "error");
      else { await fetchData(); showToast("수업이 삭제되었습니다.", "success"); }
    } catch { showToast("삭제 중 오류가 발생했습니다.", "error"); }
  };

  useEffect(() => {
    if (inlineCell && inlineRef.current) inlineRef.current.focus();
  }, [inlineCell]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <AuthGuard>
      <div className="space-y-6">

        {/* ── 상단 요약 카드 ──────────────────────────────── */}
        <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">🏠 홈 대시보드</p>
              {localProfile.nickname && (
                <p className="mt-1 text-base font-semibold text-slate-700 dark:text-slate-300">
                  안녕하세요, {localProfile.nickname}님 👋
                </p>
              )}
              <h1 className="mt-0.5 text-2xl font-semibold text-slate-900 dark:text-slate-100">학습 일정과 집중 시간을 한눈에</h1>
            </div>
            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              오늘 {todayKey}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <MetricCard
              label="오늘 수업" value={`${todayClasses}개`}
              description={todayClasses > 0 ? "주간 시간표를 기반으로 자동 집계됩니다." : undefined}
              isEmpty={todayClasses === 0} emptyHint="↓ 아래에서 시간표를 등록해보세요"
              icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>}
            />
            <MetricCard
              label="집중 시간"
              value={`${String(focusHours).padStart(2, "0")}:${String(focusMinutes).padStart(2, "0")}`}
              description={`오늘 ${todayFocusMinutes}분 / 목표 ${focusTargetMinutes}분`}
              progress={focusProgress}
              badge={todayFocusMinutes > 0 ? `${Math.round(focusProgress * 100)}%` : undefined}
              isEmpty={todayFocusMinutes === 0} emptyHint="타이머를 켜고 공부를 시작해보세요"
              icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
            />
            <MetricCard
              label="오늘 일정" value={`${todayAgendaCount}개`}
              description={todayAgendaCount > 0 ? "오늘 마감인 과제와 시험 일정의 총 개수입니다." : undefined}
              isEmpty={todayAgendaCount === 0} emptyHint="플래너에서 오늘 할 일을 추가해보세요"
              icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
            />
          </div>
        </section>

        {/* ── 시간표 + 사이드 패널 ────────────────────────── */}
        <section className="rounded-[2rem] bg-white p-4 shadow-sm sm:p-6 md:p-8 dark:bg-slate-900">

          {/* 섹션 헤더 */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">주간 시간표</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">빈 셀을 클릭하면 인라인으로 수업을 추가할 수 있어요.</p>
            </div>
            <div className="flex items-center gap-2">
              {lastSyncAt && (
                <span className="text-xs text-slate-400 dark:text-slate-500">{formatRelativeTime(lastSyncAt)} 동기화</span>
              )}
              <button type="button" disabled={syncing || loading}
                onClick={async () => { setSyncing(true); await fetchData(); setSyncing(false); }}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={syncing ? "animate-spin" : ""}>
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                새로고침
              </button>
            </div>
          </div>

          {/* 수업 추가 폼 */}
          <div className="mt-5 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <input value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && subject.trim()) handleAddSchedule(); }}
              placeholder="과목명을 입력하세요"
              className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}
              className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              {([1,2,3,4,5,6,0] as number[]).map((v) => (
                <option key={v} value={v}>{["일","월","화","수","목","금","토"][v]}요일</option>
              ))}
            </select>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}
              className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              {Array.from({ length: 10 }, (_, i) => `${i + 1}교시`).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <button onClick={handleAddSchedule} disabled={saving || !subject.trim()}
              className="rounded-3xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
              추가
            </button>
          </div>

          {/* 그리드 + 사이드 패널 */}
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.65fr_0.95fr]">

            {/* 시간표 그리드 */}
            <div>
              {loading ? <LoadingCard /> : (
                <div className="w-full overflow-x-auto">
                  <div className="min-w-[700px]">

                    {/* ── 헤더 행 ── */}
                    <div className="grid grid-cols-8 overflow-hidden rounded-[1rem] border border-slate-200 dark:border-slate-700">
                      {/* 교시 헤더 */}
                      <div className="bg-slate-100 px-3 py-3 text-center dark:bg-slate-800">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">교시</p>
                      </div>
                      {/* 요일 헤더 */}
                      {weekdayOrder.map((wd) => (
                        <div key={wd}
                          className={`px-2 py-2.5 text-center ${
                            wd === todayWeekday
                              ? "bg-sky-50 dark:bg-sky-950/40"
                              : "bg-slate-50 dark:bg-slate-900"
                          }`}>
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center gap-1">
                              <span className={`text-sm font-bold ${wd === todayWeekday ? "text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-300"}`}>
                                {weekdays[wd]}
                              </span>
                              {wd === todayWeekday && (
                                <span className="inline-flex items-center justify-center rounded-full bg-sky-500 px-1.5 py-0.5 text-[8px] font-bold leading-none text-white">
                                  오늘
                                </span>
                              )}
                            </div>
                            <span className={`text-[10px] ${wd === todayWeekday ? "font-semibold text-sky-500 dark:text-sky-400" : "text-slate-400 dark:text-slate-500"}`}>
                              {weekDates[wd]}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ── 시간표 바디 ── */}
                    <div className="mt-1 space-y-[2px]">
                      {Array.from({ length: 10 }, (_, i) => {
                        const pi      = i + 1;         // period index (1~10)
                        const timeStr = `${8 + pi}:00`; // 9:00~18:00
                        return (
                          <div key={`row-${pi}`} className="grid grid-cols-8">
                            {/* 교시 레이블 */}
                            <div className="flex flex-col justify-center rounded-l-[0.75rem] bg-slate-50 px-3 py-2 dark:bg-slate-900">
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{pi}교시</span>
                              <span className="mt-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">{timeStr}</span>
                            </div>

                            {/* 요일 셀 */}
                            {weekdayOrder.map((wd) => {
                              const cellItems = schedule.filter(
                                (item) => item.weekday === wd && Number(item.period.replace(/[^0-9]/g, "")) === pi,
                              );
                              const isToday  = wd === todayWeekday;
                              const isInline = inlineCell?.weekday === wd && inlineCell?.period === pi;
                              const isLastCol = wd === 0;

                              return (
                                <div key={`${wd}-${pi}`}
                                  className={`min-h-[72px] p-1 ${isLastCol ? "rounded-r-[0.75rem]" : ""} ${
                                    isToday ? "bg-sky-50/60 dark:bg-sky-950/20" : "bg-white dark:bg-slate-950"
                                  }`}>

                                  {cellItems.length === 0 ? (
                                    isInline ? (
                                      /* 인라인 입력 모드 */
                                      <div className="flex h-full min-h-[68px] items-start p-1 pt-1.5">
                                        <input
                                          ref={inlineRef}
                                          value={inlineSubject}
                                          onChange={(e) => setInlineSubject(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") handleInlineSave(wd, pi, inlineSubject);
                                            if (e.key === "Escape") { setInlineCell(null); setInlineSubject(""); }
                                          }}
                                          onBlur={() => window.setTimeout(() => { setInlineCell(null); setInlineSubject(""); }, 150)}
                                          placeholder="과목명"
                                          className="w-full rounded-lg border border-sky-400 bg-white px-2 py-1 text-xs outline-none focus:border-sky-500 dark:border-sky-600 dark:bg-slate-800 dark:text-slate-100"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>
                                    ) : (
                                      /* 빈 셀 — hover 시 파선 테두리 + "+" */
                                      <div
                                        onClick={() => {
                                          // 폼 자동 채우기
                                          setWeekday(wd);
                                          setPeriod(`${pi}교시`);
                                          // 인라인 모드도 동시 활성화
                                          setInlineCell({ weekday: wd, period: pi });
                                          setInlineSubject("");
                                        }}
                                        className="group flex h-full min-h-[68px] cursor-pointer items-center justify-center rounded-lg transition-colors hover:outline-dashed hover:outline-2 hover:outline-sky-300 hover:bg-sky-50/40 dark:hover:outline-sky-700 dark:hover:bg-sky-950/20"
                                      >
                                        <div className="hidden flex-col items-center gap-0.5 group-hover:flex">
                                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400">
                                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                          </svg>
                                          <span className="text-[9px] font-semibold text-sky-400">수업 추가</span>
                                        </div>
                                      </div>
                                    )
                                  ) : (
                                    /* 수업 있는 셀 */
                                    <div className="space-y-1">
                                      {cellItems.map((item) => {
                                        const color = getSubjectColor(item.subject);
                                        return (
                                          <div key={item.id}
                                            className={`group flex min-h-[66px] flex-col justify-between rounded-lg p-2 pl-3 ${color.cellBg} ${color.borderLeft}`}>
                                            <div className="flex items-start justify-between gap-1">
                                              <p className={`flex-1 break-words text-xs font-bold leading-snug ${color.cellText}`}>
                                                {item.subject}
                                              </p>
                                              {/* hover 시에만 나타나는 삭제 버튼 */}
                                              <button type="button"
                                                onClick={() => setDeleteConfirmId(item.id)}
                                                className="shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
                                                title="삭제">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500 dark:text-rose-400">
                                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                                </svg>
                                              </button>
                                            </div>
                                            {/* 수업 시간 */}
                                            <p className={`text-[10px] font-medium ${color.subText}`}>{timeStr}</p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>

                    {/* 빈 시간표 안내 */}
                    {schedule.length === 0 && !loading && (
                      <div className="mt-4 flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 py-10 text-center dark:border-slate-700 dark:bg-slate-950">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                          <polyline points="17 11 12 6 7 11"/><line x1="12" y1="6" x2="12" y2="18"/>
                        </svg>
                        <div>
                          <p className="font-semibold text-slate-700 dark:text-slate-300">아직 등록된 수업이 없습니다</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">위에서 첫 수업을 추가해보세요!</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── 우측 사이드 패널 ──────────────────────────── */}
            <div className="space-y-5">

              {/* 오늘의 학습 현황 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">오늘의 학습 현황</p>
                <h2 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {todayFocusMinutes === 0 ? "오늘 아직 공부 기록이 없어요" : `${focusHours}시간 ${focusMinutes}분 집중 🔥`}
                </h2>

                <div className="mt-4 flex items-center gap-4">
                  <div className="relative shrink-0">
                    <svg width="90" height="90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r={donutR} fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-slate-700" />
                      <circle cx="50" cy="50" r={donutR} fill="none" strokeWidth="10" strokeLinecap="round"
                        strokeDasharray={donutCirc} strokeDashoffset={donutOffset}
                        className="stroke-sky-500"
                        style={{ transform: "rotate(-90deg)", transformOrigin: "50px 50px", transition: "stroke-dashoffset 0.6s ease" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-base font-bold text-sky-600 dark:text-sky-400">{Math.round(focusProgress * 100)}%</span>
                      <span className="text-[9px] text-slate-400">달성</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{focusHours}시간 {focusMinutes}분 완료</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">목표 {focusTargetMinutes}분</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-full rounded-full bg-sky-500 transition-all duration-700" style={{ width: `${Math.min(focusProgress * 100, 100)}%` }} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Link href="/timer" className="flex flex-1 items-center justify-center gap-1.5 rounded-3xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    타이머 시작
                  </Link>
                  <Link href="/priority" className="flex flex-1 items-center justify-center gap-1.5 rounded-3xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700">
                    🔥 우선순위
                  </Link>
                </div>
              </div>

              {/* 오늘 공부 로그 — 과목 색상 일치 바 차트 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">오늘 공부 로그</p>
                <div className="mt-4 space-y-3">
                  {studyBreakdown.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-3 text-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                      <p className="text-xs text-slate-500 dark:text-slate-400">오늘 기록된 학습 로그가 없습니다.</p>
                    </div>
                  ) : (
                    studyBreakdown.map((item) => {
                      const color    = getSubjectColor(item.subject);
                      const barWidth = (item.minutes / maxStudyMin) * 100;
                      return (
                        <div key={item.subject} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${color.dotBg}`} />
                              <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-300">{item.subject}</span>
                            </div>
                            <span className="shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400">{item.minutes}분</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className={`h-full rounded-full transition-all duration-500 ${color.logBar}`} style={{ width: `${barWidth}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
        </section>

        {/* ── 나의 공부 기록 (잔디 그래프) ─────────────────── */}
        <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 md:p-8 dark:bg-slate-900">
          {/* 헤더 */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">나의 공부 기록</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">스터디 스트릭</h2>
            </div>
            {currentStreak > 0 ? (
              <div className="rounded-full bg-orange-50 px-4 py-2 text-sm font-bold text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
                🔥 {currentStreak}일 연속 공부 중
              </div>
            ) : (
              <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                오늘 공부를 시작해보세요 💪
              </div>
            )}
          </div>

          {/* 잔디 그리드 */}
          <div className="mt-6 overflow-x-auto">
            <div className="inline-flex gap-1 min-w-0">
              {/* 요일 라벨 열 */}
              <div className="flex flex-col gap-1 pt-5 pr-1 shrink-0">
                {DOW_KO.map((d) => (
                  <div key={d} className="flex h-3.5 items-center text-[9px] font-semibold leading-none text-slate-400 dark:text-slate-500">
                    {d}
                  </div>
                ))}
              </div>

              {/* 주 열들 */}
              <div className="flex gap-1">
                {grassWeeks.map((week, wi) => {
                  const firstDay  = week.find((c) => !c.placeholder);
                  const monthLabel = firstDay && new Date(firstDay.date + "T00:00:00").getDate() <= 7
                    ? MONTH_KO[new Date(firstDay.date + "T00:00:00").getMonth()]
                    : null;
                  return (
                    <div key={wi} className="flex flex-col gap-1">
                      {/* 월 레이블 */}
                      <div className="h-4 text-[9px] font-semibold leading-none text-slate-400 dark:text-slate-500 truncate">
                        {monthLabel ?? ""}
                      </div>
                      {/* 7개 셀 */}
                      {week.map((cell, di) => (
                        <div
                          key={di}
                          className={`h-3.5 w-3.5 rounded-sm transition-transform hover:scale-110 ${
                            cell.placeholder
                              ? "invisible"
                              : `cursor-default ${grassColor(cell.minutes)}`
                          }`}
                          onMouseEnter={(e) => {
                            if (cell.placeholder || !cell.date) return;
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setGrassTooltip({ date: cell.date, minutes: cell.minutes, x: r.left + r.width / 2, y: r.top });
                          }}
                          onMouseLeave={() => setGrassTooltip(null)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 범례 */}
          <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
            <span>적음</span>
            {(["bg-slate-100 dark:bg-slate-800","bg-sky-100 dark:bg-sky-900/50","bg-sky-300 dark:bg-sky-700","bg-sky-500"] as const).map((cls) => (
              <div key={cls} className={`h-3 w-3 rounded-sm ${cls}`} />
            ))}
            <span>많음</span>
            <span className="ml-3 text-slate-300 dark:text-slate-600">|</span>
            <span className="ml-1">1~30분</span>
            <span className="ml-1 text-slate-300 dark:text-slate-600">·</span>
            <span>30~60분</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span>1시간+</span>
          </div>
        </section>

        {/* ── 삭제 확인 모달 ──────────────────────────────── */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/40">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600 dark:text-rose-400">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">수업을 삭제할까요?</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">이 수업이 시간표에서 제거됩니다.</p>
                </div>
                <div className="flex w-full gap-3">
                  <button type="button" onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    취소
                  </button>
                  <button type="button" onClick={handleDeleteConfirm}
                    className="flex-1 rounded-3xl bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-700">
                    삭제
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {toastMessage && <ToastMessage message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} />}

        {/* ── 잔디 툴팁 ──────────────────────────────────── */}
        {grassTooltip && (
          <div
            className="pointer-events-none fixed z-[200] rounded-xl bg-slate-900 px-3 py-2 text-xs shadow-xl dark:bg-slate-100"
            style={{ left: grassTooltip.x, top: grassTooltip.y - 10, transform: "translate(-50%, -100%)" }}
          >
            <p className="font-semibold text-slate-300 dark:text-slate-600">{grassTooltip.date}</p>
            <p className="mt-0.5 font-bold text-white dark:text-slate-900">
              {grassTooltip.minutes === 0 ? "공부 기록 없음" : `${grassTooltip.minutes}분 집중`}
            </p>
            {/* 말풍선 꼬리 */}
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-100" />
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
