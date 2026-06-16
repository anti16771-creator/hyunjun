"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import {
  createArchiveFile,
  createArchiveFolder,
  createArchiveSignedUrl,
  deleteArchiveFile,
  deleteArchiveMeta,
  getArchiveItems,
  getUserTimetableSubjects,
  updateArchiveFolderName,
  uploadArchiveFile,
} from "@/src/lib/supabase";

const ARCHIVE_BUCKET = "archives";
const gradeOptions   = ["전체", "1학년", "2학년", "3학년", "4학년"];
const semesterOptions = ["전체", "1학기", "여름학기", "2학기", "겨울학기"];
const FOLDER_LIMIT = 20;

// ─── File kind ────────────────────────────────────────────────────────────────
type FileKind = "pdf" | "image" | "word" | "excel" | "ppt" | "code" | "archive" | "text" | "other";

function getFileKind(name: string): FileKind {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["png","jpg","jpeg","gif","webp","bmp","svg"].includes(ext)) return "image";
  if (["doc","docx"].includes(ext)) return "word";
  if (["xls","xlsx","csv"].includes(ext)) return "excel";
  if (["ppt","pptx"].includes(ext)) return "ppt";
  if (["js","ts","jsx","tsx","py","java","c","cpp","cs","go","rs"].includes(ext)) return "code";
  if (["zip","rar","tar","gz","7z"].includes(ext)) return "archive";
  if (["txt","md"].includes(ext)) return "text";
  return "other";
}

