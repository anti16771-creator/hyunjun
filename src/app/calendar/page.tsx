"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import {
  createExamEvent,
  createExamStrategy,
  getExamEvents,
  getPlannerItems,
  getUserTimetable,
  getUserTimetableSubjects,
  togglePlannerCompleted,
} from "@/src/lib/supabase";
import { dayDiff, ddayColor, ddayLabel } from "@/src/lib/dateUtils";

// ─── Types ────────────────────────────────────────────────────────────────────
type PlannerItem = { id: string; title: string; due_date: string; is_completed: boolean };
type ScheduleItem = { id: string; subject: string; weekday: number; period: string };
type ExamEvent = {
  id: string;
  subject_name: string;
  exam_type: "midterm" | "final" | "quiz" | "study";
  exam_date: string;
  exam_range: string;
  notes: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const EXAM_TYPE_KR: Record<string, string> = {
  midterm: "중간고사",
  final:   "기말고사",
  quiz:    "퀴즈",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

function formatTimeLabel(dateTime: string) {
  try {
    return new Date(dateTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  } catch { return "--:--"; }
}


// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { user, loading: authLoading } = useAuth();

  // Data
  const [planner, setPlanner]       = useState<PlannerItem[]>([]);
  const [schedule, setSchedule]     = useState<ScheduleItem[]>([]);
  const [examEvents, setExamEvents] = useState<ExamEvent[]>([]);
  const [timetableSubjects, setTimetableSubjects] = useState<string[]>([]);

  // Navigation
  const todayDate = useMemo(() => new Date(), []);
  const todayKey  = useMemo(() => formatDateKey(todayDate), [todayDate]);
  const [currentYear, setCurrentYear]   = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");

  // Selection
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));

  // Modal
  const [modalOpen, setModalOpen]       = useState(false);
  const [subjectName, setSubjectName]   = useState("");
  const [subjectMode, setSubjectMode]   = useState<"select" | "direct">("select");
  const [examType, setExamType]         = useState("midterm");
  const [examDate, setExamDate]         = useState("");
  const [examTime, setExamTime]         = useState("");
  const [examRange, setExamRange]       = useState("");
  const [examNotes, setExamNotes]       = useState("");
  const [syncToGrades, setSyncToGrades] = useState(true);
  const [error, setError]               = useState("");

  // Async
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType]       = useState<"success" | "error">("success");

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // ─── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [plannerR, scheduleR, examR] = await Promise.all([
        getPlannerItems(user.id),
        getUserTimetable(user.id),
        getExamEvents(user.id),
      ]);
      if (!plannerR.error)  setPlanner(plannerR.data ?? []);
      if (!scheduleR.error) setSchedule(scheduleR.data ?? []);
      if (!examR.error)     setExamEvents(examR.data ?? []);
    } catch {
      showToast("데이터를 불러오는 중 오류가 발생했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchData();
    getUserTimetableSubjects(user.id).then((res) => {
      if (!res.error) {
        const list = Array.from(
          new Set((res.data ?? []).map((i: { subject: string }) => i.subject).filter(Boolean))
        ) as string[];
        setTimetableSubjects(list);
      }
    });
  }, [user]);

  // ─── Navigation ─────────────────────────────────────────────────────────────
  const goToPrev = () => {
    if (calendarView === "month") {
      if (currentMonth === 0) { setCurrentYear((y) => y - 1); setCurrentMonth(11); }
      else setCurrentMonth((m) => m - 1);
    } else {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 7);
      setSelectedDate(formatDateKey(d));
    }
  };
  const goToNext = () => {
    if (calendarView === "month") {
      if (currentMonth === 11) { setCurrentYear((y) => y + 1); setCurrentMonth(0); }
      else setCurrentMonth((m) => m + 1);
    } else {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + 7);
      setSelectedDate(formatDateKey(d));
    }
  };
  const goToToday = () => {
    const t = new Date();
    setCurrentYear(t.getFullYear());
    setCurrentMonth(t.getMonth());
    setSelectedDate(formatDateKey(t));
  };

  const navLabel = useMemo(() => {
    if (calendarView === "month") return `${currentYear}년 ${currentMonth + 1}월`;
    const base = new Date(`${selectedDate}T00:00:00`);
    const dow = base.getDay();
    const start = new Date(base); start.setDate(base.getDate() - dow);
    const end   = new Date(base); end.setDate(base.getDate() + (6 - dow));
    const sm = start.getMonth() + 1, sd = start.getDate();
    const em = end.getMonth()   + 1, ed = end.getDate();
    return sm === em ? `${sm}월 ${sd}일 – ${ed}일` : `${sm}월 ${sd}일 – ${em}월 ${ed}일`;
  }, [calendarView, currentYear, currentMonth, selectedDate]);

  // ─── Computed calendar data ──────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const lastDay  = new Date(currentYear, currentMonth + 1, 0).getDate();
    return Array.from({ length: firstDay + lastDay }, (_, i) => {
      const day = i - firstDay + 1;
      if (day <= 0) return null;
      const date = new Date(currentYear, currentMonth, day);
      const key  = formatDateKey(date);
      const tasks = planner.filter((t) => t.due_date === key);
      const exams = examEvents.filter((e) => formatDateKey(new Date(e.exam_date)) === key);
      return { date, key, tasks, exams };
    });
  }, [planner, examEvents, currentYear, currentMonth]);

  const weekDays = useMemo(() => {
    const base = new Date(`${selectedDate}T00:00:00`);
    const dow  = base.getDay();
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(base);
      date.setDate(base.getDate() - dow + i);
      const key = formatDateKey(date);
      return {
        date, key,
        tasks: planner.filter((t) => t.due_date === key),
        exams: examEvents.filter((e) => formatDateKey(new Date(e.exam_date)) === key),
      };
    });
  }, [selectedDate, planner, examEvents]);

  const selectedTasks = useMemo(() => planner.filter((t) => t.due_date === selectedDate), [planner, selectedDate]);
  const selectedExams = useMemo(() => examEvents.filter((e) => e.exam_type !== "study" && formatDateKey(new Date(e.exam_date)) === selectedDate), [examEvents, selectedDate]);
  const selectedStudyPlans = useMemo(() => examEvents.filter((e) => e.exam_type === "study" && formatDateKey(new Date(e.exam_date)) === selectedDate), [examEvents, selectedDate]);

  const upcomingItems = useMemo(() => {
    const tasks = planner.filter((t) => !t.is_completed).map((t) => ({
      id: t.id, type: "과제" as const, title: t.title,
      days: dayDiff(t.due_date),
    }));
    const exams = examEvents.map((e) => ({
      id: e.id,
      type: (e.exam_type === "study" ? "공부계획" : "시험") as "시험" | "공부계획",
      title: e.subject_name,
      days: dayDiff(e.exam_date),
    }));
    return [...tasks, ...exams]
      .filter((item) => item.days >= 0)        // D+1 이상 제외
      .sort((a, b) => a.days - b.days)
      .slice(0, 5);
  }, [planner, examEvents]);

  // ─── Modal helpers ───────────────────────────────────────────────────────────
  const openModalWithDate = useCallback((dateKey: string) => {
    setExamDate(dateKey);
    setSubjectName(""); setSubjectMode("select"); setExamType("midterm");
    setExamTime(""); setExamRange(""); setExamNotes(""); setSyncToGrades(true); setError("");
    setModalOpen(true);
  }, []);

  const handleCloseModal = () => {
    setModalOpen(false);
    setSubjectName(""); setSubjectMode("select"); setExamType("midterm");
    setExamDate(""); setExamTime(""); setExamRange(""); setExamNotes(""); setSyncToGrades(true); setError("");
  };

  const handleCellClick = (key: string, hasEvents: boolean) => {
    setSelectedDate(key);
    if (!hasEvents) openModalWithDate(key);
  };

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleToggleTask = async (id: string, isCompleted: boolean) => {
    if (!user) return;
    const res = await togglePlannerCompleted(id, !isCompleted);
    if (!res.error) {
      await fetchData();
      showToast(isCompleted ? "미완료로 변경했습니다." : "과제 완료! 🎉", "success");
    } else {
      showToast("상태 변경에 실패했습니다.", "error");
    }
  };

  const handleExamSubmit = async () => {
    if (!user) { setError("로그인이 필요합니다."); return; }
    const name = subjectName.trim();
    if (!name || !examDate || !examTime) { setError("과목명, 날짜, 시간을 모두 입력해주세요."); return; }
    const examDateTime = new Date(`${examDate}T${examTime}`);
    if (isNaN(examDateTime.getTime())) { setError("유효한 시험 일시를 선택해주세요."); return; }

    setSaving(true);
    try {
      const res = await createExamEvent({
        user_id: user.id,
        subject_name: name,
        exam_type: examType as "midterm" | "final" | "quiz",
        exam_date: examDate,
        exam_range: examRange.trim(),
        notes: examNotes.trim(),
      });
      if (res.error) {
        setError(res.error.message);
        showToast("시험 등록에 실패했습니다.", "error");
      } else {
        // 성적 관리 자동 연동 (중간/기말만)
        if (syncToGrades && (examType === "midterm" || examType === "final")) {
          await createExamStrategy({
            user_id: user.id,
            exam_type: examType as "midterm" | "final",
            subject_name: name,
            is_major: true,
            credits: 3,
            study_range: examRange.trim() || "캘린더에서 등록된 시험",
            my_score: null,
            average_score: null,
          });
        }
        handleCloseModal();
        await fetchData();
        showToast("시험 일정이 등록되었습니다.", "success");
      }
    } catch {
      showToast("오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return <LoadingCard />;

  // ─── Calendar cell renderer ──────────────────────────────────────────────────
  const renderMonthCell = (item: NonNullable<typeof calendarDays[number]>) => {
    const isToday    = item.key === todayKey;
    const isSelected = item.key === selectedDate;
    const hasEvents  = item.tasks.length + item.exams.length > 0;
    const totalVisible = Math.min(item.tasks.length + item.exams.length, 2);
    const overflow = item.tasks.length + item.exams.length - totalVisible;
    const visibleTasks = item.tasks.slice(0, Math.min(item.tasks.length, 2));
    const visibleExams = item.exams.slice(0, Math.max(0, 2 - visibleTasks.length));

    return (
      <button
        key={item.key}
        type="button"
        onClick={() => handleCellClick(item.key, hasEvents)}
        className={`group flex min-h-[100px] flex-col gap-1 rounded-2xl border p-2 text-left text-sm transition ${
          isToday
            ? "border-sky-500 bg-sky-600 text-white"
            : isSelected
            ? "border-slate-900 bg-slate-50 dark:border-slate-400 dark:bg-slate-800"
            : "border-gray-100 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-600"
        }`}
      >
        <span className={`text-sm font-bold ${isToday ? "text-white" : isSelected ? "text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"}`}>
          {item.date.getDate()}
        </span>
        <div className="flex flex-col gap-0.5 overflow-hidden">
          {visibleTasks.map((t) => (
            <span key={t.id} className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${isToday ? "bg-sky-500 text-white" : "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"}`}>
              {t.title}
            </span>
          ))}
          {visibleExams.map((e) => (
            <span key={e.id} className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${
              e.exam_type === "study"
                ? isToday ? "bg-emerald-400 text-white" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                : isToday ? "bg-pink-400 text-white" : "bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300"
            }`}>
              {e.subject_name}
            </span>
          ))}
          {overflow > 0 && (
            <span className={`text-[10px] font-semibold ${isToday ? "text-sky-200" : "text-slate-400"}`}>
              +{overflow}개 더
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── 헤더 ────────────────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">📅 캘린더</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">과제 & 시험 일정</h1>
          </div>
          <button
            type="button"
            onClick={() => { setExamDate(""); openModalWithDate(todayKey); setExamDate(""); }}
            className="inline-flex items-center justify-center rounded-full bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            + 시험 등록
          </button>
        </div>
      </section>

      {/* ── 캘린더 + 사이드바 ──────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">

        {/* ── 캘린더 패널 ─────────────────────────────────── */}
        <div className="rounded-[2rem] bg-white p-6 shadow-sm dark:bg-slate-900">
          {/* 네비게이션 바 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 범례 (좌측) */}
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> 과제</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pink-500" /> 시험</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> AI 공부</span>
            </div>

            {/* 월/주 네비게이션 (중앙) */}
            <div className="flex flex-1 items-center justify-center gap-2">
              <button type="button" onClick={goToPrev}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="min-w-[120px] text-center text-sm font-semibold text-slate-900 dark:text-slate-100">{navLabel}</span>
              <button type="button" onClick={goToNext}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <button type="button" onClick={goToToday}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                오늘로
              </button>
            </div>

            {/* 뷰 토글 */}
            <div className="flex overflow-hidden rounded-full border border-slate-200 p-0.5 dark:border-slate-700">
              {(["month", "week"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setCalendarView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${calendarView === v ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:text-slate-900 dark:text-slate-400"}`}>
                  {v === "month" ? "월간" : "주간"}
                </button>
              ))}
            </div>
          </div>

          {/* ─ 월간 뷰 ─ */}
          {calendarView === "month" && (
            <>
              <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
              </div>
              <div className="mt-2 grid min-h-[480px] grid-cols-7 gap-1">
                {calendarDays.map((item, i) =>
                  item ? renderMonthCell(item) : (
                    <div key={`empty-${i}`} className="min-h-[100px] rounded-2xl" />
                  )
                )}
              </div>
            </>
          )}

          {/* ─ 주간 뷰 ─ */}
          {calendarView === "week" && (
            <>
              <div className="mt-4 grid grid-cols-7 gap-2">
                {weekDays.map(({ date, key, tasks, exams }) => {
                  const isToday    = key === todayKey;
                  const isSelected = key === selectedDate;
                  const hasEvents  = tasks.length + exams.length > 0;
                  return (
                    <div key={key}
                      className={`rounded-2xl border p-3 ${isToday ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30" : isSelected ? "border-slate-900 bg-slate-50 dark:border-slate-500 dark:bg-slate-800" : "border-gray-100 dark:border-slate-800"}`}>
                      <button type="button" onClick={() => handleCellClick(key, hasEvents)}
                        className="w-full text-left">
                        <p className="text-xs text-gray-400 dark:text-slate-500">{WEEKDAYS[date.getDay()]}</p>
                        <p className={`mt-0.5 text-lg font-bold ${isToday ? "text-sky-600 dark:text-sky-400" : "text-slate-800 dark:text-slate-200"}`}>
                          {date.getDate()}
                        </p>
                      </button>
                      <div className="mt-2 flex flex-col gap-1">
                        {tasks.map((t) => (
                          <span key={t.id} className="truncate rounded px-1 py-0.5 text-[10px] font-medium bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                            {t.title}
                          </span>
                        ))}
                        {exams.map((e) => (
                          <span key={e.id} className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                            e.exam_type === "study"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : "bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300"
                          }`}>
                            {e.subject_name}
                          </span>
                        ))}
                        {!hasEvents && (
                          <button type="button" onClick={() => openModalWithDate(key)}
                            className="mt-1 rounded px-1 py-0.5 text-[10px] text-slate-400 hover:text-sky-600 dark:text-slate-600">
                            + 추가
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── 사이드바 ─────────────────────────────────────── */}
        <div className="space-y-5">
          {/* 선택한 날짜 일정 */}
          <div className="rounded-[2rem] bg-white p-6 shadow-sm dark:bg-slate-900">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">선택한 날짜</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {formatDisplayDate(selectedDate)}
            </p>

            <div className="mt-5 space-y-5">
              {/* AI 공부 계획 */}
              {selectedStudyPlans.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI 공부 계획</p>
                  <div className="mt-3 space-y-3">
                    {selectedStudyPlans.map((plan) => (
                      <div key={plan.id} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{plan.subject_name}</p>
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">AI 공부</span>
                        </div>
                        {plan.exam_range ? <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">{plan.exam_range}</p> : null}
                        {plan.notes      ? <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">예상 시간: {plan.notes}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 시험 일정 */}
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">시험 일정</p>
                {selectedExams.length ? (
                  <div className="mt-3 space-y-3">
                    {selectedExams.map((exam) => (
                      <div key={exam.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{exam.subject_name}</p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                              {EXAM_TYPE_KR[exam.exam_type] ?? exam.exam_type}
                            </p>
                          </div>
                          <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-700 dark:bg-pink-950/40 dark:text-pink-300">시험</span>
                        </div>
                        <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">시간: {formatTimeLabel(exam.exam_date)}</p>
                        {exam.exam_range ? <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">범위: {exam.exam_range}</p> : null}
                        {exam.notes       ? <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">메모: {exam.notes}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">등록된 시험이 없습니다.</p>
                )}
              </div>

              {/* 플래너 과제 — 체크박스로 완료 처리 */}
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">플래너 과제</p>
                {selectedTasks.length ? (
                  <div className="mt-3 space-y-2">
                    {selectedTasks.map((task) => (
                      <div key={task.id}
                        className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                        <input
                          type="checkbox"
                          checked={task.is_completed}
                          onChange={() => handleToggleTask(task.id, task.is_completed)}
                          className="h-4 w-4 flex-shrink-0 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className={`flex-1 text-sm font-medium ${task.is_completed ? "line-through text-gray-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
                          {task.title}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${task.is_completed ? "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400" : "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"}`}>
                          {task.is_completed ? "완료" : "미완료"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">등록된 과제가 없습니다.</p>
                )}
              </div>
            </div>
          </div>

          {/* D-Day 임박 목록 */}
          <div className="rounded-[2rem] bg-white p-6 shadow-sm dark:bg-slate-900">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">⚠️ D-Day 임박</p>
            {upcomingItems.length ? (
              <div className="mt-4 space-y-3">
                {upcomingItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                    <div>
                      <p className="text-xs font-semibold text-gray-400 dark:text-slate-500">{item.type}</p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
                    </div>
                    <span className={`text-sm font-bold ${ddayColor(item.days)}`}>
                      {ddayLabel(item.days)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">임박한 일정이 없습니다.</p>
            )}
          </div>

          {/* 이번 달 시간표 */}
          <div className="rounded-[2rem] bg-white p-6 shadow-sm dark:bg-slate-900">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">이번 달 시간표</p>
            {loading ? (
              <div className="mt-4 space-y-2">
                {[1,2,3].map((i) => <div key={i} className="h-12 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-700" />)}
              </div>
            ) : schedule.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">등록된 시간표가 없습니다.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {schedule.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{item.subject}</p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                        {WEEKDAYS[item.weekday]}요일 · {item.period}
                      </p>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                      {WEEKDAYS[item.weekday]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── 시험 등록 모달 ────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">시험 등록</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">시험 일정을 등록하면 달력에 핑크 도트로 표시됩니다.</p>
              </div>
              <button type="button" onClick={handleCloseModal}
                className="rounded-full px-3 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 dark:hover:bg-slate-800">
                닫기
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              {/* 과목명 — 시간표 드롭다운 */}
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">과목명 *</span>
                {timetableSubjects.length > 0 ? (
                  <div className="relative mt-2">
                    <select
                      value={subjectMode === "direct" ? "__direct__" : subjectName}
                      onChange={(e) => {
                        if (e.target.value === "__direct__") { setSubjectMode("direct"); setSubjectName(""); }
                        else { setSubjectMode("select"); setSubjectName(e.target.value); }
                      }}
                      className="w-full appearance-none rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 pr-10 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="">과목을 선택하세요</option>
                      {timetableSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
                      <option value="__direct__">✏️ 직접 입력</option>
                    </select>
                    <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                ) : null}
                {(subjectMode === "direct" || timetableSubjects.length === 0) && (
                  <input
                    value={subjectName}
                    onChange={(e) => setSubjectName(e.target.value)}
                    autoFocus={subjectMode === "direct"}
                    placeholder="과목명을 입력하세요"
                    className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                )}
                {timetableSubjects.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">시간표에 등록된 과목이 없습니다. 과목명을 직접 입력하세요.</p>
                )}
              </label>

              {/* 시험 종류 */}
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">시험 종류</span>
                <select value={examType} onChange={(e) => setExamType(e.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  <option value="midterm">중간고사</option>
                  <option value="final">기말고사</option>
                  <option value="quiz">퀴즈</option>
                </select>
              </label>

              {/* 날짜 + 시간 */}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">시험 날짜 *</span>
                  <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">시험 시간 *</span>
                  <input type="time" value={examTime} onChange={(e) => setExamTime(e.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                </label>
              </div>

              {/* 시험 범위 */}
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">시험 범위</span>
                <textarea value={examRange} onChange={(e) => setExamRange(e.target.value)} rows={3}
                  className="mt-2 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
              </label>

              {/* 메모 */}
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">메모</span>
                <textarea value={examNotes} onChange={(e) => setExamNotes(e.target.value)} rows={2}
                  className="mt-2 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
              </label>

              {/* 성적 관리 연동 토글 */}
              {(examType === "midterm" || examType === "final") && (
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
                  <input
                    type="checkbox"
                    checked={syncToGrades}
                    onChange={(e) => setSyncToGrades(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">성적 관리 페이지에 자동 연동</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">등록 시 성적 관리 → 시험 전략에 자동으로 추가됩니다.</p>
                  </div>
                </label>
              )}

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}

              <div className="mt-2 flex justify-end gap-3">
                <button type="button" onClick={handleCloseModal}
                  className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  취소
                </button>
                <button type="button" onClick={handleExamSubmit} disabled={saving}
                  className="rounded-2xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
                  등록하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMessage ? <ToastMessage message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} /> : null}
    </div>
  );
}
