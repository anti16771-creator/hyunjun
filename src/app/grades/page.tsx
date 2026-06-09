"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import {
  createExamStrategy,
  createStudyCalendarEvent,
  deleteExamStrategy,
  getExamStrategies,
  getUserTimetableSubjects,
  toggleExamStrategyCompleted,
  updateExamStrategyScores,
} from "@/src/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
type ExamType = "midterm" | "final";
type ViewMode  = "grid" | "table";

type ExamEntry = {
  id: string;
  user_id: string;
  exam_type: ExamType;
  subject_name: string;
  is_major: boolean;
  credits: number;
  study_range: string;
  my_score: number | null;
  average_score: number | null;
  is_completed: boolean;
  created_at?: string;
};

type StudyPlan = { date: string; task: string; duration: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreToGradePoint(score?: number | null) {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 90) return 4.5;
  if (score >= 85) return 4.0;
  if (score >= 80) return 3.5;
  if (score >= 75) return 3.0;
  if (score >= 70) return 2.5;
  if (score >= 65) return 2.0;
  if (score >= 60) return 1.5;
  if (score >= 55) return 1.0;
  return 0.0;
}

function scoreToGradeLetter(score?: number | null): string {
  if (score == null || Number.isNaN(score)) return "—";
  if (score >= 90) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "C+";
  if (score >= 65) return "C";
  if (score >= 60) return "D+";
  if (score >= 55) return "D";
  return "F";
}

function estimatePercentile(myScore: number, avgScore: number): string {
  const d = myScore - avgScore;
  if (d >= 20) return "상위 약 10%";
  if (d >= 15) return "상위 약 15%";
  if (d >= 10) return "상위 약 20%";
  if (d >= 5)  return "상위 약 30%";
  if (d >= 0)  return "상위 약 50%";
  if (d >= -5) return "상위 약 65%";
  if (d >= -10) return "상위 약 75%";
  if (d >= -15) return "상위 약 85%";
  return "하위권";
}

function isFinalDemoted(item: ExamEntry) {
  return item.my_score != null && item.average_score != null && item.average_score - item.my_score >= 30;
}

// ─── Priority Formula ─────────────────────────────────────────────────────────
type RangeLevel  = "좁음" | "보통" | "넓음";
type ScoreStatus = "잘봄" | "평균대" | "망함" | "미입력";

function classifyStudyRange(range: string): { label: RangeLevel; score: number } {
  const trimmed = range.trim();
  const lines = trimmed.split("\n").filter((l) => l.trim()).length;
  if (lines > 1) {
    if (lines <= 2) return { label: "좁음", score: 3 };
    if (lines <= 5) return { label: "보통", score: 2 };
    return { label: "넓음", score: 1 };
  }
  if (trimmed.length < 25) return { label: "좁음", score: 3 };
  if (trimmed.length <= 70) return { label: "보통", score: 2 };
  return { label: "넓음", score: 1 };
}

function classifyScoreStatus(myScore: number | null, avgScore: number | null): { label: ScoreStatus; score: number } {
  if (myScore == null || avgScore == null) return { label: "미입력", score: 2 };
  if (myScore >= avgScore + 10) return { label: "잘봄",  score: 2 };
  if (myScore <  avgScore - 10) return { label: "망함",  score: 1 };
  return { label: "평균대", score: 3 };
}

function calcFinalBonus(finalWeightPct: number): number {
  if (finalWeightPct >= 60) return  1;
  if (finalWeightPct <= 40) return -1;
  return 0;
}

function calcGapDeduction(myScore: number | null, avgScore: number | null): number {
  if (myScore == null || avgScore == null) return 0;
  const gap = avgScore - myScore;
  if (gap <= 0)  return  0;
  if (gap <= 15) return -1;
  return 4;
}

// ─── Midterm/Final weight helpers ─────────────────────────────────────────────
const SUBJECT_WEIGHTS_KEY = "smartgrade_subject_weights";
type SubjectWeight = { midWeightPct: number };

function loadSubjectWeights(): Record<string, SubjectWeight> {
  try { return JSON.parse(localStorage.getItem(SUBJECT_WEIGHTS_KEY) || "{}"); }
  catch { return {}; }
}

function calcWeightedScore(midScore: number | null, finalScore: number | null, midPct: number): number | null {
  if (midScore == null || finalScore == null) return null;
  return Math.round((midScore * midPct + finalScore * (100 - midPct)) / 100 * 10) / 10;
}

function calcNeededFinalScore(targetScore: number, midScore: number, midPct: number): number | null {
  const finPct = 100 - midPct;
  if (finPct === 0) return null;
  return Math.round((targetScore * 100 - midScore * midPct) / finPct * 10) / 10;
}

function calcPriorityScore(item: ExamEntry, finalWeightPct: number): number {
  const majorWeight  = item.is_major ? 1.5 : 1.0;
  const creditWeight = item.credits / 3;
  const rangeScore   = classifyStudyRange(item.study_range).score;
  const statusScore  = classifyScoreStatus(item.my_score, item.average_score).score;
  const finalBonus   = calcFinalBonus(finalWeightPct);
  const gapDeduct    = calcGapDeduction(item.my_score, item.average_score);
  const base = majorWeight * creditWeight * (rangeScore + statusScore + finalBonus);
  return Math.round((base - gapDeduct) * 100) / 100;
}

