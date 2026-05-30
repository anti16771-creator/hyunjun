"use client";

import { useEffect, useMemo, useState } from "react";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import {
  createExamStrategy,
  deleteExamStrategy,
  getExamStrategies,
  toggleExamStrategyCompleted,
} from "@/src/lib/supabase";

const examTabs = [
  { label: "중간고사", value: "midterm" as const },
  { label: "기말고사", value: "final" as const },
];

const scoreToGradePoint = (score?: number | null) => {
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
};

const isFinalDemoted = (item: ExamEntry) => {
  return (
    item.my_score != null &&
    item.average_score != null &&
    item.average_score - item.my_score >= 30
  );
};

const getStrategyMessage = (item: ExamEntry, activeTab: "midterm" | "final") => {
  if (activeTab === "midterm") {
    return "중간고사 대비 전공 및 고학점 순으로 배치된 최우선 학습 과목입니다.";
  }
  return isFinalDemoted(item)
    ? "중간고사 점수가 평균보다 30점 이상 낮아, 기말 평점 방어를 위해 학습 우선순위가 하향 조정되었습니다."
    : "기말고사 대비 전공과 고학점 중심으로 전략적으로 정렬된 우선 학습 과목입니다.";
};

type ExamEntry = {
  id: string;
  user_id: string;
  exam_type: "midterm" | "final";
  subject_name: string;
  is_major: boolean;
  credits: number;
  study_range: string;
  my_score: number | null;
  average_score: number | null;
  is_completed: boolean;
  created_at?: string;
};

type GradeRecord = {
  id: string;
  year: 1 | 2 | 3 | 4;
  semester: "1학기" | "2학기";
  gradePoint: number;
  credits: number;
  subject: string;
};

