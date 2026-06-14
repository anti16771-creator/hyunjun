"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import { getUserTimetableSubjects } from "@/src/lib/supabase";

type Phase = "setup" | "playing" | "result";
type InputTab = "text" | "subject" | "file";
type QuizType = "multiple" | "short" | "mixed";
type Difficulty = "easy" | "normal" | "hard";

type Question = {
  type: "multiple" | "short";
  question: string;
  options?: string[] | null;
  answer: string;
  explanation: string;
};

type AnswerState = {
  userAnswer: string;
  submitted: boolean;
  selfCorrect: boolean | null;
};

type QuizRecord = {
  id: string;
  date: string;
  source: string;
  score: number;
  total: number;
  questions?: Question[];
  answerStates?: AnswerState[];
};

const QUIZ_HISTORY_KEY = "smartgrade_quiz_history";

const NUMBER_SYMBOLS = ["①", "②", "③", "④"];

function resolveAnswer(q: Question): string {
  const raw = q.answer.trim();
  const idx = NUMBER_SYMBOLS.indexOf(raw);
  if (idx !== -1 && q.options && q.options[idx] !== undefined) {
    return q.options[idx].trim();
  }
  return raw;
}

function isCorrect(q: Question, s: AnswerState): boolean {
  if (q.type === "multiple") return s.userAnswer.trim() === resolveAnswer(q);
  return s.selfCorrect === true;
}

function computeScore(questions: Question[], states: AnswerState[]) {
  const total = questions.length;
  const correct = questions.filter((q, i) => isCorrect(q, states[i])).length;
  return { correct, total };
}

function scoreColorCls(pct: number) {
  if (pct >= 80) return { text: "text-emerald-600 dark:text-emerald-400", badge: "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/30 dark:text-emerald-300" };
  if (pct >= 60) return { text: "text-amber-600 dark:text-amber-400",   badge: "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/30 dark:text-amber-300" };
  return            { text: "text-rose-600 dark:text-rose-400",           badge: "border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/30 dark:text-rose-300" };
}

function shuffleQuestion(q: Question): Question {
  if (q.type !== "multiple" || !q.options || q.options.length === 0) return q;
  const resolvedAns = resolveAnswer(q);
  return { ...q, options: [...q.options].sort(() => Math.random() - 0.5), answer: resolvedAns };
}