function FileKindIcon({ kind, size = "md" }: { kind: FileKind; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const badge = (bg: string, content: React.ReactNode) => (
    <div className={`flex shrink-0 items-center justify-center rounded-xl ${bg} ${dim}`}>{content}</div>
  );
  if (kind === "pdf")
    return badge("bg-rose-100 dark:bg-rose-950/40", <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400">PDF</span>);
  if (kind === "image")
    return badge("bg-emerald-100 dark:bg-emerald-950/40",
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-700 dark:text-emerald-400"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>);
  if (kind === "word")
    return badge("bg-sky-100 dark:bg-sky-950/40", <span className="text-xs font-bold text-sky-700 dark:text-sky-400">W</span>);
  if (kind === "excel")
    return badge("bg-green-100 dark:bg-green-950/40", <span className="text-xs font-bold text-green-700 dark:text-green-400">X</span>);
  if (kind === "ppt")
    return badge("bg-orange-100 dark:bg-orange-950/40", <span className="text-xs font-bold text-orange-700 dark:text-orange-400">P</span>);
  if (kind === "code")
    return badge("bg-violet-100 dark:bg-violet-950/40",
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-700 dark:text-violet-400"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>);
  if (kind === "archive")
    return badge("bg-amber-100 dark:bg-amber-950/40",
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-700 dark:text-amber-400"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>);
  if (kind === "text")
    return badge("bg-slate-100 dark:bg-slate-800",
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 dark:text-slate-400"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>);
  return badge("bg-slate-100 dark:bg-slate-800",
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonFolder() {
  return <div className="h-36 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
}
function SkeletonFile() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-1/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

// ─── Path helpers ─────────────────────────────────────────────────────────────
const gradeYearMap: Record<string, string> = { "1학년":"1","2학년":"2","3학년":"3","4학년":"4" };
const semesterMap:  Record<string, string> = { "1학기":"1","여름학기":"s","2학기":"2","겨울학기":"w" };
const encodeGradeLevel = (g: string) => gradeYearMap[g] ?? "0";
const encodeSemester   = (s: string) => semesterMap[s]  ?? "0";

const sanitizeFileName = (fileName: string) => {
  const ts = Date.now();
  // 원본에서 확장자 먼저 추출 (한글 파일명 보존)
  const lastDot = fileName.lastIndexOf(".");
  const rawExt  = lastDot > 0 ? fileName.substring(lastDot).toLowerCase() : "";
  const rawBase = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
  // 베이스만 영숫자로 정제
  const base = rawBase.replace(/[^a-zA-Z0-9_-]/g, "").trim() || "file";
  return `${ts}_${base}${rawExt}`;
};

// ─── Types ────────────────────────────────────────────────────────────────────
type ArchiveItem = {
  id: string;
  user_id: string;
  subject_name: string;
  grade_level: string;
  semester: string;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  created_at: string;
};

type FolderGroup = {
  subject_name: string;
  grade_level: string;
  semester: string;
  fileCount: number;
  user_id: string;
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ArchivePage() {
  const { user, loading: authLoading } = useAuth();

  // Data
  const [allItems, setAllItems]               = useState<ArchiveItem[]>([]);
  const [timetableSubjects, setTimetableSubjects] = useState<string[]>([]);

  // Loading states
  const [initialLoading, setInitialLoading]   = useState(true);
  const [saving, setSaving]                   = useState(false);
  const [uploading, setUploading]             = useState(false);
  const [uploadProgress, setUploadProgress]   = useState(0);

  // Drag & drop
  const [dragOver, setDragOver]               = useState(false);

  // Filters (all client-side)
  const [searchQuery, setSearchQuery]         = useState("");
  const [gradeFilter, setGradeFilter]         = useState("전체");
  const [semesterFilter, setSemesterFilter]   = useState("전체");

  // Folder form
  const [newSubjectName, setNewSubjectName]   = useState("");
  const [isDirectInput, setIsDirectInput]     = useState(false);
  const [newGradeLevel, setNewGradeLevel]     = useState("1학년");
  const [newSemester, setNewSemester]         = useState("1학기");

  // Selected folder
  const [selectedFolder, setSelectedFolder]   = useState<FolderGroup | null>(null);

  // 파일 삭제 confirm
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ArchiveItem | null>(null);

  // 폴더 삭제 confirm + 우클릭 컨텍스트 메뉴
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderGroup | null>(null);
  const [contextMenu, setContextMenu] = useState<{ folder: FolderGroup; x: number; y: number } | null>(null);

  // 폴더 이름 인라인 편집
  const [editingFolderKey, setEditingFolderKey] = useState<string | null>(null);
  const [editSubjectName, setEditSubjectName] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Toast
  const [toastMessage, setToastMessage]       = useState<string | null>(null);
  const [toastType, setToastType]             = useState<"success" | "error">("success");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // ─── Fetch (load all once — filter client-side) ───────────────────────────
  const fetchArchive = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getArchiveItems(user.id);
      if (res.error) {
        showToast("아카이브 데이터를 불러오지 못했습니다.", "error");
        setAllItems([]);
      } else {
        setAllItems((res.data ?? []) as ArchiveItem[]);
      }
    } catch {
      showToast("아카이브 데이터를 불러오지 못했습니다.", "error");
      setAllItems([]);
    } finally {
      setInitialLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    if (!user) return;
    fetchArchive();
    getUserTimetableSubjects(user.id).then((res) => {
      if (!res.error) {
        const list = Array.from(
          new Set((res.data ?? []).map((i: { subject: string }) => i.subject).filter(Boolean)),
        ) as string[];
        setTimetableSubjects(list);
      }
    });
  }, [user]);

  // ─── Derived data ─────────────────────────────────────────────────────────
  const folders = useMemo(() => {
    const map = new Map<string, FolderGroup>();
    allItems.forEach((item) => {
      if (gradeFilter !== "전체" && item.grade_level !== gradeFilter) return;
      if (semesterFilter !== "전체" && item.semester !== semesterFilter) return;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!item.subject_name.toLowerCase().includes(q) && !(item.file_name?.toLowerCase().includes(q))) return;
      }
      const key = `${item.subject_name}|${item.grade_level}|${item.semester}`;
      if (!map.has(key)) {
        map.set(key, { subject_name: item.subject_name, grade_level: item.grade_level, semester: item.semester, fileCount: item.file_name ? 1 : 0, user_id: item.user_id });
      } else if (item.file_name) {
        map.get(key)!.fileCount += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.subject_name.localeCompare(b.subject_name, "ko"));
  }, [allItems, gradeFilter, semesterFilter, searchQuery]);

  // 학기별 폴더 수 집계 (각 학기 독립 슬롯)
  const folderCountBySemester = useMemo(() => {
    const map = new Map<string, number>();
    const seen = new Set<string>();
    allItems.forEach((item) => {
      const folderKey = `${item.subject_name}|${item.grade_level}|${item.semester}`;
      if (seen.has(folderKey)) return;
      seen.add(folderKey);
      const semKey = `${item.grade_level}|${item.semester}`;
      map.set(semKey, (map.get(semKey) ?? 0) + 1);
    });
    return map;
  }, [allItems]);

  // 폼에서 선택 중인 학기의 폴더 수
  const currentSemFolderCount = useMemo(
    () => folderCountBySemester.get(`${newGradeLevel}|${newSemester}`) ?? 0,
    [folderCountBySemester, newGradeLevel, newSemester],
  );

  const folderFiles = useMemo(() => {
    if (!selectedFolder) return [];
    return allItems
      .filter((i) =>
        i.subject_name === selectedFolder.subject_name &&
        i.grade_level  === selectedFolder.grade_level  &&
        i.semester     === selectedFolder.semester      &&
        i.file_name
      )
      .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  }, [allItems, selectedFolder]);

  const isFiltered = gradeFilter !== "전체" || semesterFilter !== "전체" || searchQuery.trim() !== "";

  // 슬롯 프로그레스 — 현재 폼에서 선택된 학기 기준
  const slotPct  = Math.min((currentSemFolderCount / FOLDER_LIMIT) * 100, 100);
  const slotBar  = slotPct >= 100 ? "bg-rose-500" : slotPct >= 80 ? "bg-amber-500" : "bg-sky-500";
  const slotText = slotPct >= 100 ? "text-rose-600 dark:text-rose-400" : slotPct >= 80 ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400";

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleFolderCreate = async () => {
    if (!user) return;
    const subject = newSubjectName.trim();
    if (!subject) { showToast("과목명을 입력해주세요.", "error"); return; }
    if (currentSemFolderCount >= FOLDER_LIMIT) { showToast(`이 학기는 최대 ${FOLDER_LIMIT}개 폴더까지 생성할 수 있습니다.`, "error"); return; }
    setSaving(true);
    try {
      const res = await createArchiveFolder({ user_id: user.id, subject_name: subject, grade_level: newGradeLevel, semester: newSemester });
      if (res.error) {
        showToast("폴더 생성에 실패했습니다.", "error");
      } else {
        setNewSubjectName(""); setIsDirectInput(false);
        await fetchArchive();
        setSelectedFolder({ subject_name: subject, grade_level: newGradeLevel, semester: newSemester, fileCount: 0 });
        showToast("폴더가 생성되었습니다!", "success");
      }
    } catch {
      showToast("폴더 생성 중 오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  const processFile = async (file: File) => {
    if (!user || !selectedFolder) { showToast("폴더를 먼저 선택해주세요.", "error"); return; }

    const gradeCode    = encodeGradeLevel(selectedFolder.grade_level);
    const semCode      = encodeSemester(selectedFolder.semester);
    const safeFileName = sanitizeFileName(file.name);
    // user.id 는 UUID (영숫자 + 하이픈) → encodeURIComponent 불필요
    const filePath     = `${user.id}/${gradeCode}-${semCode}/${Date.now()}/${safeFileName}`;

    console.log("[Archive] 업로드 시작", { bucket: ARCHIVE_BUCKET, filePath, fileSize: file.size, fileType: file.type });

    setUploading(true); setUploadProgress(0);
    try {
      // 1. Storage 업로드
      setUploadProgress(10);
      const uploadRes = await uploadArchiveFile(ARCHIVE_BUCKET, filePath, file);
      if (uploadRes.error) {
        console.error("[Archive] Storage 업로드 실패", uploadRes.error);
        showToast(`업로드 실패: ${uploadRes.error.message}`, "error");
        return;
      }
      const uploadedPath = uploadRes.data?.path ?? filePath;
      console.log("[Archive] Storage 업로드 성공", { uploadedPath });
      setUploadProgress(60);

      // 2. DB 메타데이터 저장
      const dbRes = await createArchiveFile({
        user_id: user.id,
        subject_name: selectedFolder.subject_name,
        grade_level: selectedFolder.grade_level,
        semester: selectedFolder.semester,
        file_url: uploadedPath,
        file_name: file.name,
        file_type: file.type || file.name.split(".").pop() || "unknown",
      });
      if (dbRes.error) {
        console.error("[Archive] DB 메타데이터 저장 실패", dbRes.error);
        showToast(`메타데이터 저장 실패: ${dbRes.error.message}`, "error");
        return;
      }
      setUploadProgress(100);
      console.log("[Archive] DB 저장 성공, 목록 갱신 중");
      await fetchArchive();
      showToast("업로드 완료!", "success");
    } catch (err) {
      console.error("[Archive] processFile 예외", err);
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`업로드 오류: ${msg}`, "error");
    } finally {
      setUploading(false); setUploadProgress(0);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
    e.target.value = "";
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  };

  const handleDownload = async (item: ArchiveItem) => {
    if (!item.file_url) return;
    try {
      const res = await createArchiveSignedUrl(ARCHIVE_BUCKET, item.file_url);
      if (res.error) { showToast("다운로드 링크를 가져오지 못했습니다.", "error"); return; }
      window.open(res.data.signedUrl, "_blank");
    } catch {
      showToast("다운로드 링크 생성 중 오류가 발생했습니다.", "error");
    }
  };

  // ─── 폴더 삭제 ───────────────────────────────────────────────────────────────
  const handleFolderDelete = async () => {
    if (!deleteFolderTarget || !user) return;
    const target = deleteFolderTarget;
    setDeleteFolderTarget(null);
    setSaving(true);
    try {
      const folderItems = allItems.filter(
        (i) => i.subject_name === target.subject_name &&
                i.grade_level  === target.grade_level  &&
                i.semester     === target.semester,
      );
      // 1. Storage 파일 삭제
      await Promise.all(
        folderItems.filter((i) => i.file_url).map((i) => deleteArchiveFile(ARCHIVE_BUCKET, i.file_url!)),
      );
      // 2. DB 레코드 전체 삭제
      const dbResults = await Promise.all(folderItems.map((i) => deleteArchiveMeta(i.id)));
      const dbErrors = dbResults.filter((r) => r.error);
      if (dbErrors.length > 0) {
        console.error("[Archive] 폴더 DB 삭제 일부 실패:", dbErrors.map((r) => r.error));
      }
      // 3. 선택된 폴더이면 해제
      if (
        selectedFolder?.subject_name === target.subject_name &&
        selectedFolder?.grade_level  === target.grade_level  &&
        selectedFolder?.semester     === target.semester
      ) setSelectedFolder(null);
      await fetchArchive();
      showToast("폴더가 삭제되었습니다.", "success");
    } catch {
      showToast("폴더 삭제 중 오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  // ─── 폴더 이름 수정 ──────────────────────────────────────────────────────────
  const handleFolderNameSave = async (folder: FolderGroup) => {
    const newName = editSubjectName.trim();
    if (!newName || !user) { setEditingFolderKey(null); return; }
    if (newName === folder.subject_name) { setEditingFolderKey(null); return; }
    setEditSaving(true);
    try {
      const res = await updateArchiveFolderName(user.id, folder.subject_name, folder.grade_level, folder.semester, newName);
      if (res.error) {
        console.error("[Archive] 폴더 이름 수정 실패:", res.error);
        showToast(`수정 실패: ${res.error.message}`, "error");
      } else if (!res.data || (Array.isArray(res.data) && res.data.length === 0)) {
        showToast("수정 권한이 없거나 해당 폴더를 찾을 수 없습니다.", "error");
      } else {
        if (
          selectedFolder?.subject_name === folder.subject_name &&
          selectedFolder?.grade_level  === folder.grade_level &&
          selectedFolder?.semester     === folder.semester
        ) {
          setSelectedFolder({ ...selectedFolder, subject_name: newName });
        }
        setEditingFolderKey(null);
        await fetchArchive();
        showToast("폴더 이름이 수정되었습니다.", "success");
      }
    } catch (err) {
      console.error("[Archive] handleFolderNameSave 예외:", err);
      showToast("수정 중 오류가 발생했습니다.", "error");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmItem || !user) return;
    const item = deleteConfirmItem;
    setDeleteConfirmItem(null);
    setSaving(true);
    try {
      if (item.file_url) {
        const storRes = await deleteArchiveFile(ARCHIVE_BUCKET, item.file_url);
        if (storRes.error) {
          console.error("[Archive] Storage 파일 삭제 실패:", storRes.error);
          showToast("파일 삭제에 실패했습니다.", "error");
          return;
        }
      }
      const dbRes = await deleteArchiveMeta(item.id);
      if (dbRes.error) {
        console.error("[Archive] DB 레코드 삭제 실패:", dbRes.error);
        showToast(`삭제 실패: ${dbRes.error.message}`, "error");
      } else if (!dbRes.data || (Array.isArray(dbRes.data) && dbRes.data.length === 0)) {
        console.warn("[Archive] DB 삭제: 영향받은 행 없음 (RLS 차단 또는 이미 삭제됨)");
        showToast("삭제 권한이 없거나 이미 삭제된 파일입니다.", "error");
      } else {
        await fetchArchive();
        showToast("파일이 삭제되었습니다.", "success");
      }
    } catch (err) {
      console.error("[Archive] handleDeleteConfirm 예외:", err);
      showToast("파일 삭제 중 오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  // ─── Guards ────────────────────────────────────────────────────────────────
  if (authLoading) return <LoadingCard />;
  if (!user) {
    return (
      <div className="rounded-[2rem] bg-white p-8 shadow-sm dark:bg-slate-900">
        <p className="text-base text-slate-600 dark:text-slate-300">로그인 후 아카이브 자료실을 이용할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 헤더 + 검색 필터 ──────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">📚 아카이브</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">전공 자료실</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">과목 폴더를 만들고 학습 자료를 저장하세요.</p>
          </div>

          {/* 슬롯 프로그레스 바 — 선택된 학기 기준 */}
          <div className="w-full sm:w-64">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-500 dark:text-slate-400">
                {newGradeLevel} {newSemester} 슬롯
              </span>
              <span className={slotText}>{currentSemFolderCount} / {FOLDER_LIMIT}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className={`h-full rounded-full transition-all duration-500 ${slotBar}`} style={{ width: `${slotPct}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
              학기별 최대 {FOLDER_LIMIT}개 · 각 학기 독립
            </p>
            {slotPct >= 80 && (
              <p className={`mt-0.5 text-xs font-semibold ${slotText}`}>
                {slotPct >= 100 ? "⚠️ 이 학기 폴더가 꽉 찼습니다!" : "⚠️ 슬롯이 거의 찼습니다."}
              </p>
            )}
          </div>
        </div>

        {/* 검색 + 필터 */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">검색</label>
            <div className="relative mt-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="과목명 또는 파일명"
                className="h-11 w-full rounded-3xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">학년</label>
            <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}
              className="mt-2 h-11 w-full rounded-3xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              {gradeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">학기</label>
            <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)}
              className="mt-2 h-11 w-full rounded-3xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              {semesterOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* ── 폴더 그리드 + 사이드바 ────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-[1fr_300px]">
        {/* 폴더 그리드 */}
        <div className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">과목 폴더</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">클릭하면 해당 폴더의 자료를 볼 수 있어요.</p>
            </div>
            {selectedFolder && (
              <button type="button" onClick={() => setSelectedFolder(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                ← 전체 보기
              </button>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
            {initialLoading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonFolder key={i} />)
            ) : folders.length === 0 ? (
              <div className="col-span-full flex flex-col items-center gap-4 rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50 py-14 text-center dark:border-slate-700 dark:bg-slate-950">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                {isFiltered ? (
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">검색 결과가 없어요</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">다른 검색어나 필터를 시도해보세요.</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">아직 생성된 폴더가 없어요</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">새 과목 폴더를 만들어보세요!</p>
                  </div>
                )}
              </div>
            ) : (
              folders.map((folder) => {
                const folderKey = `${folder.subject_name}|${folder.grade_level}|${folder.semester}`;
                const isSelected =
                  selectedFolder?.subject_name === folder.subject_name &&
                  selectedFolder?.grade_level  === folder.grade_level  &&
                  selectedFolder?.semester     === folder.semester;
                const isEditing = editingFolderKey === folderKey;
                return (
                  <div
                    key={folderKey}
                    role="button"
                    tabIndex={0}
                    onClick={() => { if (!isEditing) setSelectedFolder(folder); }}
                    onKeyDown={(e) => { if (!isEditing && (e.key === "Enter" || e.key === " ")) setSelectedFolder(folder); }}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ folder, x: e.clientX, y: e.clientY }); }}
                    className={`relative flex min-h-36 w-full cursor-pointer flex-col justify-between rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? "border-sky-400 bg-sky-50 dark:border-sky-600 dark:bg-sky-950/20"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
                    }`}>
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {folder.grade_level} · {folder.semester}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          isSelected
                            ? "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        }`}>
                          {folder.fileCount}개
                        </span>
                      </div>
                      {isEditing ? (
                        <>
                          <input
                            value={editSubjectName}
                            onChange={(e) => setEditSubjectName(e.target.value)}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter") handleFolderNameSave(folder);
                              if (e.key === "Escape") setEditingFolderKey(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                            className="mt-2 w-full rounded-lg border border-sky-300 bg-white px-2 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-sky-500 dark:border-sky-700 dark:bg-slate-800 dark:text-slate-100"
                          />
                          <div className="mt-1.5 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleFolderNameSave(folder)}
                              disabled={editSaving}
                              className="rounded-md bg-sky-600 px-2.5 py-0.5 text-[10px] font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
                            >{editSaving ? "…" : "확인"}</button>
                            <button
                              type="button"
                              onClick={() => setEditingFolderKey(null)}
                              className="rounded-md border border-slate-200 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >취소</button>
                          </div>
                        </>
                      ) : (
                        <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {folder.subject_name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        {folder.fileCount === 0 ? "자료 없음" : `자료 ${folder.fileCount}개`}
                      </div>
                      <div className="flex items-center gap-1 text-xs" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => { setEditingFolderKey(folderKey); setEditSubjectName(folder.subject_name); }}
                          className="font-medium text-sky-400 transition hover:text-sky-600 dark:text-sky-500 dark:hover:text-sky-300"
                        >수정</button>
                        <span className="text-slate-200 dark:text-slate-600">|</span>
                        <button
                          type="button"
                          onClick={() => setDeleteFolderTarget(folder)}
                          className="font-medium text-rose-400 transition hover:text-rose-600 dark:text-rose-500 dark:hover:text-rose-300"
                        >삭제</button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 새 폴더 생성 사이드바 */}
        <aside className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">새 과목 폴더</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">학기별로 최대 {FOLDER_LIMIT}개까지 생성 가능합니다.</p>

          <div className="mt-5 space-y-4">
            {/* 과목명 — 시간표 드롭다운 or 직접 입력 */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">과목명</label>
              {timetableSubjects.length > 0 && !isDirectInput ? (
                <div className="relative mt-2">
                  <select
                    value={newSubjectName}
                    onChange={(e) => {
                      if (e.target.value === "__direct__") { setIsDirectInput(true); setNewSubjectName(""); }
                      else setNewSubjectName(e.target.value);
                    }}
                    className="h-11 w-full appearance-none rounded-3xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="">과목 선택</option>
                    {timetableSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
                    <option value="__direct__">✏️ 직접 입력</option>
                  </select>
                  <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleFolderCreate(); }}
                    placeholder="과목명 직접 입력"
                    className="h-11 flex-1 rounded-3xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  {timetableSubjects.length > 0 && (
                    <button type="button" onClick={() => { setIsDirectInput(false); setNewSubjectName(""); }}
                      className="rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
                      목록
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">학년</label>
              <select value={newGradeLevel} onChange={(e) => setNewGradeLevel(e.target.value)}
                className="mt-2 h-11 w-full rounded-3xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                {gradeOptions.filter((o) => o !== "전체").map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">학기</label>
              <select value={newSemester} onChange={(e) => setNewSemester(e.target.value)}
                className="mt-2 h-11 w-full rounded-3xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                {semesterOptions.filter((o) => o !== "전체").map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            {/* 현재 학기 슬롯 미니 표시 */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-500 dark:text-slate-400">{newGradeLevel} {newSemester}</span>
                <span className={slotText}>{currentSemFolderCount} / {FOLDER_LIMIT}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div className={`h-full rounded-full transition-all duration-500 ${slotBar}`} style={{ width: `${slotPct}%` }} />
              </div>
            </div>

            <button type="button" onClick={handleFolderCreate}
              disabled={saving || currentSemFolderCount >= FOLDER_LIMIT}
              className="inline-flex w-full items-center justify-center rounded-3xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "생성 중..." : currentSemFolderCount >= FOLDER_LIMIT ? "이 학기 폴더 꽉 참" : "새 과목 폴더 생성"}
            </button>

            {timetableSubjects.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                💡 시간표에 과목을 등록하면 드롭다운으로 빠르게 선택할 수 있어요.
              </p>
            )}
          </div>
        </aside>
      </section>

      {/* ── 자료 목록 (폴더 선택 시) ──────────────────────── */}
      {selectedFolder && (
        <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">자료 목록</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {selectedFolder.subject_name}
                <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">
                  {selectedFolder.grade_level} · {selectedFolder.semester}
                </span>
              </h2>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              파일 업로드
              <input ref={fileInputRef} type="file" accept="*/*" onChange={handleFileChange} className="hidden" disabled={uploading} />
            </label>
          </div>

          {/* 업로드 프로그레스 */}
          {uploading && (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950/30">
              <div className="flex items-center justify-between text-sm font-semibold text-sky-700 dark:text-sky-300">
                <span>업로드 중...</span><span>{uploadProgress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-200 dark:bg-sky-900">
                <div className="h-full rounded-full bg-sky-500 transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {/* 드래그 앤 드롭 존 */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
              dragOver
                ? "border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/30"
                : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950/50"
            }`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`mb-2 ${dragOver ? "text-sky-500" : "text-slate-300 dark:text-slate-600"}`}>
              <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
            </svg>
            <p className={`text-sm font-semibold ${dragOver ? "text-sky-600 dark:text-sky-400" : "text-slate-400 dark:text-slate-500"}`}>
              {dragOver ? "여기에 놓으세요!" : "파일을 드래그하거나 클릭해서 업로드"}
            </p>
          </div>

          {/* 파일 목록 */}
          <div className="mt-5">
            {initialLoading ? (
              <div className="space-y-3"><SkeletonFile /><SkeletonFile /></div>
            ) : folderFiles.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50 py-12 text-center dark:border-slate-700 dark:bg-slate-950">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                </svg>
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">이 폴더에 아직 자료가 없어요</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">파일을 업로드해보세요!</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {folderFiles.map((item) => {
                  const kind = getFileKind(item.file_name ?? "");
                  return (
                    <div key={item.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                      <FileKindIcon kind={kind} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.file_name}</p>
                        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                          {item.file_type || kind} · {new Date(item.created_at).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={() => handleDownload(item)}
                          className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
                          다운로드
                        </button>
                        <button type="button" onClick={() => setDeleteConfirmItem(item)}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 우클릭 컨텍스트 메뉴 ────────────────────────────── */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        >
          <div
            className="fixed z-50 min-w-[120px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { setDeleteFolderTarget(contextMenu.folder); setContextMenu(null); }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              삭제
            </button>
          </div>
        </div>
      )}

      {/* ── 폴더 삭제 확인 모달 ───────────────────────────── */}
      {deleteFolderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/40">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600 dark:text-rose-400">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">폴더를 삭제할까요?</h2>
                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{deleteFolderTarget.subject_name}</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  폴더 안의 파일도 모두 삭제됩니다.<br />
                  삭제 후에는 복구할 수 없습니다.
                </p>
              </div>
              <div className="flex w-full gap-3">
                <button type="button" onClick={() => setDeleteFolderTarget(null)}
                  className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  취소
                </button>
                <button type="button" onClick={handleFolderDelete} disabled={saving}
                  className="flex-1 rounded-3xl bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50">
                  {saving ? "삭제 중..." : "삭제"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 파일 삭제 확인 모달 ───────────────────────────── */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/40">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600 dark:text-rose-400">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">파일을 삭제할까요?</h2>
                <p className="mt-1 max-w-xs truncate text-sm text-slate-500 dark:text-slate-400">{deleteConfirmItem.file_name}</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">삭제 후에는 복구할 수 없습니다.</p>
              </div>
              <div className="flex w-full gap-3">
                <button type="button" onClick={() => setDeleteConfirmItem(null)}
                  className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  취소
                </button>
                <button type="button" onClick={handleDeleteConfirm} disabled={saving}
                  className="flex-1 rounded-3xl bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50">
                  삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMessage && <ToastMessage message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} />}
    </div>
  );
}
