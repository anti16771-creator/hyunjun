"use client";

import { useState } from "react";
import { findProfilesByName } from "@/src/lib/supabase";
import Link from "next/link";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  const visible = local.slice(0, 1);
  const hidden = "*".repeat(Math.max(local.length - 1, 3));
  return `${visible}${hidden}@${domain}`;
}

export default function FindIdPage() {
  const [name, setName] = useState("");
  const [results, setResults] = useState<Array<{ name: string; email: string; created_at: string }>>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    const response = await findProfilesByName(name.trim());
    setLoading(false);

    if (response.error) {
      setError(response.error.message);
      return;
    }

    if (!response.data || (Array.isArray(response.data) && response.data.length === 0)) {
      setResults([]);
      setMessage("이름과 일치하는 회원을 찾을 수 없습니다.");
      return;
    }

    setResults(response.data as Array<{ name: string; email: string; created_at: string }>);
  };

  return (
    <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-10 shadow-sm dark:bg-slate-900">
      <div className="space-y-4">
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">아이디 찾기</p>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">가입한 이름으로 이메일을 찾아보세요</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">가입 시 입력한 이름을 입력하면, 해당 계정의 이메일 일부를 보여드립니다.</p>
      </div>

      <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">이름</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
          {loading ? "검색 중..." : "아이디 찾기"}
        </button>
      </form>

      {results.length > 0 ? (
        <div className="mt-10 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 bg-slate-100 px-6 py-4 text-sm font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            <span>이름</span>
            <span>이메일</span>
            <span>가입일</span>
          </div>
          <div className="space-y-2 px-6 py-4">
            {results.map((item) => (
              <div key={`${item.name}-${item.email}`} className="grid grid-cols-[1fr_1fr_1fr] gap-4 rounded-3xl bg-white px-4 py-4 text-sm text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
                <span>{item.name}</span>
                <span>{maskEmail(item.email)}</span>
                <span>{new Date(item.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-10 flex flex-col gap-3 text-sm text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>계정이 기억나지 않으면 비밀번호 찾기를 이용하세요.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/auth/login" className="rounded-3xl bg-slate-100 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-200 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">
            로그인으로 이동
          </Link>
          <Link href="/auth/forgot" className="rounded-3xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
            비밀번호 찾기
          </Link>
        </div>
      </div>
    </div>
  );
}
