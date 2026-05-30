"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("smartgrade_dark_mode");
    if (storedTheme) {
      setDarkMode(JSON.parse(storedTheme));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("smartgrade_dark_mode", JSON.stringify(darkMode));
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">⚙️ 설정</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">개인 맞춤 설정</h1>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">다크 모드</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">앱 전체에 어두운 테마를 적용합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setDarkMode((prev) => !prev)}
                className={`rounded-full px-5 py-3 text-sm font-semibold transition ${darkMode ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
              >
                {darkMode ? "켜짐" : "꺼짐"}
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">알림</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">집중 타이머 완료 알림을 받을지 선택하세요.</p>
              </div>
              <button
                type="button"
                onClick={() => setNotifications((prev) => !prev)}
                className={`rounded-full px-5 py-3 text-sm font-semibold transition ${notifications ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
              >
                {notifications ? "사용" : "중지"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
