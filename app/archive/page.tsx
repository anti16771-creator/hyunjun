"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
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
  uploadArchiveFile,
} from "@/src/lib/supabase";

const ARCHIVE_BUCKET = "archives";
const gradeOptions = ["전체", "1학년", "2학년", "3학년", "4학년"];
const semesterOptions = ["전체", "1학기", "여름학기", "2학기", "겨울학기"];
const folderLimit = 20;

const iconMap: Record<string, string> = {
  pdf: "📄",
  zip: "🗜️",
  rar: "🗜️",
  png: "🖼️",
  jpg: "🖼️",
  jpeg: "🖼️",
  gif: "🖼️",
  txt: "📝",
  md: "📝",
  js: "📄",
  ts: "📄",
  jsx: "📄",
  tsx: "📄",
  py: "🐍",
  java: "☕",
  doc: "📄",
  docx: "📄",
  ppt: "📊",
  pptx: "📊",
  csv: "📊",
  xls: "📊",
  xlsx: "📊",
  default: "📎",
};

const getFileIcon = (name: string) => {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return iconMap[extension] ?? iconMap.default;
};

const gradeYearMap: Record<string, string> = {
  "1학년": "1",
  "2학년": "2",
  "3학년": "3",
  "4학년": "4",
};

const semesterMap: Record<string, string> = {
  "1학기": "1",
  "여름학기": "s",
  "2학기": "2",
  "겨울학기": "w",
};

const normalizePath = (value: string) => encodeURIComponent(value.trim().replace(/\s+/g, "_"));

const encodeGradeLevel = (grade: string) => gradeYearMap[grade] ?? "0";
const encodeSemester = (semester: string) => semesterMap[semester] ?? "0";

const sanitizeFileName = (fileName: string) => {
  const timestamp = Date.now();
  const name = fileName
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .trim();
  const [nameWithoutExt, ext] = name.lastIndexOf(".") > 0
    ? [name.substring(0, name.lastIndexOf(".")), name.substring(name.lastIndexOf("."))]
    : [name, ""];
  return `${timestamp}_${nameWithoutExt || "file"}${ext}`;
};

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
};

