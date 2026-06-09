"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────
type SemesterKey = "1-1" | "1-2" | "2-1" | "2-2" | "3-1" | "3-2" | "4-1" | "4-2";
type ViewMode    = "grid" | "table";

type GradeRecord = {
  id: string;
  year: 1 | 2 | 3 | 4;
  semester: "1학기" | "2학기";
  gradePoint: number;
  credits: number;
  subject: string;
};

const GRADE_RECORDS_KEY = "smartgrade_grade_records";

const SEMESTER_TABS: Array<{
  key: SemesterKey;
  year: 1 | 2 | 3 | 4;
  sem: "1학기" | "2학기";
  label: string;
  short: string;
}> = [
  { key: "1-1", year: 1, sem: "1학기", label: "1학년 1학기", short: "1-1" },
  { key: "1-2", year: 1, sem: "2학기", label: "1학년 2학기", short: "1-2" },
  { key: "2-1", year: 2, sem: "1학기", label: "2학년 1학기", short: "2-1" },
  { key: "2-2", year: 2, sem: "2학기", label: "2학년 2학기", short: "2-2" },
  { key: "3-1", year: 3, sem: "1학기", label: "3학년 1학기", short: "3-1" },
  { key: "3-2", year: 3, sem: "2학기", label: "3학년 2학기", short: "3-2" },
  { key: "4-1", year: 4, sem: "1학기", label: "4학년 1학기", short: "4-1" },
  { key: "4-2", year: 4, sem: "2학기", label: "4학년 2학기", short: "4-2" },
];

function loadGradeRecords(): GradeRecord[] {
  try { return JSON.parse(localStorage.getItem(GRADE_RECORDS_KEY) || "[]"); }
  catch { return []; }
}

