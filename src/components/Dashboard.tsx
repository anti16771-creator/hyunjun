"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { loadFromLocalStorage, saveToLocalStorage } from "@/src/lib/localStorage";

const STORAGE_KEYS = {
  planner: "smartgrade_planner",
  grades: "smartgrade_grades",
  archive: "smartgrade_archive",
  schedule: "smartgrade_schedule",
  studyLogs: "smartgrade_study_logs",
  settings: "smartgrade_settings",
};

const gradeOptions = [
  { label: "A+", value: 4.5 },
  { label: "A", value: 4.0 },
  { label: "B+", value: 3.5 },
  { label: "B", value: 3.0 },
  { label: "C+", value: 2.5 },
  { label: "C", value: 2.0 },
  { label: "D+", value: 1.5 },
  { label: "D", value: 1.0 },
  { label: "F", value: 0 },
];

const defaultArchive = [
  {
    id: "archive-1",
    semester: "1학년 1학기",
    files: [
      { id: "file-1", name: "운영체제 노트.pdf", note: "페이지 교체, 스케줄링 개념 정리" },
      { id: "file-2", name: "자료구조 정리.docx", note: "트리, 그래프 정리" },
    ],
  },
  {
    id: "archive-2",
    semester: "1학년 2학기",
    files: [
      { id: "file-3", name: "웹개발 프로젝트 계획.pptx", note: "프론트엔드 기술 스택 정리" },
    ],
  },
];

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const secondsLeft = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secondsLeft).padStart(2, "0")}`;
}

function weekdayLabel(index: number) {
  return ["일", "월", "화", "수", "목", "금", "토"][index] || "";
}

function getPriorityByDueDate(dueDate: string) {
  if (!dueDate) return "normal";
  const now = new Date();
  const target = new Date(`${dueDate}T23:59:59`);
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff <= 3 ? "urgent" : "normal";
}

function getGradeTheme(value: number) {
  if (value >= 4) return { label: "A", className: "bg-emerald-50 text-emerald-700" };
  if (value >= 3) return { label: "B", className: "bg-sky-50 text-sky-700" };
  return { label: "C", className: "bg-orange-50 text-orange-700" };
}

function getNotificationPermission() {
  if (typeof window === "undefined") return;
  if (Notification.permission === "default") Notification.requestPermission();
}

function beep() {
  if (typeof window === "undefined") return;
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.2);
}

export default function Dashboard() {
  const [planner, setPlanner] = useState<{
    id: string;
    title: string;
    dueDate: string;
    completed: boolean;
    priority: "urgent" | "normal";
  }[]>([]);
  const [grades, setGrades] = useState<{
    id: string;
    name: string;
    credit: number;
    scoreValue: number;
    scoreLabel: string;
    memo: string;
  }[]>([]);
  const [archive, setArchive] = useState<
    { id: string; semester: string; files: { id: string; name: string; note: string }[]; expanded?: boolean }[]
  >([]);
  const [schedule, setSchedule] = useState<
    { id: string; weekday: number; time: string; subject: string }[]
  >([]);
  const [studyLogs, setStudyLogs] = useState<{ id: string; date: string; minutes: number; subject: string }[]>([]);
  const [settings, setSettings] = useState({ darkMode: false, prioritySort: true });

  const [plannerTitle, setPlannerTitle] = useState("");
  const [plannerDue, setPlannerDue] = useState("");

  const [gradeName, setGradeName] = useState("");
  const [gradeCredit, setGradeCredit] = useState(3);
  const [gradeScore, setGradeScore] = useState(4.5);

  const [scheduleWeekday, setScheduleWeekday] = useState(1);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleSubject, setScheduleSubject] = useState("");

  const [memoModal, setMemoModal] = useState({ open: false, title: "", type: "grade" as "grade" | "file", targetId: "", content: "" });
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerMode, setTimerMode] = useState<"focus" | "break">("focus");
  const [timerCycle, setTimerCycle] = useState(1);
  const [timerSubject, setTimerSubject] = useState("전체 과목");

  const timerRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const todayWeekday = useMemo(() => today.getDay(), [today]);

  useEffect(() => {
    setPlanner(loadFromLocalStorage(STORAGE_KEYS.planner, []));
    setGrades(loadFromLocalStorage(STORAGE_KEYS.grades, []));
    setArchive(loadFromLocalStorage(STORAGE_KEYS.archive, defaultArchive));
    setSchedule(
      loadFromLocalStorage(STORAGE_KEYS.schedule, [
        { id: "schedule-1", weekday: 1, time: "10:00", subject: "데이터베이스" },
        { id: "schedule-2", weekday: 3, time: "14:00", subject: "웹개발" },
        { id: "schedule-3", weekday: 4, time: "16:00", subject: "운영체제" },
      ]),
    );
    setStudyLogs(loadFromLocalStorage(STORAGE_KEYS.studyLogs, []));
    setSettings(loadFromLocalStorage(STORAGE_KEYS.settings, { darkMode: false, prioritySort: true }));
    getNotificationPermission();
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    saveToLocalStorage(STORAGE_KEYS.planner, planner);
  }, [planner]);

  useEffect(() => {
    saveToLocalStorage(STORAGE_KEYS.grades, grades);
  }, [grades]);

  useEffect(() => {
    saveToLocalStorage(STORAGE_KEYS.archive, archive);
  }, [archive]);

  useEffect(() => {
    saveToLocalStorage(STORAGE_KEYS.schedule, schedule);
  }, [schedule]);

  useEffect(() => {
    saveToLocalStorage(STORAGE_KEYS.studyLogs, studyLogs);
  }, [studyLogs]);

  useEffect(() => {
    saveToLocalStorage(STORAGE_KEYS.settings, settings);
    document.body.classList.toggle("dark", settings.darkMode);
  }, [settings]);

  useEffect(() => {
    if (!timerRunning) return;
    const duration = timerMode === "focus" ? 1500 : 300;
    timerRef.current = window.setInterval(() => {
      setTimerSeconds((prev) => {
        const next = prev + 1;
        if (next >= duration) {
          if (timerMode === "focus") {
            const subject = timerSubject || "전체 과목";
            setStudyLogs((prevLogs) => [
              ...prevLogs,
              { id: `${Date.now()}`, date: todayKey, minutes: Math.round(next / 60), subject },
            ]);
          }
          beep();
          if (Notification.permission === "granted") {
            new Notification("Smart Grade", {
              body:
                timerMode === "focus"
                  ? "집중 시간이 종료되었습니다. 휴식 시간을 시작하세요."
                  : "휴식 시간이 종료되었습니다. 다시 집중하세요.",
            });
          }
          setTimerMode((prevMode) => (prevMode === "focus" ? "break" : "focus"));
          if (timerMode === "break") {
            setTimerCycle((cycle) => cycle + 1);
          }
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [timerRunning, timerMode, timerSubject, todayKey]);

  const todayClasses = useMemo(() => schedule.filter((item) => item.weekday === todayWeekday).length, [schedule, todayWeekday]);
  const upcomingTasks = useMemo(() => planner.filter((item) => !item.completed).length, [planner]);
  const completedTasks = useMemo(() => planner.filter((item) => item.completed).length, [planner]);
  const achievementRate = planner.length ? Math.round((completedTasks / planner.length) * 100) : 0;
  const todayStudyMinutes = useMemo(
    () => studyLogs.filter((item) => item.date === todayKey).reduce((sum, item) => sum + item.minutes, 0),
    [studyLogs, todayKey],
  );

  const timerDuration = timerMode === "focus" ? 1500 : 300;
  const timerPercent = Math.min(100, (timerSeconds / timerDuration) * 100);

  const weeklyStudyData = useMemo(() => {
    return [...Array(7)].map((_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = formatDateKey(date);
      const minutes = studyLogs.filter((log) => log.date === key).reduce((sum, item) => sum + item.minutes, 0);
      return { date: `${date.getMonth() + 1}/${date.getDate()}`, minutes };
    });
  }, [studyLogs]);

  const subjectStudyData = useMemo(() => {
    const category = studyLogs.reduce<Record<string, number>>((acc, item) => {
      acc[item.subject] = (acc[item.subject] || 0) + item.minutes;
      return acc;
    }, {});
    return Object.entries(category).map(([subject, minutes]) => ({ subject, minutes }));
  }, [studyLogs]);

  const todayCalendarEvents = useMemo(
    () => planner.filter((item) => item.dueDate === todayKey),
    [planner, todayKey],
  );

  const handleThemeToggle = () => {
    setSettings((prev) => ({ ...prev, darkMode: !prev.darkMode }));
  };

  const handlePriorityToggle = () => {
    setSettings((prev) => ({ ...prev, prioritySort: !prev.prioritySort }));
  };

  const sortedPlanner = useMemo(() => {
    const sorted = [...planner];
    if (settings.prioritySort) {
      sorted.sort((a, b) => {
        if (a.priority === b.priority) return a.dueDate.localeCompare(b.dueDate);
        return a.priority === "urgent" ? -1 : 1;
      });
    }
    return sorted;
  }, [planner, settings.prioritySort]);

  const todayMonth = useMemo(() => `${today.getFullYear()}년 ${today.getMonth() + 1}월`, [today]);
  const calendarDays = useMemo(() => {
    const first = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return Array.from({ length: first + last }, (_, index) => {
      const day = index - first + 1;
      if (day <= 0) return null;
      const date = new Date(today.getFullYear(), today.getMonth(), day);
      const key = formatDateKey(date);
      const events = planner.filter((item) => item.dueDate === key);
      return { date, events };
    });
  }, [planner, today]);

  const [calendarSelectedDate, setCalendarSelectedDate] = useState(todayKey);

  useEffect(() => {
    setCalendarSelectedDate(todayKey);
  }, [todayKey]);

  const calendarSelectedEvents = useMemo(
    () => planner.filter((item) => item.dueDate === calendarSelectedDate),
    [planner, calendarSelectedDate],
  );

  const handlePlannerAdd = () => {
    if (!plannerTitle.trim()) return;
    const newItem = {
      id: `${Date.now()}`,
      title: plannerTitle.trim(),
      dueDate: plannerDue || todayKey,
      completed: false,
      priority: getPriorityByDueDate(plannerDue || todayKey) as "urgent" | "normal",
    };
    setPlanner((prev) => [...prev, newItem]);
    setPlannerTitle("");
    setPlannerDue("");
  };

  const handlePlannerToggle = (id: string) => {
    setPlanner((prev) => prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)));
  };

  const handlePlannerDelete = (id: string) => {
    setPlanner((prev) => prev.filter((item) => item.id !== id));
  };

  const handleGradeAdd = () => {
    if (!gradeName.trim()) return;
    setGrades((prev) => [
      ...prev,
      {
        id: `${Date.now()}`,
        name: gradeName.trim(),
        credit: gradeCredit,
        scoreValue: gradeScore,
        scoreLabel: gradeOptions.find((item) => item.value === gradeScore)?.label || "F",
        memo: "",
      },
    ]);
    setGradeName("");
  };

  const handleGradeDelete = (id: string) => {
    setGrades((prev) => prev.filter((item) => item.id !== id));
  };

  const handleGradeMemoOpen = (id: string, name: string, memo: string) => {
    setMemoModal({ open: true, title: `${name} 메모`, type: "grade", targetId: id, content: memo });
  };

  const handleFileMemoOpen = (folderId: string, fileId: string, fileName: string, note: string) => {
    setMemoModal({ open: true, title: `${fileName} 메모`, type: "file", targetId: `${folderId}|${fileId}`, content: note });
  };

  const handleMemoSave = () => {
    if (memoModal.type === "grade") {
      setGrades((prev) => prev.map((item) => (item.id === memoModal.targetId ? { ...item, memo: memoModal.content } : item)));
    } else {
      const [folderId, fileId] = memoModal.targetId.split("|");
      setArchive((prev) =>
        prev.map((folder) =>
          folder.id === folderId
            ? {
                ...folder,
                files: folder.files.map((file) => (file.id === fileId ? { ...file, note: memoModal.content } : file)),
              }
            : folder,
        ),
      );
    }
    setMemoModal((prev) => ({ ...prev, open: false }));
  };

  const handleArchiveToggle = (id: string) => {
    setArchive((prev) =>
      prev.map((folder) =>
        folder.id === id ? { ...folder, expanded: !folder.expanded } : folder,
      ),
    );
  };

  const handleArchiveFolderDelete = (id: string) => {
    setArchive((prev) => prev.filter((folder) => folder.id !== id));
  };

  const handleArchiveFileDelete = (folderId: string, fileId: string) => {
    setArchive((prev) =>
      prev.map((folder) =>
        folder.id === folderId
          ? { ...folder, files: folder.files.filter((file) => file.id !== fileId) }
          : folder,
      ),
    );
  };

  const handleArchiveFolderAdd = () => {
    const semester = window.prompt("새 학기를 입력하세요.", "2학년 1학기");
    if (!semester) return;
    setArchive((prev) => [...prev, { id: `${Date.now()}`, semester, files: [] }]);
  };

  const handleArchiveFileAdd = (folderId: string) => {
    const fileName = window.prompt("파일명을 입력하세요.", "새 문서.pdf");
    if (!fileName) return;
    setArchive((prev) =>
      prev.map((folder) =>
        folder.id === folderId
          ? { ...folder, files: [...folder.files, { id: `${Date.now()}`, name: fileName, note: "" }] }
          : folder,
      ),
    );
  };

  const handleScheduleAdd = () => {
    if (!scheduleSubject.trim()) return;
    setSchedule((prev) => [
      ...prev,
      { id: `${Date.now()}`, weekday: scheduleWeekday, time: scheduleTime, subject: scheduleSubject.trim() },
    ]);
    setScheduleSubject("");
    setScheduleModalOpen(false);
  };

  const handleExport = () => {
    const payload = {
      planner,
      grades,
      archive,
      schedule,
      studyLogs,
      settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `smartgrade_backup_${todayKey}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      setPlanner(parsed.planner ?? []);
      setGrades(parsed.grades ?? []);
      setArchive(parsed.archive ?? defaultArchive);
      setSchedule(parsed.schedule ?? []);
      setStudyLogs(parsed.studyLogs ?? []);
      setSettings(parsed.settings ?? { darkMode: false, prioritySort: true });
      setCalendarSelectedDate(todayKey);
      alert("데이터가 복원되었습니다.");
    } catch {
      alert("유효한 JSON 파일이 아닙니다.");
    }
  };

  const handleClear = () => {
    if (!window.confirm("모든 데이터를 초기화하시겠습니까?")) return;
    setPlanner([]);
    setGrades([]);
    setArchive(defaultArchive);
    setSchedule([]);
    setStudyLogs([]);
    setSettings({ darkMode: false, prioritySort: true });
    setTimerRunning(false);
    setTimerSeconds(0);
    setTimerMode("focus");
    setTimerCycle(1);
  };

  const gpaScore = useMemo(() => {
    const totalCredit = grades.reduce((sum, item) => sum + item.credit, 0);
    const totalScore = grades.reduce((sum, item) => sum + item.credit * item.scoreValue, 0);
    return totalCredit ? (totalScore / totalCredit).toFixed(2) : "0.00";
  }, [grades]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <section className="grid gap-6 rounded-[2rem] bg-gradient-to-r from-sky-600 via-cyan-500 to-violet-600 p-8 text-white shadow-sm sm:grid-cols-[1.8fr_1fr]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold tracking-[0.15em]">
              SMART GRADE
            </div>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              대학생을 위한 스마트 학점 관리 플랫폼
            </h1>
            <p className="max-w-2xl text-sm text-white/90 sm:text-base">
              자기주도 학습, 학점 관리, 시간표, 아카이브, 뽀모도로 타이머까지 한 번에 관리하세요.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "오늘 수업", value: `${todayClasses}개` },
              { label: "주간 달성률", value: `${achievementRate}%` },
              { label: "오늘 집중 시간", value: `${String(Math.floor(todayStudyMinutes / 60)).padStart(2, "0")}:${String(todayStudyMinutes % 60).padStart(2, "0")}` },
            ].map((item) => (
              <div key={item.label} className="rounded-[1.75rem] border border-white/20 bg-white/10 p-5 shadow-sm backdrop-blur-xl">
                <p className="text-sm text-white/70">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
          <div className="space-y-6">
            <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">주요 학습 지표</p>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-100">오늘의 집중 현황</h2>
                </div>
                <div className="flex items-center gap-3 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> 실시간 반영
                </div>
              </div>
              <div className="mt-8 space-y-6">
                {[
                  { title: "오늘 수업", label: `${todayClasses}개`, percent: Math.min(100, todayClasses * 20), gradient: "from-sky-500 to-cyan-500" },
                  { title: "다가오는 과제", label: `${upcomingTasks}개`, percent: Math.min(100, upcomingTasks * 10), gradient: "from-violet-500 to-fuchsia-500" },
                  { title: "주간 달성률", label: `${achievementRate}%`, percent: achievementRate, gradient: "from-sky-500 to-indigo-500" },
                ].map((item) => (
                  <div key={item.title} className="space-y-3 rounded-[1.5rem] bg-slate-50 p-5 dark:bg-slate-950">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{item.title}</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">실시간</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div className={`h-full rounded-full bg-gradient-to-r ${item.gradient}`} style={{ width: `${item.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">스마트 플래너</p>
                  <p className="mt-2 text-base text-slate-600 dark:text-slate-400">기한 기반으로 할 일을 빠르게 등록하고 완료를 관리하세요.</p>
                </div>
                <button
                  type="button"
                  onClick={handlePriorityToggle}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${settings.prioritySort ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
                >
                  우선순위 {settings.prioritySort ? "ON" : "OFF"}
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-[1.2fr_1fr_auto]">
                <input
                  value={plannerTitle}
                  onChange={(e) => setPlannerTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePlannerAdd()}
                  className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="새로운 할 일을 입력하고 Enter"
                />
                <input
                  type="date"
                  value={plannerDue}
                  onChange={(e) => setPlannerDue(e.target.value)}
                  className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <button type="button" onClick={handlePlannerAdd} className="rounded-3xl bg-sky-600 px-6 py-4 text-sm font-semibold text-white transition hover:bg-sky-700">
                  추가하기
                </button>
              </div>

              <div className="mt-8 space-y-4">
                {sortedPlanner.map((task) => {
                  const priorityTag = task.priority === "urgent" ? "긴급" : "일반";
                  return (
                    <article key={task.id} className={`rounded-[1.5rem] border p-4 dark:border-slate-800 ${task.completed ? "bg-slate-100 dark:bg-slate-900/80 opacity-80" : "bg-slate-50 dark:bg-slate-950"}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <label className="flex items-center gap-3 text-slate-900 dark:text-slate-100">
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => handlePlannerToggle(task.id)}
                            className="h-5 w-5 rounded border-slate-300 text-sky-600"
                          />
                          <span className={`${task.completed ? "line-through opacity-70" : ""}`}>{task.title}</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${task.priority === "urgent" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{priorityTag}</span>
                          <button type="button" onClick={() => handlePlannerDelete(task.id)} className="rounded-full px-3 py-1 text-sm text-slate-500 transition hover:text-red-600 dark:text-slate-300">
                            삭제
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
                        <span>마감일: {task.dueDate}</span>
                        <span>우선순위: {task.priority === "urgent" ? "높음" : "보통"}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">몰입 타이머</p>
                  <p className="mt-2 text-slate-600 dark:text-slate-400">뽀모도로 사이클로 꾸준히 집중 시간을 쌓아보세요.</p>
                </div>
                <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  🍅 x {timerCycle}
                </div>
              </div>

              <div className="mt-8 flex flex-col items-center justify-center gap-6">
                <div className="relative flex h-56 w-56 items-center justify-center rounded-full bg-slate-50 shadow-[inset_0_0_0_8px_rgba(148,163,184,0.15)] dark:bg-slate-950">
                  <svg viewBox="0 0 160 160" className="absolute inset-0 h-full w-full">
                    <circle cx="80" cy="80" r="72" className="stroke-slate-200 stroke-[16] fill-transparent dark:stroke-slate-800" />
                    <circle
                      cx="80"
                      cy="80"
                      r="72"
                      className="stroke-sky-500 stroke-[16] fill-transparent stroke-linecap-round"
                      style={{ strokeDasharray: 452, strokeDashoffset: 452 - (452 * timerPercent) / 100, transition: "stroke-dashoffset 0.2s ease" }}
                    />
                  </svg>
                  <div className="relative flex h-40 w-40 flex-col items-center justify-center rounded-full bg-white text-center text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100">
                    <strong className="text-5xl">{formatTime(timerSeconds)}</strong>
                    <span className="mt-2 text-sm text-slate-500 dark:text-slate-400">{timerMode === "focus" ? "집중 모드" : "휴식 모드"}</span>
                  </div>
                </div>

                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
                  <button type="button" onClick={() => setTimerRunning((prev) => !prev)} className="rounded-3xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700">
                    {timerRunning ? "정지" : "시작"}
                  </button>
                  <button type="button" onClick={() => { setTimerRunning(false); setTimerSeconds(0); setTimerMode("focus"); setTimerCycle(1); }} className="rounded-3xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100">
                    초기화
                  </button>
                  <button type="button" onClick={() => setScheduleModalOpen(true)} className="rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    시간표 등록
                  </button>
                </div>

                <div className="w-full rounded-[1.75rem] bg-slate-100 p-4 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>현재 과목</span>
                    <select value={timerSubject} onChange={(e) => setTimerSubject(e.target.value)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <option>전체 과목</option>
                      {grades.map((item) => (<option key={item.id}>{item.name}</option>))}
                    </select>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">전공 아카이브</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">폴더 & 문서</h2>
                </div>
                <button type="button" onClick={handleArchiveFolderAdd} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100">
                  폴더 추가
                </button>
              </div>

              <div className="mt-6 space-y-4">
                {archive.map((folder) => (
                  <div key={folder.id} className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                    <button
                      type="button"
                      onClick={() => handleArchiveToggle(folder.id)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                    >
                      <div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{folder.semester}</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">파일 {folder.files.length}개</p>
                      </div>
                      <span className="text-sm text-slate-500 dark:text-slate-400">열기</span>
                    </button>
                    <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-700">
                      <div className={`grid gap-3 ${folder.expanded ? "grid-cols-1" : "grid-cols-1"}`}>
                        {folder.files.map((file) => (
                          <div key={file.id} className="flex items-center justify-between gap-3 rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-slate-100">{file.name}</p>
                              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{file.note || "메모가 없습니다."}</p>
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => handleFileMemoOpen(folder.id, file.id, file.name, file.note)} className="text-sky-600 transition hover:text-sky-800">
                                메모
                              </button>
                              <button type="button" onClick={() => handleArchiveFileDelete(folder.id, file.id)} className="text-rose-600 transition hover:text-rose-800">
                                삭제
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button type="button" onClick={() => handleArchiveFileAdd(folder.id)} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100">
                          파일 추가
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <section className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">주간 학습 리포트</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">일별 공부 시간</h2>
                </div>
              </div>
              <div className="mt-6 h-[320px]">
                {mounted ? (
                  <ResponsiveContainer width="100%" height="100%" minHeight={320} minWidth={0}>
                    <BarChart data={weeklyStudyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="date" tick={{ fill: settings.darkMode ? "#cbd5e1" : "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: settings.darkMode ? "#cbd5e1" : "#64748b" }} axisLine={false} tickLine={false} />
                      <Tooltip wrapperStyle={{ backgroundColor: settings.darkMode ? "#0f172a" : "#fff" }} />
                      <Bar dataKey="minutes" radius={[12, 12, 0, 0]} fill="#0f74ff" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-[1.75rem] bg-slate-100 text-slate-500">로딩 중...</div>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">과목별 집중 시간</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">누적 공부 시간</h2>
                </div>
              </div>
              <div className="mt-6 h-[320px]">
                {mounted ? (
                  <ResponsiveContainer width="100%" height="100%" minHeight={320} minWidth={0}>
                    <PieChart>
                      <Pie dataKey="minutes" data={subjectStudyData} innerRadius={60} outerRadius={100} paddingAngle={4} stroke="none">
                        {subjectStudyData.map((entry, index) => (
                          <Cell key={`cell-${entry.subject}`} fill={["#0f74ff", "#7c3aed", "#16a34a", "#f59e0b", "#14b8a6"][index % 5]} />
                        ))}
                      </Pie>
                      <Legend verticalAlign="bottom" wrapperStyle={{ color: settings.darkMode ? "#cbd5e1" : "#475569" }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-[1.75rem] bg-slate-100 text-slate-500">로딩 중...</div>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">캘린더</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">시험 & 마감일</h2>
              </div>
              <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">오늘: {todayKey}</div>
            </div>
            <div className="mt-6 flex flex-col gap-4">
              <div className="grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                {Array.from({ length: 7 }).map((_, index) => (
                  <span key={index}>{weekdayLabel(index)}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((item, index) =>
                  item ? (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setCalendarSelectedDate(formatDateKey(item.date))}
                      className={`rounded-3xl border p-3 text-left text-sm transition ${formatDateKey(item.date) === todayKey ? "border-sky-500 bg-sky-50 text-sky-900 dark:border-sky-400 dark:bg-slate-800" : item.events.some((task) => !task.completed && getPriorityByDueDate(task.dueDate) === "urgent") ? "border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-500 dark:bg-slate-900" : "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"}`}
                    >
                      <span className="font-semibold">{item.date.getDate()}</span>
                      <span className="block mt-1 text-xs text-slate-500 dark:text-slate-400">{item.events.length}개</span>
                    </button>
                  ) : (
                    <div key={index} className="h-20 rounded-3xl bg-transparent" />
                  ),
                )}
              </div>
            </div>
            <div className="mt-6 rounded-[1.75rem] bg-slate-50 p-5 dark:bg-slate-950">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{calendarSelectedDate} 일정</h3>
              <div className="mt-4 space-y-3">
                {calendarSelectedEvents.length ? (
                  calendarSelectedEvents.map((item) => (
                    <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-slate-900 dark:text-slate-100">{item.title}</strong>
                        <span className="text-sm text-slate-500 dark:text-slate-400">{item.priority === "urgent" ? "긴급" : "일반"}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.completed ? "완료된 과제" : "진행 중"}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">선택한 날짜에 일정이 없습니다.</p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">데이터 관리</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">백업 & 복원</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={handleExport} className="rounded-3xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700">
                  내보내기
                </button>
                <label className="rounded-3xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 cursor-pointer">
                  가져오기
                  <input type="file" accept="application/json" onChange={handleImport} className="hidden" />
                </label>
                <button type="button" onClick={handleClear} className="rounded-3xl border border-rose-400 bg-transparent px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-slate-800">
                  초기화
                </button>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">로컬 스토리지에 저장된 전체 데이터를 JSON으로 백업/복원할 수 있습니다.</p>
          </section>
        </section>
      </div>

      {scheduleModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">시간표 등록</h3>
              <button type="button" onClick={() => setScheduleModalOpen(false)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">닫기</button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <select value={scheduleWeekday} onChange={(e) => setScheduleWeekday(Number(e.target.value))} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                {[1, 2, 3, 4, 5].map((day) => (
                  <option key={day} value={day}>{weekdayLabel(day)}</option>
                ))}
              </select>
              <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
              <input value={scheduleSubject} onChange={(e) => setScheduleSubject(e.target.value)} placeholder="과목명" className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button type="button" onClick={handleScheduleAdd} className="rounded-3xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700">등록</button>
              <button type="button" onClick={() => setScheduleModalOpen(false)} className="rounded-3xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">취소</button>
            </div>
          </div>
        </div>
      )}

      {memoModal.open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{memoModal.title}</h3>
              <button type="button" onClick={() => setMemoModal((prev) => ({ ...prev, open: false }))} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">닫기</button>
            </div>
            <textarea
              value={memoModal.content}
              onChange={(e) => setMemoModal((prev) => ({ ...prev, content: e.target.value }))}
              rows={10}
              className="mt-6 w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              placeholder="메모를 입력하세요..."
            />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setMemoModal((prev) => ({ ...prev, open: false }))} className="rounded-3xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">취소</button>
              <button type="button" onClick={handleMemoSave} className="rounded-3xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
