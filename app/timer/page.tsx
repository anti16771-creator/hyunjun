"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MetricCard from "@/src/components/MetricCard";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import {
  createStudyLog,
  deleteStudyLog,
  getStudyLogs,
  getUserTimetableSubjects,
} from "@/src/lib/supabase";

const FOCUS_DURATION = 25 * 60;
const BREAK_DURATION = 5 * 60;

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatHHMMSS(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTimeLabel(value?: string) {
  if (!value) return "--:--";
  try {
    return new Date(value).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--:--";
  }
}

export default function TimerPage() {
  const { user, loading: authLoading } = useAuth();
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [pomodoroMode, setPomodoroMode] = useState(false);
  const [sessionType, setSessionType] = useState<"focus" | "break">("focus");
  const [pomodoroSeconds, setPomodoroSeconds] = useState(FOCUS_DURATION);
  const [accumulatedFocusSeconds, setAccumulatedFocusSeconds] = useState(0);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [logs, setLogs] = useState<{
    id: string;
    date: string;
    minutes: number;
    subject: string;
    duration_seconds?: number;
    created_at?: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");
  const [timerRunning, setTimerRunning] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToastMessage(message);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  };

  const timerRef = useRef<number | null>(null);
  const sessionTypeRef = useRef(sessionType);
  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  useEffect(() => {
    sessionTypeRef.current = sessionType;
  }, [sessionType]);

  const fetchSubjects = async () => {
    if (!user) return;
    const response = await getUserTimetableSubjects(user.id);
    if (response.error) {
      setError(response.error.message);
      setSubjects([]);
      return;
    }

    const uniqueSubjects = Array.from(
      new Set((response.data ?? []).map((item: { subject: string }) => item.subject).filter(Boolean)),
    );
    setSubjects(uniqueSubjects);
    if (!selectedSubject && uniqueSubjects.length > 0) {
      setSelectedSubject(uniqueSubjects[0]);
    }
  };

  const fetchLogs = async () => {
    if (!user) return;
    setLoading(true);
    const response = await getStudyLogs(user.id);
    if (response.error) {
      setError(response.error.message);
      setLogs([]);
    } else {
      setError("");
      setLogs(response.data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchSubjects();
    fetchLogs();
  }, [user]);

  const getSessionDisplay = () => {
    return pomodoroMode ? formatTime(pomodoroSeconds) : formatTime(timerSeconds);
  };

  const todaySeconds = useMemo(
    () =>
      logs
        .filter((item) => item.date === todayKey)
        .reduce((sum, item) => sum + (item.duration_seconds ?? item.minutes * 60), 0),
    [logs, todayKey],
  );

  const todayRecords = useMemo(
    () => logs.filter((item) => item.date === todayKey),
    [logs, todayKey],
  );

  const resetTimer = () => {
    setTimerRunning(false);
    setTimerSeconds(0);
    setPomodoroSeconds(FOCUS_DURATION);
    setSessionType("focus");
    setAccumulatedFocusSeconds(0);
  };

  useEffect(() => {
    if (!timerRunning) return;

    timerRef.current = window.setInterval(() => {
      if (pomodoroMode) {
        setPomodoroSeconds((prev) => {
          if (prev <= 1) {
            setSessionType((current) => {
              const next = current === "focus" ? "break" : "focus";
              return next;
            });
            setAccumulatedFocusSeconds((curr) => curr + 1);
            return sessionTypeRef.current === "focus" ? BREAK_DURATION : FOCUS_DURATION;
          }
          if (sessionTypeRef.current === "focus") {
            setAccumulatedFocusSeconds((curr) => curr + 1);
          }
          return prev - 1;
        });
        return;
      }

      setTimerSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [timerRunning, pomodoroMode]);

  const handleSave = async () => {
    if (authLoading) {
      setError("인증 정보를 불러오는 중입니다. 잠시만 기다려주세요.");
      showToast("인증 정보를 불러오는 중입니다.", "error");
      return;
    }
    if (!user) {
      setError("로그인이 필요합니다.");
      showToast("로그인이 필요합니다.", "error");
      return;
    }
    const duration = pomodoroMode ? accumulatedFocusSeconds : timerSeconds;
    if (duration === 0) {
      setError("저장할 집중 시간이 없습니다.");
      showToast("저장할 집중 시간이 없습니다.", "error");
      return;
    }
    if (!selectedSubject) {
      setError("먼저 집중 과목을 선택하세요.");
      showToast("먼저 집중 과목을 선택하세요.", "error");
      return;
    }

    setSaving(true);
    const response = await createStudyLog({
      user_id: user.id,
      subject: selectedSubject,
      duration_seconds: duration,
      minutes: Math.round(duration / 60) || 1,
      date: todayKey,
    });

    if (response.error) {
      console.error("createStudyLog error", response.error);
      setError(response.error.message);
      showToast("집중 기록 저장에 실패했습니다.", "error");
    } else {
      await fetchLogs();
      resetTimer();
      setError("");
      showToast("집중 기록이 저장되었습니다.", "success");
    }
    setSaving(false);
  };

  const handleDeleteRecord = async (id: string) => {
    if (authLoading) {
      setError("인증 정보를 불러오는 중입니다. 잠시만 기다려주세요.");
      showToast("인증 정보를 불러오는 중입니다.", "error");
      return;
    }
    if (!user) {
      setError("로그인이 필요합니다.");
      showToast("로그인이 필요합니다.", "error");
      return;
    }
    setSaving(true);
    const response = await deleteStudyLog(id);
    if (response.error) {
      console.error("deleteStudyLog error", response.error);
      setError(response.error.message);
      showToast("집중 기록 삭제에 실패했습니다.", "error");
    } else {
      await fetchLogs();
      setError("");
      showToast("집중 기록이 삭제되었습니다.", "success");
    }
    setSaving(false);
  };

  const sessionSubtitle = pomodoroMode
    ? sessionType === "focus"
      ? "25분 집중 세션"
      : "5분 휴식 세션"
    : "스톱워치 모드";

  if (authLoading) {
    return <LoadingCard />;
  }

  if (!user) {
    return (
      <div className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <p className="text-base text-slate-600 dark:text-slate-300">로그인 후 뽀모도로 타이머를 사용해주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">⏱️ 뽀모도로 타이머</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">오늘의 집중 세션</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">타이머를 시작하면 현재 세션이 자동으로 흐릅니다.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">오늘 {todayKey}</span>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <MetricCard label="현재 세션" value={getSessionDisplay()} description={sessionSubtitle} />
          <MetricCard label="오늘 누적 집중" value={formatHHMMSS(todaySeconds)} description="오늘 저장된 지표가 실시간 업데이트 됩니다." />
          <MetricCard label="선택된 과목" value={selectedSubject || "과목을 선택하세요"} />
        </div>

        <div className="mt-8 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">집중 과목</label>
              {subjects.length > 0 ? (
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {subjects.map((subjectOption) => (
                    <option key={subjectOption} value={subjectOption}>
                      {subjectOption}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="시간표에 과목이 없습니다. 과목을 등록해주세요."
                />
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setPomodoroMode((prev) => !prev);
                  if (!pomodoroMode) {
                    setSessionType("focus");
                    setPomodoroSeconds(FOCUS_DURATION);
                    setAccumulatedFocusSeconds(0);
                  }
                }}
                className={`rounded-3xl px-6 py-4 text-sm font-semibold transition ${pomodoroMode ? "bg-sky-600 text-white hover:bg-sky-700" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"}`}
              >
                {pomodoroMode ? "Pomodoro 모드 ON" : "Pomodoro 모드 OFF"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setTimerRunning((prev) => !prev)}
            className="rounded-3xl bg-sky-600 px-6 py-4 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            {timerRunning ? "일시정지" : "시작"}
          </button>
          <button
            type="button"
            onClick={resetTimer}
            className="rounded-3xl border border-slate-300 bg-white px-6 py-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (pomodoroMode ? accumulatedFocusSeconds === 0 : timerSeconds === 0)}
            className="rounded-3xl bg-emerald-600 px-6 py-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            저장하기
          </button>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      </div>

      <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">오늘 집중 기록</p>
            <p className="mt-2 text-base text-slate-600 dark:text-slate-400">저장된 공부 기록을 최신순 타임라인으로 확인하세요.</p>
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <LoadingCard />
          ) : todayRecords.length === 0 ? (
            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              오늘 저장된 집중 기록이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {todayRecords.map((item) => {
                const duration = item.duration_seconds ?? item.minutes * 60;
                const minutes = Math.floor(duration / 60);
                const seconds = duration % 60;
                return (
                  <div key={item.id} className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">🔥 {item.subject} - {minutes}분 {String(seconds).padStart(2, "0")}초 집중 완료!</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">저장 시간 {formatTimeLabel(item.created_at)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRecord(item.id)}
                        className="self-start rounded-3xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/40 dark:text-rose-300"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
          {toastMessage ? <ToastMessage message={toastMessage} type={toastType} /> : null}
      </section>
    </div>
  );
}