const SCORE_STATUS_STYLE: Record<ScoreStatus, string> = {
  잘봄:   "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  평균대: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800",
  망함:   "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
  미입력: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

// ─── Entry Meta (기말비중 localStorage) ──────────────────────────────────────
const GRADES_META_KEY = "smartgrade_grades_meta";
type EntryMeta = { finalWeightPct: number };

function loadGradesMeta(): Record<string, EntryMeta> {
  try { return JSON.parse(localStorage.getItem(GRADES_META_KEY) || "{}"); }
  catch { return {}; }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex gap-4">
        <div className="flex-1 space-y-3">
          <div className="h-5 w-1/2 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-3/4 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-1/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="h-10 w-20 animate-pulse rounded-3xl bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ["#0ea5e9","#8b5cf6","#10b981","#f59e0b","#f43f5e","#ec4899"];

function Confetti() {
  const pieces = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      left: `${(i * 1.67) % 100}%`,
      delay: `${(i * 50) % 2000}ms`,
      dur: `${1500 + (i * 37) % 1000}ms`,
    })), []);

  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(540deg); opacity: 0; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {pieces.map((p) => (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: p.left,
              top: 0,
              width: 10,
              height: 10,
              backgroundColor: p.color,
              borderRadius: 2,
              animation: `confetti-fall ${p.dur} ease-in forwards`,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GradesPage() {
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab]       = useState<ExamType>("midterm");
  const [viewMode, setViewMode]         = useState<ViewMode>("grid");
  const [midtermEntries, setMidtermEntries] = useState<ExamEntry[]>([]);
  const [finalEntries, setFinalEntries]     = useState<ExamEntry[]>([]);
  const [subjectWeights, setSubjectWeights] = useState<Record<string, SubjectWeight>>({});
  const [timetableSubjects, setTimetableSubjects] = useState<string[]>([]);

  // Strategy form
  const [subjectName, setSubjectName]         = useState("");
  const [isDirectInput, setIsDirectInput]     = useState(false);
  const [isMajor, setIsMajor]                 = useState(true);
  const [credits, setCredits]                 = useState(3);
  const [studyRange, setStudyRange]           = useState("");
  const [studyRangeMode, setStudyRangeMode]   = useState<"text" | "checklist">("text");
  const [checklistItems, setChecklistItems]   = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [newCheckItem, setNewCheckItem]       = useState("");
  const [myScoreInput, setMyScoreInput]       = useState("");
  const [averageScoreInput, setAverageScoreInput] = useState("");
  const [midWeightPct, setMidWeightPct]       = useState(40);
  const finalWeightPct = 100 - midWeightPct;
  const [formErrors, setFormErrors]           = useState<Record<string, string>>({});
  const [entryMeta, setEntryMeta]             = useState<Record<string, EntryMeta>>({});

  // UI state
  const [deleteConfirmId, setDeleteConfirmId]   = useState<string | null>(null);
  const [editingId, setEditingId]               = useState<string | null>(null);
  const [editMyScore, setEditMyScore]           = useState("");
  const [editAvgScore, setEditAvgScore]         = useState("");
  const [showConfetti, setShowConfetti]         = useState(false);
  const [editingGoalGpa, setEditingGoalGpa]     = useState(false);

  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // AI study planner
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planHours, setPlanHours]         = useState(2);
  const [planLoading, setPlanLoading]     = useState(false);
  const [planResult, setPlanResult]       = useState<StudyPlan[] | null>(null);
  const [planSaving, setPlanSaving]       = useState(false);

  // 목표 GPA 역산
  const [targetGpa,    setTargetGpa]    = useState(3.5);
  const [remainCredit, setRemainCredit] = useState(15);
  const [toastType, setToastType]       = useState<"success" | "error">("success");

  const subjectNameRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchAllEntries = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [midRes, finRes] = await Promise.all([
      getExamStrategies(user.id, "midterm"),
      getExamStrategies(user.id, "final"),
    ]);
    setMidtermEntries(midRes.error ? [] : ((midRes.data ?? []) as ExamEntry[]));
    setFinalEntries(finRes.error ? [] : ((finRes.data ?? []) as ExamEntry[]));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    setEntryMeta(loadGradesMeta());
    setSubjectWeights(loadSubjectWeights());
    const saved = parseInt(localStorage.getItem("smartgrade_daily_goal_hours") ?? "2", 10);
    setPlanHours(isNaN(saved) || saved < 1 ? 2 : Math.min(saved, 12));
  }, []);

  useEffect(() => {
    if (!user) return;
    getUserTimetableSubjects(user.id).then((res) => {
      if (!res.error) {
        const list = Array.from(
          new Set((res.data ?? []).map((i: { subject: string }) => i.subject).filter(Boolean)),
        ) as string[];
        setTimetableSubjects(list);
      }
    });
  }, [user]);

  useEffect(() => { if (user) fetchAllEntries(); }, [user]);

  // ─── Current-tab entries (for form context + priority list) ─────────────────
  const entries = useMemo(
    () => (activeTab === "midterm" ? midtermEntries : finalEntries),
    [activeTab, midtermEntries, finalEntries],
  );

  const handleSubjectSelect = useCallback((value: string) => {
    if (value === "__direct__") {
      setIsDirectInput(true);
      setSubjectName("");
      return;
    }
    setIsDirectInput(false);
    setSubjectName(value);
    setFormErrors((p) => ({ ...p, subjectName: "" }));
    const prev = [...midtermEntries, ...finalEntries].find((e) => e.subject_name === value);
    if (prev != null) setIsMajor(prev.is_major);
  }, [midtermEntries, finalEntries]);

  // ─── Paired subjects (midterm + final combined by subject_name) ──────────
  const pairedSubjects = useMemo(() => {
    const allNames = Array.from(new Set([
      ...midtermEntries.map((e) => e.subject_name),
      ...finalEntries.map((e) => e.subject_name),
    ]));
    return allNames.map((name) => {
      const mid = midtermEntries.find((e) => e.subject_name === name) ?? null;
      const fin = finalEntries.find((e) => e.subject_name === name) ?? null;
      const midPct = subjectWeights[name]?.midWeightPct ?? 40;
      const finalPct = 100 - midPct;
      const weightedScore = calcWeightedScore(mid?.my_score ?? null, fin?.my_score ?? null, midPct);
      const status: "확정" | "진행중" | "기말만" | "미입력" =
        weightedScore != null ? "확정" :
        (mid?.my_score != null) ? "진행중" :
        (fin?.my_score != null) ? "기말만" : "미입력";
      const credits = (mid ?? fin)!.credits;
      const isMajor = (mid ?? fin)!.is_major;
      return { name, midEntry: mid, finalEntry: fin, midPct, finalPct, weightedScore, status, credits, isMajor };
    });
  }, [midtermEntries, finalEntries, subjectWeights]);

  const pairedMap = useMemo(
    () => Object.fromEntries(pairedSubjects.map((s) => [s.name, s])),
    [pairedSubjects],
  );

  // 확정 GPA: 중간 + 기말 모두 입력된 과목만
  const confirmedGpa = useMemo(() => {
    const confirmed = pairedSubjects.filter((s) => s.weightedScore != null);
    if (!confirmed.length) return null;
    const pts = confirmed.reduce((sum, s) => sum + (scoreToGradePoint(s.weightedScore) ?? 0) * s.credits, 0);
    const cr  = confirmed.reduce((sum, s) => sum + s.credits, 0);
    return cr ? (pts / cr).toFixed(2) : null;
  }, [pairedSubjects]);

  const confirmedMajorGpa = useMemo(() => {
    const confirmed = pairedSubjects.filter((s) => s.weightedScore != null && s.isMajor);
    if (!confirmed.length) return null;
    const pts = confirmed.reduce((sum, s) => sum + (scoreToGradePoint(s.weightedScore) ?? 0) * s.credits, 0);
    const cr  = confirmed.reduce((sum, s) => sum + s.credits, 0);
    return cr ? (pts / cr).toFixed(2) : null;
  }, [pairedSubjects]);

  // 예상 GPA: 점수가 있는 과목 전체 (미확정 포함)
  const estimatedGpa = useMemo(() => {
    const withScore = pairedSubjects.filter((s) => s.status !== "미입력");
    if (!withScore.length) return null;
    const pts = withScore.reduce((sum, s) => {
      const score = s.weightedScore ?? s.midEntry?.my_score ?? s.finalEntry?.my_score ?? 0;
      return sum + (scoreToGradePoint(score) ?? 0) * s.credits;
    }, 0);
    const cr = withScore.reduce((sum, s) => sum + s.credits, 0);
    return cr ? (pts / cr).toFixed(2) : null;
  }, [pairedSubjects]);

  const inProgressCount = useMemo(
    () => pairedSubjects.filter((s) => s.status === "진행중").length,
    [pairedSubjects],
  );
  const confirmedCount = useMemo(
    () => pairedSubjects.filter((s) => s.status === "확정").length,
    [pairedSubjects],
  );

  // examGpa: 확정 우선, 없으면 예상 사용
  const examGpa  = confirmedGpa ?? estimatedGpa ?? "0.00";
  const majorGpa = confirmedMajorGpa ?? "0.00";

  const totalCredit    = useMemo(() => pairedSubjects.reduce((s, p) => s + p.credits, 0), [pairedSubjects]);
  const remainingCount = useMemo(() => entries.filter((i) => !i.is_completed).length, [entries]);
  const majorHigher    = parseFloat(majorGpa) > parseFloat(examGpa);

  const scoreChartData = useMemo(() =>
    entries
      .filter((e) => e.my_score != null || e.average_score != null)
      .map((e) => ({
        name: e.subject_name.length > 5 ? `${e.subject_name.slice(0, 5)}…` : e.subject_name,
        내점수: e.my_score ?? 0,
        평균: e.average_score ?? 0,
      })),
  [entries]);

  // ─── 목표 GPA 역산 계산 ──────────────────────────────────────────────────────
  const gpaCalc = useMemo(() => {
    // 확정된 과목(중간+기말 모두 입력) 기준으로 역산
    const currentGpa   = parseFloat(confirmedGpa ?? estimatedGpa ?? "0");
    const scoredCredit = pairedSubjects.filter((s) => s.weightedScore != null).reduce((s, p) => s + p.credits, 0);
    const remain       = Math.max(remainCredit, 1);
    const totalExp     = scoredCredit + remain;
    const currentPts   = currentGpa * scoredCredit;

    const needed = (targetGpa * totalExp - currentPts) / remain;
    const neededRound  = Math.round(needed * 100) / 100;
    const isImpossible = neededRound > 4.5;

    let diffMsg: string;
    if (isImpossible)          diffMsg = "달성이 불가능해요 ❌";
    else if (neededRound > 4.0) diffMsg = "매우 어려워요 😰";
    else if (neededRound > 3.5) diffMsg = "도전해볼 만해요 🔥";
    else if (neededRound > 3.0) diffMsg = "충분히 가능해요 💪";
    else                        diffMsg = "여유 있어요 😊";

    const scenarios = [
      { label: "A+ 만점", gp: 4.5 },
      { label: "A0 평균", gp: 4.0 },
      { label: "B+ 평균", gp: 3.5 },
      { label: "B0 평균", gp: 3.0 },
    ].map(({ label, gp }) => ({
      label,
      gp,
      finalGpa: Math.round(((currentPts + gp * remain) / totalExp) * 100) / 100,
    }));

    return {
      currentGpa,
      scoredCredit,
      totalExp,
      neededGpa: neededRound,
      isImpossible,
      isEasy: neededRound <= 3.0,
      diffMsg,
      scenarios,
      currentPct: Math.min((currentGpa / 4.5) * 100, 100),
      targetPct:  Math.min((targetGpa  / 4.5) * 100, 100),
      inProgressCount,
      confirmedCount,
    };
  }, [confirmedGpa, estimatedGpa, pairedSubjects, targetGpa, remainCredit, inProgressCount, confirmedCount]);

  const sortedEntries = useMemo(() => {
    return [...entries]
      .map((item) => {
        const fwp = entryMeta[item.id]?.finalWeightPct ?? 50;
        return {
          ...item,
          _score:  calcPriorityScore(item, fwp),
          _range:  classifyStudyRange(item.study_range),
          _status: classifyScoreStatus(item.my_score, item.average_score),
        };
      })
      .sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score;
        if (b.credits !== a.credits) return b.credits - a.credits;
        if (a.is_major !== b.is_major) return a.is_major ? -1 : 1;
        return b._range.score - a._range.score;
      });
  }, [entries, entryMeta]);

  useEffect(() => {
    if (entries.length > 0 && entries.every((e) => e.is_completed)) {
      setShowConfetti(true);
      window.setTimeout(() => setShowConfetti(false), 3500);
    }
  }, [entries]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const validateStrategyForm = () => {
    const errs: Record<string, string> = {};
    if (!subjectName.trim()) errs.subjectName = "과목명을 입력해주세요";
    if (studyRangeMode === "text" && !studyRange.trim()) errs.studyRange = "시험 범위를 입력해주세요";
    if (studyRangeMode === "checklist" && checklistItems.length === 0) errs.studyRange = "체크리스트 항목을 추가해주세요";
    const my  = myScoreInput.trim() ? Number(myScoreInput) : null;
    const avg = averageScoreInput.trim() ? Number(averageScoreInput) : null;
    if (my  != null && (my  < 0 || my  > 100)) errs.myScore  = "0~100 사이로 입력하세요";
    if (avg != null && (avg < 0 || avg > 100)) errs.avgScore = "0~100 사이로 입력하세요";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAdd = async () => {
    if (!user) { showToast("로그인이 필요합니다.", "error"); return; }
    if (!validateStrategyForm()) return;
    const finalRange = studyRangeMode === "checklist"
      ? checklistItems.map((i) => `- ${i.text}`).join("\n")
      : studyRange.trim();
    setSaving(true);
    const res = await createExamStrategy({
      user_id: user.id,
      exam_type: activeTab,
      subject_name: subjectName.trim(),
      is_major: isMajor,
      credits,
      study_range: finalRange,
      my_score: myScoreInput.trim() ? Number(myScoreInput) : null,
      average_score: averageScoreInput.trim() ? Number(averageScoreInput) : null,
    });
    if (res.error) {
      showToast("저장에 실패했습니다.", "error");
    } else {
      const newId = (res.data as any)?.[0]?.id as string | undefined;
      if (newId) {
        const newMeta = { ...loadGradesMeta(), [newId]: { finalWeightPct } };
        localStorage.setItem(GRADES_META_KEY, JSON.stringify(newMeta));
        setEntryMeta(newMeta);
      }
      // 과목별 중간/기말 비중 저장
      const name = subjectName.trim();
      const newWeights = { ...loadSubjectWeights(), [name]: { midWeightPct } };
      localStorage.setItem(SUBJECT_WEIGHTS_KEY, JSON.stringify(newWeights));
      setSubjectWeights(newWeights);

      setSubjectName(""); setIsDirectInput(false); setIsMajor(true); setCredits(3);
      setStudyRange(""); setChecklistItems([]); setNewCheckItem("");
      setMyScoreInput(""); setAverageScoreInput(""); setMidWeightPct(40); setFormErrors({});
      await fetchAllEntries();
      showToast("과목이 추가되었습니다.", "success");
      subjectNameRef.current?.focus();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!user) { showToast("로그인이 필요합니다.", "error"); return; }
    setSaving(true);
    const res = await deleteExamStrategy(id);
    if (res.error) showToast("삭제에 실패했습니다.", "error");
    else { setDeleteConfirmId(null); await fetchAllEntries(); showToast("과목이 삭제되었습니다.", "success"); }
    setSaving(false);
  };

  const handleToggleCompleted = async (id: string, current: boolean) => {
    if (!user) { showToast("로그인이 필요합니다.", "error"); return; }
    setSaving(true);
    const res = await toggleExamStrategyCompleted(id, !current);
    if (res.error) showToast("상태 변경에 실패했습니다.", "error");
    else { await fetchAllEntries(); if (!current) showToast("학습 완료! 🎉", "success"); }
    setSaving(false);
  };

  const handleEditSave = async (id: string) => {
    if (!user) return;
    const my  = editMyScore.trim() ? Number(editMyScore) : null;
    const avg = editAvgScore.trim() ? Number(editAvgScore) : null;
    if ((my != null && (my < 0 || my > 100)) || (avg != null && (avg < 0 || avg > 100))) {
      showToast("점수는 0~100 사이여야 합니다.", "error"); return;
    }
    setSaving(true);
    const res = await updateExamStrategyScores(id, my, avg);
    if (res.error) showToast("수정에 실패했습니다.", "error");
    else { setEditingId(null); await fetchAllEntries(); showToast("점수가 수정되었습니다.", "success"); }
    setSaving(false);
  };

  const handleGeneratePlan = async () => {
    if (entries.length === 0) { showToast("등록된 과목이 없습니다.", "error"); return; }
    setPlanLoading(true);
    setPlanResult(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch("/api/ai-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          today,
          dailyHours: planHours,
          targetGpa,
          subjects: entries.map((item) => ({
            name: item.subject_name,
            myScore: item.my_score,
            averageScore: item.average_score,
            grade: scoreToGradeLetter(item.my_score),
          })),
        }),
      });
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPlanResult(json.plans ?? []);
    } catch {
      showToast("계획 생성에 실패했습니다. 다시 시도해주세요.", "error");
    } finally {
      setPlanLoading(false);
    }
  };

  const handleAddPlans = async () => {
    if (!user || !planResult?.length) return;
    setPlanSaving(true);
    let count = 0;
    for (const plan of planResult) {
      const colonIdx = plan.task.indexOf(":");
      const subjectName = colonIdx > 0 ? plan.task.slice(0, colonIdx).trim() : plan.task;
      const res = await createStudyCalendarEvent({
        user_id: user.id,
        subject_name: subjectName,
        task: plan.task,
        study_date: plan.date,
        duration: plan.duration,
      });
      if (!res.error) count++;
    }
    setPlanModalOpen(false);
    setPlanResult(null);
    showToast(`${count}개의 학습 일정을 타이머에 추가했습니다.`, "success");
    setPlanSaving(false);
  };

  const updatePlanRow = (index: number, field: keyof StudyPlan, value: string | number) => {
    setPlanResult((prev) => prev?.map((p, i) => i === index ? { ...p, [field]: value } : p) ?? null);
  };

  // ─── Guards ────────────────────────────────────────────────────────────────
  if (authLoading) return <LoadingCard />;
  if (!user) {
    return (
      <div className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <p className="text-base text-slate-600 dark:text-slate-300">로그인 후 성적 관리 기능을 사용할 수 있습니다.</p>
      </div>
    );
  }

  const gpaNum   = parseFloat(examGpa);
  const gaugePct = Math.min((gpaNum / 4.5) * 100, 100);

  return (
    <div className="space-y-6">
      {showConfetti && <Confetti />}

      {/* ── 헤더 + 시험 GPA 요약 카드 ──────────────────────── */}
      <section className="rounded-[2rem] bg-white p-4 shadow-sm sm:p-6 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">📊 성적 관리</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">시험 점수 & 공부 전략</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setPlanResult(null); setPlanModalOpen(true); }}
              className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
            >
              ✨ AI 학습 계획 생성
            </button>
            <Link href="/credits"
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300">
              🎓 학점 관리
            </Link>
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              남은 과목 {remainingCount}개
            </span>
          </div>
        </div>

        {majorHigher && (
          <div className="mt-4 flex items-center gap-3 rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
            <span className="text-lg">🌟</span>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              전공 역량이 뛰어나요! 전공 GPA({majorGpa})가 전체 GPA({examGpa})보다 높습니다.
            </p>
          </div>
        )}

        {/* 이번 시험 GPA 3개 stat */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {/* Card 1: 확정/예상 GPA + 목표 인라인 편집 */}
          <div className="rounded-[1.5rem] border border-sky-200 bg-sky-50 p-4 dark:border-sky-800/50 dark:bg-sky-950/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500 dark:text-sky-400">
                  {confirmedGpa != null ? "확정 GPA" : "예상 GPA (중간 기준)"}
                </p>
                {confirmedGpa != null && inProgressCount > 0 && (
                  <p className="text-[10px] text-amber-500 dark:text-amber-400">진행 중 {inProgressCount}개 미포함</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditingGoalGpa((v) => !v)}
                className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-600 transition hover:bg-sky-50 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-400"
              >
                목표 {targetGpa.toFixed(1)} ✎
              </button>
            </div>
            {editingGoalGpa && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={2.0} max={4.5} step={0.1} value={targetGpa}
                    onChange={(e) => setTargetGpa(parseFloat(e.target.value))}
                    className="flex-1 accent-sky-600"
                  />
                  <span className="w-10 text-right text-sm font-bold text-sky-600 dark:text-sky-400">{targetGpa.toFixed(1)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingGoalGpa(false)}
                  className="text-[10px] font-semibold text-slate-400 underline-offset-2 hover:underline"
                >
                  완료
                </button>
              </div>
            )}
            {gpaNum === 0 ? (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">점수를 입력하면 표시됩니다</p>
            ) : (
              <>
                <p className="mt-1.5 text-3xl font-bold text-sky-600 dark:text-sky-400">{examGpa}</p>
                {confirmedGpa != null && estimatedGpa != null && confirmedGpa !== estimatedGpa && (
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    진행 중 포함 예상: <span className="font-semibold text-amber-600 dark:text-amber-400">{estimatedGpa}</span>
                  </p>
                )}
                <div className="mt-2">
                  <div className="mb-1 flex justify-between text-[10px] text-slate-400">
                    <span>현재 {examGpa}</span><span>목표 {targetGpa.toFixed(1)}</span>
                  </div>
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full rounded-full bg-sky-500 transition-all duration-500" style={{ width: `${gaugePct}%` }} />
                    <div className="absolute inset-y-0 w-0.5 bg-amber-500" style={{ left: `${Math.min((targetGpa / 4.5) * 100, 100)}%` }} />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Card 2: 전공 GPA + 목표 대비 진행률 */}
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">전공 GPA</p>
            <p className={`mt-1.5 text-3xl font-bold ${majorHigher ? "text-emerald-600 dark:text-emerald-400" : parseFloat(majorGpa) < parseFloat(examGpa) ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-slate-100"}`}>
              {majorGpa}
            </p>
            <div className="mt-2">
              <div className="mb-1 flex justify-between text-[10px] text-slate-400">
                <span className={majorHigher ? "text-emerald-500" : "text-rose-500"}>{majorHigher ? "▲ 전체 대비 높음" : "▼ 전체 대비 낮음"}</span>
                <span>목표 {targetGpa.toFixed(1)}</span>
              </div>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${majorHigher ? "bg-emerald-500" : "bg-rose-400"}`}
                  style={{ width: `${Math.min((parseFloat(majorGpa) / 4.5) * 100, 100)}%` }}
                />
                <div className="absolute inset-y-0 w-0.5 bg-amber-500" style={{ left: `${Math.min((targetGpa / 4.5) * 100, 100)}%` }} />
              </div>
            </div>
          </div>

          {/* Card 3: 이수 학점 + 졸업 진행률 */}
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">이수 예정 학점</p>
            <p className="mt-1.5 text-3xl font-bold text-slate-900 dark:text-slate-100">{totalCredit}</p>
            <div className="mt-2">
              <div className="mb-1 flex justify-between text-[10px] text-slate-400">
                <span>현재 {totalCredit}학점</span>
                <span>목표 {totalCredit + remainCredit}학점</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-500"
                  style={{ width: `${(totalCredit + remainCredit) > 0 ? Math.min((totalCredit / (totalCredit + remainCredit)) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 누적 GPA 안내 */}
        <div className="mt-3 flex items-center gap-2 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950/50">
          <span className="text-sm">🎓</span>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            누적 GPA · 졸업학점 관리는{" "}
            <Link href="/credits" className="font-semibold text-sky-600 underline-offset-2 hover:underline dark:text-sky-400">
              학점 관리 페이지
            </Link>
            에서 확인하세요.
          </p>
        </div>

        {/* 중간/기말 탭 */}
        <div className="mt-6">
          <div className="flex overflow-hidden rounded-full border border-slate-200 p-1 dark:border-slate-700 w-fit">
            {(["midterm", "final"] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${activeTab === tab ? "bg-sky-600 text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}>
                {tab === "midterm" ? "중간고사" : "기말고사"}
              </button>
            ))}
          </div>
        </div>

        {/* ── 과목 추가 폼 ─────────────────────────────────── */}
        <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-950">
          <p className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
            {activeTab === "midterm" ? "중간고사" : "기말고사"} 과목 시험 전략 추가
          </p>
          <div className="grid gap-4">
            {/* 과목명 */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">과목명 *</label>
              <div className="relative mt-2">
                <select
                  value={isDirectInput ? "__direct__" : subjectName}
                  onChange={(e) => handleSubjectSelect(e.target.value)}
                  className={`w-full appearance-none rounded-3xl border px-4 py-3 pr-10 text-sm text-slate-900 outline-none transition dark:text-slate-100 dark:bg-slate-900 ${
                    formErrors.subjectName
                      ? "border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/20"
                      : "border-slate-200 bg-white focus:border-sky-400 dark:border-slate-700"
                  }`}>
                  <option value="">과목을 선택하세요 (또는 직접 입력)</option>
                  {timetableSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="__direct__">✏️ 직접 입력</option>
                </select>
                <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              {isDirectInput && (
                <input
                  ref={subjectNameRef}
                  value={subjectName}
                  onChange={(e) => { setSubjectName(e.target.value); setFormErrors((p) => ({ ...p, subjectName: "" })); }}
                  placeholder="과목명을 직접 입력하세요"
                  autoFocus
                  className={`mt-2 w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 outline-none transition dark:text-slate-100 dark:bg-slate-900 ${
                    formErrors.subjectName
                      ? "border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/20"
                      : "border-slate-200 bg-white focus:border-sky-400 dark:border-slate-700"
                  }`}
                />
              )}
              {!isDirectInput && subjectName && (
                <p className="mt-1.5 ml-3 text-xs text-sky-600 dark:text-sky-400">✓ 이전 등록 이력으로 이수 구분이 자동 설정되었습니다</p>
              )}
              {formErrors.subjectName && <p className="mt-1 ml-3 text-xs text-rose-600">{formErrors.subjectName}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">이수 구분</label>
                <select value={isMajor ? "major" : "elective"} onChange={(e) => setIsMajor(e.target.value === "major")}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="major">전공</option>
                  <option value="elective">교양</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">학점</label>
                <select value={credits} onChange={(e) => setCredits(Number(e.target.value))}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {[1,2,3,4].map((v) => <option key={v} value={v}>{v}학점</option>)}
                </select>
              </div>
            </div>

            {/* 시험 범위 */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">시험 범위 *</label>
                <button type="button" onClick={() => setStudyRangeMode((m) => m === "text" ? "checklist" : "text")}
                  className="text-xs font-semibold text-sky-600 hover:underline">
                  {studyRangeMode === "text" ? "체크리스트로 전환" : "텍스트로 전환"}
                </button>
              </div>
              {studyRangeMode === "text" ? (
                <input value={studyRange} onChange={(e) => { setStudyRange(e.target.value); setFormErrors((p) => ({ ...p, studyRange: "" })); }}
                  placeholder="시험 범위를 입력하세요"
                  className={`mt-2 w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 outline-none transition dark:text-slate-100 dark:bg-slate-900 ${formErrors.studyRange ? "border-rose-400 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-600" : "border-slate-200 bg-white focus:border-sky-400 dark:border-slate-700"}`}
                />
              ) : (
                <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <div className="space-y-2">
                    {checklistItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <input type="checkbox" checked={item.done}
                          onChange={() => setChecklistItems((p) => p.map((i) => i.id === item.id ? { ...i, done: !i.done } : i))}
                          className="h-4 w-4 rounded text-sky-600" />
                        <span className={`flex-1 text-sm ${item.done ? "line-through text-slate-400" : "text-slate-900 dark:text-slate-100"}`}>{item.text}</span>
                        <button type="button" onClick={() => setChecklistItems((p) => p.filter((i) => i.id !== item.id))} className="text-slate-400 hover:text-rose-500">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input value={newCheckItem} onChange={(e) => setNewCheckItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newCheckItem.trim()) {
                          setChecklistItems((p) => [...p, { id: `${Date.now()}`, text: newCheckItem.trim(), done: false }]);
                          setNewCheckItem("");
                        }
                      }}
                      placeholder="항목 입력 후 Enter"
                      className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                  </div>
                </div>
              )}
              {formErrors.studyRange && <p className="mt-1 ml-3 text-xs text-rose-600">{formErrors.studyRange}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">내 시험 점수</label>
                <input value={myScoreInput} onChange={(e) => { setMyScoreInput(e.target.value); setFormErrors((p) => ({ ...p, myScore: "" })); }}
                  placeholder="선택 입력" type="number" min={0} max={100}
                  className={`mt-2 w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 outline-none dark:text-slate-100 dark:bg-slate-900 ${formErrors.myScore ? "border-rose-400 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-600" : "border-slate-200 bg-white focus:border-sky-400 dark:border-slate-700"}`}
                />
                {formErrors.myScore && <p className="mt-1 ml-3 text-xs text-rose-600">{formErrors.myScore}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">시험 평균 점수</label>
                <input value={averageScoreInput} onChange={(e) => { setAverageScoreInput(e.target.value); setFormErrors((p) => ({ ...p, avgScore: "" })); }}
                  placeholder="선택 입력" type="number" min={0} max={100}
                  className={`mt-2 w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 outline-none dark:text-slate-100 dark:bg-slate-900 ${formErrors.avgScore ? "border-rose-400 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-600" : "border-slate-200 bg-white focus:border-sky-400 dark:border-slate-700"}`}
                />
                {formErrors.avgScore && <p className="mt-1 ml-3 text-xs text-rose-600">{formErrors.avgScore}</p>}
              </div>
            </div>

            {/* 중간/기말 비중 */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                중간 / 기말 비중 설정
                <span className="ml-2 normal-case text-[10px] text-slate-400">(가중 최종 점수 계산에 사용)</span>
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  { mid: 30, fin: 70 },
                  { mid: 40, fin: 60 },
                  { mid: 50, fin: 50 },
                  { mid: 60, fin: 40 },
                ] as const).map(({ mid, fin }) => (
                  <button key={mid} type="button" onClick={() => setMidWeightPct(mid)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                      midWeightPct === mid
                        ? "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                        : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                    }`}>
                    중간 {mid}% / 기말 {fin}%
                  </button>
                ))}
              </div>
              <p className="mt-1.5 ml-1 text-[10px] text-slate-400 dark:text-slate-500">
                현재 설정: 중간 <span className="font-bold text-sky-600">{midWeightPct}%</span> + 기말 <span className="font-bold text-sky-600">{finalWeightPct}%</span>
              </p>
            </div>

            <button type="button" onClick={handleAdd} disabled={saving}
              className="inline-flex items-center justify-center rounded-3xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
              추가하기
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
      {/* ── 점수 비교 차트 ────────────────────────────────── */}
      {scoreChartData.length > 0 && (
        <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">과목별 점수 비교</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">내 점수 vs 평균</h2>
          <div className="mt-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="내점수" fill="#0ea5e9" radius={[4,4,0,0]} />
                <Bar dataKey="평균" fill="#cbd5e1" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── 목표 GPA 역산 ────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">🎯 목표 GPA 역산</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">목표 달성을 위한 필요 평점 계산</h2>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* ── 좌측: 입력 ─────────────────────────────────── */}
          <div className="space-y-6">
            {/* 목표 GPA 슬라이더 */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">목표 GPA</span>
                <span className="text-2xl font-extrabold tabular-nums text-sky-600 dark:text-sky-400">{targetGpa.toFixed(1)}</span>
              </div>
              <input type="range" min={2.0} max={4.5} step={0.1} value={targetGpa}
                onChange={(e) => setTargetGpa(parseFloat(e.target.value))}
                className="mt-2 w-full accent-sky-600" />
              <div className="mt-0.5 flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
                <span>2.0</span><span>3.0</span><span>3.5</span><span>4.0</span><span>4.5</span>
              </div>
            </div>

            {/* 남은 이수 학점 */}
            <div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">앞으로 이수할 학점</span>
              <div className="mt-2 flex items-center gap-3">
                <input type="number" min={1} max={200} value={remainCredit}
                  onChange={(e) => setRemainCredit(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-28 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-sm font-bold text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">학점</span>
              </div>
            </div>

            {/* 현재 이수 정보 요약 */}
            <div className="space-y-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
              {[
                { label: "현재 이수 학점 (점수 입력됨)",     value: `${gpaCalc.scoredCredit}학점` },
                { label: "총 예상 이수 학점",                value: `${gpaCalc.totalExp}학점` },
                { label: "현재 GPA",                         value: gpaCalc.currentGpa.toFixed(2), color: "text-sky-600 dark:text-sky-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">{label}</span>
                  <span className={`font-semibold ${color ?? "text-slate-900 dark:text-slate-100"}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 우측: 결과 ─────────────────────────────────── */}
          <div className="space-y-5">
            {/* 게이지 바: 현재 → 목표 시각화 */}
            <div>
              <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>현재 {gpaCalc.currentGpa.toFixed(2)}</span>
                <span>목표 {targetGpa.toFixed(1)}</span>
                <span>4.5 만점</span>
              </div>
              <div className="relative h-5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                {/* 현재 GPA 막대 */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-sky-400 transition-all duration-500 dark:bg-sky-500"
                  style={{ width: `${gpaCalc.currentPct}%` }}
                />
                {/* 목표 GPA 마커 */}
                <div
                  className="absolute inset-y-0 w-0.5 bg-amber-500"
                  style={{ left: `${gpaCalc.targetPct}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
                <span>0.0</span><span>4.5</span>
              </div>
            </div>

            {/* 진행 중 과목 안내 */}
            {gpaCalc.inProgressCount > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/20">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  ⏳ 기말고사 미입력 {gpaCalc.inProgressCount}개 과목은 제외됩니다. 기말 점수 입력 후 재계산됩니다.
                </p>
              </div>
            )}

            {/* 필요 평점 + 달성 가능 여부 */}
            <div className={`rounded-2xl border p-5 text-center ${
              gpaCalc.isImpossible
                ? "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30"
                : gpaCalc.isEasy
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                : "border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30"
            }`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                앞으로 필요한 평균 평점
              </p>
              <p className={`mt-2 text-5xl font-extrabold tabular-nums leading-none ${
                gpaCalc.isImpossible
                  ? "text-rose-600 dark:text-rose-400"
                  : gpaCalc.isEasy
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-sky-600 dark:text-sky-400"
              }`}>
                {gpaCalc.isImpossible ? "—" : gpaCalc.neededGpa.toFixed(2)}
              </p>
              {gpaCalc.isImpossible && (
                <p className="mt-1 text-xs font-semibold text-rose-500 dark:text-rose-400">(4.5 초과)</p>
              )}
              <p className={`mt-2.5 text-sm font-semibold ${
                gpaCalc.isImpossible
                  ? "text-rose-700 dark:text-rose-300"
                  : gpaCalc.isEasy
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-sky-700 dark:text-sky-300"
              }`}>
                {gpaCalc.diffMsg}
              </p>
            </div>

            {/* 학점별 시나리오 테이블 */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">학점별 최종 GPA 시나리오</p>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {gpaCalc.scenarios.map(({ label, gp, finalGpa }) => {
                  const reachTarget = finalGpa >= targetGpa;
                  return (
                    <div key={label}
                      className={`flex items-center justify-between px-4 py-3 ${
                        reachTarget
                          ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                          : "bg-white dark:bg-slate-900"
                      }`}>
                      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-violet-600 dark:text-violet-400">{gp.toFixed(1)}</span>
                        <span className={`text-sm font-bold tabular-nums ${
                          reachTarget ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"
                        }`}>
                          {finalGpa.toFixed(2)}
                        </span>
                        {reachTarget && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            목표 달성
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

        </div>
        {/* ── 과목 목록 & 추천 우선순위 ───────────────────── */}
        <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">🔥 오늘의 추천 공부 우선순위</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {activeTab === "midterm" ? "중간고사 대비 전공 및 고학점 순" : "기말 평점 방어를 반영한 전략적 추천"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              전체 {entries.length}개
            </span>
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
            <a href="/priority"
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
              전용 페이지에서 보기
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </a>
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="space-y-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-[1.75rem] border border-slate-200 bg-slate-50 py-12 text-center dark:border-slate-800 dark:bg-slate-950">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-300">아직 등록된 과목이 없어요</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">과목을 추가하면 공부 우선순위를 추천해드릴게요!</p>
              </div>
            </div>
          ) : viewMode === "table" ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-950">
                  <tr>
                    {["과목명","구분","학점","내 점수","평균","예상 등급","차이","상태",""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {sortedEntries.map((item) => {
                    const diff = item.my_score != null && item.average_score != null ? item.my_score - item.average_score : null;
                    return (
                      <tr key={item.id} className={`bg-white dark:bg-slate-900 ${item.is_completed ? "opacity-60" : ""}`}>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{item.subject_name}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.is_major ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{item.is_major ? "전공" : "교양"}</span></td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.credits}학점</td>
                        <td className="px-4 py-3 font-semibold text-sky-600">{item.my_score ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-500">{item.average_score ?? "—"}</td>
                        <td className="px-4 py-3 font-bold text-violet-600">{scoreToGradeLetter(item.my_score)}</td>
                        <td className="px-4 py-3">{diff != null ? <span className={`font-semibold ${diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{diff >= 0 ? `+${diff}` : diff}점</span> : "—"}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.is_completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{item.is_completed ? "완료" : "미완료"}</span></td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setDeleteConfirmId(item.id)} className="text-xs text-slate-400 hover:text-rose-500">삭제</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedEntries.map((item) => {
                const demoted       = activeTab === "final" && isFinalDemoted(item);
                const diff          = item.my_score != null && item.average_score != null ? item.my_score - item.average_score : null;
                const pct           = item.my_score != null && item.average_score != null ? estimatePercentile(item.my_score, item.average_score) : null;
                const isEditing     = editingId === item.id;
                const priorityScore = (item as any)._score as number ?? 0;
                const rangeInfo     = (item as any)._range  as ReturnType<typeof classifyStudyRange>;
                const statusInfo    = (item as any)._status as ReturnType<typeof classifyScoreStatus>;
                // 중간/기말 통합 데이터
                const paired    = pairedMap[item.subject_name];
                const midPct    = paired?.midPct ?? 40;
                const finalPct  = paired?.finalPct ?? 60;
                const midScore  = paired?.midEntry?.my_score ?? null;
                const finScore  = paired?.finalEntry?.my_score ?? null;
                const weighted  = paired?.weightedScore ?? null;
                const grade     = scoreToGradeLetter(weighted ?? item.my_score);
                // 목표 등급(B+, 80점)을 기준으로 기말에서 필요한 점수 역산
                const targetScore     = 80;
                const neededFinalScore = activeTab === "midterm" && midScore != null && finScore == null
                  ? calcNeededFinalScore(targetScore, midScore, midPct)
                  : null;

                return (
                  <div key={item.id}
                    className={`overflow-hidden rounded-2xl border transition ${item.is_completed ? "border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-950" : "border-slate-200 bg-white shadow-sm hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"}`}>
                    <div className="p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.is_completed && <span className="text-emerald-500">✅</span>}
                            <p className={`text-lg font-semibold ${item.is_completed ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
                              {item.subject_name}
                            </p>
                            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${item.is_major ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                              {item.is_major ? "전공" : "교양"}
                            </span>
                            {demoted && <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">하향 조정</span>}
                            {weighted != null ? (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                확정 {grade}
                              </span>
                            ) : grade !== "—" ? (
                              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                                예상 {grade}
                              </span>
                            ) : null}
                            {paired?.status === "진행중" && (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                                기말 미입력
                              </span>
                            )}
                            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${SCORE_STATUS_STYLE[statusInfo.label]}`}>
                              {statusInfo.label}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                              </svg>
                              P {priorityScore.toFixed(1)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                              범위 {rangeInfo.label}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            {isEditing ? (
                              <>
                                <input value={editMyScore} onChange={(e) => setEditMyScore(e.target.value)}
                                  type="number" min={0} max={100} placeholder="내 점수"
                                  className="w-24 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                                <input value={editAvgScore} onChange={(e) => setEditAvgScore(e.target.value)}
                                  type="number" min={0} max={100} placeholder="평균 점수"
                                  className="w-24 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                                <button type="button" onClick={() => handleEditSave(item.id)}
                                  className="rounded-2xl bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700">저장</button>
                                <button type="button" onClick={() => setEditingId(null)}
                                  className="rounded-2xl border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400">취소</button>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5 rounded-2xl bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-950">
                                  <span className="text-slate-400">내 점수</span>
                                  <span className="font-bold text-sky-600">{item.my_score != null ? `${item.my_score}점` : "—"}</span>
                                  {diff != null && (
                                    <span className={`ml-1 text-xs font-semibold ${diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                      ({diff >= 0 ? `+${diff}` : diff})
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 rounded-2xl bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-950">
                                  <span className="text-slate-400">평균</span>
                                  <span className="font-bold text-slate-700 dark:text-slate-300">{item.average_score != null ? `${item.average_score}점` : "—"}</span>
                                </div>
                                {pct && (
                                  <div className="rounded-2xl bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                                    {pct}
                                  </div>
                                )}
                                <button type="button"
                                  onClick={() => { setEditingId(item.id); setEditMyScore(String(item.my_score ?? "")); setEditAvgScore(String(item.average_score ?? "")); }}
                                  className="rounded-2xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400">
                                  수정
                                </button>
                              </>
                            )}
                          </div>

                          {/* 중간/기말 가중 점수 패널 */}
                          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <div className="flex items-center gap-1">
                                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">중간 {midPct}%</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {midScore != null ? `${midScore}점` : "미입력"}
                                </span>
                                {midScore != null && <span className="text-slate-400">→ {Math.round(midScore * midPct) / 100}점 기여</span>}
                              </div>
                              <span className="text-slate-300 dark:text-slate-600">+</span>
                              <div className="flex items-center gap-1">
                                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">기말 {finalPct}%</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {finScore != null ? `${finScore}점` : "미입력"}
                                </span>
                                {finScore != null && <span className="text-slate-400">→ {Math.round(finScore * finalPct) / 100}점 기여</span>}
                              </div>
                              {weighted != null && (
                                <>
                                  <span className="text-slate-300 dark:text-slate-600">=</span>
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">가중 {weighted}점 ({scoreToGradeLetter(weighted)})</span>
                                </>
                              )}
                            </div>
                            {neededFinalScore != null && (
                              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                                B+(80점) 달성하려면 기말에서 최소{" "}
                                <span className={`font-bold ${neededFinalScore > 100 ? "text-rose-600" : "text-amber-700"}`}>
                                  {neededFinalScore > 100 ? "불가능 (100점 초과)" : `${neededFinalScore}점`}
                                </span>{" "}
                                필요
                              </p>
                            )}
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-950">
                              <p className="text-xs font-semibold text-slate-500">학점</p>
                              <p className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">{item.credits}학점</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-950">
                              <p className="text-xs font-semibold text-slate-500">시험 범위</p>
                              <p className="mt-0.5 break-words text-slate-700 dark:text-slate-300 whitespace-pre-line">{item.study_range}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-start gap-2 sm:items-end">
                          <button type="button" onClick={() => handleToggleCompleted(item.id, item.is_completed)}
                            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                              item.is_completed
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            }`}>
                            {item.is_completed ? "✅ 완료됨" : "학습 완료"}
                          </button>
                          <button type="button" onClick={() => setDeleteConfirmId(item.id)}
                            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      </div>

      {/* ── 삭제 확인 모달 ────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/40">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600 dark:text-rose-400">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">삭제하시겠어요?</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">이 과목 데이터가 영구 삭제됩니다.</p>
              </div>
              <div className="flex w-full gap-3">
                <button type="button" onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  취소
                </button>
                <button type="button" onClick={() => handleDelete(deleteConfirmId)} disabled={saving}
                  className="flex-1 rounded-3xl bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50">
                  삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI 학습 계획 생성 모달 ───────────────────── */}
      {planModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-900" style={{ maxHeight: "90vh" }}>
            {/* 헤더 */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">✨ AI 학습 계획 생성</p>
                <h2 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {planResult ? "생성된 학습 계획" : "계획 생성 설정"}
                </h2>
              </div>
              <button type="button" onClick={() => { setPlanModalOpen(false); setPlanResult(null); }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {planLoading ? (
                <div className="space-y-3">
                  {[0.4, 0.7, 0.55, 0.85, 0.6, 0.75].map((w, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-24 flex-shrink-0 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
                      <div className="h-8 flex-1 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" style={{ maxWidth: `${w * 100}%` }} />
                      <div className="h-8 w-16 flex-shrink-0 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
                    </div>
                  ))}
                  <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">AI가 학습 계획을 생성하고 있어요...</p>
                </div>
              ) : planResult ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="pb-3 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">날짜</th>
                        <th className="pb-3 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">할 일</th>
                        <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">시간(분)</th>
                        <th className="pb-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {planResult.map((plan, i) => (
                        <tr key={i}>
                          <td className="py-2 pr-3">
                            <input type="date" value={plan.date}
                              onChange={(e) => updatePlanRow(i, "date", e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                          </td>
                          <td className="py-2 pr-3">
                            <input value={plan.task}
                              onChange={(e) => updatePlanRow(i, "task", e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                          </td>
                          <td className="py-2 pr-2">
                            <input type="number" min={5} max={480} value={plan.duration}
                              onChange={(e) => updatePlanRow(i, "duration", parseInt(e.target.value, 10) || 0)}
                              className="w-20 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                          </td>
                          <td className="py-2 text-right">
                            <button type="button"
                              onClick={() => setPlanResult((prev) => prev?.filter((_, idx) => idx !== i) ?? null)}
                              className="rounded-full p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {planResult.length === 0 && (
                    <p className="py-6 text-center text-sm text-slate-400">항목이 없습니다. 다시 생성해보세요.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {/* 자동 포함 성적 안내 */}
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 dark:border-violet-900/40 dark:bg-violet-950/30">
                    <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                      ✅ 현재 등록된 과목 {entries.length}개의 성적·평균·목표 GPA 정보가 자동으로 포함됩니다.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {entries.slice(0, 6).map((item) => (
                        <span key={item.id} className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                          {item.subject_name}{item.my_score != null ? ` (${item.my_score}점)` : ""}
                        </span>
                      ))}
                      {entries.length > 6 && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">+{entries.length - 6}개</span>
                      )}
                    </div>
                    <p className="mt-2 text-xs font-medium text-violet-600 dark:text-violet-400">
                      목표 GPA {targetGpa.toFixed(1)} · 현재 GPA {examGpa}
                    </p>
                  </div>

                  {/* 하루 목표 공부 시간 */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">하루 목표 공부 시간</label>
                      <span className="text-sm font-bold text-violet-600 dark:text-violet-400">{planHours}시간</span>
                    </div>
                    <input type="range" min={1} max={12} value={planHours}
                      onChange={(e) => setPlanHours(parseInt(e.target.value, 10))}
                      className="w-full accent-violet-600" />
                    <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>1시간</span><span>12시간</span></div>
                  </div>
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="flex flex-shrink-0 gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
              {planLoading ? (
                <div className="flex flex-1 items-center justify-center py-1 text-sm text-slate-400">생성 중...</div>
              ) : planResult ? (
                <>
                  <button type="button" onClick={() => setPlanResult(null)}
                    className="rounded-3xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    ← 다시 설정
                  </button>
                  <button type="button" onClick={handleGeneratePlan}
                    className="rounded-3xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    🔄 다시 생성
                  </button>
                  <button type="button" onClick={handleAddPlans} disabled={planSaving || planResult.length === 0}
                    className="flex-1 rounded-3xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {planSaving ? "저장 중..." : `타이머 일정에 추가 (${planResult.length}개)`}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => { setPlanModalOpen(false); setPlanResult(null); }}
                    className="rounded-3xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    취소
                  </button>
                  <button type="button" onClick={handleGeneratePlan} disabled={entries.length === 0}
                    className="flex-1 rounded-3xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
                    계획 생성
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {toastMessage ? <ToastMessage message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} /> : null}
    </div>
  );
}
