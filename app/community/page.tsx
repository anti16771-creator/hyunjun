"use client";

import { DragEvent, useEffect, useMemo, useState } from "react";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import {
  createCommunityPost,
  getCommunityPosts,
  getProfileByIdentifier,
  getSignedAttachmentUrl,
  uploadBoardAttachment,
  updateProfileRole,
} from "@/src/lib/supabase";

const categoryTabs = [
  { value: "공지사항", label: "📢 공지사항" },
  { value: "자유게시판", label: "💬 자유게시판" },
  { value: "자료 공유실", label: "📚 자료 공유실" },
  { value: "꿀팁", label: "💡 꿀팁" },
];

type CommunityPost = {
  id: string;
  user_id: string;
  author_name: string;
  category: string;
  title: string;
  content: string;
  file_url?: string | null;
  file_name?: string | null;
  created_at: string;
};

type ProfileEntry = {
  id: string;
  email: string;
  name: string;
  role: string;
};

function sanitizeFileName(filename: string) {
  const timestamp = Date.now();
  const name = filename
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .trim();
  const [nameWithoutExt, ext] = name.lastIndexOf(".") > 0
    ? [name.substring(0, name.lastIndexOf(".")), name.substring(name.lastIndexOf("."))]
    : [name, ""];
  return `${timestamp}_${nameWithoutExt || "file"}${ext}`;
}

function sanitizeCategoryPath(category: string) {
  const categoryMap: Record<string, string> = {
    "공지사항": "notice",
    "자유게시판": "freeboard",
    "자료 공유실": "resources",
    "꿀팁": "tips",
  };
  return categoryMap[category] || encodeURIComponent(category);
}

