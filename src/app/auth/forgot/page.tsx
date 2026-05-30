"use client";

import Link from "next/link";
import { useState } from "react";
import { sendPasswordResetEmail } from "@/src/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    const response = await sendPasswordResetEmail(email);
    setLoading(false);

    if (response.error) {
      setError(response.error.message);
      setMessage("");
      return;
    }

    setError("");
    setMessage("비밀번호 재설정 이메일을 전송했습니다. 메일함을 확인하세요.");
  };

  return (
    <div className="mx-auto max-w-xl rounded-[2rem] bg-white p-10 shadow-sm dark:bg-slate-900">
      <div className="space-y-4">
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">비밀번호 찾기</p>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">비밀번호를 재설정하세요</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">가입한 이메일로 비밀번호 재설정 링크를 전송합니다.</p>
      </div>

      <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">이메일</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
            required
          />
        </label>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-3xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "전송 중..." : "재설정 메일 전송"}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-3 text-sm text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>아이디를 잊으셨다면 이름으로 아이디 찾기 기능을 사용하세요.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/auth/login" className="rounded-3xl bg-slate-100 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-200 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">
            로그인
          </Link>
          <Link href="/auth/find-id" className="rounded-3xl bg-slate-100 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-200 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">
            아이디 찾기
          </Link>
        </div>
      </div>
    </div>
  );
}
