import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Sidebar from "@/src/components/Sidebar";
import Topbar from "@/src/components/Topbar";
import BottomTabBar from "@/src/components/BottomTabBar";
import { AuthProvider } from "@/src/context/AuthContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Smart Grade Platform",
  description: "대학생을 위한 스마트 학점 관리 및 자기주도 학습 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* 다크모드 초기화: localStorage에서 읽어 hydration 전에 클래스 적용 */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(JSON.parse(localStorage.getItem('smartgrade_dark_mode')||'false'))document.documentElement.classList.add('dark')}catch(e){}` }} />
      </head>
      <body className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <AuthProvider>
          <div className="min-h-screen md:grid md:grid-cols-[280px_1fr]">
            <Sidebar />
            <div className="flex min-h-screen flex-col">
              <Topbar />
              <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6 lg:p-8 lg:pb-8">{children}</main>
            </div>
          </div>
          <BottomTabBar />
        </AuthProvider>
      </body>
    </html>
  );
}