export default function CommunityPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("공지사항");
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [writeModalOpen, setWriteModalOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);

  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postTag, setPostTag] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [searchIdentifier, setSearchIdentifier] = useState("");
  const [searchedProfile, setSearchedProfile] = useState<ProfileEntry | null>(null);
  const [manageMessage, setManageMessage] = useState("");
  const [roleLoading, setRoleLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const isAdmin = profile?.role === "admin";
  const canPostNotice = profile?.role === "admin" || profile?.role === "staff";

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToastMessage(message);
    setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  };

  const filteredCategoryLabel = useMemo(
    () => categoryTabs.find((tab) => tab.value === selectedCategory)?.label ?? selectedCategory,
    [selectedCategory],
  );

  const loadPosts = async () => {
    setLoading(true);
    setError("");
    const response = await getCommunityPosts(selectedCategory);
    if (response.error) {
      setError(response.error.message);
      setPosts([]);
      setSelectedPost(null);
    } else {
      const data = response.data ?? [];
      setPosts(data);
      setSelectedPost(data[0] ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPosts();
  }, [selectedCategory]);

  const handleOpenWrite = () => {
    setPostTitle("");
    setPostContent("");
    setPostTag("");
    setAttachedFile(null);
    setError("");
    setWriteModalOpen(true);
  };

  const handleCloseWrite = () => {
    setWriteModalOpen(false);
    setAttachedFile(null);
    setError("");
  };

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    setAttachedFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) {
      handleFileChange(file);
    }
  };

  const handleUploadPost = async () => {
    if (authLoading) {
      setError("인증 정보를 불러오는 중입니다. 잠시만 기다려주세요.");
      return;
    }
    if (!user) {
      setError("로그인 후에 글을 작성할 수 있습니다.");
      return;
    }
    if (!postTitle.trim() || !postContent.trim()) {
      setError("제목과 내용을 모두 입력해주세요.");
      return;
    }

    setUploading(true);
    setError("");

    let fileUrl: string | null = null;
    let fileName: string | null = null;

    if (attachedFile) {
      const safeName = sanitizeFileName(attachedFile.name);
      const categoryPath = sanitizeCategoryPath(selectedCategory);
      const encodedUserId = encodeURIComponent(user.id);
      const storagePath = `${encodedUserId}/${categoryPath}/${safeName}`;
      console.log("Board attachment storage key:", storagePath);
      const uploadResult = await uploadBoardAttachment("board_attachments", storagePath, attachedFile);
      if (uploadResult.error) {
        console.error("uploadBoardAttachment error", uploadResult.error);
        setError(uploadResult.error.message);
        showToast("첨부 파일 업로드에 실패했습니다.", "error");
        setUploading(false);
        return;
      }
      fileUrl = storagePath;
      fileName = attachedFile.name;
    }

    const authorName =
      profile?.name ||
      (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) ||
      user.email ||
      "익명 사용자";

    const createResponse = await createCommunityPost({
      user_id: user.id,
      author_name: authorName,
      category: selectedCategory,
      title: postTitle.trim(),
      content: `${postTag ? `[${postTag}] ` : ""}${postContent.trim()}`,
      file_url: fileUrl,
      file_name: fileName,
    });

    if (createResponse.error) {
      console.error("createCommunityPost error", createResponse.error);
      setError(createResponse.error.message);
      showToast("게시글 등록에 실패했습니다.", "error");
    } else {
      handleCloseWrite();
      await loadPosts();
      showToast("게시글이 등록되었습니다.", "success");
    }
    setUploading(false);
  };

  const handleDownloadFile = async (filePath: string, fileName: string) => {
    if (!filePath) return;
    const response = await getSignedAttachmentUrl("board_attachments", filePath);
    if (response.error || !response.data?.signedUrl) {
      setError(response.error?.message ?? "첨부 파일을 가져오지 못했습니다.");
      return;
    }
    window.open(response.data.signedUrl, "_blank");
  };

  const handleCopyLink = async (filePath: string) => {
    if (!filePath) return;
    const response = await getSignedAttachmentUrl("board_attachments", filePath);
    if (response.error || !response.data?.signedUrl) {
      setError(response.error?.message ?? "공유 링크를 생성하지 못했습니다.");
      return;
    }
    await navigator.clipboard.writeText(response.data.signedUrl);
  };

  const handleOpenManage = () => {
    setSearchIdentifier("");
    setSearchedProfile(null);
    setManageMessage("");
    setManageModalOpen(true);
  };

  const handleSearchProfile = async () => {
    if (!searchIdentifier.trim()) {
      setManageMessage("이메일 또는 UID를 입력해주세요.");
      return;
    }
    setRoleLoading(true);
    setManageMessage("");
    const response = await getProfileByIdentifier(searchIdentifier.trim());
    if (response.error) {
      setManageMessage(response.error.message);
      setSearchedProfile(null);
    } else if (!response.data) {
      setManageMessage("해당 유저를 찾을 수 없습니다.");
      setSearchedProfile(null);
    } else {
      setSearchedProfile(response.data as ProfileEntry);
    }
    setRoleLoading(false);
  };

  const handleApplyRoleChange = async () => {
    if (!searchedProfile) {
      setManageMessage("먼저 유저를 검색해주세요.");
      return;
    }
    setRoleLoading(true);
    setManageMessage("");
    const targetRole = searchedProfile.role === "staff" ? "user" : "staff";
    const response = await updateProfileRole(searchedProfile.id, targetRole);
    if (response.error) {
      setManageMessage(response.error.message);
    } else {
      setManageMessage(`${searchedProfile.email} 님의 권한이 ${targetRole === "staff" ? "staff" : "user"}로 변경되었습니다.`);
      setSearchedProfile({ ...searchedProfile, role: targetRole });
    }
    setRoleLoading(false);
  };

  if (authLoading) {
    return <LoadingCard />;
  }

  return (
    <div className="min-h-screen bg-gray-50/50 py-6">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        <section className="rounded-[2rem] bg-white px-6 py-8 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">커뮤니티 게시판</p>
              <h1 className="mt-3 text-4xl font-semibold text-slate-900">Smart Grade Community Dashboard</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-600">
                자유로운 게시글, 자료 공유, 꿀팁, 그리고 공지사항을 한 곳에서 관리하세요. 관리자 권한이 있으면 공지사항 작성과 권한 관리도 할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={handleOpenManage}
                  className="rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
                >
                  🔒 유저 권한 관리
                </button>
              ) : null}
              {user && (selectedCategory !== "공지사항" || canPostNotice) ? (
                <button
                  type="button"
                  onClick={handleOpenWrite}
                  className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {selectedCategory === "공지사항" ? "⚙️ 공지사항 작성" : "✏️ 글쓰기"}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] bg-white px-6 py-6 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {categoryTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setSelectedCategory(tab.value)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    selectedCategory === tab.value
                      ? "bg-slate-900 text-white"
                      : "border border-gray-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="text-sm text-gray-500">현재 카테고리: {filteredCategoryLabel}</div>
          </div>

          <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-gray-100 bg-white">
            <div className="hidden grid-cols-[60px_1fr_180px_180px_130px] gap-4 border-b border-gray-100 px-5 py-4 text-sm font-semibold text-gray-500 sm:grid">
              <div>번호</div>
              <div>제목</div>
              <div>작성자</div>
              <div>등록일</div>
              <div>첨부</div>
            </div>
            {loading ? (
              <div className="p-6">
                <LoadingCard />
              </div>
            ) : posts.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">해당 카테고리의 게시물이 없습니다.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {posts.map((post, index) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => setSelectedPost(post)}
                    className={`flex w-full flex-col gap-4 px-5 py-4 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center ${
                      selectedPost?.id === post.id ? "bg-slate-50" : "bg-white"
                    }`}
                  >
                    <div className="min-w-[60px] text-xs font-semibold text-gray-500 sm:text-sm">{index + 1}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 line-clamp-1">{post.title}</p>
                      <p className="mt-1 text-xs text-gray-500 line-clamp-1">{post.content}</p>
                    </div>
                    <div className="min-w-[180px] text-sm text-gray-600">{post.author_name}</div>
                    <div className="min-w-[180px] text-sm text-gray-600">{new Date(post.created_at).toLocaleDateString("ko-KR")}</div>
                    <div className="min-w-[130px] text-right text-sm text-gray-600">
                      {post.file_name ? <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-slate-700">📎 {post.file_name}</span> : <span className="text-gray-400">-</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[0.7fr_0.3fr]">
            <div className="rounded-[1.75rem] border border-gray-100 bg-gray-50 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-500">선택된 게시물</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{selectedPost?.title ?? "게시물을 선택해주세요."}</p>
                </div>
                <span className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-700 ring-1 ring-gray-200">
                  {selectedPost?.category ?? "-"}
                </span>
              </div>

              {selectedPost ? (
                <div className="mt-6 space-y-5">
                  <div className="rounded-3xl border border-gray-100 bg-white p-5">
                    <p className="text-sm font-semibold text-gray-700">작성자</p>
                    <p className="mt-2 text-sm text-slate-900">{selectedPost.author_name}</p>
                  </div>
                  <div className="rounded-3xl border border-gray-100 bg-white p-5">
                    <p className="text-sm font-semibold text-gray-700">내용</p>
                    <p className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-600">{selectedPost.content}</p>
                  </div>
                  {selectedPost.file_url ? (
                    <div className="rounded-3xl border border-gray-100 bg-white p-5">
                      <p className="text-sm font-semibold text-gray-700">첨부 파일</p>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700">
                          📎 {selectedPost.file_name ?? "첨부파일"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDownloadFile(selectedPost.file_url!, selectedPost.file_name ?? "attachment")}
                          className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-gray-50"
                        >
                          다운로드
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(selectedPost.file_url!)}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          링크 복사
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
                  게시물 제목을 클릭하면 상세 내용을 확인할 수 있습니다.
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="rounded-[1.75rem] border border-gray-100 bg-white p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">게시판 안내</p>
                <div className="mt-4 space-y-3 text-sm text-gray-600">
                  <p>• 공지사항은 staff/admin만 작성 가능합니다.</p>
                  <p>• 자유/자료/꿀팁은 로그인한 누구나 작성할 수 있습니다.</p>
                  <p>• 첨부 파일은 board_attachments 버킷에 안전하게 저장됩니다.</p>
                  <p>• 제목은 길어져도 깔끔하게 줄임 처리됩니다.</p>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-gray-100 bg-white p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">선택된 카테고리</p>
                <p className="mt-4 text-lg font-semibold text-slate-900">{filteredCategoryLabel}</p>
                <p className="mt-3 text-sm text-gray-600">
                  {selectedCategory === "공지사항"
                    ? "공지사항은 관리자가 게시글을 올리고 일반 사용자는 읽기 전용입니다."
                    : "자유롭게 게시물을 등록하고 파일을 첨부할 수 있습니다."}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {writeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
          <div className="w-full max-w-3xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">게시물 작성</h2>
                <p className="mt-2 text-sm text-gray-500">{selectedCategory}에 새로운 글을 등록합니다.</p>
              </div>
              <button type="button" onClick={handleCloseWrite} className="rounded-full px-3 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100">
                닫기
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">제목</span>
                <input
                  value={postTitle}
                  onChange={(event) => setPostTitle(event.target.value)}
                  className="mt-3 w-full rounded-3xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">태그</span>
                <input
                  value={postTag}
                  onChange={(event) => setPostTag(event.target.value)}
                  placeholder="예: 질문, 팁, 자료"
                  className="mt-3 w-full rounded-3xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">내용</span>
                <textarea
                  value={postContent}
                  onChange={(event) => setPostContent(event.target.value)}
                  rows={8}
                  className="mt-3 w-full rounded-[1.5rem] border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
              </label>

              <div>
                <p className="text-sm font-medium text-gray-700">첨부 파일</p>
                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  className="mt-3 rounded-[1.5rem] border-2 border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500 transition hover:border-slate-300"
                >
                  <p>파일을 드래그하여 업로드하거나 아래 버튼을 클릭하세요.</p>
                  <input
                    type="file"
                    accept="*"
                    onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                    className="mt-4 hidden"
                    id="community-file-input"
                  />
                  <label htmlFor="community-file-input" className="mt-4 inline-flex cursor-pointer rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                    파일 선택
                  </label>
                </div>
                {attachedFile ? (
                  <div className="mt-4 flex items-center justify-between rounded-3xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <span>{attachedFile.name}</span>
                    <button type="button" onClick={() => setAttachedFile(null)} className="text-slate-500 transition hover:text-slate-900">
                      삭제
                    </button>
                  </div>
                ) : null}
              </div>

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}

              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={handleCloseWrite} className="rounded-3xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:border-slate-300">
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleUploadPost}
                  disabled={uploading}
                  className="rounded-3xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  게시글 등록
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <ToastMessage message={toastMessage} type={toastType} />
      ) : null}

      {manageModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">유저 권한 관리</h2>
                <p className="mt-2 text-sm text-gray-500">이메일 또는 UID로 사용자를 검색하여 staff 권한을 부여하거나 박탈할 수 있습니다.</p>
              </div>
              <button type="button" onClick={() => setManageModalOpen(false)} className="rounded-full px-3 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100">
                닫기
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_130px]">
                <input
                  value={searchIdentifier}
                  onChange={(event) => setSearchIdentifier(event.target.value)}
                  placeholder="이메일 또는 UID 입력"
                  className="w-full rounded-3xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
                <button
                  type="button"
                  onClick={handleSearchProfile}
                  disabled={roleLoading}
                  className="rounded-3xl bg-slate-900 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  검색
                </button>
              </div>

              {searchedProfile ? (
                <div className="rounded-[1.5rem] border border-gray-200 bg-gray-50 p-5">
                  <p className="text-sm text-gray-500">검색 결과</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-900">
                    <p>이메일: {searchedProfile.email}</p>
                    <p>UID: {searchedProfile.id}</p>
                    <p>현재 역할: {searchedProfile.role}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleApplyRoleChange}
                      disabled={roleLoading || searchedProfile.role === "admin"}
                      className="rounded-3xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {searchedProfile.role === "staff" ? "staff 권한 박탈" : "staff 권한 부여"}
                    </button>
                    {searchedProfile.role === "admin" ? (
                      <span className="text-sm text-gray-500">admin 계정은 권한 변경 불가</span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {manageMessage ? <p className="text-sm text-slate-700">{manageMessage}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
