"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";

export default function Topbar() {
  const router = useRouter();
  const { user, profile, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
    router.replace("/auth/login");
  };

  return (
    <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">Smart Grade Platform</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">대학생 자기주도 학습 플랫폼</h2>
        </div>
        {user ? (
          <div className="flex items-center gap-3 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <div className="text-right">
              <p>{profile?.name ?? user.email}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{profile?.role === "admin" ? "관리자" : "일반 회원"}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <Link href="/auth/login" className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-sky-400 dark:hover:bg-slate-700">
            로그인
          </Link>
        )}
      </div>
    </header>
  );
}
