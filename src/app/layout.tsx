import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Sidebar from "@/src/components/Sidebar";
import Topbar from "@/src/components/Topbar";
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <AuthProvider>
          <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
            <Sidebar />
            <div className="flex min-h-screen flex-col">
              <Topbar />
              <main className="flex-1 p-6 lg:p-8">{children}</main>
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
