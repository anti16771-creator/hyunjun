"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoadingCard from "@/src/components/LoadingCard";
import MetricCard from "@/src/components/MetricCard";
import ToastMessage from "@/src/components/ToastMessage";
import { AuthGuard } from "@/src/components/AuthGuard";
import { useAuth } from "@/src/context/AuthContext";
import { createTimetableEntry, deleteTimetableEntry, getExamEvents, getPlannerItems, getStudyLogs, getUserTimetable } from "@/src/lib/supabase";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

// ─── 과목별 색상 팔레트 (전체 문자열로 선언 — Tailwind purge 방지) ──────────
const COLOR_PALETTE = [
  {
    cellBg: "bg-sky-100 dark:bg-sky-950/40",
    cellText: "text-sky-900 dark:text-sky-100",
    subText: "text-sky-600 dark:text-sky-400",
    borderLeft: "border-l-[4px] border-l-sky-400 dark:border-l-sky-500",
    dotBg: "bg-sky-500",
    logBar: "bg-sky-500",
    tag: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  },
  {
    cellBg: "bg-violet-100 dark:bg-violet-950/40",
    cellText: "text-violet-900 dark:text-violet-100",
    subText: "text-violet-600 dark:text-violet-400",
    borderLeft: "border-l-[4px] border-l-violet-400 dark:border-l-violet-500",
    dotBg: "bg-violet-500",
    logBar: "bg-violet-500",
    tag: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  },
  {
    cellBg: "bg-emerald-100 dark:bg-emerald-950/40",
    cellText: "text-emerald-900 dark:text-emerald-100",
    subText: "text-emerald-600 dark:text-emerald-400",
    borderLeft: "border-l-[4px] border-l-emerald-400 dark:border-l-emerald-500",
    dotBg: "bg-emerald-500",
    logBar: "bg-emerald-500",
    tag: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  {
    cellBg: "bg-amber-100 dark:bg-amber-950/40",
    cellText: "text-amber-900 dark:text-amber-100",
    subText: "text-amber-600 dark:text-amber-400",
    borderLeft: "border-l-[4px] border-l-amber-400 dark:border-l-amber-500",
    dotBg: "bg-amber-500",
    logBar: "bg-amber-500",
    tag: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  },
  {
    cellBg: "bg-rose-100 dark:bg-rose-950/40",
    cellText: "text-rose-900 dark:text-rose-100",
    subText: "text-rose-600 dark:text-rose-400",
    borderLeft: "border-l-[4px] border-l-rose-400 dark:border-l-rose-500",
    dotBg: "bg-rose-500",
    logBar: "bg-rose-500",
    tag: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  },
  {
    cellBg: "bg-orange-100 dark:bg-orange-950/40",
    cellText: "text-orange-900 dark:text-orange-100",
    subText: "text-orange-600 dark:text-orange-400",
    borderLeft: "border-l-[4px] border-l-orange-400 dark:border-l-orange-500",
    dotBg: "bg-orange-500",
    logBar: "bg-orange-500",
    tag: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  },
  {
    cellBg: "bg-teal-100 dark:bg-teal-950/40",
    cellText: "text-teal-900 dark:text-teal-100",
    subText: "text-teal-600 dark:text-teal-400",
    borderLeft: "border-l-[4px] border-l-teal-400 dark:border-l-teal-500",
    dotBg: "bg-teal-500",
    logBar: "bg-teal-500",
    tag: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
  },
  {
    cellBg: "bg-pink-100 dark:bg-pink-950/40",
    cellText: "text-pink-900 dark:text-pink-100",
    subText: "text-pink-600 dark:text-pink-400",
    borderLeft: "border-l-[4px] border-l-pink-400 dark:border-l-pink-500",
    dotBg: "bg-pink-500",
    logBar: "bg-pink-500",
    tag: "bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300",
  },
] as const;

// djb2 해시 — 과목명을 동일 색상으로 결정론적 매핑
function getSubjectColor(subject: string) {
  let h = 5381;
  for (let i = 0; i < subject.length; i++) {
    h = ((h << 5) + h + subject.charCodeAt(i)) | 0;
  }
  return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
}

function formatDateKey(date: Date) { return date.toISOString().slice(0, 10); }

function parseWeekday(value: string | number): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const normalized = String(value).trim();
  // 한국어/영어 이름 먼저 확인 (숫자 추출보다 우선)
  const mapping: Record<string, number> = {
    일: 0, 일요일: 0, 월: 1, 월요일: 1, 화: 2, 화요일: 2,
    수: 3, 수요일: 3, 목: 4, 목요일: 4, 금: 5, 금요일: 5, 토: 6, 토요일: 6,
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
  };
  if (mapping[normalized] !== undefined) return mapping[normalized];
  // 숫자 추출 (예: "1", "1요일" 등)
  const digits = normalized.replace(/[^0-9]/g, "");
  if (digits) return Number(digits);
  return 0;
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "";
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 5) return "방금 전";
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  return `${Math.floor(diff / 3600)}시간 전`;
}

// ─── 잔디 그래프 helpers ─────────────────────────────────────────────────────
function grassColor(minutes: number): string {
  if (minutes === 0)   return "bg-slate-100 dark:bg-slate-800";
  if (minutes < 30)    return "bg-sky-100 dark:bg-sky-900/50";
  if (minutes < 60)    return "bg-sky-300 dark:bg-sky-700";
  return "bg-sky-500";
}

const DOW_KO = ["일","월","화","수","목","금","토"] as const;
const MONTH_KO = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"] as const;

