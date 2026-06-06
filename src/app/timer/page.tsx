"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar, BarChart, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import { createStudyLog, deleteStudyLog, getStudyLogs, getUserTimetableSubjects } from "@/src/lib/supabase";

const DEFAULT_FOCUS_SECS = 25 * 60;
const DEFAULT_BREAK_SECS =  5 * 60;

function lsGetNum(key: string, fallback: number): number {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
  catch { return fallback; }
}

const CHART_COLORS = ["#0ea5e9","#8b5cf6","#10b981","#f59e0b","#f43f5e","#f97316","#14b8a6","#ec4899"];

// 과목별 링 색상 — Tailwind 전체 문자열로 선언 (purge 방지)
const SUBJECT_RING_COLORS = [
  "stroke-sky-500", "stroke-violet-500", "stroke-emerald-500", "stroke-amber-500",
  "stroke-rose-500", "stroke-orange-500", "stroke-teal-500",   "stroke-pink-500",
] as const;

const LOG_TAG_COLORS = [
  { dot: "bg-sky-500",     tag: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  { dot: "bg-violet-500",  tag: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
  { dot: "bg-emerald-500", tag: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  { dot: "bg-amber-500",   tag: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  { dot: "bg-rose-500",    tag: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
];

// djb2 해시로 과목명 → 링 색상 결정론적 매핑
function subjectRingColor(subject: string): string {
  if (!subject) return "stroke-sky-500";
  let h = 5381;
  for (let i = 0; i < subject.length; i++) h = ((h << 5) + h + subject.charCodeAt(i)) | 0;
  return SUBJECT_RING_COLORS[Math.abs(h) % SUBJECT_RING_COLORS.length];
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
}
function formatHHMMSS(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
}
function formatDateKey(d: Date) { return d.toISOString().slice(0, 10); }
function formatTimeLabel(v?: string) {
  if (!v) return "--:--";
  try { return new Date(v).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }); }
  catch { return "--:--"; }
}

// ─── 히스토리 헬퍼 ───────────────────────────────────────────────────────────
function formatTotalTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m || 0}분`;
}

function getSessionTimes(log: { created_at?: string; duration_seconds?: number; minutes: number }) {
  if (!log.created_at) return null;
  const end   = new Date(log.created_at);
  const dur   = log.duration_seconds ?? log.minutes * 60;
  const start = new Date(end.getTime() - dur * 1000);
  const fmt   = (d: Date) => `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  return { start: fmt(start), end: fmt(end) };
}

function formatDateLabel(dateStr: string, todayKey: string): string {
  const yesterday = new Date(new Date(todayKey).getTime() - 86400000).toISOString().slice(0, 10);
  if (dateStr === todayKey)  return "오늘";
  if (dateStr === yesterday) return "어제";
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function SkeletonRow() {
  return (
    <div className="space-y-2 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <div className="flex gap-2"><div className="h-5 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"/><div className="h-5 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"/></div>
        <div className="h-7 w-12 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-700"/>
      </div>
      <div className="h-1.5 w-full animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"/>
    </div>
  );
}

type LogItem = { id: string; date: string; minutes: number; subject: string; duration_seconds?: number; created_at?: string };

export default function TimerPage() {
  const { user, loading: authLoading } = useAuth();

  const [focusDuration, setFocusDuration]                 = useState(DEFAULT_FOCUS_SECS);
  const [breakDuration, setBreakDuration]                 = useState(DEFAULT_BREAK_SECS);
  const [dailyGoalHours, setDailyGoalHours]               = useState(3);
  const focusDurationRef                                  = useRef(DEFAULT_FOCUS_SECS);
  const breakDurationRef                                  = useRef(DEFAULT_BREAK_SECS);

  const [timerSeconds, setTimerSeconds]                   = useState(0);
  const [pomodoroMode, setPomodoroMode]                   = useState(false);
  const [sessionType, setSessionType]                     = useState<"focus"|"break">("focus");
  const [pomodoroSeconds, setPomodoroSeconds]             = useState(DEFAULT_FOCUS_SECS);
  const [accumulatedFocusSeconds, setAccumulatedFocusSeconds] = useState(0);
  const [selectedSubject, setSelectedSubject]             = useState("");
  const [subjects, setSubjects]                           = useState<string[]>([]);
  const [logs, setLogs]                                   = useState<LogItem[]>([]);
  const [loading, setLoading]                             = useState(true);
  const [saving, setSaving]                               = useState(false);
  const [timerRunning, setTimerRunning]                   = useState(false);
  const [justCompleted, setJustCompleted]                 = useState(false);
  const [showCompletionModal, setShowCompletionModal]     = useState(false);
  const [toastMessage, setToastMessage]                   = useState<string|null>(null);
  const [toastType, setToastType]                         = useState<"success"|"error">("success");

  // ─── 히스토리 필터 상태 ───────────────────────────────────────────────────
  const [historySubjectFilter, setHistorySubjectFilter]   = useState("전체");
  const [historyDateRange, setHistoryDateRange]           = useState<"오늘"|"이번 주"|"이번 달"|"전체">("전체");
  const [showAllHistory, setShowAllHistory]               = useState(false);
  const [expandedDates, setExpandedDates]                 = useState<Set<string>>(() => new Set([formatDateKey(new Date())]));

  const timerRef             = useRef<number|null>(null);
  const sessionTypeRef       = useRef(sessionType);
  const skipFirstExpandReset = useRef(false);
  const todayKey       = useMemo(() => formatDateKey(new Date()), []);

  const showToast = useCallback((msg: string, type: "success"|"error" = "success") => {
    setToastMessage(msg); setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  useEffect(() => { sessionTypeRef.current = sessionType; }, [sessionType]);
  useEffect(() => { focusDurationRef.current = focusDuration; }, [focusDuration]);
  useEffect(() => { breakDurationRef.current = breakDuration; }, [breakDuration]);

  // 설정 페이지에서 저장한 집중 설정을 마운트 시 읽어옴
  useEffect(() => {
    const fd = lsGetNum("smartgrade_pomodoro_focus", 25) * 60;
    const bd = lsGetNum("smartgrade_pomodoro_break",  5) * 60;
    const dg = lsGetNum("smartgrade_daily_goal_hours", 3);
    focusDurationRef.current = fd;
    breakDurationRef.current = bd;
    setFocusDuration(fd);
    setBreakDuration(bd);
    setDailyGoalHours(dg);
    setPomodoroSeconds(fd);
  }, []);

  // ─── Data ─────────────────────────────────────────────────────────────────
  const fetchSubjects = async () => {
    if (!user) return;
    const res = await getUserTimetableSubjects(user.id);
    if (!res.error) {
      const list = Array.from(new Set((res.data ?? []).map((i: { subject: string }) => i.subject).filter(Boolean))) as string[];
      setSubjects(list);
      const pre = typeof window !== "undefined" ? localStorage.getItem("priority_timer_subject") : null;
      if (pre) { localStorage.removeItem("priority_timer_subject"); setSelectedSubject(pre); }
      else setSelectedSubject((p) => p || list[0] || "");
    }
  };

  const fetchLogs = async () => {
    if (!user) return;
    setLoading(true);
    const res = await getStudyLogs(user.id);
    setLogs(res.error ? [] : (res.data ?? []));
    setLoading(false);
  };

  useEffect(() => { if (!user) return; fetchSubjects(); fetchLogs(); }, [user]);

  // ─── Guards & shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (!timerRunning) return; e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [timerRunning]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!timerRunning && !selectedSubject) { showToast("과목을 먼저 선택해주세요", "error"); return; }
        setTimerRunning((p) => !p);
      }
      if (e.code === "KeyR") {
        e.preventDefault();
        if (timerRunning) { if (window.confirm("집중 세션이 진행 중입니다. 초기화할까요?")) resetTimer(); }
        else resetTimer();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [timerRunning, selectedSubject]);

  // ─── Completion notification ──────────────────────────────────────────────
  useEffect(() => {
    if (!justCompleted) return;
    setJustCompleted(false);
    const notify = async () => {
      if (!("Notification" in window)) { setShowCompletionModal(true); return; }
      if (Notification.permission === "granted") new Notification("집중 세션 완료! 🎉", { body: "수고했어요!" });
      else if (Notification.permission !== "denied") {
        const p = await Notification.requestPermission();
        if (p === "granted") new Notification("집중 세션 완료! 🎉", { body: "수고했어요!" });
        else setShowCompletionModal(true);
      } else setShowCompletionModal(true);
    };
    notify();
  }, [justCompleted]);

  // ─── Timer ────────────────────────────────────────────────────────────────
  const resetTimer = () => {
    setTimerRunning(false); setTimerSeconds(0);
    setPomodoroSeconds(focusDuration); setSessionType("focus"); setAccumulatedFocusSeconds(0);
  };

  useEffect(() => {
    if (!timerRunning) return;
    timerRef.current = window.setInterval(() => {
      if (pomodoroMode) {
        setPomodoroSeconds((prev) => {
          if (prev <= 1) {
            setJustCompleted(true);
            setSessionType((c) => c === "focus" ? "break" : "focus");
            setAccumulatedFocusSeconds((c) => c + 1);
            return sessionTypeRef.current === "focus" ? breakDurationRef.current : focusDurationRef.current;
          }
          if (sessionTypeRef.current === "focus") setAccumulatedFocusSeconds((c) => c + 1);
          return prev - 1;
        });
        return;
      }
      setTimerSeconds((p) => p + 1);
    }, 1000);
    return () => { if (timerRef.current !== null) window.clearInterval(timerRef.current); timerRef.current = null; };
  }, [timerRunning, pomodoroMode]);

  // ─── Save / Delete ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) { showToast("로그인이 필요합니다.", "error"); return; }
    const dur = pomodoroMode ? accumulatedFocusSeconds : timerSeconds;
    if (dur === 0) { showToast("저장할 집중 시간이 없습니다.", "error"); return; }
    if (!selectedSubject) { showToast("먼저 집중 과목을 선택하세요.", "error"); return; }
    setSaving(true);
    const res = await createStudyLog({ user_id: user.id, subject: selectedSubject, duration_seconds: dur, minutes: Math.round(dur / 60) || 1, date: todayKey });
    if (res.error) showToast("저장에 실패했습니다.", "error");
    else { await fetchLogs(); resetTimer(); showToast("저장 완료! 🎉", "success"); }
    setSaving(false);
  };

  const handleDeleteRecord = async (id: string) => {
    if (!user) return;
    setSaving(true);
    const res = await deleteStudyLog(id);
    if (res.error) showToast("기록 삭제에 실패했습니다.", "error");
    else { await fetchLogs(); showToast("기록이 삭제되었습니다.", "success"); }
    setSaving(false);
  };

  // ─── Ring / display ───────────────────────────────────────────────────────
  const RING_R    = 70;
  const RING_CIRC = 2 * Math.PI * RING_R;

  const ringProgress = pomodoroMode
    ? Math.min(1 - pomodoroSeconds / (sessionType === "focus" ? focusDuration : breakDuration), 1)
    : (timerSeconds % 60) / 60;
  const ringOffset = RING_CIRC * (1 - ringProgress);

  const ringColorClass = useMemo(() => {
    if (!timerRunning) return "stroke-slate-300 dark:stroke-slate-600";
    if (pomodoroMode && sessionType === "break") return "stroke-emerald-500";
    if (selectedSubject) return subjectRingColor(selectedSubject);
    return "stroke-sky-500";
  }, [timerRunning, pomodoroMode, sessionType, selectedSubject]);

  const statusBadge = useMemo(() => {
    const isIdle = !timerRunning && (pomodoroMode ? pomodoroSeconds === focusDuration : timerSeconds === 0);
    if (isIdle) return { text: "대기", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" };
    if (!timerRunning) return { text: "일시정지", cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" };
    if (pomodoroMode && sessionType === "break") return { text: "휴식 중 🌿", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" };
    return { text: "집중 중 🔥", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" };
  }, [timerRunning, pomodoroMode, sessionType, pomodoroSeconds, timerSeconds, focusDuration]);

  const getDisplayTime = () => pomodoroMode ? formatTime(pomodoroSeconds) : formatTime(timerSeconds);
  const currentSessionSecs = pomodoroMode ? accumulatedFocusSeconds : timerSeconds;
  const canSave = currentSessionSecs > 0;

  // ─── Stats ────────────────────────────────────────────────────────────────
  const todaySeconds = useMemo(
    () => logs.filter((l) => l.date === todayKey).reduce((s, l) => s + (l.duration_seconds ?? l.minutes * 60), 0),
    [logs, todayKey],
  );
  const todayRecords     = useMemo(() => logs.filter((l) => l.date === todayKey), [logs, todayKey]);
  const maxRecordMinutes = useMemo(
    () => Math.max(...todayRecords.map((r) => Math.round((r.duration_seconds ?? r.minutes * 60) / 60)), 1),
    [todayRecords],
  );

  const subjectChartData = useMemo(() => {
    const grouped = logs.filter((l) => l.date === todayKey).reduce<Record<string,number>>((acc, l) => {
      const m = Math.round((l.duration_seconds ?? l.minutes * 60) / 60);
      acc[l.subject] = (acc[l.subject] ?? 0) + m; return acc;
    }, {});
    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [logs, todayKey]);

  const hourlyChartData = useMemo(() => {
    const grouped = logs.filter((l) => l.date === todayKey && l.created_at).reduce<Record<number,number>>((acc, l) => {
      const h = new Date(l.created_at!).getHours();
      acc[h] = (acc[h] ?? 0) + Math.round((l.duration_seconds ?? l.minutes * 60) / 60); return acc;
    }, {});
    return Array.from({ length: 24 }, (_, h) => ({ hour: `${h}시`, minutes: grouped[h] ?? 0 }));
  }, [logs, todayKey]);

  const subjectColorMap = useMemo(() => {
    const map = new Map<string,number>();
    logs.forEach((l) => { if (!map.has(l.subject)) map.set(l.subject, map.size % LOG_TAG_COLORS.length); });
    return map;
  }, [logs]);

  // ─── 히스토리 계산 ────────────────────────────────────────────────────────
  // 로그에서 중복 없는 과목 목록
  const historySubjects = useMemo(() => {
    const set = new Set(logs.map((l) => l.subject).filter(Boolean));
    return Array.from(set).sort();
  }, [logs]);

  // 필터 적용된 로그 (내림차순 정렬)
  const historyFilteredLogs = useMemo(() => {
    const now  = new Date();
    let result = [...logs].sort((a, b) =>
      b.date.localeCompare(a.date) || (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    );

    // 과목 필터
    if (historySubjectFilter !== "전체") {
      result = result.filter((l) => l.subject === historySubjectFilter);
    }

    // 날짜 범위 필터
    if (historyDateRange === "오늘") {
      result = result.filter((l) => l.date === todayKey);
    } else if (historyDateRange === "이번 주") {
      const cutoff = new Date(now); cutoff.setDate(now.getDate() - 6);
      const cutStr = cutoff.toISOString().slice(0, 10);
      result = result.filter((l) => l.date >= cutStr);
    } else if (historyDateRange === "이번 달") {
      const cutStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      result = result.filter((l) => l.date >= cutStr);
    } else {
      // "전체" 이지만 showAllHistory=false 이면 7일 제한
      if (!showAllHistory) {
        const cutoff = new Date(now); cutoff.setDate(now.getDate() - 6);
        const cutStr = cutoff.toISOString().slice(0, 10);
        result = result.filter((l) => l.date >= cutStr);
      }
    }
    return result;
  }, [logs, historySubjectFilter, historyDateRange, showAllHistory, todayKey]);

  // 날짜별 그룹핑
  const historyGrouped = useMemo(() => {
    const dateMap = new Map<string, LogItem[]>();
    historyFilteredLogs.forEach((l) => {
      const arr = dateMap.get(l.date) ?? [];
      arr.push(l);
      dateMap.set(l.date, arr);
    });
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, records]) => ({
        date,
        label: formatDateLabel(date, todayKey),
        totalSecs: records.reduce((s, r) => s + (r.duration_seconds ?? r.minutes * 60), 0),
        records: records.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")),
      }));
  }, [historyFilteredLogs, todayKey]);

  // 날짜 그룹 펼치기/접기 — 필터 변경 시 전체 초기화 (단, 첫 렌더는 건너뜀)
  useEffect(() => {
    if (!skipFirstExpandReset.current) { skipFirstExpandReset.current = true; return; }
    setExpandedDates(new Set());
  }, [historyDateRange, historySubjectFilter, showAllHistory]);

  const toggleDateExpand = (date: string) => {
    if (historyGrouped.length === 1) return;
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  const isDateExpanded = (date: string) => historyGrouped.length === 1 || expandedDates.has(date);

  // "더 보기" 버튼 표시 여부 (전체 모드 & 7일 밖에 기록 있을 때만)
  const hasOlderLogs = useMemo(() => {
    if (historyDateRange !== "전체" || showAllHistory) return false;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 6);
    const cutStr = cutoff.toISOString().slice(0, 10);
    return logs.some(
      (l) => l.date < cutStr &&
        (historySubjectFilter === "전체" || l.subject === historySubjectFilter),
    );
  }, [logs, historySubjectFilter, historyDateRange, showAllHistory]);

  // ─── Guards ───────────────────────────────────────────────────────────────
  if (authLoading) return <LoadingCard />;
  if (!user) {
    return (
      <div className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <p className="text-base text-slate-600 dark:text-slate-300">로그인 후 뽀모도로 타이머를 사용해주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 집중 중 배경 */}
      <div className={`fixed inset-0 pointer-events-none transition-opacity duration-700 ${timerRunning ? "opacity-100" : "opacity-0"}`}
        style={{ backgroundColor: "#EFF6FF", zIndex: -1 }} />

      {/* ── 메인 타이머 카드 (통합: 모드토글+과목+링+버튼+스탯) ── */}
      <div className="rounded-[2rem] bg-white p-4 shadow-sm dark:bg-slate-900">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">⏱️ 집중 타이머</p>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {todayKey}
          </span>
        </div>

        <div className="mt-3 flex flex-col items-center gap-2">
          {/* ① 모드 토글 */}
          <div className="flex overflow-hidden rounded-xl border-2 border-slate-200 dark:border-slate-700">
            <button type="button"
              onClick={() => { setPomodoroMode(false); resetTimer(); }}
              className={`px-5 py-1.5 text-sm font-bold transition ${!pomodoroMode ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"}`}>
              일반 모드
            </button>
            <button type="button"
              onClick={() => { setPomodoroMode(true); setSessionType("focus"); setPomodoroSeconds(focusDuration); setAccumulatedFocusSeconds(0); setTimerRunning(false); }}
              className={`px-5 py-1.5 text-sm font-bold transition ${pomodoroMode ? "bg-sky-600 text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"}`}>
              🍅 포모도로
            </button>
          </div>

          {/* ② 과목 선택 */}
          <div className="relative">
            {subjects.length > 0 ? (
              <>
                <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}
                  className="appearance-none cursor-pointer rounded-full border border-sky-200 bg-sky-50 px-5 py-1.5 pr-9 text-sm font-semibold text-sky-700 outline-none transition focus:border-sky-400 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
                  <option value="">과목을 선택하세요</option>
                  {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sky-500"
                  xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-5 py-1.5 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                시간표에 등록된 과목이 없어요
              </span>
            )}
          </div>

          {/* ③ SVG 원형 프로그레스 링 (60% 축소) */}
          <div className="relative">
            <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
              <circle cx="80" cy="80" r={RING_R} fill="none" strokeWidth="8" className="stroke-slate-100 dark:stroke-slate-800"/>
              <circle cx="80" cy="80" r={RING_R} fill="none" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={RING_CIRC} strokeDashoffset={ringOffset}
                className={ringColorClass}
                style={{ transform:"rotate(-90deg)", transformOrigin:"80px 80px", transition:"stroke-dashoffset 0.5s ease, stroke 0.4s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusBadge.cls}`}>
                {statusBadge.text}
              </span>
              <span className="text-[2.5rem] font-extrabold leading-none tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
                {getDisplayTime()}
              </span>
              {selectedSubject && (
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 truncate max-w-[110px]">
                  {selectedSubject}
                </span>
              )}
            </div>
          </div>

          {/* ④ 컨트롤 버튼 */}
          <div className="flex items-end gap-2">
            <div className="flex flex-col items-center gap-0.5">
              <button type="button"
                onClick={() => {
                  if (!timerRunning && !selectedSubject) { showToast("과목을 먼저 선택해주세요", "error"); return; }
                  setTimerRunning((p) => !p);
                }}
                className="flex items-center gap-2 rounded-3xl bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700">
                {timerRunning ? (
                  <><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>일시정지</>
                ) : (
                  <><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>시작</>
                )}
              </button>
              <span className="text-[9px] text-slate-400">[Space]</span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <button type="button"
                onClick={() => { if (timerRunning) { if (window.confirm("진행 중 세션을 초기화할까요?")) resetTimer(); } else resetTimer(); }}
                className="rounded-3xl border-2 border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800">
                초기화
              </button>
              <span className="text-[9px] text-slate-400">[R]</span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <button type="button" onClick={handleSave} disabled={saving || !canSave}
                className="rounded-3xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
                저장하기
              </button>
              <span className="text-[9px] text-transparent select-none" aria-hidden>·</span>
            </div>
          </div>

          {/* 구분선 */}
          <div className="mt-1 w-full border-t border-slate-100 dark:border-slate-800" />

          {/* ⑤ 통합 스탯 3개 */}
          <div className="grid w-full grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
            <div className="px-3 py-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">세션</p>
              <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">{formatHHMMSS(currentSessionSecs)}</p>
              <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{pomodoroMode ? "누적 집중" : "스톱워치"}</p>
            </div>
            <div className="px-3 py-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-500 dark:text-sky-400">오늘 누적</p>
              <p className="mt-1 text-sm font-bold text-sky-700 dark:text-sky-300">{formatHHMMSS(todaySeconds)}</p>
              <p className="mt-0.5 text-[10px] text-sky-400 dark:text-sky-500">
                목표 {dailyGoalHours}h · {todayRecords.length}세션
              </p>
            </div>
            <div className="px-3 py-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">집중 과목</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-slate-100">{selectedSubject || "—"}</p>
              <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{pomodoroMode ? "포모도로" : "일반"} 모드</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 차트 2열 ──────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 도넛 차트 — 오늘 과목 분포 */}
        <section className="rounded-[2rem] bg-white p-5 shadow-sm dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">오늘 과목 분포</p>
          <h2 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">집중 시간 비율</h2>
          <div className="mt-3">
            {subjectChartData.length === 0 ? (
              <div className="flex items-center gap-4">
                <div className="relative h-[130px] w-[130px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie dataKey="value" data={[{ value: 1 }]} innerRadius={38} outerRadius={58} stroke="none">
                        <Cell fill="#e2e8f0"/>
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">기록 없음</span>
                  </div>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">아직 집중 기록이 없어요</p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="h-[148px] w-[148px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie dataKey="value" data={subjectChartData} innerRadius={40} outerRadius={66} paddingAngle={3} stroke="none">
                        {subjectChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>)}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v}분`,""]} contentStyle={{ borderRadius:"0.75rem", border:"1px solid #e2e8f0", fontSize:12 }}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 overflow-hidden">
                  {subjectChartData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}/>
                      <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{item.name}</span>
                      <span className="shrink-0 font-bold text-slate-900 dark:text-slate-100">{item.value}분</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 바 차트 — 시간대별 집중 패턴 (0~23시 항상 표시) */}
        <section className="rounded-[2rem] bg-white p-5 shadow-sm dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">오늘 집중 패턴</p>
          <h2 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">시간대별 집중 현황</h2>
          <div className="mt-3 h-[168px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyChartData} margin={{ top:0, right:0, left:-20, bottom:0 }}>
                <XAxis dataKey="hour" tick={{ fontSize:9, fill:"#94a3b8" }} axisLine={false} tickLine={false} interval={2}/>
                <YAxis tick={{ fontSize:10, fill:"#94a3b8" }} axisLine={false} tickLine={false}/>
                <Tooltip formatter={(v) => [`${v}분`,"집중"]} contentStyle={{ borderRadius:"0.75rem", border:"1px solid #e2e8f0", fontSize:12 }}/>
                <Bar dataKey="minutes" radius={[4,4,0,0]} fill="#0ea5e9"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* ── 오늘 집중 기록 ────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">오늘 집중 기록</p>
        <h2 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">저장된 공부 기록</h2>

        <div className="mt-4">
          {loading ? (
            <div className="space-y-3"><SkeletonRow/><SkeletonRow/></div>
          ) : todayRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 py-10 text-center dark:border-slate-800 dark:bg-slate-950">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-300">아직 기록이 없어요</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">첫 세션을 시작해보세요!</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {todayRecords.map((item) => {
                const dur    = item.duration_seconds ?? item.minutes * 60;
                const mins   = Math.floor(dur / 60);
                const secs   = dur % 60;
                const barPct = Math.min((mins / maxRecordMinutes) * 100, 100);
                const color  = LOG_TAG_COLORS[subjectColorMap.get(item.subject) ?? 0];
                return (
                  <div key={item.id} className="group space-y-2 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${color.tag}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`}/>
                            {item.subject}
                          </span>
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {mins}분 {String(secs).padStart(2,"0")}초
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">저장 {formatTimeLabel(item.created_at)}</p>
                      </div>
                      <button type="button" onClick={() => handleDeleteRecord(item.id)}
                        className="self-start rounded-2xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 opacity-0 transition group-hover:opacity-100 hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/40 dark:text-rose-300">
                        삭제
                      </button>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className={`h-full rounded-full ${color.dot} transition-all`} style={{ width:`${barPct}%` }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── 집중 기록 히스토리 ─────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">집중 기록 히스토리</p>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">날짜별 세션 기록</h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["오늘","이번 주","이번 달","전체"] as const).map((r) => (
              <button key={r} type="button"
                onClick={() => { setHistoryDateRange(r); setShowAllHistory(false); }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  historyDateRange === r
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                }`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {historySubjects.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {["전체", ...historySubjects].map((sub) => {
              const colorIdx = subjectColorMap.get(sub);
              const color    = colorIdx !== undefined ? LOG_TAG_COLORS[colorIdx] : null;
              return (
                <button key={sub} type="button"
                  onClick={() => setHistorySubjectFilter(sub)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    historySubjectFilter === sub
                      ? color
                        ? `${color.tag} ring-2 ring-offset-1 ring-current`
                        : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "border border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                  }`}>
                  {color && <span className={`h-2 w-2 rounded-full ${color.dot}`} />}
                  {sub}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-5 space-y-6">
          {loading ? (
            <div className="space-y-3"><SkeletonRow/><SkeletonRow/><SkeletonRow/></div>
          ) : historyGrouped.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 py-12 text-center dark:border-slate-700 dark:bg-slate-950">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-300">아직 집중 기록이 없어요</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">첫 번째 세션을 시작해보세요!</p>
              </div>
            </div>
          ) : (
            historyGrouped.map(({ date, label, totalSecs, records }) => (
              <div key={date}>
                {/* 날짜 그룹 헤더 — 클릭으로 펼치기/접기 */}
                <button
                  type="button"
                  onClick={() => toggleDateExpand(date)}
                  className="mb-1 flex w-full items-center justify-between rounded-xl px-2 py-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${date === todayKey ? "text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-300"}`}>
                      {label}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                      date === todayKey
                        ? "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }`}>
                      총 {formatTotalTime(totalSecs)}
                    </span>
                    {historyGrouped.length > 1 && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`shrink-0 text-slate-400 transition-transform duration-300 dark:text-slate-500 ${isDateExpanded(date) ? "rotate-180" : ""}`}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    )}
                  </div>
                </button>

                {/* 세션 목록 — 슬라이드 애니메이션 */}
                <div className={`grid transition-all duration-300 ease-in-out ${isDateExpanded(date) ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="min-h-0 overflow-hidden">
                    <div className="space-y-2 pb-1 pt-0.5">
                      {records.map((item) => {
                        const dur     = item.duration_seconds ?? item.minutes * 60;
                        const mins    = Math.floor(dur / 60);
                        const secs    = dur % 60;
                        const color   = LOG_TAG_COLORS[subjectColorMap.get(item.subject) ?? 0];
                        const times   = getSessionTimes(item);
                        return (
                          <div key={item.id}
                            className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.dot}`} />
                            <span className="w-32 shrink-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {item.subject}
                            </span>
                            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${color.tag}`}>
                              {mins > 0 ? `${mins}분` : ""}{secs > 0 && mins === 0 ? `${secs}초` : ""}
                              {mins > 0 && secs > 0 ? ` ${String(secs).padStart(2,"0")}초` : ""}
                            </span>
                            <span className="flex-1 text-center text-xs text-slate-500 dark:text-slate-400">
                              {times ? `${times.start} ~ ${times.end}` : "—"}
                            </span>
                            <span className="hidden shrink-0 text-xs text-slate-400 dark:text-slate-500 sm:block">
                              {label}
                            </span>
                            <button type="button" onClick={() => handleDeleteRecord(item.id)}
                              className="ml-auto shrink-0 rounded-full p-1.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-400">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {hasOlderLogs && (
          <div className="mt-5 text-center">
            <button type="button" onClick={() => setShowAllHistory(true)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              7일 이전 기록 더 보기
            </button>
          </div>
        )}
        {showAllHistory && historyDateRange === "전체" && (
          <div className="mt-3 text-center">
            <button type="button" onClick={() => setShowAllHistory(false)}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 underline-offset-2 hover:underline">
              최근 7일만 보기
            </button>
          </div>
        )}
      </section>

      {/* 세션 완료 모달 */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-50 text-4xl dark:bg-sky-950/50">🎉</div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">집중 세션 완료!</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">수고했어요! 잠시 휴식을 취해보세요.</p>
              <button type="button" onClick={() => setShowCompletionModal(false)}
                className="w-full rounded-3xl bg-sky-600 py-3 text-sm font-semibold text-white transition hover:bg-sky-700">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && <ToastMessage message={toastMessage} type={toastType} onClose={() => setToastMessage(null)}/>}
    </div>
  );
}
