"use client";

import { useEffect, useMemo, useState } from "react";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import {
  createExamEvent,
  getExamEvents,
  getPlannerItems,
  getUserTimetable,
} from "@/src/lib/supabase";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTimeLabel(dateTime: string) {
  const date = new Date(dateTime);
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function getDayDifference(target: Date) {
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.floor((targetDate.getTime() - startToday.getTime()) / (1000 * 60 * 60 * 24));
}

export default function CalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const [planner, setPlanner] = useState<{ id: string; title: string; due_date: string; is_completed: boolean }[]>([]);
  const [schedule, setSchedule] = useState<{ id: string; subject: string; weekday: number; period: string }[]>([]);
  const [examEvents, setExamEvents] = useState<{
    id: string;
    subject_name: string;
    exam_type: "midterm" | "final" | "quiz";
    exam_date: string;
    exam_range: string;
    notes: string;
  }[]>([]);
  const [selectedDate, setSelectedDate] = useState(formatDateKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [examType, setExamType] = useState("midterm");
  const [examDate, setExamDate] = useState("");
  const [examTime, setExamTime] = useState("");
  const [examRange, setExamRange] = useState("");
  const [examNotes, setExamNotes] = useState("");
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToastMessage(message);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  };

  const monthLabel = useMemo(() => {
    const date = new Date();
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
  }, []);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [plannerResp, scheduleResp, examResp] = await Promise.all([
        getPlannerItems(user.id),
        getUserTimetable(user.id),
        getExamEvents(user.id),
      ]);

      if (plannerResp.error) {
        console.error("getPlannerItems error", plannerResp.error);
        setError(plannerResp.error.message);
        setPlanner([]);
        showToast("플래너 데이터를 불러오는 중 오류가 발생했습니다.", "error");
      } else {
        setPlanner(plannerResp.data ?? []);
        setError("");
      }

      if (scheduleResp.error) {
        console.error("getUserTimetable error", scheduleResp.error);
        setError(scheduleResp.error.message || error);
        setSchedule([]);
        showToast("시간표 데이터를 불러오는 중 오류가 발생했습니다.", "error");
      } else {
        setSchedule(scheduleResp.data ?? []);
        setError("");
      }

      if (examResp.error) {
        console.error("getExamEvents error", examResp.error);
        setError(examResp.error.message || error);
        setExamEvents([]);
        showToast("시험 일정을 불러오는 중 오류가 발생했습니다.", "error");
      } else {
        setExamEvents(examResp.data ?? []);
        setError("");
      }
    } catch (err) {
      console.error("Calendar fetchData error", err);
      setError("캘린더 데이터를 불러오는 중 오류가 발생했습니다.");
      setPlanner([]);
      setSchedule([]);
      setExamEvents([]);
      showToast("캘린더 데이터를 불러오는 중 오류가 발생했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const calendarDays = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: firstDay + lastDay }, (_, index) => {
      const day = index - firstDay + 1;
      if (day <= 0) return null;
      const date = new Date(year, month, day);
      const dateKey = formatDateKey(date);
      const taskCount = planner.filter((item) => item.due_date === dateKey).length;
      const examCount = examEvents.filter((item) => formatDateKey(new Date(item.exam_date)) === dateKey).length;
      return { date, taskCount, examCount };
    });
  }, [planner, examEvents]);

  const selectedTasks = useMemo(
    () => planner.filter((item) => item.due_date === selectedDate),
    [planner, selectedDate],
  );

  const selectedExams = useMemo(
    () => examEvents.filter((item) => formatDateKey(new Date(item.exam_date)) === selectedDate),
    [examEvents, selectedDate],
  );

  const upcomingItems = useMemo(() => {
    const today = new Date();
    const taskItems = planner
      .filter((item) => !item.is_completed)
      .map((item) => ({
        id: item.id,
        type: "과제" as const,
        title: item.title,
        target: item.due_date,
        days: getDayDifference(new Date(item.due_date)),
      }));

    const examItems = examEvents.map((item) => ({
      id: item.id,
      type: "시험" as const,
      title: item.subject_name,
      target: formatDateKey(new Date(item.exam_date)),
      days: getDayDifference(new Date(item.exam_date)),
    }));

    return [...taskItems, ...examItems]
      .sort((a, b) => a.days - b.days)
      .slice(0, 3);
  }, [planner, examEvents]);

  const handleOpenModal = () => {
    setModalOpen(true);
    setError("");
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSubjectName("");
    setExamType("midterm");
    setExamDate("");
    setExamTime("");
    setExamRange("");
    setExamNotes("");
    setError("");
  };

  const handleExamSubmit = async () => {
    if (authLoading) {
      setError("인증 정보를 불러오는 중입니다. 잠시만 기다려주세요.");
      return;
    }
    if (!user) {
      setError("로그인 후에 시험을 등록할 수 있습니다.");
      return;
    }
    if (!subjectName.trim() || !examDate || !examTime) {
      setError("과목명과 시험 날짜 및 시간을 모두 입력해주세요.");
      return;
    }

    const examDateTime = new Date(`${examDate}T${examTime}`);
    if (isNaN(examDateTime.getTime())) {
      setError("유효한 시험 일시를 선택해주세요.");
      return;
    }

    setSaving(true);
    try {
      const response = await createExamEvent({
        user_id: user.id,
        subject_name: subjectName.trim(),
        exam_type: examType as "midterm" | "final" | "quiz",
        exam_date: examDateTime.toISOString().slice(0, 10),
        exam_range: examRange.trim(),
        notes: examNotes.trim(),
      });

      if (response.error) {
        console.error("createExamEvent error", response.error);
        setError(response.error.message);
        showToast("시험 등록에 실패했습니다.", "error");
      } else {
        handleCloseModal();
        await fetchData();
        showToast("시험 일정이 등록되었습니다.", "success");
      }
    } catch (err) {
      console.error("handleExamSubmit error", err);
      setError("시험 일정 등록 중 오류가 발생했습니다.");
      showToast("시험 일정 등록 중 오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return <LoadingCard />;
  }

  return (
    <div className="min-h-screen bg-gray-50/50 px-6 py-8">
      <section className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">📅 캘린더</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">과제 & 시험 일정</h1>
            <p className="mt-3 max-w-2xl text-sm text-gray-500">
              플래너 과제와 자체 시험을 한 화면에서 관리하고, 달력 위에 자동으로 일정을 표시합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenModal}
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            + 시험 등록
          </button>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">{monthLabel}</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
              <span>파란 과제 도트</span>
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-pink-500" />
              <span>핑크 시험 도트</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-[0.24em] text-gray-500">
            {weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="mt-3 grid min-h-[520px] grid-cols-7 gap-2">
            {calendarDays.map((item, index) =>
              item ? (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedDate(formatDateKey(item.date))}
                  className={`group flex h-36 flex-col justify-between rounded-2xl border bg-white p-3 text-left transition ${
                    formatDateKey(item.date) === selectedDate
                      ? "border-slate-900 bg-slate-50"
                      : "border-gray-100 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{item.date.getDate()}</span>
                    <div className="flex items-center gap-1">
                      {item.taskCount > 0 ? <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> : null}
                      {item.examCount > 0 ? <span className="h-2.5 w-2.5 rounded-full bg-pink-500" /> : null}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {item.taskCount ? (
                      <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-700">과제 {item.taskCount}</span>
                    ) : null}
                    {item.examCount ? (
                      <span className="rounded-full bg-pink-50 px-2 py-1 text-[10px] font-semibold text-pink-700">시험 {item.examCount}</span>
                    ) : null}
                  </div>
                </button>
              ) : (
                <div key={index} className="h-36 rounded-2xl bg-transparent" />
              ),
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">선택한 날짜</p>
                <p className="mt-2 text-xl font-semibold text-slate-900">{selectedDate}</p>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">시험 일정</p>
                {selectedExams.length ? (
                  <div className="mt-4 space-y-3">
                    {selectedExams.map((exam) => (
                      <div key={exam.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{exam.subject_name}</p>
                            <p className="mt-1 text-sm text-gray-500">{exam.exam_type === "midterm" ? "중간고사" : exam.exam_type === "final" ? "기말고사" : "퀴즈"}</p>
                          </div>
                          <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-700">시험</span>
                        </div>
                        <p className="mt-3 text-sm text-gray-600">시간: {formatTimeLabel(exam.exam_date)}</p>
                        {exam.exam_range ? <p className="mt-2 text-sm text-gray-600">범위: {exam.exam_range}</p> : null}
                        {exam.notes ? <p className="mt-2 text-sm text-gray-600">메모: {exam.notes}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">해당 날짜에는 등록된 시험이 없습니다.</p>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-900">플래너 과제</p>
                {selectedTasks.length ? (
                  <div className="mt-4 space-y-3">
                    {selectedTasks.map((task) => (
                      <div key={task.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className={`font-semibold ${task.is_completed ? "text-gray-400 line-through" : "text-slate-900"}`}>{task.title}</p>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${task.is_completed ? "bg-gray-200 text-gray-500" : "bg-sky-50 text-sky-700"}`}>{task.is_completed ? "완료" : "미완료"}</span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600">마감일: {task.due_date}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">해당 날짜에는 등록된 과제가 없습니다.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">⚠️ 다가오는 마감 임박 D-Day</p>
            {upcomingItems.length ? (
              <div className="mt-5 grid gap-4">
                {upcomingItems.map((item) => (
                  <div key={item.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.type}</p>
                        <p className="mt-1 text-sm text-gray-500">{item.title}</p>
                      </div>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                        {item.days < 0 ? `D+${Math.abs(item.days)}` : item.days === 0 ? "D-0" : `D-${item.days}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500">다가오는 마감 일정이 없습니다.</p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">이번 달 시간표</p>
            {loading ? (
              <LoadingCard />
            ) : schedule.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">등록된 시간표가 없습니다.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {schedule.map((item) => (
                  <div key={item.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{item.subject}</p>
                        <p className="mt-1 text-sm text-gray-500">{weekdays[item.weekday]} · {item.period}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">시험 등록</h2>
                <p className="mt-2 text-sm text-gray-500">시험 일정을 등록하면 달력에 핑크색 도트로 표시됩니다.</p>
              </div>
              <button type="button" onClick={handleCloseModal} className="rounded-full px-3 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100">
                닫기
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="block">
                <span className="text-xs font-medium text-gray-500">과목명</span>
                <input
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-500">시험 종류</span>
                <select
                  value={examType}
                  onChange={(e) => setExamType(e.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="midterm">중간고사</option>
                  <option value="final">기말고사</option>
                  <option value="quiz">퀴즈</option>
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">시험 날짜</span>
                  <input
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">시험 시간</span>
                  <input
                    type="time"
                    value={examTime}
                    onChange={(e) => setExamTime(e.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-gray-500">시험 범위</span>
                <textarea
                  value={examRange}
                  onChange={(e) => setExamRange(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-500">메모</span>
                <textarea
                  value={examNotes}
                  onChange={(e) => setExamNotes(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}

              <div className="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleExamSubmit}
                  disabled={saving}
                  className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  등록하기
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {error && !modalOpen ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      {toastMessage ? <ToastMessage message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} /> : null}
    </div>
  );
}
