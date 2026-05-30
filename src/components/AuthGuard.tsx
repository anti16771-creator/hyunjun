"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <p className="text-sm text-slate-500 dark:text-slate-400">인증 상태를 확인 중입니다...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function AdminGuard({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace("/auth/login");
      } else if (profile?.role !== "admin") {
        router.replace("/");
      }
    }
  }, [user, profile, loading, router]);

  if (loading || !user || profile?.role !== "admin") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <p className="text-sm text-slate-500 dark:text-slate-400">관리자 권한을 확인 중입니다...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