export default function QuizPage() {
  const { user, loading: authLoading } = useAuth();

  const [subjects, setSubjects] = useState<string[]>([]);

  // Setup form
  const [inputTab, setInputTab] = useState<InputTab>("text");
  const [textInput, setTextInput] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<{
    text?: string;
    base64?: string;
    mimeType?: string;
  }>({});
  const [questionCount, setQuestionCount] = useState<5 | 10 | 20>(10);
  const [quizType, setQuizType] = useState<QuizType>("multiple");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");

  // Quiz
  const [phase, setPhase] = useState<Phase>("setup");
  const [generating, setGenerating] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answerStates, setAnswerStates] = useState<AnswerState[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentInput, setCurrentInput] = useState("");
  const [quizSource, setQuizSource] = useState("");

  // Results UI
  const [showWrong, setShowWrong] = useState(false);

  // History
  const [history, setHistory] = useState<QuizRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [wrongViewRecord, setWrongViewRecord] = useState<QuizRecord | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  useEffect(() => {
    try {
      const stored: QuizRecord[] = JSON.parse(localStorage.getItem(QUIZ_HISTORY_KEY) || "[]");
      const withIds = stored.map((r) => r.id ? r : { ...r, id: Math.random().toString(36).slice(2) });
      setHistory(withIds);
      if (withIds.some((r, i) => !stored[i]?.id)) {
        localStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify(withIds));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    getUserTimetableSubjects(user.id).then((res) => {
      if (!res.error) {
        const list = Array.from(
          new Set(
            (res.data ?? []).map((i: { subject: string }) => i.subject).filter(Boolean)
          )
        ) as string[];
        setSubjects(list);
      }
    });
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setFileData({});
    if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        setFileData({ base64, mimeType: "application/pdf" });
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => setFileData({ text: ev.target?.result as string });
      reader.readAsText(file, "utf-8");
    }
  };

  const handleGenerate = async () => {
    let content = "";
    let fileBase64 = "";
    let fileMimeType = "";
    let source = "";

    if (inputTab === "text") {
      if (!textInput.trim()) {
        showToast("학습 내용을 입력해주세요.", "error");
        return;
      }
      content = textInput.trim();
      source = content.slice(0, 20) + (content.length > 20 ? "…" : "");
    } else if (inputTab === "subject") {
      if (!selectedSubject) {
        showToast("과목을 선택해주세요.", "error");
        return;
      }
      content = `${selectedSubject} 과목의 핵심 개념과 이론에 관한 대학교 수준의 퀴즈를 만들어줘.`;
      source = selectedSubject;
    } else {
      if (!uploadedFile) {
        showToast("파일을 선택해주세요.", "error");
        return;
      }
      if (!fileData.base64 && !fileData.text) {
        showToast("파일을 읽는 중입니다. 잠시 후 다시 시도해주세요.", "error");
        return;
      }
      if (fileData.base64) {
        fileBase64 = fileData.base64;
        fileMimeType = fileData.mimeType!;
      } else {
        content = fileData.text!;
      }
      source = uploadedFile.name;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/ai-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          fileBase64,
          fileMimeType,
          count: questionCount,
          type: quizType,
          difficulty,
        }),
      });
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      const qs: Question[] = (json.questions ?? []).slice(0, questionCount);
      if (!qs.length) throw new Error("Empty");

      setQuestions(qs);
      setAnswerStates(qs.map(() => ({ userAnswer: "", submitted: false, selfCorrect: null })));
      setCurrentIdx(0);
      setCurrentInput("");
      setQuizSource(source);
      setShowWrong(false);
      setPhase("playing");
    } catch {
      showToast("퀴즈 생성에 실패했습니다. 다시 시도해주세요.", "error");
    } finally {
      setGenerating(false);
    }
  };

  const submitAnswer = () => {
    if (!currentInput.trim()) return;
    setAnswerStates((prev) =>
      prev.map((s, i) =>
        i === currentIdx ? { ...s, userAnswer: currentInput, submitted: true } : s
      )
    );
  };

  const selfGrade = (correct: boolean) => {
    setAnswerStates((prev) =>
      prev.map((s, i) => (i === currentIdx ? { ...s, selfCorrect: correct } : s))
    );
  };

  const goNext = () => {
    if (currentIdx + 1 < questions.length) {
      setCurrentIdx(currentIdx + 1);
      setCurrentInput("");
    } else {
      const { correct, total } = computeScore(questions, answerStates);
      const record: QuizRecord = {
        id: Math.random().toString(36).slice(2),
        date: new Date().toISOString().slice(0, 10),
        source: quizSource,
        score: correct,
        total,
        questions: [...questions],
        answerStates: [...answerStates],
      };
      const newHistory = [record, ...history].slice(0, 30);
      setHistory(newHistory);
      localStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify(newHistory));
      setPhase("result");
    }
  };

  const handleRetry = () => {
    setAnswerStates(questions.map(() => ({ userAnswer: "", submitted: false, selfCorrect: null })));
    setCurrentIdx(0);
    setCurrentInput("");
    setShowWrong(false);
    setPhase("playing");
  };

  const handleRetryFromHistory = (record: QuizRecord) => {
    if (!record.questions?.length) return;
    const shuffled = record.questions.map(shuffleQuestion);
    setQuestions(shuffled);
    setAnswerStates(shuffled.map(() => ({ userAnswer: "", submitted: false, selfCorrect: null })));
    setCurrentIdx(0);
    setCurrentInput("");
    setQuizSource(record.source);
    setShowWrong(false);
    setPhase("playing");
  };

  const handleDeleteHistoryRecord = (id: string) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    const newHistory = history.filter((r) => r.id !== id);
    setHistory(newHistory);
    localStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify(newHistory));
    showToast("삭제되었습니다.", "success");
  };

  const handleNewQuiz = () => {
    setPhase("setup");
    setQuestions([]);
    setCurrentInput("");
    setShowWrong(false);
  };

  if (authLoading) return <LoadingCard />;

  // ── Setup phase ───────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="space-y-6">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                🧠 AI 퀴즈
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                AI 퀴즈 생성
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                학습 내용, 과목, 또는 파일로 맞춤형 퀴즈를 만들어보세요.
              </p>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="flex-shrink-0 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                📜 기록 {history.length}개
              </button>
            )}
          </div>

          {showHistory && history.length > 0 && (
            <div className="mt-4 space-y-2">
              {history.slice(0, 20).map((r) => {
                const pct   = Math.round((r.score / r.total) * 100);
                const color = scoreColorCls(pct);
                const wrongCount = r.questions && r.answerStates
                  ? r.questions.filter((q, i) => !isCorrect(q, r.answerStates![i])).length
                  : 0;
                return (
                  <div key={r.id}
                    className="group flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{r.source}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{r.date}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${color.badge}`}>
                      {r.score}/{r.total} · {pct}%
                    </span>
                    {wrongCount > 0 && (
                      <button type="button" onClick={() => setWrongViewRecord(r)}
                        className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/30 dark:text-rose-300">
                        오답 {wrongCount}개
                      </button>
                    )}
                    {r.questions?.length ? (
                      <button type="button" onClick={() => handleRetryFromHistory(r)}
                        className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                        다시 풀기
                      </button>
                    ) : null}
                    <button type="button" onClick={() => handleDeleteHistoryRecord(r.id)}
                      className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-950/30 dark:hover:text-red-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 오답 확인 모달 */}
          {wrongViewRecord && (() => {
            const wrongItems = wrongViewRecord.questions!
              .map((q, i) => ({ q, s: wrongViewRecord.answerStates![i], i }))
              .filter(({ q, s }) => !isCorrect(q, s));
            return (
              <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8"
                onClick={(e) => { if (e.target === e.currentTarget) setWrongViewRecord(null); }}>
                <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-rose-500">❌ 오답 확인</p>
                      <p className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                        틀린 문제 {wrongItems.length}개
                      </p>
                    </div>
                    <button type="button" onClick={() => setWrongViewRecord(null)}
                      className="rounded-full px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                      닫기
                    </button>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{wrongViewRecord.source} · {wrongViewRecord.date}</p>

                  <div className="mt-4 space-y-4">
                    {wrongItems.map(({ q, s, i }) => (
                      <div key={i} className="rounded-2xl border border-rose-100 bg-rose-50/30 p-4 dark:border-rose-900/20 dark:bg-rose-950/10">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-xs font-bold text-rose-500">{i + 1}번</span>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            q.type === "multiple"
                              ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300"
                              : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300"
                          }`}>{q.type === "multiple" ? "객관식" : "주관식"}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{q.question}</p>
                        <div className="mt-2.5 space-y-1">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            내 답변: <span className="font-semibold text-rose-600 dark:text-rose-400">{s.userAnswer || "(미제출)"}</span>
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            정답: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{q.answer}</span>
                          </p>
                        </div>
                        <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3 dark:border-sky-900/30 dark:bg-sky-950/20">
                          <p className="text-xs font-semibold text-sky-500">💡 해설</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{q.explanation}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={() => { handleRetryFromHistory(wrongViewRecord); setWrongViewRecord(null); }}
                    className="mt-5 w-full rounded-3xl bg-sky-600 py-3 text-sm font-semibold text-white transition hover:bg-sky-700">
                    🔄 이 퀴즈 다시 풀기
                  </button>
                </div>
              </div>
            );
          })()}
        </section>

        {/* Input method */}
        <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            퀴즈 소재 선택
          </p>

          <div className="mt-4 flex w-fit overflow-hidden rounded-full border border-slate-200 p-1 dark:border-slate-700">
            {(
              [
                { key: "text", label: "✏️ 직접 입력" },
                { key: "subject", label: "📚 과목 선택" },
                { key: "file", label: "📎 파일 업로드" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setInputTab(t.key)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                  inputTab === t.key
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-5">
            {inputTab === "text" && (
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  학습 내용 또는 주제 입력
                </label>
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows={6}
                  placeholder="예: 운영체제 프로세스 스케줄링 — FCFS, SJF, Round Robin 알고리즘의 특징과 차이점..."
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <p className="mt-1.5 text-right text-xs text-slate-400">{textInput.length}자</p>
              </div>
            )}

            {inputTab === "subject" && (
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  과목 선택
                </label>
                {!user ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-800 dark:bg-amber-950/30">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      로그인 후 시간표에 등록된 과목을 선택할 수 있습니다.
                    </p>
                  </div>
                ) : subjects.length === 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-800 dark:bg-amber-950/30">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      시간표에 등록된 과목이 없습니다. 홈 대시보드에서 시간표를 먼저 등록해주세요.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {subjects.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSelectedSubject(s)}
                        className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition ${
                          selectedSubject === s
                            ? "border-sky-400 bg-sky-600 text-white"
                            : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {inputTab === "file" && (
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  파일 업로드 (PDF, TXT, MD)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-10 transition hover:border-sky-400 hover:bg-sky-50/30 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-sky-600"
                >
                  {uploadedFile ? (
                    <>
                      <span className="text-3xl">📄</span>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {uploadedFile.name}
                      </p>
                      <p className="text-xs text-slate-400">클릭하여 다른 파일 선택</p>
                      {!fileData.base64 && !fileData.text && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          파일 읽는 중...
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-3xl text-slate-300 dark:text-slate-600">📎</span>
                      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        클릭하여 파일 선택
                      </p>
                      <p className="text-xs text-slate-400">PDF, TXT, MD 지원</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            )}
          </div>
        </section>

        {/* Quiz settings */}
        <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            퀴즈 설정
          </p>

          <div className="mt-5 grid gap-6 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                문제 수
              </label>
              <div className="flex gap-2">
                {([5, 10, 20] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQuestionCount(n)}
                    className={`flex-1 rounded-2xl border py-2.5 text-sm font-semibold transition ${
                      questionCount === n
                        ? "border-sky-400 bg-sky-600 text-white"
                        : "border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {n}개
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                유형
              </label>
              <div className="flex gap-2">
                {(
                  [
                    { key: "multiple", label: "객관식" },
                    { key: "short", label: "주관식" },
                    { key: "mixed", label: "혼합" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setQuizType(t.key)}
                    className={`flex-1 rounded-2xl border py-2.5 text-sm font-semibold transition ${
                      quizType === t.key
                        ? "border-violet-400 bg-violet-600 text-white"
                        : "border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                난이도
              </label>
              <div className="flex gap-2">
                {(
                  [
                    { key: "easy", label: "쉬움" },
                    { key: "normal", label: "보통" },
                    { key: "hard", label: "어려움" },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDifficulty(d.key)}
                    className={`flex-1 rounded-2xl border py-2.5 text-sm font-semibold transition ${
                      difficulty === d.key
                        ? "border-amber-400 bg-amber-500 text-white"
                        : "border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="mt-6 w-full rounded-3xl bg-sky-600 py-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? (
              <span className="inline-flex items-center justify-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                AI가 퀴즈를 생성하고 있어요...
              </span>
            ) : (
              `🧠 퀴즈 생성하기 (${questionCount}문제)`
            )}
          </button>
        </section>

        {toastMessage && (
          <ToastMessage
            message={toastMessage}
            type={toastType}
            onClose={() => setToastMessage(null)}
          />
        )}
      </div>
    );
  }

  // ── Playing phase ─────────────────────────────────────────────────────────
  const curQ = questions[currentIdx];
  const curS = answerStates[currentIdx];

  if (phase === "playing" && curQ) {
    const isMultiple = curQ.type === "multiple";
    const isSubmitted = curS?.submitted ?? false;
    const resolvedAnswer = resolveAnswer(curQ);
    const multipleCorrect =
      isMultiple && isSubmitted && curS.userAnswer.trim() === resolvedAnswer;
    const multipleWrong =
      isMultiple && isSubmitted && curS.userAnswer.trim() !== resolvedAnswer;
    const canGoNext =
      isSubmitted && (isMultiple || curS.selfCorrect !== null);

    return (
      <div className="space-y-6">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                🧠 AI 퀴즈
              </p>
              <p className="mt-0.5 max-w-xs truncate text-sm font-medium text-slate-600 dark:text-slate-400">
                {quizSource}
              </p>
            </div>
            <button
              type="button"
              onClick={handleNewQuiz}
              className="flex-shrink-0 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ✕ 종료
            </button>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>
                {currentIdx + 1} / {questions.length} 문제
              </span>
              <span>{Math.round((currentIdx / questions.length) * 100)}%</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-500"
                style={{ width: `${(currentIdx / questions.length) * 100}%` }}
              />
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-extrabold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
              {currentIdx + 1}
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                curQ.type === "multiple"
                  ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300"
                  : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300"
              }`}
            >
              {curQ.type === "multiple" ? "객관식" : "주관식"}
            </span>
          </div>

          <p className="text-base font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
            {curQ.question}
          </p>

          <div className="mt-6 space-y-3">
            {isMultiple && curQ.options ? (
              curQ.options.map((opt, oi) => {
                let cls =
                  "border-slate-200 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
                if (isSubmitted) {
                  if (opt.trim() === resolvedAnswer) {
                    cls =
                      "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200";
                  } else if (curS.userAnswer.trim() === opt.trim() && multipleWrong) {
                    cls =
                      "border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-600 dark:bg-rose-950/40 dark:text-rose-200";
                  } else {
                    cls =
                      "border-slate-100 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500";
                  }
                } else if (currentInput === opt) {
                  cls =
                    "border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-600 dark:bg-sky-950/40 dark:text-sky-200";
                }
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={isSubmitted}
                    onClick={() => setCurrentInput(opt)}
                    className={`w-full rounded-2xl border px-5 py-3.5 text-left text-sm font-medium transition disabled:cursor-default ${cls}`}
                  >
                    {opt}
                  </button>
                );
              })
            ) : (
              <textarea
                value={isSubmitted ? curS.userAnswer : currentInput}
                onChange={(e) => !isSubmitted && setCurrentInput(e.target.value)}
                disabled={isSubmitted}
                rows={3}
                placeholder="답을 입력하세요..."
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-900 outline-none transition focus:border-sky-500 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            )}
          </div>

          {!isSubmitted && (
            <button
              type="button"
              onClick={submitAnswer}
              disabled={!currentInput.trim()}
              className="mt-5 w-full rounded-3xl bg-sky-600 py-3.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              제출하기
            </button>
          )}

          {isSubmitted && (
            <div className="mt-5 space-y-4">
              {isMultiple && (
                <div
                  className={`flex items-center gap-3 rounded-2xl border px-5 py-4 ${
                    multipleCorrect
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30"
                  }`}
                >
                  <span className="text-xl">{multipleCorrect ? "✅" : "❌"}</span>
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        multipleCorrect
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-rose-700 dark:text-rose-300"
                      }`}
                    >
                      {multipleCorrect ? "정답이에요!" : "오답이에요."}
                    </p>
                    {multipleWrong && (
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        정답:{" "}
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {resolvedAnswer}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {!isMultiple && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    정답
                  </p>
                  <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    {curQ.answer}
                  </p>
                  {curS.selfCorrect === null && (
                    <>
                      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        내 답변과 비교하여 자가 채점해주세요.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => selfGrade(true)}
                          className="flex-1 rounded-2xl border border-emerald-200 bg-emerald-50 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                        >
                          ✓ 맞았어요
                        </button>
                        <button
                          type="button"
                          onClick={() => selfGrade(false)}
                          className="flex-1 rounded-2xl border border-rose-200 bg-rose-50 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                        >
                          ✗ 틀렸어요
                        </button>
                      </div>
                    </>
                  )}
                  {curS.selfCorrect !== null && (
                    <div
                      className={`mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 ${
                        curS.selfCorrect
                          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                          : "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30"
                      }`}
                    >
                      <span>{curS.selfCorrect ? "✅" : "❌"}</span>
                      <span
                        className={`text-sm font-semibold ${
                          curS.selfCorrect
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-rose-700 dark:text-rose-300"
                        }`}
                      >
                        {curS.selfCorrect ? "정답 처리" : "오답 처리"}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-sky-100 bg-sky-50/50 px-5 py-4 dark:border-sky-900/30 dark:bg-sky-950/20">
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-500 dark:text-sky-400">
                  💡 해설
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {curQ.explanation}
                </p>
              </div>

              {canGoNext && (
                <button
                  type="button"
                  onClick={goNext}
                  className="w-full rounded-3xl bg-sky-600 py-3.5 text-sm font-semibold text-white transition hover:bg-sky-700"
                >
                  {currentIdx + 1 < questions.length
                    ? `다음 문제 (${currentIdx + 2}/${questions.length})`
                    : "결과 보기 🎯"}
                </button>
              )}
            </div>
          )}
        </section>

        {toastMessage && (
          <ToastMessage
            message={toastMessage}
            type={toastType}
            onClose={() => setToastMessage(null)}
          />
        )}
      </div>
    );
  }

  // ── Result phase ──────────────────────────────────────────────────────────
  if (phase === "result") {
    const { correct, total } = computeScore(questions, answerStates);
    const pct = Math.round((correct / total) * 100);
    const wrongItems = questions
      .map((q, i) => ({ q, s: answerStates[i], i }))
      .filter(({ q, s }) => !isCorrect(q, s));

    return (
      <div className="space-y-6">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            🧠 AI 퀴즈 결과
          </p>

          <div
            className={`mx-auto mt-6 flex h-36 w-36 items-center justify-center rounded-full border-4 ${
              pct >= 80
                ? "border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30"
                : pct >= 60
                ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30"
                : "border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/30"
            }`}
          >
            <div>
              <p
                className={`text-4xl font-extrabold ${
                  pct >= 80
                    ? "text-emerald-600 dark:text-emerald-400"
                    : pct >= 60
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {pct}점
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                {correct}/{total} 정답
              </p>
            </div>
          </div>

          <p className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {pct >= 90
              ? "완벽해요! 🎉"
              : pct >= 80
              ? "훌륭합니다! 👍"
              : pct >= 60
              ? "잘 했어요! 계속 화이팅!"
              : "더 복습이 필요해요. 파이팅! 💪"}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">출처: {quizSource}</p>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              {
                label: "전체 문제",
                value: String(total),
                color: "text-slate-900 dark:text-slate-100",
              },
              {
                label: "정답",
                value: String(correct),
                color: "text-emerald-600 dark:text-emerald-400",
              },
              {
                label: "오답",
                value: String(total - correct),
                color: "text-rose-600 dark:text-rose-400",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 py-4 text-center dark:border-slate-700 dark:bg-slate-950"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {s.label}
                </p>
                <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </section>

        {wrongItems.length > 0 && (
          <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setShowWrong((v) => !v)}
              className="flex w-full items-center justify-between"
            >
              <div className="text-left">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-500">
                  ❌ 틀린 문제 ({wrongItems.length}개)
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {showWrong ? "접기" : "클릭하여 확인하기"}
                </p>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${
                  showWrong ? "rotate-180" : ""
                }`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showWrong && (
              <div className="mt-4 space-y-4">
                {wrongItems.map(({ q, s, i }) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-rose-100 bg-rose-50/30 p-5 dark:border-rose-900/20 dark:bg-rose-950/10"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-xs font-bold text-rose-500">{i + 1}번</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          q.type === "multiple"
                            ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300"
                            : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300"
                        }`}
                      >
                        {q.type === "multiple" ? "객관식" : "주관식"}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {q.question}
                    </p>
                    <div className="mt-3 space-y-1.5">
                      <p className="text-xs text-slate-500">
                        내 답변:{" "}
                        <span className="font-semibold text-rose-600 dark:text-rose-400">
                          {s.userAnswer || "(미제출)"}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        정답:{" "}
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {q.answer}
                        </span>
                      </p>
                    </div>
                    <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3 dark:border-sky-900/30 dark:bg-sky-950/20">
                      <p className="text-xs font-semibold text-sky-500">💡 해설</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {q.explanation}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleRetry}
            className="flex-1 rounded-3xl border border-slate-200 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            🔄 다시 풀기
          </button>
          <button
            type="button"
            onClick={handleNewQuiz}
            className="flex-1 rounded-3xl bg-sky-600 py-3.5 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            🧠 새 퀴즈 생성
          </button>
        </div>

        {toastMessage && (
          <ToastMessage
            message={toastMessage}
            type={toastType}
            onClose={() => setToastMessage(null)}
          />
        )}
      </div>
    );
  }

  return null;
}
