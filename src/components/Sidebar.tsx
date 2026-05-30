"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";

const baseNavItems = [
  { href: "/", label: "홈 대시보드", icon: "🏠" },
  { href: "/timer", label: "뽀모도로 타이머", icon: "⏱️" },
  { href: "/planner", label: "플래너", icon: "📋" },
  { href: "/grades", label: "성적 관리", icon: "📊" },
  { href: "/calendar", label: "캘린더", icon: "📅" },
  { href: "/archive", label: "아카이브", icon: "📁" },
  { href: "/community", label: "커뮤니티", icon: "💬" },
  { href: "/leaderboard", label: "친구 리더보드", icon: "👥" },
  { href: "/achievements", label: "뱃지 & 레벨", icon: "🏆" },
  { href: "/settings", label: "설정", icon: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const navItems = profile?.role === "admin" ? [...baseNavItems, { href: "/admin", label: "회원 관리", icon: "🛠️" }] : baseNavItems;

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white px-6 py-8 dark:border-slate-800 dark:bg-slate-950 lg:block">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">Smart Grade</p>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">스마트 학점</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">학습, 시간표, 성적을 한 번에</p>
      </div>

      <nav className="mt-10 space-y-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-3xl px-4 py-3 text-sm font-semibold transition ${
                active
                  ? "bg-sky-600 text-white"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
