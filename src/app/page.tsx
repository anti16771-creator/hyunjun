"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LoadingCard from "@/src/components/LoadingCard";
import MetricCard from "@/src/components/MetricCard";
import ToastMessage from "@/src/components/ToastMessage";
import { AuthGuard } from "@/src/components/AuthGuard";
import { useAuth } from "@/src/context/AuthContext";
import { createTimetableEntry, deleteTimetableEntry, getExamEvents, getPlannerItems, getStudyLogs, getUserTimetable } from "@/src/lib/supabase";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseWeekday(value: string | number): number {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }

  const normalized = String(value).trim();
  const numeric = Number(normalized.replace(/[^0-9]/g, ""));
  if (!Number.isNaN(numeric)) {
    return numeric;
  }

  const mapping: Record<string, number> = {
    일: 0,
    일요일: 0,
    월: 1,
    월요일: 1,
    화: 2,
    화요일: 2,
    수: 3,
    수요일: 3,
    목: 4,
    목요일: 4,
    금: 5,
    금요일: 5,
    토: 6,
    토요일: 6,
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  return mapping[normalized] ?? 0;
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [schedule, setSchedule] = useState<{ id: string; subject: string; weekday: number; period: string }[]>([]);
  const [studyLogs, setStudyLogs] = useState<{ id: string; date: string; minutes: number; subject: string }[]>([]);
  const [subject, setSubject] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [period, setPeriod] = useState("1교시");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [todayAgendaCount, setTodayAgendaCount] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToastMessage(message);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  };
  const todayWeekday = useMemo(() => new Date().getDay(), []);

  const studyBreakdown = useMemo(() => {
    const todayLogs = studyLogs.filter((item) => item.date === todayKey);
    const grouped = todayLogs.reduce<Record<string, number>>((acc, item) => {
      const subject = String(item.subject || "미등록 과목");
      acc[subject] = (acc[subject] ?? 0) + Number(item.minutes || 0);
      return acc;
    }, {});
    return Object.entries(grouped)
      .map(([subject, minutes]) => ({ subject, minutes }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [studyLogs, todayKey]);

  const focusTargetMinutes = 180;
  const todayFocusMinutes = useMemo(
    () => studyLogs.filter((item) => item.date === todayKey).reduce((sum, item) => sum + (item.minutes || 0), 0),
    [studyLogs, todayKey],
  );
  const focusProgress = Math.min(todayFocusMinutes / focusTargetMinutes, 1);
  const focusHours = Math.floor(todayFocusMinutes / 60);
  const focusMinutes = todayFocusMinutes % 60;

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [timetableResult, studyLogResult, plannerResult, examResult] = await Promise.all([
        getUserTimetable(user.id),
        getStudyLogs(user.id),
        getPlannerItems(user.id),
        getExamEvents(user.id),
      ]);

      if (timetableResult.error) {
        console.error("시간표 불러오기 에러:", timetableResult.error);
        setError(timetableResult.error.message);
        setSchedule([]);
        showToast("시간표 데이터를 불러오는 중 오류가 발생했습니다.", "error");
      } else {
        setSchedule(
          (timetableResult.data ?? []).map((item: any) => ({
            id: String(item.id),
            subject: String(item.subject ?? ""),
            weekday: parseWeekday(item.weekday),
            period: String(item.period ?? ""),
          })),
        );
        setError("");
      }

      if (studyLogResult.error) {
        console.error("집중 시간 불러오기 에러:", studyLogResult.error);
        setError(studyLogResult.error.message || error);
        setStudyLogs([]);
        showToast("집중 시간 데이터를 불러오는 중 오류가 발생했습니다.", "error");
      } else {
        setStudyLogs(
          (studyLogResult.data ?? []).map((item: any) => ({
            id: String(item.id),
            date: String(item.date ?? ""),
            minutes: Number(item.minutes ?? 0),
            subject: String(item.subject ?? ""),
          })),
        );
        setError("");
      }

      if (plannerResult.error) {
        console.error("플래너 데이터 불러오기 에러:", plannerResult.error);
      }

      if (examResult.error) {
        console.error("시험 일정 불러오기 에러:", examResult.error);
      }

      const todayString = todayKey;
      const plannerDueCount = (plannerResult.data ?? []).filter(
        (item: any) => String(item.due_date) === todayString,
      ).length;
      const examDueCount = (examResult.data ?? []).filter(
        (item: any) => String(item.exam_date) === todayString,
      ).length;
      setTodayAgendaCount(plannerDueCount + examDueCount);
    } catch (err) {
      console.error("fetchData error", err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
      setSchedule([]);
      setStudyLogs([]);
      setTodayAgendaCount(0);
      showToast("데이터를 불러오는 중 오류가 발생했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setSchedule([]);
      setStudyLogs([]);
      setLoading(false);
      return;
    }

    fetchData();
  }, [user]);

  const handleAddSchedule = async () => {
    if (authLoading) {
      setError("인증 정보를 불러오는 중입니다. 잠시만 기다려주세요.");
      return;
    }
    if (!subject.trim() || !user) {
      setError("로그인 후에 시간표를 저장할 수 있습니다.");
      return;
    }
    setSaving(true);
    try {
      const result = await createTimetableEntry({
        user_id: String(user.id),
        subject: String(subject.trim()),
        weekday: String(weekday),
        period: String(period),
      });
      if (result.error) {
        console.error(
          "createTimetableEntry error",
          result.error?.message,
          result.error?.details,
          result.error?.hint,
          result.error,
        );
        setError(result.error.message || "시간표 저장에 실패했습니다.");
        showToast(result.error.message || "시간표 저장에 실패했습니다.", "error");
      } else {
        setSubject("");
        setWeekday(1);
        setPeriod("1교시");
        if (result.data?.[0]) {
          const inserted = result.data[0] as any;
          setSchedule((prev) => [
            ...prev,
            {
              id: String(inserted.id),
              subject: String(inserted.subject ?? subject.trim()),
              weekday: parseWeekday(inserted.weekday ?? weekday),
              period: String(inserted.period ?? period),
            },
          ]);
        }
        await fetchData();
        setError("");
        showToast("시간표가 정상 저장되었습니다.", "success");
      }
    } catch (catchError) {
      const error = catchError as any;
      console.error("handleAddSchedule error", error?.message, error?.details, error?.hint, error);
      setError(error?.message || "시간표 저장 중 오류가 발생했습니다.");
      showToast(error?.message || "시간표 저장 중 오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (authLoading) {
      setError("인증 정보를 불러오는 중입니다. 잠시만 기다려주세요.");
      return;
    }
    try {
      const result = await deleteTimetableEntry(id);
      if (result.error) {
        console.error("deleteTimetableEntry error", result.error);
        setError(result.error.message);
        showToast("시간표 삭제에 실패했습니다.", "error");
      } else {
        await fetchData();
        showToast("시간표 항목이 삭제되었습니다.", "success");
      }
    } catch (err) {
      console.error("handleDeleteSchedule error", err);
      setError("시간표 삭제 중 오류가 발생했습니다.");
      showToast("시간표 삭제 중 오류가 발생했습니다.", "error");
    }
  };

  const todayClasses = useMemo(() => schedule.filter((item) => item.weekday === todayWeekday).length, [schedule, todayWeekday]);
  const todayMinutes = useMemo(() => studyLogs.filter((item) => item.date === todayKey).reduce((sum, item) => sum + item.minutes, 0), [studyLogs, todayKey]);
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0] as const;

  return (
    <AuthGuard>
      <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">🏠 홈 대시보드</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">학습 일정과 집중 시간을 한눈에</h1>
          </div>
          <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            오늘 {todayKey}
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <MetricCard label="오늘 수업" value={`${todayClasses}개`} description="주간 시간표를 기반으로 자동 집계됩니다." />
          <MetricCard label="집중 시간" value={`${String(Math.floor(todayMinutes / 60)).padStart(2, "0")}:${String(todayMinutes % 60).padStart(2, "0")}`} description="오늘 저장된 집중 시간의 합계입니다." />
          <MetricCard label="오늘 일정" value={`${todayAgendaCount}개`} description="오늘 마감인 과제와 시험 일정의 총 개수입니다." />
        </div>
      </section>

      <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">주간 시간표</p>
            <p className="mt-2 text-base text-slate-600 dark:text-slate-400">현재 로그인된 사용자 기준으로 7일 전체를 보여주는 와이드 캘린더입니다.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">실시간 Supabase 동기화</span>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[2fr_1fr_1fr_0.9fr_1.2fr]">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="과목명을 입력하세요"
            className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {([1, 2, 3, 4, 5, 6, 0] as number[]).map((weekdayValue) => (
              <option key={weekdayValue} value={weekdayValue}>
                {weekdayValue === 0 ? "일요일" : weekdayValue === 1 ? "월요일" : weekdayValue === 2 ? "화요일" : weekdayValue === 3 ? "수요일" : weekdayValue === 4 ? "목요일" : weekdayValue === 5 ? "금요일" : "토요일"}
              </option>
            ))}
          </select>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {Array.from({ length: 10 }, (_, index) => `${index + 1}교시`).map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
          <button
            onClick={handleAddSchedule}
            disabled={saving || !subject.trim()}
            className="rounded-3xl bg-sky-600 px-6 py-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            시간표 저장
          </button>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.65fr_0.95fr]">
          <div className="space-y-6">
            <div className="w-full overflow-x-auto">
              <div className="min-w-[1000px]">
                <div className="grid grid-cols-8 gap-px rounded-[1.5rem] border border-slate-200 bg-slate-200 text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                  <div className="bg-slate-50 px-4 py-4 text-left font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-100">교시</div>
                  {weekdayOrder.map((weekdayValue) => (
                    <div key={weekdayValue} className="bg-slate-50 px-4 py-4 text-center font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-100">
                      {weekdays[weekdayValue]}
                    </div>
                  ))}
                </div>

                <div className="mt-2 space-y-2">
                  {Array.from({ length: 10 }, (_, index) => {
                    const periodIndex = index + 1;
                    const timeLabel = `${periodIndex}교시 ${9 + periodIndex - 1}:00`;
                    return (
                      <div key={`row-${periodIndex}`} className="grid grid-cols-8 gap-px rounded-[1.25rem] overflow-hidden border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800">
                        <div className="bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-100 whitespace-nowrap">
                          <div>{periodIndex}교시</div>
                          <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{timeLabel}</div>
                        </div>
                        {weekdayOrder.map((weekdayValue) => {
                          const cellItems = schedule.filter(
                            (item) => item.weekday === weekdayValue && Number(item.period.replace(/[^0-9]/g, "")) === periodIndex,
                          );
                          return (
                            <div key={`${weekdayValue}-${periodIndex}`} className="min-h-[80px] bg-white p-3 dark:bg-slate-950">
                              {cellItems.length === 0 ? (
                                <div className="flex h-full w-full items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500 whitespace-nowrap">
                                  비어있음
                                </div>
                              ) : (
                                <div className="flex h-full flex-col justify-between space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                  {cellItems.map((item) => (
                                    <div key={item.id} className="flex h-auto flex-col gap-2 rounded-xl bg-white p-3 transition dark:bg-slate-800">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="flex-1 break-keep text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100 whitespace-normal">
                                          {item.subject}
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteSchedule(item.id)}
                                          className="flex-shrink-0 text-sm font-semibold text-rose-600 transition hover:text-rose-700"
                                        >
                                          삭제
                                        </button>
                                      </div>
                                      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                        {weekdays[weekdayValue]} · {item.period}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">오늘의 학습 현황</p>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">오늘 {focusHours}시간 {focusMinutes}분 집중 완료 🔥</h2>
                </div>
                <Link href="/timer" className="inline-flex items-center gap-2 rounded-3xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                  타이머 시작
                </Link>
              </div>
              <div className="mt-6 rounded-3xl bg-slate-100 p-3">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>오늘 목표 {focusTargetMinutes}분</span>
                  <span>{Math.round(focusProgress * 100)}%</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${Math.round(focusProgress * 100)}%` }} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">오늘 공부 로그</p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">과목별 집중 시간을 한눈에 확인합니다.</p>
                </div>
              </div>
              <div className="mt-6 space-y-4">
                {studyBreakdown.length === 0 ? (
                  <p className="text-sm text-slate-500">오늘 기록된 학습 로그가 없습니다.</p>
                ) : (
                  studyBreakdown.map((item) => (
                    <div key={item.subject} className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-slate-700">
                        <span>{item.subject}</span>
                        <span>{item.minutes}분</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-sky-600" style={{ width: `${Math.min((item.minutes / focusTargetMinutes) * 100, 100)}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      </section>
      {toastMessage ? <ToastMessage message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} /> : null}
    </div>
  </AuthGuard>
  );
}
