"use client";

import { useEffect, useState } from "react";
import { AdminGuard } from "@/src/components/AuthGuard";
import { getAllUserProfiles, updateUserRole } from "@/src/lib/supabase";
import type { UserProfile } from "@/src/context/AuthContext";

export default function AdminPage() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadProfiles = async () => {
    setLoading(true);
    const response = await getAllUserProfiles();
    if (response.error) {
      setError(response.error.message);
      setProfiles([]);
    } else {
      setError("");
      setProfiles((response.data ?? []) as UserProfile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const toggleRole = async (profile: UserProfile) => {
    const nextRole = profile.role === "admin" ? "user" : "admin";
    setBusyId(profile.id);
    const response = await updateUserRole(profile.id, nextRole);
    setBusyId(null);

    if (response.error) {
      setError(response.error.message);
      return;
    }

    await loadProfiles();
  };

  return (
    <AdminGuard>
      <div className="space-y-8">
        <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">관리자 회원관리</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">전체 회원 목록</h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">회원의 등급을 직접 변경하고 가입 현황을 관리할 수 있습니다.</p>
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
          {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}
          {loading ? (
            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              회원 목록을 불러오는 중입니다...
            </div>
          ) : (
            <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 shadow-sm dark:border-slate-800">
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-4 bg-slate-100 px-6 py-4 text-sm font-semibold text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                <span>이름</span>
                <span>이메일</span>
                <span>가입일</span>
                <span>권한</span>
              </div>
              <div className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
                {profiles.map((profile) => (
                  <div key={profile.id} className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-4 px-6 py-4 text-sm text-slate-700 dark:text-slate-200">
                    <span>{profile.name}</span>
                    <span>{profile.email}</span>
                    <span>{new Date(profile.created_at).toLocaleDateString()}</span>
                    <button
                      type="button"
                      disabled={busyId === profile.id}
                      onClick={() => toggleRole(profile)}
                      className={`rounded-3xl px-4 py-2 text-sm font-semibold transition ${
                        profile.role === "admin"
                          ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
                          : "bg-sky-100 text-sky-700 hover:bg-sky-200"
                      } ${busyId === profile.id ? "opacity-70 cursor-not-allowed" : ""}`}
                    >
                      {busyId === profile.id ? "처리 중..." : profile.role === "admin" ? "관리자 → 일반" : "일반 → 관리자"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </AdminGuard>
  );
}