export default function GradesPage() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"midterm" | "final">("midterm");
  const [viewTab, setViewTab] = useState<"strategy" | "grade">("strategy");
  const [entries, setEntries] = useState<ExamEntry[]>([]);
  const [gradeRecords, setGradeRecords] = useState<GradeRecord[]>([]);
  const [subjectName, setSubjectName] = useState("");
  const [isMajor, setIsMajor] = useState(true);
  const [credits, setCredits] = useState(3);
  const [studyRange, setStudyRange] = useState("");
  const [myScoreInput, setMyScoreInput] = useState("");
  const [averageScoreInput, setAverageScoreInput] = useState("");
  const [gradeSubject, setGradeSubject] = useState("");
  const [gradeYear, setGradeYear] = useState<1 | 2 | 3 | 4>(1);
  const [gradeSemester, setGradeSemester] = useState<"1학기" | "2학기">("1학기");
  const [gradePointInput, setGradePointInput] = useState(4.0);
  const [gradeCreditInput, setGradeCreditInput] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToastMessage(message);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchEntries = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await getExamStrategies(user.id, activeTab);
      if (response.error) {
        console.error("getExamStrategies error", response.error);
        setError(response.error.message);
        setEntries([]);
        showToast("시험 전략 데이터를 불러오는 중 오류가 발생했습니다.", "error");
      } else {
        setError("");
        setEntries((response.data ?? []) as ExamEntry[]);
      }
    } catch (err) {
      console.error("fetchEntries error", err);
      setError("시험 전략 조회 중 오류가 발생했습니다.");
      setEntries([]);
      showToast("시험 전략 조회 중 오류가 발생했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchEntries();
  }, [user, activeTab]);

  const totalCredit = useMemo(
    () => entries.reduce((sum, item) => sum + item.credits, 0),
    [entries],
  );

  const totalGpa = useMemo(() => {
    const scored = entries.filter((item) => item.my_score != null);
    const totalPoints = scored.reduce((sum, item) => {
      const point = scoreToGradePoint(item.my_score);
      return sum + (point ?? 0) * item.credits;
    }, 0);
    const totalScoredCredits = scored.reduce((sum, item) => sum + item.credits, 0);
    return totalScoredCredits ? (totalPoints / totalScoredCredits).toFixed(2) : "0.00";
  }, [entries]);

  const majorGpa = useMemo(() => {
    const scoredMajor = entries.filter((item) => item.is_major && item.my_score != null);
    const totalPoints = scoredMajor.reduce((sum, item) => {
      const point = scoreToGradePoint(item.my_score);
      return sum + (point ?? 0) * item.credits;
    }, 0);
    const totalScoredMajorCredits = scoredMajor.reduce((sum, item) => sum + item.credits, 0);
    return totalScoredMajorCredits ? (totalPoints / totalScoredMajorCredits).toFixed(2) : "0.00";
  }, [entries]);

  const remainingCount = useMemo(
    () => entries.filter((item) => !item.is_completed).length,
    [entries],
  );

  const totalGradeCredits = useMemo(
    () => gradeRecords.reduce((sum, record) => sum + record.credits, 0),
    [gradeRecords],
  );

  const gradePointsSum = useMemo(
    () => gradeRecords.reduce((sum, record) => sum + record.gradePoint * record.credits, 0),
    [gradeRecords],
  );

  const combinedTotalCredit = useMemo(
    () => totalCredit + totalGradeCredits,
    [totalCredit, totalGradeCredits],
  );

  const combinedGpa = useMemo(() => {
    const entryPoints = entries.reduce((sum, item) => {
      if (item.my_score == null) return sum;
      const point = scoreToGradePoint(item.my_score);
      return sum + (point ?? 0) * item.credits;
    }, 0);
    const entryCredits = entries.reduce((sum, item) => sum + (item.my_score != null ? item.credits : 0), 0);
    const totalPoints = entryPoints + gradePointsSum;
    const totalCredits = entryCredits + totalGradeCredits;
    return totalCredits ? (totalPoints / totalCredits).toFixed(2) : "0.00";
  }, [entries, gradePointsSum, totalGradeCredits]);

  const gradeTrend = useMemo(() => {
    return gradeRecords.map((record, index) => ({
      label: `${record.year}학년 ${record.semester}`,
      value: record.gradePoint,
      x: gradeRecords.length > 1 ? (index * 100) / (gradeRecords.length - 1) : 0,
    }));
  }, [gradeRecords]);

  const sortedEntries = useMemo(() => {
    const sorted = [...entries];
    if (activeTab === "midterm") {
      sorted.sort((a, b) => {
        if (a.is_major !== b.is_major) return a.is_major ? -1 : 1;
        if (a.credits !== b.credits) return b.credits - a.credits;
        return a.subject_name.localeCompare(b.subject_name, "ko");
      });
      return sorted;
    }

    sorted.sort((a, b) => {
      const aDemoted = isFinalDemoted(a);
      const bDemoted = isFinalDemoted(b);
      if (aDemoted !== bDemoted) return aDemoted ? 1 : -1;
      if (a.is_major !== b.is_major) return a.is_major ? -1 : 1;
      if (a.credits !== b.credits) return b.credits - a.credits;
      return a.subject_name.localeCompare(b.subject_name, "ko");
    });
    return sorted;
  }, [entries, activeTab]);

  const handleAddGradeRecord = () => {
    if (!gradeSubject.trim()) {
      setError("과목명은 필수 입력 항목입니다.");
      return;
    }
    if (gradePointInput < 0 || gradePointInput > 4.5) {
      setError("평점은 0.0에서 4.5 사이여야 합니다.");
      return;
    }
    setGradeRecords((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${gradeSubject}`,
        year: gradeYear,
        semester: gradeSemester,
        gradePoint: Number(gradePointInput),
        credits: Number(gradeCreditInput),
        subject: gradeSubject.trim(),
      },
    ]);
    setGradeSubject("");
    setGradePointInput(4.0);
    setGradeCreditInput(3);
    setError("");
    showToast("학점 정보가 저장되었습니다.", "success");
  };

  const handleAdd = async () => {
    if (authLoading) {
      setError("인증 정보를 불러오는 중입니다. 잠시만 기다려주세요.");
      return;
    }
    if (!user) {
      setError("로그인 후에 학습 전략을 저장할 수 있습니다.");
      return;
    }
    if (!subjectName.trim() || !studyRange.trim()) {
      setError("과목명과 시험 범위는 필수 입력입니다.");
      return;
    }

    const myScore = myScoreInput.trim() ? Number(myScoreInput) : null;
    const averageScore = averageScoreInput.trim() ? Number(averageScoreInput) : null;

    if (myScore != null && (myScore < 0 || myScore > 100)) {
      setError("내 시험 점수는 0에서 100 사이여야 합니다.");
      return;
    }
    if (averageScore != null && (averageScore < 0 || averageScore > 100)) {
      setError("시험 평균 점수는 0에서 100 사이여야 합니다.");
      return;
    }

    setSaving(true);
    try {
      const response = await createExamStrategy({
        user_id: user.id,
        exam_type: activeTab,
        subject_name: subjectName.trim(),
        is_major: isMajor,
        credits,
        study_range: studyRange.trim(),
        my_score: myScore,
        average_score: averageScore,
      });

      if (response.error) {
        console.error("createExamStrategy error", response.error);
        setError(response.error.message);
        showToast("학습 전략 저장에 실패했습니다.", "error");
      } else {
        setSubjectName("");
        setIsMajor(true);
        setCredits(3);
        setStudyRange("");
        setMyScoreInput("");
        setAverageScoreInput("");
        await fetchEntries();
        setError("");
        showToast("학습 전략이 저장되었습니다.", "success");
      }
    } catch (err) {
      console.error("handleAdd error", err);
      setError("학습 전략 저장 중 오류가 발생했습니다.");
      showToast("학습 전략 저장 중 오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (authLoading) {
      setError("인증 정보를 불러오는 중입니다. 잠시만 기다려주세요.");
      return;
    }
    if (!user) {
      setError("로그인 후에 삭제할 수 있습니다.");
      return;
    }
    setSaving(true);
    try {
      const response = await deleteExamStrategy(id);
      if (response.error) {
        console.error("deleteExamStrategy error", response.error);
        setError(response.error.message);
        showToast("학습 전략 삭제에 실패했습니다.", "error");
      } else {
        await fetchEntries();
        showToast("학습 전략이 삭제되었습니다.", "success");
      }
    } catch (err) {
      console.error("handleDelete error", err);
      setError("학습 전략 삭제 중 오류가 발생했습니다.");
      showToast("학습 전략 삭제 중 오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCompleted = async (id: string, currentState: boolean) => {
    if (authLoading) {
      setError("인증 정보를 불러오는 중입니다. 잠시만 기다려주세요.");
      return;
    }
    if (!user) {
      setError("로그인 후에 상태를 변경할 수 있습니다.");
      return;
    }
    setSaving(true);
    try {
      const response = await toggleExamStrategyCompleted(id, !currentState);
      if (response.error) {
        console.error("toggleExamStrategyCompleted error", response.error);
        setError(response.error.message);
        showToast("상태 변경에 실패했습니다.", "error");
      } else {
        await fetchEntries();
        showToast("시험 전략 상태가 업데이트되었습니다.", "success");
      }
    } catch (err) {
      console.error("handleToggleCompleted error", err);
      setError("상태 변경 중 오류가 발생했습니다.");
      showToast("상태 변경 중 오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return <LoadingCard />;
  }

  if (!user) {
    return (
      <div className="rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
        <p className="text-base text-gray-600">로그인 후 시험 전략 플래너를 사용할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 px-6 py-8">
      <section className="rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">📘 성적 전략 플래너</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">시험 전략과 GPA를 한 곳에서</h1>
            <p className="mt-3 max-w-2xl text-sm text-gray-500">
              중간고사와 기말고사 탭을 전환하며 학습 우선순위를 분석하고, 실시간 GPA와 누적 이수 학점을 확인하세요.
            </p>
          </div>

          <div className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            남은 과목 {remainingCount}개
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-full bg-gray-100 p-1">
            {examTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.value
                    ? "bg-white shadow-sm text-slate-900"
                    : "text-gray-500"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-full bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setViewTab("strategy")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                viewTab === "strategy"
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-gray-500"
              }`}
            >
              과목별 시험 전략
            </button>
            <button
              type="button"
              onClick={() => setViewTab("grade")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                viewTab === "grade"
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-gray-500"
              }`}
            >
              전체 학점 관리
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-medium text-gray-500">전체 GPA</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{combinedGpa}</p>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-medium text-gray-500">전공 GPA</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{majorGpa}</p>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-medium text-gray-500">총 이수 학점</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{combinedTotalCredit}</p>
          </div>
        </div>

        {viewTab === "strategy" ? (
          <div className="mt-8">
            <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
              <div className="grid gap-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-[0.24em] text-gray-500">과목명</label>
                  <input
                    value={subjectName}
                    onChange={(e) => setSubjectName(e.target.value)}
                    placeholder="과목명을 입력하세요"
                    className="mt-2 w-full rounded-3xl border border-gray-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.24em] text-gray-500">이수 구분</label>
                    <select
                      value={isMajor ? "major" : "elective"}
                      onChange={(e) => setIsMajor(e.target.value === "major")}
                      className="mt-2 w-full rounded-3xl border border-gray-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    >
                      <option value="major">전공</option>
                      <option value="elective">교양</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.24em] text-gray-500">학점</label>
                    <select
                      value={credits}
                      onChange={(e) => setCredits(Number(e.target.value))}
                      className="mt-2 w-full rounded-3xl border border-gray-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    >
                      {[1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value}학점
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium uppercase tracking-[0.24em] text-gray-500">시험 범위</label>
                  <input
                    value={studyRange}
                    onChange={(e) => setStudyRange(e.target.value)}
                    placeholder="시험 범위를 입력하세요"
                    className="mt-2 w-full rounded-3xl border border-gray-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.24em] text-gray-500">내 시험 점수</label>
                    <input
                      value={myScoreInput}
                      onChange={(e) => setMyScoreInput(e.target.value)}
                      placeholder="선택 입력"
                      type="number"
                      min={0}
                      max={100}
                      className="mt-2 w-full rounded-3xl border border-gray-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.24em] text-gray-500">시험 평균 점수</label>
                    <input
                      value={averageScoreInput}
                      onChange={(e) => setAverageScoreInput(e.target.value)}
                      placeholder="선택 입력"
                      type="number"
                      min={0}
                      max={100}
                      className="mt-2 w-full rounded-3xl border border-gray-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={saving || !subjectName.trim() || !studyRange.trim()}
                  className="mt-2 inline-flex items-center justify-center rounded-3xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  추가하기
                </button>

                {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
            <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">학년별 평점 추이</p>
                  <p className="mt-2 text-sm text-gray-600">추가한 학점 데이터를 기반으로 GPA 추이를 시각화합니다.</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-500">{gradeRecords.length}개 추가</span>
              </div>
              <div className="mt-6 h-64 w-full rounded-3xl bg-white p-4 shadow-sm">
                {gradeTrend.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500">
                    학점을 추가하면 라인 차트가 표시됩니다.
                  </div>
                ) : (
                  <svg viewBox="0 0 300 120" className="h-full w-full">
                    <polyline
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth="3"
                      points={gradeTrend
                        .map((point) => `${point.x * 2.4 + 20},${110 - (point.value / 4.5) * 80}`)
                        .join(" ")}
                    />
                    {gradeTrend.map((point, index) => (
                      <g key={point.label}>
                        <circle cx={point.x * 2.4 + 20} cy={110 - (point.value / 4.5) * 80} r="5" fill="#0284c7" />
                        <text x={point.x * 2.4 + 20} y="116" textAnchor="middle" className="text-[10px] fill-slate-500">
                          {gradeTrend[index].label}
                        </text>
                      </g>
                    ))}
                  </svg>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6">
              <div className="grid gap-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-[0.24em] text-gray-500">과목명</label>
                  <input
                    value={gradeSubject}
                    onChange={(e) => setGradeSubject(e.target.value)}
                    placeholder="과목명을 입력하세요"
                    className="mt-2 w-full rounded-3xl border border-gray-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.24em] text-gray-500">학년</label>
                    <select
                      value={gradeYear}
                      onChange={(e) => setGradeYear(Number(e.target.value) as 1 | 2 | 3 | 4)}
                      className="mt-2 w-full rounded-3xl border border-gray-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    >
                      {[1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value}학년
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.24em] text-gray-500">학기</label>
                    <select
                      value={gradeSemester}
                      onChange={(e) => setGradeSemester(e.target.value as "1학기" | "2학기")}
                      className="mt-2 w-full rounded-3xl border border-gray-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    >
                      {(["1학기", "2학기"] as const).map((semester) => (
                        <option key={semester} value={semester}>
                          {semester}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.24em] text-gray-500">취득 평점</label>
                    <input
                      value={gradePointInput}
                      onChange={(e) => setGradePointInput(Number(e.target.value))}
                      placeholder="4.5"
                      type="number"
                      min={0}
                      max={4.5}
                      step={0.1}
                      className="mt-2 w-full rounded-3xl border border-gray-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.24em] text-gray-500">이수 학점</label>
                    <select
                      value={gradeCreditInput}
                      onChange={(e) => setGradeCreditInput(Number(e.target.value))}
                      className="mt-2 w-full rounded-3xl border border-gray-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    >
                      {[1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value}학점
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddGradeRecord}
                  className="mt-2 inline-flex items-center justify-center rounded-3xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
                >
                  학점 추가
                </button>

                {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">🔥 오늘의 추천 공부 우선순위</p>
            <p className="mt-2 max-w-2xl text-sm text-gray-500">
              {activeTab === "midterm"
                ? "중간고사 대비 전공 및 고학점 순으로 우선순위가 매겨집니다."
                : "기말 평점 방어를 반영한 전략적 추천 과목을 확인하세요."}
            </p>
          </div>
          <div className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            전체 과목 {entries.length}개
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {loading ? (
            <LoadingCard />
          ) : entries.length === 0 ? (
            <div className="rounded-[1.75rem] border border-gray-100 bg-gray-50 p-8 text-center text-sm text-gray-500">
              추가된 시험 전략 과목이 없습니다.
            </div>
          ) : (
            sortedEntries.map((item) => {
              const demoted = activeTab === "final" && isFinalDemoted(item);
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border border-gray-100 bg-white p-5 transition ${
                    item.is_completed ? "opacity-80" : "hover:shadow-sm"
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className={`text-xl font-semibold ${item.is_completed ? "text-gray-400 line-through" : "text-slate-900"}`}>
                          {item.subject_name}
                        </p>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            item.is_completed
                              ? "bg-gray-100 text-gray-500 border border-gray-200"
                              : item.is_major
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : "bg-slate-50 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {item.is_major ? "전공" : "교양"}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          demoted
                            ? "bg-pink-50 text-pink-700 border border-pink-100"
                            : "bg-slate-50 text-slate-600 border border-gray-100"
                        }`}
                        >
                          {demoted ? "하향 조정" : activeTab === "midterm" ? "중간고사 우선" : "기말 전략"}
                        </span>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-3xl bg-gray-50 p-3 text-sm text-gray-600">
                          <p className="font-semibold text-slate-900">학점</p>
                          <p className="mt-1">{item.credits}학점</p>
                        </div>
                        <div className="rounded-3xl bg-gray-50 p-3 text-sm text-gray-600">
                          <p className="font-semibold text-slate-900">시험 범위</p>
                          <p className="mt-1 break-words">{item.study_range}</p>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-3xl bg-gray-50 p-3 text-sm text-gray-600">
                          <p className="font-semibold text-slate-900">내 점수</p>
                          <p className="mt-1">{item.my_score != null ? `${item.my_score}점` : "미입력"}</p>
                        </div>
                        <div className="rounded-3xl bg-gray-50 p-3 text-sm text-gray-600">
                          <p className="font-semibold text-slate-900">평균 점수</p>
                          <p className="mt-1">{item.average_score != null ? `${item.average_score}점` : "미입력"}</p>
                        </div>
                      </div>

                      <p className="rounded-3xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                        {getStrategyMessage(item, activeTab)}
                      </p>
                    </div>

                    <div className="flex flex-col items-start gap-3 sm:items-end">
                      <button
                        type="button"
                        onClick={() => handleToggleCompleted(item.id, item.is_completed)}
                        className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          item.is_completed
                            ? "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                            : "border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-200"
                        }`}
                      >
                        {item.is_completed ? "완료 처리됨" : "학습 완료"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="inline-flex items-center gap-2 rounded-full text-sm font-semibold text-gray-400 transition hover:text-gray-700"
                      >
                        <span aria-hidden="true">🗑️</span>
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
      {toastMessage ? <ToastMessage message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} /> : null}
    </div>
  );
}