export default function ArchivePage() {
  const { user, loading: authLoading } = useAuth();
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState("전체");
  const [semesterFilter, setSemesterFilter] = useState("전체");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newGradeLevel, setNewGradeLevel] = useState("1학년");
  const [newSemester, setNewSemester] = useState("1학기");
  const [selectedFolder, setSelectedFolder] = useState<FolderGroup | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToastMessage(message);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchArchive = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await getArchiveItems(user.id, gradeFilter, semesterFilter, searchQuery);
      if (response.error) {
        setError(response.error.message);
        setArchiveItems([]);
        showToast("아카이브 데이터를 불러오는 중 오류가 발생했습니다.", "error");
      } else {
        setError("");
        setArchiveItems((response.data ?? []) as ArchiveItem[]);
      }
    } catch (err) {
      console.error("fetchArchive error", err);
      setError("아카이브 데이터를 불러오는 중 오류가 발생했습니다.");
      setArchiveItems([]);
      showToast("아카이브 데이터를 불러오는 중 오류가 발생했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchArchive();
  }, [user, gradeFilter, semesterFilter, searchQuery]);

  const folders = useMemo(() => {
    const map = new Map<string, FolderGroup>();
    archiveItems.forEach((item) => {
      const key = `${item.subject_name}|${item.grade_level}|${item.semester}`;
      if (!map.has(key)) {
        map.set(key, {
          subject_name: item.subject_name,
          grade_level: item.grade_level,
          semester: item.semester,
          fileCount: item.file_name ? 1 : 0,
        });
      } else if (item.file_name) {
        map.get(key)!.fileCount += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.subject_name.localeCompare(b.subject_name, "ko"));
  }, [archiveItems]);

  const folderFiles = useMemo(() => {
    if (!selectedFolder) return [];
    return archiveItems
      .filter(
        (item) =>
          item.subject_name === selectedFolder.subject_name &&
          item.grade_level === selectedFolder.grade_level &&
          item.semester === selectedFolder.semester &&
          item.file_name,
      )
      .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  }, [archiveItems, selectedFolder]);

  const totalFolderCount = useMemo(() => folders.length, [folders]);
  const remainingSlots = folderLimit - totalFolderCount;

  const handleFolderCreate = async () => {
    if (authLoading) {
      setError("인증 정보를 불러오는 중입니다. 잠시만 기다려주세요.");
      return;
    }
    if (!user) {
      setError("로그인 후에 폴더를 생성할 수 있습니다.");
      return;
    }
    if (!newSubjectName.trim()) {
      setError("과목명을 입력해야 합니다.");
      return;
    }
    if (totalFolderCount >= folderLimit) {
      setError(`최대 ${folderLimit}개 폴더까지 생성할 수 있습니다.`);
      return;
    }
    setLoading(true);
    try {
      const response = await createArchiveFolder({
        user_id: user.id,
        subject_name: newSubjectName.trim(),
        grade_level: newGradeLevel,
        semester: newSemester,
      });
      if (response.error) {
        console.error("createArchiveFolder error", response.error);
        setError(response.error.message);
        showToast("새 폴더 생성에 실패했습니다.", "error");
      } else {
        setNewSubjectName("");
        setNewGradeLevel("1학년");
        setNewSemester("1학기");
        await fetchArchive();
        setSelectedFolder({
          subject_name: newSubjectName.trim(),
          grade_level: newGradeLevel,
          semester: newSemester,
          fileCount: 0,
        });
        setError("");
        showToast("새 폴더가 생성되었습니다.", "success");
      }
    } catch (err) {
      console.error("handleFolderCreate error", err);
      setError("폴더 생성 중 오류가 발생했습니다.");
      showToast("폴더 생성 중 오류가 발생했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFolderSelect = (folder: FolderGroup) => {
    setSelectedFolder(folder);
    setError("");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (authLoading) {
      setError("인증 정보를 불러오는 중입니다. 잠시만 기다려주세요.");
      return;
    }
    if (!user || !selectedFolder) {
      setError("로그인 후 폴더를 선택하고 파일을 업로드하세요.");
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    
    const gradeCode = encodeGradeLevel(selectedFolder.grade_level);
    const semesterCode = encodeSemester(selectedFolder.semester);
    const safeFileName = sanitizeFileName(file.name);
    
    // 🔒 Storage 경로: 한글/특수문자 완전 배제, 영문/숫자만 사용
    // subject_${Date.now()} 형식으로 안전한 고유 폴더명 생성
    const safeSubjectId = `subject_${Date.now()}`;
    const filePath = `${encodeURIComponent(user.id)}/${gradeCode}-${semesterCode}/${safeSubjectId}/${safeFileName}`;
    console.log("Archive storage key (한글 배제):", filePath);
    setUploading(true);
    setProgress(0);
    try {
      const uploadResponse = await uploadArchiveFile(ARCHIVE_BUCKET, filePath, file, setProgress);
      if (uploadResponse.error) {
        console.error("uploadArchiveFile error", uploadResponse.error);
        setError(uploadResponse.error.message);
        showToast("파일 업로드에 실패했습니다.", "error");
        return;
      }
      const uploadedPath = uploadResponse.data?.path ?? filePath;
      const dbResponse = await createArchiveFile({
        user_id: user.id,
        subject_name: selectedFolder.subject_name,
        grade_level: selectedFolder.grade_level,
        semester: selectedFolder.semester,
        file_url: uploadedPath,
        file_name: file.name,
        file_type: file.type || file.name.split(".").pop() || "unknown",
      });
      if (dbResponse.error) {
        console.error("createArchiveFile error", dbResponse.error);
        setError(dbResponse.error.message);
        showToast("메타데이터 저장에 실패했습니다.", "error");
      } else {
        await fetchArchive();
        setError("");
        showToast("파일이 성공적으로 업로드되었습니다.", "success");
      }
    } catch (err) {
      console.error("handleFileUpload error", err);
      setError("파일 업로드 중 오류가 발생했습니다.");
      showToast("파일 업로드 중 오류가 발생했습니다.", "error");
    } finally {
      setUploading(false);
      setProgress(0);
      event.target.value = "";
    }
  };

  const handleDownloadFile = async (item: ArchiveItem) => {
    if (!item.file_url) return;
    try {
      const response = await createArchiveSignedUrl(ARCHIVE_BUCKET, item.file_url);
      if (response.error) {
        console.error("createArchiveSignedUrl error", response.error);
        setError(response.error.message);
        showToast("파일 다운로드 링크를 가져오지 못했습니다.", "error");
        return;
      }
      window.open(response.data.signedUrl, "_blank");
    } catch (err) {
      console.error("handleDownloadFile error", err);
      setError("다운로드 링크 생성 중 오류가 발생했습니다.");
      showToast("다운로드 링크 생성 중 오류가 발생했습니다.", "error");
    }
  };

  const handleDeleteFile = async (item: ArchiveItem) => {
    if (!user || !item.file_url) return;
    setLoading(true);
    try {
      const storageResponse = await deleteArchiveFile(ARCHIVE_BUCKET, item.file_url);
      if (storageResponse.error) {
        setError(storageResponse.error.message);
        showToast("파일 삭제에 실패했습니다.", "error");
        return;
      }
      const dbResponse = await deleteArchiveMeta(item.id);
      if (dbResponse.error) {
        setError(dbResponse.error.message);
        showToast("삭제된 파일 메타데이터 제거에 실패했습니다.", "error");
      } else {
        await fetchArchive();
        setError("");
        showToast("파일이 삭제되었습니다.", "success");
      }
    } catch (err) {
      console.error("handleDeleteFile error", err);
      setError("파일 삭제 중 오류가 발생했습니다.");
      showToast("파일 삭제 중 오류가 발생했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToRoot = () => {
    setSelectedFolder(null);
    setError("");
  };

  if (authLoading) {
    return <LoadingCard />;
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <p className="text-base text-gray-600">로그인 후 아카이브 자료실을 이용할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 px-6 py-8">
      <section className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">📚 아카이브</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">전공 자료실</h1>
            <p className="mt-3 max-w-2xl text-sm text-gray-500">
              폴더를 생성하고 해당 과목 폴더 안에서 자료를 업로드하세요. 학년/학기 검색으로 빠르게 찾을 수 있습니다.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <p className="font-semibold text-gray-900">폴더</p>
              <p className="mt-1">{totalFolderCount} / {folderLimit}</p>
            </div>
            <div className="rounded-3xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <p className="font-semibold text-gray-900">남은 슬롯</p>
              <p className="mt-1">{remainingSlots}개</p>
            </div>
            <div className="rounded-3xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <p className="font-semibold text-gray-900">선택된 폴더</p>
              <p className="mt-1">{selectedFolder ? `${selectedFolder.subject_name}` : "메인"}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-center">
          <div className="grid w-full gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-500">검색</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="파일명 또는 과목명 검색"
                className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">학년</span>
              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                {gradeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">학기</span>
              <select
                value={semesterFilter}
                onChange={(e) => setSemesterFilter(e.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                {semesterOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">폴더</p>
              <p className="mt-2 text-sm text-gray-500">과목 폴더를 클릭해서 자료를 확인하세요.</p>
            </div>
            {selectedFolder ? (
              <button
                type="button"
                onClick={handleBackToRoot}
                className="rounded-2xl border border-gray-100 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-200"
              >
                돌아가기
              </button>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            {loading ? (
              <div className="col-span-full rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500">
                <LoadingCard />
              </div>
            ) : folders.length === 0 ? (
              <div className="col-span-full rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500">
                생성된 과목 폴더가 없습니다.
              </div>
            ) : (
              folders.map((folder) => (
                <button
                  key={`${folder.subject_name}-${folder.grade_level}-${folder.semester}`}
                  type="button"
                  onClick={() => handleFolderSelect(folder)}
                  className="group flex h-44 w-full flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 text-left transition hover:border-gray-200"
                >
                  <div className="space-y-3">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">{folder.grade_level} · {folder.semester}</p>
                    <p className="max-h-12 overflow-hidden text-ellipsis text-lg font-semibold text-slate-900 line-clamp-2">{folder.subject_name}</p>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{folder.fileCount}개 자료</span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">폴더</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <aside className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">새 과목 폴더 추가</p>
            <p className="mt-2 text-sm text-gray-500">기본 5개 슬롯 제공, 최대 {folderLimit}개까지 생성할 수 있습니다.</p>
          </div>

          <form onSubmit={(event) => {
            event.preventDefault();
            handleFolderCreate();
          }} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-gray-500">과목명</span>
              <input
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                placeholder="새 과목명"
                className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">학년</span>
              <select
                value={newGradeLevel}
                onChange={(e) => setNewGradeLevel(e.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                {gradeOptions.filter((option) => option !== "전체").map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">학기</span>
              <select
                value={newSemester}
                onChange={(e) => setNewSemester(e.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-gray-100 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                {semesterOptions.filter((option) => option !== "전체").map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={totalFolderCount >= folderLimit}
              className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              새 과목 폴더 생성
            </button>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500">
              현재 생성된 폴더: {totalFolderCount}
              <br />
              남은 슬롯: {remainingSlots}
            </div>
          </form>
        </aside>
      </section>

      <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">자료 목록</p>
            <p className="mt-2 text-sm text-gray-500">선택한 폴더에 업로드된 자료를 확인하고 다운로드하거나 삭제하세요.</p>
          </div>
          <div className="text-sm text-gray-500">{selectedFolder ? `${selectedFolder.subject_name} (${selectedFolder.grade_level} · ${selectedFolder.semester})` : "폴더를 선택하면 업로드 버튼이 나타납니다."}</div>
        </div>

        {selectedFolder ? (
          <div className="mt-6 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-500">
                파일 업로드 경로: {selectedFolder.grade_level}_{selectedFolder.semester}/{selectedFolder.subject_name}
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-200">
                업로드 파일
                <input type="file" accept="*/*" onChange={handleFileUpload} className="hidden" disabled={uploading} />
              </label>
            </div>
            {uploading ? (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="mb-2 text-sm text-gray-500">업로드 진행률 {progress}%</div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : null}

            {folderFiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500">
                선택된 폴더에 업로드된 자료가 없습니다.
              </div>
            ) : (
              <div className="space-y-4">
                {folderFiles.map((item) => (
                  <div key={item.id} className="grid gap-4 rounded-2xl border border-gray-100 bg-white p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.file_name}</p>
                      <p className="mt-2 text-sm text-gray-500">{item.file_type || "알 수 없음"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleDownloadFile(item)}
                        className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-200"
                      >
                        다운로드
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFile(item)}
                        className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-200"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-10 text-center text-sm text-gray-500">
            과목 폴더를 선택하면 파일 업로드와 자료 목록을 확인할 수 있습니다.
          </div>
        )}
      </section>

      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      {toastMessage ? <ToastMessage message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} /> : null}
    </div>
  );
}