export default function Home() {
  const { user, localProfile, loading: authLoading } = useAuth();

  const [schedule, setSchedule]               = useState<{ id: string; subject: string; weekday: number; period: string }[]>([]);
  const [studyLogs, setStudyLogs]             = useState<{ id: string; date: string; minutes: number; subject: string }[]>([]);
  const [todayAgendaCount, setTodayAgendaCount] = useState(0);
  const [plannerItems, setPlannerItems]         = useState<{ id: string; title: string; due_date: string; is_completed: boolean }[]>([]);
  const [examEvents, setExamEvents]             = useState<{ id: string; subject_name: string; exam_date: string; exam_type: string }[]>([]);
  const [showAllAgenda, setShowAllAgenda]       = useState(false);

  // 폼 상태
  const [subject, setSubject]   = useState("");
  const [weekday, setWeekday]   = useState(1);
  const [period, setPeriod]     = useState("1교시");

  // 인라인 셀 편집
  const [inlineCell, setInlineCell]       = useState<{ weekday: number; period: number } | null>(null);
  const [inlineSubject, setInlineSubject] = useState("");
  const inlineRef = useRef<HTMLInputElement>(null);

  // 드래그 멀티 선택
  const [isDragging, setIsDragging]           = useState(false);
  const [dragStart, setDragStart]             = useState<{ weekday: number; period: number } | null>(null);
  const [dragCurrent, setDragCurrent]         = useState<{ weekday: number; period: number } | null>(null);
  const [multiSelectModal, setMultiSelectModal] = useState<{ weekday: number; periods: number[] } | null>(null);
  const [multiSubject, setMultiSubject]         = useState("");
  const multiSubjectRef = useRef<HTMLInputElement>(null);

  // 블록 삭제 다이얼로그
  const [blockDeleteDialog, setBlockDeleteDialog] = useState<{
    entries: { id: string; period: number }[];
    subjectName: string;
  } | null>(null);

  // 동기화
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncing, setSyncing]       = useState(false);

  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType]       = useState<"success" | "error">("success");

  const todayKey     = useMemo(() => formatDateKey(new Date()), []);
  const todayWeekday = useMemo(() => new Date().getDay(), []);
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0] as const;

  // 요일별 날짜 계산 (이번 주)
  const weekDates = useMemo(() => {
    const today    = new Date();
    const todayDay = today.getDay();
    const result: Record<number, string> = {};
    ([1, 2, 3, 4, 5, 6, 0] as number[]).forEach((wd) => {
      const d = new Date(today);
      d.setDate(today.getDate() + (wd - todayDay));
      result[wd] = `${d.getMonth() + 1}/${d.getDate()}`;
    });
    return result;
  }, []);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg); setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // ─── 통계 ─────────────────────────────────────────────────────────────────
  const studyBreakdown = useMemo(() => {
    const todayLogs = studyLogs.filter((i) => i.date === todayKey);
    const grouped   = todayLogs.reduce<Record<string, number>>((acc, i) => {
      const s = String(i.subject || "미등록 과목");
      acc[s] = (acc[s] ?? 0) + Number(i.minutes || 0);
      return acc;
    }, {});
    return Object.entries(grouped).map(([subject, minutes]) => ({ subject, minutes })).sort((a, b) => b.minutes - a.minutes);
  }, [studyLogs, todayKey]);

  type AgendaItem =
    | { kind: "class";   period: string; subject: string; sortKey: number }
    | { kind: "planner"; title: string;  sortKey: number }
    | { kind: "exam";    subject_name: string; exam_type: string; sortKey: number };

  const todayAgendaItems = useMemo<AgendaItem[]>(() => {
    const items: AgendaItem[] = [];
    schedule
      .filter((s) => s.weekday === todayWeekday)
      .forEach((s) => {
        const n = parseInt(s.period) || 99;
        items.push({ kind: "class", period: s.period, subject: s.subject, sortKey: n });
      });
    plannerItems
      .filter((p) => p.due_date === todayKey && !p.is_completed)
      .forEach((p) => items.push({ kind: "planner", title: p.title, sortKey: 200 }));
    examEvents
      .filter((e) => e.exam_date === todayKey)
      .forEach((e) => items.push({ kind: "exam", subject_name: e.subject_name, exam_type: e.exam_type, sortKey: 100 }));
    return items.sort((a, b) => a.sortKey - b.sortKey);
  }, [schedule, plannerItems, examEvents, todayWeekday, todayKey]);

  const focusTargetMinutes = 180;
  const todayFocusMinutes  = useMemo(
    () => studyLogs.filter((i) => i.date === todayKey).reduce((s, i) => s + (i.minutes || 0), 0),
    [studyLogs, todayKey],
  );
  const focusProgress = Math.min(todayFocusMinutes / focusTargetMinutes, 1);
  const focusHours    = Math.floor(todayFocusMinutes / 60);
  const focusMinutes  = todayFocusMinutes % 60;
  const donutR        = 40;
  const donutCirc     = 2 * Math.PI * donutR;
  const donutOffset   = donutCirc * (1 - focusProgress);
  const maxStudyMin   = useMemo(() => Math.max(...studyBreakdown.map((s) => s.minutes), 1), [studyBreakdown]);

  const todayClasses = useMemo(
    () => schedule.filter((i) => i.weekday === todayWeekday).length,
    [schedule, todayWeekday],
  );

  // 연속 교시 같은 과목 → 하나의 블록으로 합치기
  const mergedBlocks = useMemo(() => {
    const result: Record<number, { subject: string; startPeriod: number; endPeriod: number; ids: string[] }[]> = {};
    weekdayOrder.forEach((wd) => {
      const dayItems = schedule
        .filter((s) => s.weekday === wd)
        .map((s) => {
          const digits = String(s.period).replace(/[^0-9]/g, "");
          return { ...s, subject: s.subject.trim(), p: digits ? Number(digits) : 0 };
        })
        .filter((s) => s.p > 0)
        .sort((a, b) => a.p - b.p);
      const blocks: { subject: string; startPeriod: number; endPeriod: number; ids: string[] }[] = [];
      let i = 0;
      while (i < dayItems.length) {
        const cur = dayItems[i];
        let end = cur.p;
        const ids = [cur.id];
        while (
          i + 1 < dayItems.length &&
          dayItems[i + 1].subject === cur.subject &&
          dayItems[i + 1].p === end + 1
        ) {
          i++;
          end = dayItems[i].p;
          ids.push(dayItems[i].id);
        }
        blocks.push({ subject: cur.subject, startPeriod: cur.p, endPeriod: end, ids });
        i++;
      }
      result[wd] = blocks;
    });
    return result;
  }, [schedule, weekdayOrder]);

  // ─── DEBUG: mergedBlocks 진단 (문제 파악 후 제거) ────────────────────────
  useEffect(() => {
    if (schedule.length === 0) {
      console.log("[TT-DEBUG] schedule 비어있음 (데이터 없음)");
      return;
    }
    console.log("[TT-DEBUG] schedule raw:", schedule);
    const hasMultiSpan = weekdayOrder.some((wd) =>
      (mergedBlocks[wd] ?? []).some((b) => b.endPeriod > b.startPeriod)
    );
    console.log("[TT-DEBUG] mergedBlocks:", mergedBlocks);
    console.log("[TT-DEBUG] 2교시 이상 병합 블록 존재?", hasMultiSpan);
    if (!hasMultiSpan) {
      console.log("[TT-DEBUG] → 연속된 같은 과목 교시가 없어 병합 없음. 같은 요일·같은 과목명·연속 교시를 등록해야 합니다.");
    }
  }, [schedule, mergedBlocks, weekdayOrder]);

  // ─── 잔디 그래프 ─────────────────────────────────────────────────────────
  const [grassTooltip, setGrassTooltip] = useState<{ date: string; minutes: number; x: number; y: number } | null>(null);

  // 날짜별 집중 분 합계 맵
  const dailyMinutes = useMemo(() => {
    const map: Record<string, number> = {};
    studyLogs.forEach((l) => { map[l.date] = (map[l.date] ?? 0) + (Number(l.minutes) || 0); });
    return map;
  }, [studyLogs]);

  // 12주 × 7일 격자 (일~토 행, 주 열 — 왼쪽이 과거)
  const grassWeeks = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayDow = today.getDay(); // 0=일, 6=토
    // 이번 주 일요일 기준으로 11주 전 일요일 = startSunday
    const startSunday = new Date(today);
    startSunday.setDate(today.getDate() - todayDow - 11 * 7);

    // startSunday ~ today + 토요일까지 padding → 12 × 7 = 84 cells
    type Cell = { date: string; minutes: number; placeholder: boolean };
    const cells: Cell[] = [];
    const d = new Date(startSunday);
    while (d <= today) {
      const key = d.toISOString().slice(0, 10);
      cells.push({ date: key, minutes: dailyMinutes[key] ?? 0, placeholder: false });
      d.setDate(d.getDate() + 1);
    }
    // 마지막 주 채우기
    const rem = cells.length % 7;
    if (rem > 0) {
      for (let i = 0; i < 7 - rem; i++) cells.push({ date: "", minutes: 0, placeholder: true });
    }

    // 7개씩 묶어 주(열) 배열로
    const weeks: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    // 각 주의 첫 날짜 (월 레이블용)
    return weeks;
  }, [dailyMinutes]);

  // 현재 연속 스트릭
  const currentStreak = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayKey = today.toISOString().slice(0, 10);
    let streak = 0;
    const d = new Date(today);
    // 오늘 공부 없으면 어제부터 체크
    if (!(dailyMinutes[todayKey] ?? 0)) d.setDate(d.getDate() - 1);
    for (let i = 0; i < 365; i++) {
      const key = d.toISOString().slice(0, 10);
      if ((dailyMinutes[key] ?? 0) > 0) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }, [dailyMinutes]);

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [ttRes, logRes, plannerRes, examRes] = await Promise.all([
        getUserTimetable(user.id),
        getStudyLogs(user.id),
        getPlannerItems(user.id),
        getExamEvents(user.id),
      ]);

      if (!ttRes.error) {
        console.log("[TT-DEBUG] raw timetable data:", ttRes.data);
        const parsed = (ttRes.data ?? []).map((item: any) => ({
          id: String(item.id),
          subject: String(item.subject ?? ""),
          weekday: parseWeekday(item.weekday),
          period: String(item.period ?? ""),
        }));
        console.log("[TT-DEBUG] parsed schedule:", parsed);
        setSchedule(parsed);
      } else {
        console.error("시간표 에러:", ttRes.error);
        setSchedule([]);
      }

      if (!logRes.error) {
        setStudyLogs(
          (logRes.data ?? []).map((item: any) => ({
            id: String(item.id),
            date: String(item.date ?? ""),
            minutes: Number(item.minutes ?? 0),
            subject: String(item.subject ?? ""),
          })),
        );
      } else {
        console.error("로그 에러:", logRes.error);
        setStudyLogs([]);
      }

      const rawPlanner = (plannerRes.data ?? []).map((i: any) => ({
        id: String(i.id),
        title: String(i.title ?? ""),
        due_date: String(i.due_date ?? ""),
        is_completed: Boolean(i.is_completed),
      }));
      const rawExam = (examRes.data ?? []).map((i: any) => ({
        id: String(i.id),
        subject_name: String(i.subject_name ?? ""),
        exam_date: String(i.exam_date ?? ""),
        exam_type: String(i.exam_type ?? ""),
      }));
      setPlannerItems(rawPlanner);
      setExamEvents(rawExam);
      const plannerDue = rawPlanner.filter((i) => i.due_date === todayKey).length;
      const examDue    = rawExam.filter((i) => i.exam_date === todayKey).length;
      setTodayAgendaCount(plannerDue + examDue);
      setError("");
      setLastSyncAt(new Date());
    } catch (err) {
      console.error("fetchData error", err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
      showToast("데이터를 불러오는 중 오류가 발생했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }, [user, todayKey, showToast]);

  useEffect(() => {
    if (!user) { setSchedule([]); setStudyLogs([]); setLoading(false); return; }
    fetchData();
  }, [user]);

  // ─── 폼 저장 ──────────────────────────────────────────────────────────────
  const handleAddSchedule = async () => {
    if (authLoading) return;
    if (!subject.trim() || !user) { setError("로그인 후에 시간표를 저장할 수 있습니다."); return; }
    setSaving(true);
    try {
      const result = await createTimetableEntry({ user_id: user.id, subject: subject.trim(), weekday: String(weekday), period });
      if (result.error) {
        showToast((result.error as any).message || "시간표 저장에 실패했습니다.", "error");
      } else {
        setSubject(""); await fetchData();
        showToast("시간표가 저장되었습니다.", "success");
      }
    } catch (err: any) {
      showToast(err?.message || "저장 중 오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  // ─── 인라인 저장 ──────────────────────────────────────────────────────────
  const handleInlineSave = useCallback(async (wd: number, pi: number, sub: string) => {
    if (!sub.trim() || !user) { setInlineCell(null); setInlineSubject(""); return; }
    setSaving(true);
    try {
      const result = await createTimetableEntry({ user_id: user.id, subject: sub.trim(), weekday: String(wd), period: `${pi}교시` });
      if (result.error) {
        showToast(result.error.message || "저장에 실패했습니다.", "error");
      } else {
        setInlineCell(null); setInlineSubject("");
        await fetchData();
        showToast("수업이 추가되었습니다.", "success");
      }
    } catch { showToast("저장 중 오류가 발생했습니다.", "error"); }
    finally { setSaving(false); }
  }, [user, fetchData, showToast]);

  // ─── 멀티 교시 저장 ────────────────────────────────────────────────────────
  const handleMultiSave = useCallback(async () => {
    if (!multiSelectModal || !multiSubject.trim() || !user) return;
    setSaving(true);
    try {
      await Promise.all(
        multiSelectModal.periods.map((p) =>
          createTimetableEntry({ user_id: user.id, subject: multiSubject.trim(), weekday: String(multiSelectModal.weekday), period: `${p}교시` })
        )
      );
      setMultiSelectModal(null);
      setMultiSubject("");
      await fetchData();
      showToast(`${multiSelectModal.periods.length}개 교시가 추가되었습니다.`, "success");
    } catch { showToast("저장 중 오류가 발생했습니다.", "error"); }
    finally { setSaving(false); }
  }, [multiSelectModal, multiSubject, user, fetchData, showToast]);

  // ─── 블록 삭제 ────────────────────────────────────────────────────────────
  const handleBlockDeleteAll = useCallback(async () => {
    if (!blockDeleteDialog) return;
    const { entries } = blockDeleteDialog;
    setBlockDeleteDialog(null);
    try {
      await Promise.all(entries.map((e) => deleteTimetableEntry(e.id)));
      await fetchData();
      showToast(`${entries.length}개 교시가 삭제되었습니다.`, "success");
    } catch { showToast("삭제 중 오류가 발생했습니다.", "error"); }
  }, [blockDeleteDialog, fetchData, showToast]);

  const handleBlockDeleteSingle = useCallback(async (id: string) => {
    setBlockDeleteDialog(null);
    try {
      const result = await deleteTimetableEntry(id);
      if (result.error) showToast("삭제에 실패했습니다.", "error");
      else { await fetchData(); showToast("수업이 삭제되었습니다.", "success"); }
    } catch { showToast("삭제 중 오류가 발생했습니다.", "error"); }
  }, [fetchData, showToast]);

  useEffect(() => {
    if (inlineCell && inlineRef.current) inlineRef.current.focus();
  }, [inlineCell]);

  // 드래그 상태를 ref로도 유지 (document mouseup 핸들러 stale closure 방지)
  const dragRef = useRef({ isDragging: false, dragStart: null as typeof dragStart, dragCurrent: null as typeof dragCurrent, schedule: [] as typeof schedule });
  dragRef.current = { isDragging, dragStart, dragCurrent, schedule };

  useEffect(() => {
    const endDrag = () => {
      const { isDragging: active, dragStart: start, dragCurrent: cur, schedule: sched } = dragRef.current;
      if (!active) return;
      if (start && cur && start.weekday === cur.weekday) {
        const wd   = start.weekday;
        const minP = Math.min(start.period, cur.period);
        const maxP = Math.max(start.period, cur.period);
        if (minP === maxP) {
          setInlineCell({ weekday: wd, period: minP });
          setInlineSubject("");
          setWeekday(wd);
          setPeriod(`${minP}교시`);
        } else {
          const allP   = Array.from({ length: maxP - minP + 1 }, (_, j) => minP + j);
          const emptyP = allP.filter((p) => !sched.some((s) => s.weekday === wd && Number(s.period.replace(/[^0-9]/g, "")) === p));
          if (emptyP.length > 0) { setMultiSelectModal({ weekday: wd, periods: emptyP }); setMultiSubject(""); }
        }
      }
      setIsDragging(false); setDragStart(null); setDragCurrent(null);
    };
    document.addEventListener("mouseup", endDrag);
    return () => document.removeEventListener("mouseup", endDrag);
  }, []);

  useEffect(() => {
    if (multiSelectModal && multiSubjectRef.current) multiSubjectRef.current.focus();
  }, [multiSelectModal]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <AuthGuard>
      <div className="space-y-6">

        {/* ── 상단 요약 카드 ──────────────────────────────── */}
        <section className="rounded-[2rem] bg-white p-4 shadow-sm sm:p-6 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">🏠 홈 대시보드</p>
              {localProfile.nickname && (
                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  안녕하세요, {localProfile.nickname}님 👋
                </p>
              )}
              <h1 className="mt-0.5 text-xl font-semibold text-slate-900 dark:text-slate-100">학습 일정과 집중 시간을 한눈에</h1>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              오늘 {todayKey}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MetricCard
              label="오늘 수업" value={`${todayClasses}개`}
              description={todayClasses > 0 ? "주간 시간표를 기반으로 자동 집계됩니다." : undefined}
              isEmpty={todayClasses === 0} emptyHint="↓ 아래에서 시간표를 등록해보세요"
              icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>}
            />
            <MetricCard
              label="집중 시간"
              value={`${String(focusHours).padStart(2, "0")}:${String(focusMinutes).padStart(2, "0")}`}
              description={`오늘 ${todayFocusMinutes}분 / 목표 ${focusTargetMinutes}분`}
              progress={focusProgress}
              badge={todayFocusMinutes > 0 ? `${Math.round(focusProgress * 100)}%` : undefined}
              isEmpty={todayFocusMinutes === 0} emptyHint="타이머를 켜고 공부를 시작해보세요"
              icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
            />
            <MetricCard
              label="오늘 일정" value={`${todayAgendaCount}개`}
              description={todayAgendaCount > 0 ? "오늘 마감인 과제와 시험 일정의 총 개수입니다." : undefined}
              isEmpty={todayAgendaCount === 0} emptyHint="플래너에서 오늘 할 일을 추가해보세요"
              icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
            />
          </div>
        </section>

        {/* ── 시간표 + 사이드 패널 ────────────────────────── */}
        <section className="rounded-[2rem] bg-white p-4 shadow-sm sm:p-6 md:p-8 dark:bg-slate-900">

          {/* 섹션 헤더 */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">주간 시간표</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">빈 셀을 클릭하거나 드래그해서 여러 교시를 한 번에 등록할 수 있어요.</p>
            </div>
            <div className="flex items-center gap-2">
              {lastSyncAt && (
                <span className="text-xs text-slate-400 dark:text-slate-500">{formatRelativeTime(lastSyncAt)} 동기화</span>
              )}
              <button type="button" disabled={syncing || loading}
                onClick={async () => { setSyncing(true); await fetchData(); setSyncing(false); }}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={syncing ? "animate-spin" : ""}>
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                새로고침
              </button>
            </div>
          </div>

          {/* 수업 추가 폼 */}
          <div className="mt-5 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <input value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && subject.trim()) handleAddSchedule(); }}
              placeholder="과목명을 입력하세요"
              className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}
              className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              {([1,2,3,4,5,6,0] as number[]).map((v) => (
                <option key={v} value={v}>{["일","월","화","수","목","금","토"][v]}요일</option>
              ))}
            </select>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}
              className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              {Array.from({ length: 10 }, (_, i) => `${i + 1}교시`).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <button onClick={handleAddSchedule} disabled={saving || !subject.trim()}
              className="rounded-3xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
              추가
            </button>
          </div>

          {/* 그리드 + 사이드 패널 */}
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.65fr_0.95fr]">

            {/* 시간표 그리드 */}
            <div>
              {loading ? <LoadingCard /> : (
                <div className="w-full overflow-x-auto">
                  <div className="min-w-[700px]">

                    {/* ── 헤더 행 ── */}
                    <div className="overflow-hidden rounded-[1rem] border border-slate-200 dark:border-slate-700" style={{ display: "grid", gridTemplateColumns: "72px repeat(7, 1fr)" }}>
                      {/* 교시 헤더 */}
                      <div className="bg-slate-100 px-3 py-3 text-center dark:bg-slate-800">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">교시</p>
                      </div>
                      {/* 요일 헤더 */}
                      {weekdayOrder.map((wd) => (
                        <div key={wd}
                          className={`px-2 py-2.5 text-center ${
                            wd === todayWeekday
                              ? "bg-sky-50 dark:bg-sky-950/40"
                              : "bg-slate-50 dark:bg-slate-900"
                          }`}>
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center gap-1">
                              <span className={`text-sm font-bold ${wd === todayWeekday ? "text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-300"}`}>
                                {weekdays[wd]}
                              </span>
                              {wd === todayWeekday && (
                                <span className="inline-flex items-center justify-center rounded-full bg-sky-500 px-1.5 py-0.5 text-[8px] font-bold leading-none text-white">
                                  오늘
                                </span>
                              )}
                            </div>
                            <span className={`text-[10px] ${wd === todayWeekday ? "font-semibold text-sky-500 dark:text-sky-400" : "text-slate-400 dark:text-slate-500"}`}>
                              {weekDates[wd]}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ── 시간표 바디 (CSS Grid — 블록 병합 지원) ── */}
                    <div
                      className="mt-[2px]"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "72px repeat(7, 1fr)",
                        gridTemplateRows: "repeat(10, 74px)",
                        gap: "2px",
                        userSelect: isDragging ? "none" : undefined,
                      }}
                    >
                      {/* 교시 레이블 열 (column 1) */}
                      {Array.from({ length: 10 }, (_, i) => {
                        const pi = i + 1;
                        return (
                          <div key={`label-${pi}`}
                            style={{ gridColumn: 1, gridRow: pi }}
                            className="flex flex-col justify-center rounded-l-[0.75rem] bg-slate-50 px-3 py-2 dark:bg-slate-900"
                          >
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{pi}교시</span>
                            <span className="mt-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">{8 + pi}:00</span>
                          </div>
                        );
                      })}

                      {/* 요일 컬럼 (columns 2~8) */}
                      {weekdayOrder.map((wd, wdIdx) => {
                        const colIdx    = wdIdx + 2;
                        const isToday   = wd === todayWeekday;
                        const isLastCol = wdIdx === weekdayOrder.length - 1;
                        const dayBlocks = mergedBlocks[wd] ?? [];
                        const coveredPeriods = new Set(
                          dayBlocks.flatMap((b) =>
                            Array.from({ length: b.endPeriod - b.startPeriod + 1 }, (_, j) => b.startPeriod + j)
                          )
                        );

                        return (
                          <Fragment key={wd}>
                            {/* 병합 블록 */}
                            {dayBlocks.map((block) => {
                              const span  = block.endPeriod - block.startPeriod + 1;
                              const color = getSubjectColor(block.subject);
                              const startT = `${8 + block.startPeriod}:00`;
                              const endT   = `${8 + block.endPeriod + 1}:00`;
                              return (
                                <div key={block.ids[0]}
                                  style={{ gridColumn: colIdx, gridRow: `${block.startPeriod} / span ${span}` }}
                                  className={`p-1 ${isLastCol ? "rounded-r-[0.75rem]" : ""} ${isToday ? "bg-sky-50/60 dark:bg-sky-950/20" : "bg-white dark:bg-slate-950"}`}
                                >
                                  <div className={`group flex h-full flex-col justify-between rounded-lg p-2 pl-3 ${color.cellBg} ${color.borderLeft}`}>
                                    <div className="flex items-start justify-between gap-1">
                                      <p className={`flex-1 break-words text-xs font-bold leading-snug ${color.cellText}`}>{block.subject}</p>
                                      <button type="button"
                                        onClick={() => setBlockDeleteDialog({ entries: block.ids.map((id, k) => ({ id, period: block.startPeriod + k })), subjectName: block.subject })}
                                        className="shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
                                        title="삭제">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500 dark:text-rose-400">
                                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                        </svg>
                                      </button>
                                    </div>
                                    <p className={`text-[10px] font-medium ${color.subText}`}>
                                      {span > 1 ? `${startT} ~ ${endT}` : startT}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}

                            {/* 빈 셀 (드래그 가능) */}
                            {Array.from({ length: 10 }, (_, i) => i + 1)
                              .filter((p) => !coveredPeriods.has(p))
                              .map((p) => {
                                const isInline = inlineCell?.weekday === wd && inlineCell?.period === p;
                                const dMin = isDragging && dragStart?.weekday === wd && dragCurrent ? Math.min(dragStart.period, dragCurrent.period) : -1;
                                const dMax = isDragging && dragStart?.weekday === wd && dragCurrent ? Math.max(dragStart.period, dragCurrent.period) : -1;
                                const highlighted = p >= dMin && p <= dMax;
                                return (
                                  <div key={`${wd}-${p}`}
                                    style={{ gridColumn: colIdx, gridRow: p }}
                                    className={`p-1 ${isLastCol ? "rounded-r-[0.75rem]" : ""} ${isToday ? "bg-sky-50/60 dark:bg-sky-950/20" : "bg-white dark:bg-slate-950"}`}
                                  >
                                    {isInline ? (
                                      <div className="flex h-full items-start p-1 pt-1.5">
                                        <input
                                          ref={inlineRef}
                                          value={inlineSubject}
                                          onChange={(e) => setInlineSubject(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") handleInlineSave(wd, p, inlineSubject);
                                            if (e.key === "Escape") { setInlineCell(null); setInlineSubject(""); }
                                          }}
                                          onBlur={() => window.setTimeout(() => { setInlineCell(null); setInlineSubject(""); }, 150)}
                                          placeholder="과목명"
                                          className="w-full rounded-lg border border-sky-400 bg-white px-2 py-1 text-xs outline-none focus:border-sky-500 dark:border-sky-600 dark:bg-slate-800 dark:text-slate-100"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>
                                    ) : (
                                      <div
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          setDragStart({ weekday: wd, period: p });
                                          setDragCurrent({ weekday: wd, period: p });
                                          setIsDragging(true);
                                        }}
                                        onMouseEnter={() => {
                                          if (isDragging && dragStart?.weekday === wd) setDragCurrent({ weekday: wd, period: p });
                                        }}
                                        className={`group flex h-full cursor-pointer items-center justify-center rounded-lg transition-colors ${
                                          highlighted
                                            ? "bg-sky-100/80 outline-dashed outline-2 outline-sky-400 dark:bg-sky-900/40 dark:outline-sky-600"
                                            : "hover:bg-sky-50/40 hover:outline-dashed hover:outline-2 hover:outline-sky-300 dark:hover:bg-sky-950/20 dark:hover:outline-sky-700"
                                        }`}
                                      >
                                        {highlighted ? (
                                          <div className="h-2 w-2 rounded-full bg-sky-400 dark:bg-sky-500" />
                                        ) : (
                                          <div className="hidden flex-col items-center gap-0.5 group-hover:flex">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400">
                                              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                            </svg>
                                            <span className="text-[9px] font-semibold text-sky-400">수업 추가</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            }
                          </Fragment>
                        );
                      })}
                    </div>

                    {/* 빈 시간표 안내 */}
                    {schedule.length === 0 && !loading && (
                      <div className="mt-4 flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 py-10 text-center dark:border-slate-700 dark:bg-slate-950">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                          <polyline points="17 11 12 6 7 11"/><line x1="12" y1="6" x2="12" y2="18"/>
                        </svg>
                        <div>
                          <p className="font-semibold text-slate-700 dark:text-slate-300">아직 등록된 수업이 없습니다</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">위에서 첫 수업을 추가해보세요!</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── 우측 사이드 패널 ──────────────────────────── */}
            <div className="space-y-5">

              {/* 오늘의 학습 현황 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">오늘의 학습 현황</p>
                <h2 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {todayFocusMinutes === 0 ? "오늘 아직 공부 기록이 없어요" : `${focusHours}시간 ${focusMinutes}분 집중 🔥`}
                </h2>

                <div className="mt-4 flex items-center gap-4">
                  <div className="relative shrink-0">
                    <svg width="90" height="90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r={donutR} fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-slate-700" />
                      <circle cx="50" cy="50" r={donutR} fill="none" strokeWidth="10" strokeLinecap="round"
                        strokeDasharray={donutCirc} strokeDashoffset={donutOffset}
                        className="stroke-sky-500"
                        style={{ transform: "rotate(-90deg)", transformOrigin: "50px 50px", transition: "stroke-dashoffset 0.6s ease" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-base font-bold text-sky-600 dark:text-sky-400">{Math.round(focusProgress * 100)}%</span>
                      <span className="text-[9px] text-slate-400">달성</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{focusHours}시간 {focusMinutes}분 완료</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">목표 {focusTargetMinutes}분</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-full rounded-full bg-sky-500 transition-all duration-700" style={{ width: `${Math.min(focusProgress * 100, 100)}%` }} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Link href="/timer" className="flex flex-1 items-center justify-center gap-1.5 rounded-3xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    타이머 시작
                  </Link>
                  <Link href="/priority" className="flex flex-1 items-center justify-center gap-1.5 rounded-3xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700">
                    🔥 우선순위
                  </Link>
                </div>
              </div>

              {/* 오늘 일정 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">오늘 일정</p>
                <div className="mt-3 space-y-2">
                  {todayAgendaItems.length === 0 ? (
                    <p className="py-2 text-xs text-slate-400 dark:text-slate-500">오늘 등록된 일정이 없어요</p>
                  ) : (
                    <>
                      {(showAllAgenda ? todayAgendaItems : todayAgendaItems.slice(0, 5)).map((item, idx) => {
                        if (item.kind === "class") {
                          const color = getSubjectColor(item.subject);
                          return (
                            <div key={idx} className="flex items-center gap-2">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${color.dotBg}`} />
                              <span className="shrink-0 text-[11px] font-semibold text-slate-400 dark:text-slate-500">{item.period}</span>
                              <span className="mx-0.5 text-[10px] text-slate-300 dark:text-slate-600">|</span>
                              <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">{item.subject}</span>
                            </div>
                          );
                        }
                        if (item.kind === "exam") {
                          return (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                              <span className="shrink-0 text-[11px] font-semibold text-amber-500">D-day</span>
                              <span className="mx-0.5 text-[10px] text-slate-300 dark:text-slate-600">|</span>
                              <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">{item.subject_name}</span>
                            </div>
                          );
                        }
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                            <span className="shrink-0 text-[11px] font-semibold text-rose-500">오늘 마감</span>
                            <span className="mx-0.5 text-[10px] text-slate-300 dark:text-slate-600">|</span>
                            <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">{item.title}</span>
                          </div>
                        );
                      })}
                      {todayAgendaItems.length > 5 && (
                        <button
                          onClick={() => setShowAllAgenda((v) => !v)}
                          className="mt-1 text-[11px] font-semibold text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300"
                        >
                          {showAllAgenda ? "접기" : `더보기 +${todayAgendaItems.length - 5}`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 오늘 공부 로그 — 과목 색상 일치 바 차트 */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">오늘 공부 로그</p>
                <div className="mt-4 space-y-3">
                  {studyBreakdown.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-3 text-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                      <p className="text-xs text-slate-500 dark:text-slate-400">오늘 기록된 학습 로그가 없습니다.</p>
                    </div>
                  ) : (
                    studyBreakdown.map((item) => {
                      const color    = getSubjectColor(item.subject);
                      const barWidth = (item.minutes / maxStudyMin) * 100;
                      return (
                        <div key={item.subject} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${color.dotBg}`} />
                              <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-300">{item.subject}</span>
                            </div>
                            <span className="shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400">{item.minutes}분</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className={`h-full rounded-full transition-all duration-500 ${color.logBar}`} style={{ width: `${barWidth}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
        </section>

        {/* ── 나의 공부 기록 (잔디 그래프) ─────────────────── */}
        <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 md:p-8 dark:bg-slate-900">
          {/* 헤더 */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">나의 공부 기록</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">스터디 스트릭</h2>
            </div>
            {currentStreak > 0 ? (
              <div className="rounded-full bg-orange-50 px-4 py-2 text-sm font-bold text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
                🔥 {currentStreak}일 연속 공부 중
              </div>
            ) : (
              <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                오늘 공부를 시작해보세요 💪
              </div>
            )}
          </div>

          {/* 잔디 그리드 */}
          <div className="mt-6 overflow-x-auto">
            <div className="inline-flex gap-1 min-w-0">
              {/* 요일 라벨 열 */}
              <div className="flex flex-col gap-1 pt-5 pr-1 shrink-0">
                {DOW_KO.map((d) => (
                  <div key={d} className="flex h-3.5 items-center text-[9px] font-semibold leading-none text-slate-400 dark:text-slate-500">
                    {d}
                  </div>
                ))}
              </div>

              {/* 주 열들 */}
              <div className="flex gap-1">
                {grassWeeks.map((week, wi) => {
                  const firstDay  = week.find((c) => !c.placeholder);
                  const monthLabel = firstDay && new Date(firstDay.date + "T00:00:00").getDate() <= 7
                    ? MONTH_KO[new Date(firstDay.date + "T00:00:00").getMonth()]
                    : null;
                  return (
                    <div key={wi} className="flex flex-col gap-1">
                      {/* 월 레이블 */}
                      <div className="h-4 text-[9px] font-semibold leading-none text-slate-400 dark:text-slate-500 truncate">
                        {monthLabel ?? ""}
                      </div>
                      {/* 7개 셀 */}
                      {week.map((cell, di) => (
                        <div
                          key={di}
                          className={`h-3.5 w-3.5 rounded-sm transition-transform hover:scale-110 ${
                            cell.placeholder
                              ? "invisible"
                              : `cursor-default ${grassColor(cell.minutes)}`
                          }`}
                          onMouseEnter={(e) => {
                            if (cell.placeholder || !cell.date) return;
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setGrassTooltip({ date: cell.date, minutes: cell.minutes, x: r.left + r.width / 2, y: r.top });
                          }}
                          onMouseLeave={() => setGrassTooltip(null)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 범례 */}
          <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
            <span>적음</span>
            {(["bg-slate-100 dark:bg-slate-800","bg-sky-100 dark:bg-sky-900/50","bg-sky-300 dark:bg-sky-700","bg-sky-500"] as const).map((cls) => (
              <div key={cls} className={`h-3 w-3 rounded-sm ${cls}`} />
            ))}
            <span>많음</span>
            <span className="ml-3 text-slate-300 dark:text-slate-600">|</span>
            <span className="ml-1">1~30분</span>
            <span className="ml-1 text-slate-300 dark:text-slate-600">·</span>
            <span>30~60분</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span>1시간+</span>
          </div>
        </section>

        {/* ── 블록 삭제 다이얼로그 ─────────────────────────── */}
        {blockDeleteDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/40">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600 dark:text-rose-400">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">수업을 삭제할까요?</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">{blockDeleteDialog.subjectName}</p>
                  {blockDeleteDialog.entries.length > 1 && (
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {blockDeleteDialog.entries[0].period}교시 ~ {blockDeleteDialog.entries[blockDeleteDialog.entries.length - 1].period}교시
                    </p>
                  )}
                </div>

                {blockDeleteDialog.entries.length > 1 ? (
                  /* 멀티 교시 블록 — 전체/개별 선택 */
                  <div className="w-full space-y-2">
                    <button type="button" onClick={handleBlockDeleteAll}
                      className="w-full rounded-3xl bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-700">
                      전체 교시 삭제 ({blockDeleteDialog.entries.length}개)
                    </button>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">또는 개별 교시 선택</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {blockDeleteDialog.entries.map((e) => (
                        <button key={e.id} type="button"
                          onClick={() => handleBlockDeleteSingle(e.id)}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40">
                          {e.period}교시만
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => setBlockDeleteDialog(null)}
                      className="w-full rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                      취소
                    </button>
                  </div>
                ) : (
                  /* 단일 교시 */
                  <div className="flex w-full gap-3">
                    <button type="button" onClick={() => setBlockDeleteDialog(null)}
                      className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                      취소
                    </button>
                    <button type="button" onClick={() => handleBlockDeleteSingle(blockDeleteDialog.entries[0].id)}
                      className="flex-1 rounded-3xl bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-700">
                      삭제
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 멀티 교시 과목 입력 팝업 ────────────────────── */}
        {multiSelectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">수업 일괄 등록</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {weekdays[multiSelectModal.weekday]}요일{" "}
                    {multiSelectModal.periods[0]}교시 ~ {multiSelectModal.periods[multiSelectModal.periods.length - 1]}교시
                    ({multiSelectModal.periods.length}개 교시)
                  </p>
                </div>
                <input
                  ref={multiSubjectRef}
                  value={multiSubject}
                  onChange={(e) => setMultiSubject(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && multiSubject.trim()) handleMultiSave();
                    if (e.key === "Escape") { setMultiSelectModal(null); setMultiSubject(""); }
                  }}
                  placeholder="과목명을 입력하세요"
                  className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <div className="flex gap-3">
                  <button type="button"
                    onClick={() => { setMultiSelectModal(null); setMultiSubject(""); }}
                    className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    취소
                  </button>
                  <button type="button"
                    onClick={handleMultiSave}
                    disabled={!multiSubject.trim() || saving}
                    className="flex-1 rounded-3xl bg-sky-600 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {multiSelectModal.periods.length}개 교시 등록
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {toastMessage && <ToastMessage message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} />}

        {/* ── 잔디 툴팁 ──────────────────────────────────── */}
        {grassTooltip && (
          <div
            className="pointer-events-none fixed z-[200] rounded-xl bg-slate-900 px-3 py-2 text-xs shadow-xl dark:bg-slate-100"
            style={{ left: grassTooltip.x, top: grassTooltip.y - 10, transform: "translate(-50%, -100%)" }}
          >
            <p className="font-semibold text-slate-300 dark:text-slate-600">{grassTooltip.date}</p>
            <p className="mt-0.5 font-bold text-white dark:text-slate-900">
              {grassTooltip.minutes === 0 ? "공부 기록 없음" : `${grassTooltip.minutes}분 집중`}
            </p>
            {/* 말풍선 꼬리 */}
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-100" />
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