function gpaColor(gpa: number): string {
  if (gpa >= 4.0) return "text-emerald-600 dark:text-emerald-400";
  if (gpa >= 3.0) return "text-sky-600 dark:text-sky-400";
  if (gpa >= 2.0) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function gpToLetter(gp: number): string {
  if (gp >= 4.5) return "A+";
  if (gp >= 4.0) return "A";
  if (gp >= 3.5) return "B+";
  if (gp >= 3.0) return "B";
  if (gp >= 2.5) return "C+";
  if (gp >= 2.0) return "C";
  if (gp >= 1.5) return "D+";
  if (gp >= 1.0) return "D";
  return "F";
}

function calcSemGpa(records: GradeRecord[]): number | null {
  const cr = records.reduce((s, r) => s + r.credits, 0);
  if (!cr) return null;
  const pts = records.reduce((s, r) => s + r.gradePoint * r.credits, 0);
  return pts / cr;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CreditsPage() {
  const { user, loading: authLoading } = useAuth();

  const [activeSemester, setActiveSemester] = useState<SemesterKey>("1-1");
  const [gradeRecords, setGradeRecords]     = useState<GradeRecord[]>([]);
  const [viewMode, setViewMode]             = useState<ViewMode>("grid");

  // Form
  const [gradeSubject, setGradeSubject]         = useState("");
  const [gradePointInput, setGradePointInput]   = useState("4.0");
  const [gradeCreditInput, setGradeCreditInput] = useState(3);

  // Target GPA
  const [targetGpa, setTargetGpa]               = useState(4.0);
  const [remainingCredits, setRemainingCredits] = useState(30);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType]       = useState<"success" | "error">("success");

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  useEffect(() => { setGradeRecords(loadGradeRecords()); }, []);

  useEffect(() => {
    localStorage.setItem(GRADE_RECORDS_KEY, JSON.stringify(gradeRecords));
  }, [gradeRecords]);

  // ─── Active semester ───────────────────────────────────────────────────────
  const activeSemInfo = useMemo(
    () => SEMESTER_TABS.find((t) => t.key === activeSemester)!,
    [activeSemester],
  );

  const activeSemRecords = useMemo(
    () => gradeRecords.filter((r) => r.year === activeSemInfo.year && r.semester === activeSemInfo.sem),
    [gradeRecords, activeSemInfo],
  );

  // ─── Derived stats ─────────────────────────────────────────────────────────
  const activeSemGpa = useMemo(() => calcSemGpa(activeSemRecords), [activeSemRecords]);

  const cumulativeGpa = useMemo(() => calcSemGpa(gradeRecords), [gradeRecords]);

  const totalCredits = useMemo(
    () => gradeRecords.reduce((s, r) => s + r.credits, 0),
    [gradeRecords],
  );

  // Chart data: one point per semester
  const gradeTrend = useMemo(() =>
    SEMESTER_TABS.map((tab) => {
      const records = gradeRecords.filter((r) => r.year === tab.year && r.semester === tab.sem);
      const gpa = calcSemGpa(records);
      return { name: tab.short, GPA: gpa != null ? parseFloat(gpa.toFixed(2)) : null };
    }),
  [gradeRecords]);

  // Target GPA calculator
  const targetGpaInfo = useMemo(() => {
    const curGpa = cumulativeGpa ?? 0;
    const curCr  = totalCredits;
    if (!remainingCredits || remainingCredits <= 0) return null;
    const needed = (targetGpa * (curCr + remainingCredits) - curGpa * curCr) / remainingCredits;
    return Math.min(Math.max(needed, 0), 4.5).toFixed(2);
  }, [cumulativeGpa, totalCredits, targetGpa, remainingCredits]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleAdd = () => {
    if (!gradeSubject.trim()) { showToast("과목명을 입력해주세요.", "error"); return; }
    const gp = parseFloat(gradePointInput);
    if (isNaN(gp) || gp < 0 || gp > 4.5) { showToast("평점은 0.0~4.5 사이여야 합니다.", "error"); return; }
    setGradeRecords((prev) => [
      ...prev,
      {
        id: `${Date.now()}`,
        year: activeSemInfo.year,
        semester: activeSemInfo.sem,
        gradePoint: gp,
        credits: Number(gradeCreditInput),
        subject: gradeSubject.trim(),
      },
    ]);
    setGradeSubject("");
    setGradePointInput("4.0");
    setGradeCreditInput(3);
    showToast("과목이 추가되었습니다.", "success");
  };

  const handleDelete = (id: string) => {
    setGradeRecords((prev) => prev.filter((r) => r.id !== id));
    showToast("과목이 삭제되었습니다.", "success");
  };

  // ─── Guards ────────────────────────────────────────────────────────────────
  if (authLoading) return <LoadingCard />;
  if (!user) {
    return (
      <div className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <p className="text-base text-slate-600 dark:text-slate-300">로그인 후 학점 관리 기능을 사용할 수 있습니다.</p>
      </div>
    );
  }

  const cumGpaNum = cumulativeGpa ?? 0;
  const gaugePct  = Math.min((cumGpaNum / 4.5) * 100, 100);

  return (
    <div className="space-y-6">
      {/* ── 헤더 + 학기 탭 + 입력 폼 ──────────────────────── */}
      <section className="rounded-[2rem] bg-white p-4 shadow-sm sm:p-6 dark:bg-slate-900">

        {/* 타이틀 행 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">🎓 학점 관리</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">GPA · 졸업학점 관리</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* 뷰 모드 토글 */}
            <div className="flex rounded-full border border-slate-200 p-1 dark:border-slate-700">
              <button type="button" onClick={() => setViewMode("grid")}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${viewMode === "grid" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:text-slate-900 dark:text-slate-400"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </button>
              <button type="button" onClick={() => setViewMode("table")}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${viewMode === "table" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:text-slate-900 dark:text-slate-400"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
            </div>
            <Link href="/grades"
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
              📊 성적 관리
            </Link>
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              총 {totalCredits}학점
            </span>
          </div>
        </div>

        {/* GPA 요약 카드 3개 */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {/* 누적 GPA + 게이지 */}
          <div className="col-span-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950 sm:col-span-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">누적 GPA</p>
            {cumGpaNum === 0 ? (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">아직 성적 데이터가 없어요</p>
            ) : (
              <>
                <p className={`mt-1 text-2xl font-bold ${gpaColor(cumGpaNum)}`}>{cumGpaNum.toFixed(2)}</p>
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>0.0</span><span>4.5</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full rounded-full bg-sky-500 transition-all duration-500" style={{ width: `${gaugePct}%` }} />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 이번 학기 GPA */}
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-950">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">이번 학기 GPA</p>
            <p className={`mt-1 text-2xl font-bold ${activeSemGpa != null ? gpaColor(activeSemGpa) : "text-slate-400 dark:text-slate-500"}`}>
              {activeSemGpa != null ? activeSemGpa.toFixed(2) : "—"}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">{activeSemInfo.label}</p>
          </div>

          {/* 총 이수 학점 */}
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-950">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">총 이수 학점</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{totalCredits}</p>
            <p className="mt-1 text-[10px] text-slate-400">학점</p>
          </div>
        </div>

        {/* 학기 탭 8개 (가로 스크롤) */}
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-1 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800">
            {SEMESTER_TABS.map((tab) => {
              const records = gradeRecords.filter((r) => r.year === tab.year && r.semester === tab.sem);
              const gpa     = calcSemGpa(records);
              return (
                <button key={tab.key} type="button"
                  onClick={() => setActiveSemester(tab.key)}
                  className={`flex min-w-[52px] flex-col items-center rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    activeSemester === tab.key
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}>
                  <span>{tab.short}</span>
                  <span className={`mt-0.5 text-[10px] font-normal ${gpa != null ? gpaColor(gpa) : "text-slate-300 dark:text-slate-600"}`}>
                    {gpa != null ? gpa.toFixed(1) : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 과목 추가 폼 */}
        <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-950">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {activeSemInfo.label} 과목 추가
          </p>
          <div className="mt-4 grid gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">과목명</label>
              <input
                value={gradeSubject}
                onChange={(e) => setGradeSubject(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                placeholder="과목명을 입력하세요"
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  취득 평점 <span className="normal-case text-[10px] font-normal text-slate-400">(0.0 ~ 4.5)</span>
                </label>
                <input
                  value={gradePointInput}
                  onChange={(e) => setGradePointInput(e.target.value)}
                  type="number" min={0} max={4.5} step={0.1}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">이수 학점</label>
                <select
                  value={gradeCreditInput}
                  onChange={(e) => setGradeCreditInput(Number(e.target.value))}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {[1, 2, 3, 4].map((v) => <option key={v} value={v}>{v}학점</option>)}
                </select>
              </div>
            </div>
            <button type="button" onClick={handleAdd}
              className="inline-flex items-center justify-center rounded-3xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700">
              과목 추가
            </button>
          </div>
        </div>

        {/* 해당 학기 과목 목록 */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {activeSemInfo.label} 과목 목록
              <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {activeSemRecords.length}개
              </span>
              {activeSemGpa != null && (
                <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  activeSemGpa >= 4.0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : activeSemGpa >= 3.0 ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                }`}>
                  GPA {activeSemGpa.toFixed(2)}
                </span>
              )}
            </p>
          </div>

          {activeSemRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50 py-10 text-center dark:border-slate-700 dark:bg-slate-950">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              <p className="text-sm text-slate-500 dark:text-slate-400">{activeSemInfo.label}에 아직 등록된 과목이 없어요</p>
            </div>
          ) : viewMode === "table" ? (
            /* ── 테이블 뷰 ── */
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-950">
                  <tr>
                    {["과목명", "취득 평점", "등급", "이수 학점", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {activeSemRecords.map((record) => (
                    <tr key={record.id} className="bg-white dark:bg-slate-900">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{record.subject}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${gpaColor(record.gradePoint)}`}>{record.gradePoint.toFixed(1)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                          {gpToLetter(record.gradePoint)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{record.credits}학점</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => handleDelete(record.id)}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* ── 그리드 뷰 ── */
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activeSemRecords.map((record) => (
                <div key={record.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{record.subject}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className={`text-sm font-bold ${gpaColor(record.gradePoint)}`}>{record.gradePoint.toFixed(1)}</span>
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                        {gpToLetter(record.gradePoint)}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">{record.credits}학점</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => handleDelete(record.id)}
                    className="ml-3 shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── 학년별 평점 추이 차트 ──────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">학년별 평점 추이</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">학기별 GPA 변화</h2>
        <div className="mt-4 h-[240px]">
          {gradeRecords.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              <p className="text-xs text-slate-500 dark:text-slate-400">학점을 추가하면 추이 차트가 표시됩니다</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={gradeTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 4.5]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "1rem", border: "1px solid #e2e8f0", fontSize: 12 }}
                  formatter={(val: any) => val != null ? [(+val).toFixed(2), "GPA"] : ["—", "GPA"]}
                />
                <Line
                  type="monotone"
                  dataKey="GPA"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  dot={{ fill: "#0ea5e9", r: 5, strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 7 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* ── 목표 GPA 역산 ──────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">🎯 목표 GPA 역산</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">목표 달성에 필요한 평점</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          현재 누적 GPA <strong className={cumGpaNum > 0 ? gpaColor(cumGpaNum) : ""}>{cumGpaNum > 0 ? cumGpaNum.toFixed(2) : "없음"}</strong>
          {totalCredits > 0 && ` (${totalCredits}학점 기준)`}
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">목표 GPA</label>
            <input
              value={targetGpa}
              onChange={(e) => setTargetGpa(Number(e.target.value))}
              type="number" min={0} max={4.5} step={0.1}
              className="mt-1 w-24 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">남은 이수 학점 (예상)</label>
            <input
              value={remainingCredits}
              onChange={(e) => setRemainingCredits(Number(e.target.value))}
              type="number" min={0}
              className="mt-1 w-24 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          {targetGpaInfo ? (
            <div className="rounded-2xl bg-sky-50 px-5 py-3 dark:bg-sky-950/40">
              <p className="text-xs text-slate-500 dark:text-slate-400">앞으로 평균 필요 평점</p>
              <p className={`mt-0.5 text-2xl font-bold ${gpaColor(parseFloat(targetGpaInfo))}`}>{targetGpaInfo}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">남은 이수 학점을 입력하면 필요 평점이 계산됩니다.</p>
          )}
        </div>
      </section>

      {toastMessage ? <ToastMessage message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} /> : null}
    </div>
  );
}
