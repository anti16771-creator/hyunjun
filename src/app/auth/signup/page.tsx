"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPassword, signUpWithEmail } from "@/src/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    const response = await signUpWithEmail(email, password, name);

    if (response.error) {
      setError(response.error.message);
      setLoading(false);
      return;
    }

    const session = response.data?.session;
    if (!session) {
      const signInResult = await signInWithPassword(email, password);
      if (signInResult.error) {
        setError(signInResult.error.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    router.push("/");
  };

  return (
    <div className="mx-auto max-w-xl rounded-[2rem] bg-white p-10 shadow-sm dark:bg-slate-900">
      <div className="space-y-4">
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">회원가입</p>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">새 계정을 생성하세요</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">이메일 인증 없이 즉시 가입 및 로그인이 됩니다.</p>
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

        <label className="block">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
            required
            minLength={6}
          />
        </label>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-3xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "가입 중..." : "회원가입"}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-3 text-sm text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>이미 계정이 있나요? 로그인하거나 이름으로 아이디를 찾아보세요.</p>
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
