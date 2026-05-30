"use client";

import { useEffect, useMemo, useState } from "react";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import { createPlannerItem, deletePlannerItem, getPlannerItems, togglePlannerCompleted } from "@/src/lib/supabase";

const statusMap = (days: number) => {
  if (days < 0) {
    return {
      label: "기간 만료",
      badge: "bg-slate-100 text-slate-500 border border-slate-200",
    };
  }
  if (days <= 3) {
    return {
      label: "긴급 (3일 이내)",
      badge: "bg-red-50 text-red-600 border border-red-200",
    };
  }
  if (days <= 7) {
    return {
      label: "보통 (일주일 이내)",
      badge: "bg-orange-50 text-orange-600 border border-orange-200",
    };
  }
  return {
    label: "여유 (일주일 이상)",
    badge: "bg-green-50 text-green-600 border border-green-200",
  };
};

const getDayDifference = (dueDate: string) => {
  const today = new Date();
  const due = new Date(`${dueDate}T00:00:00`);
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.floor((startDue.getTime() - startToday.getTime()) / (1000 * 60 * 60 * 24));
};

export default function PlannerPage() {
  const { user, loading: authLoading } = useAuth();
  const [planner, setPlanner] = useState<{ id: string; title: string; due_date: string; is_completed: boolean }[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToastMessage(message);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchPlanner = async () => {
    if (!user) return;
    setLoading(true);
    const response = await getPlannerItems(user.id);
    if (response.error) {
      setError(response.error.message);
      setPlanner([]);
    } else {
      setPlanner(response.data ?? []);
      setError("");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchPlanner();
  }, [user]);

  const handleAdd = async () => {
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
    if (!title.trim() || !dueDate) {
      setError("과제명과 마감일은 필수 입력입니다.");
      return;
    }
    setSaving(true);
    const response = await createPlannerItem({ user_id: user.id, title: title.trim(), due_date: dueDate });
    if (response.error) {
      console.error("createPlannerItem error", response.error);
      setError(response.error.message);
      showToast("플래너 항목 저장에 실패했습니다.", "error");
    } else {
      setTitle("");
      setDueDate("");
      await fetchPlanner();
      setError("");
      showToast("플래너 항목이 저장되었습니다.", "success");
    }
    setSaving(false);
  };

  const handleToggle = async (id: string, isCompleted: boolean) => {
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
    const response = await togglePlannerCompleted(id, !isCompleted);
    if (response.error) {
      console.error("togglePlannerCompleted error", response.error);
      setError(response.error.message);
      showToast("과제 상태 업데이트에 실패했습니다.", "error");
    } else {
      await fetchPlanner();
      setError("");
      showToast("과제 상태가 업데이트되었습니다.", "success");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
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
    const response = await deletePlannerItem(id);
    if (response.error) {
      console.error("deletePlannerItem error", response.error);
      setError(response.error.message);
      showToast("과제 삭제에 실패했습니다.", "error");
    } else {
      await fetchPlanner();
      setError("");
      showToast("과제가 삭제되었습니다.", "success");
    }
    setSaving(false);
  };

  const upcomingTasks = useMemo(() => planner.filter((item) => !item.is_completed).length, [planner]);

  if (authLoading) {
    return <LoadingCard />;
  }

  if (!user) {
    return (
      <div className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <p className="text-base text-slate-600 dark:text-slate-300">로그인 후 과제 마감일 관리를 시작하세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">📋 플래너</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">과제 마감일 관리</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">과제명과 마감일을 입력하면 Supabase에 저장되고 실시간으로 상태가 반영됩니다.</p>
          </div>
          <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            남은 과제 {upcomingTasks}개
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-[1.8fr_1fr_0.8fr]">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="과제명을 입력하세요"
            className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !title.trim() || !dueDate}
            className="rounded-3xl bg-sky-600 px-6 py-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            과제 추가하기
          </button>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      </section>

      <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">내 플래너</p>
            <p className="mt-2 text-base text-slate-600 dark:text-slate-400">마감일 순으로 정렬된 과제 목록을 확인하세요.</p>
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <LoadingCard />
          ) : planner.length === 0 ? (
            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              저장된 플래너 항목이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {planner.map((item) => {
                const dueDays = getDayDifference(item.due_date);
                const status = statusMap(dueDays);
                const isExpired = dueDays < 0;
                return (
                  <div key={item.id} className="grid gap-4 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5 shadow-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                    <div className="flex flex-col items-center justify-center rounded-[1.75rem] bg-slate-900 px-4 py-3 text-center text-white shadow-sm dark:bg-slate-700">
                      <span className="text-sm font-medium">{isExpired ? "D+" : "D-"}{Math.abs(dueDays)}</span>
                      <span className="mt-1 text-xs text-slate-200">마감까지</span>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className={`text-lg font-semibold ${item.is_completed ? "line-through text-slate-400" : "text-slate-900 dark:text-slate-100"}`}>{item.title}</p>
                        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${item.is_completed ? "bg-slate-100 text-slate-500 border border-slate-200" : status.badge}`}>
                          {item.is_completed ? "완료됨" : status.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">마감일 {item.due_date}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">남은 일수: {dueDays < 0 ? `만료 ${Math.abs(dueDays)}일 전` : `${dueDays}일`}</p>
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600">
                        <input
                          type="checkbox"
                          checked={item.is_completed}
                          onChange={() => handleToggle(item.id, item.is_completed)}
                          className="h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span>{item.is_completed ? "완료" : "미완료"}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="inline-flex items-center gap-2 rounded-3xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-900/50"
                      >
                        <span aria-hidden="true">🗑️</span>
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      {toastMessage ? <ToastMessage message={toastMessage} type={toastType} /> : null}
    </div>
  );
}
