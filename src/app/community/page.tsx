"use client";

import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoadingCard from "@/src/components/LoadingCard";
import ToastMessage from "@/src/components/ToastMessage";
import { useAuth } from "@/src/context/AuthContext";
import {
  addPostLike, createComment, createCommunityPost,
  deleteComment, deleteCommunityPost, getCommentCountsByPosts,
  getCommentsByPost, getCommunityPosts, getPostLikes,
  getProfileByIdentifier, getSignedAttachmentUrl,
  removePostLike, updateCommunityPost, updateProfileRole,
  uploadBoardAttachment,
} from "@/src/lib/supabase";

const categoryTabs = [
  { value: "공지사항",   label: "📢 공지사항" },
  { value: "자유게시판", label: "💬 자유게시판" },
  { value: "자료 공유실", label: "📚 자료 공유실" },
  { value: "꿀팁",       label: "💡 꿀팁" },
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

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  author_name: string;
  content: string;
  created_at: string;
};

type ProfileEntry = { id: string; email: string; name: string; role: string };

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return "방금 전";
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR");
}

function sanitizeFileName(filename: string) {
  const ts = Date.now();
  const lastDot = filename.lastIndexOf(".");
  const rawExt  = lastDot > 0 ? filename.substring(lastDot).toLowerCase() : "";
  const rawBase = lastDot > 0 ? filename.substring(0, lastDot) : filename;
  const base    = rawBase.replace(/[^a-zA-Z0-9._-]/g, "").trim() || "file";
  return `${ts}_${base}${rawExt}`;
}

function sanitizeCategoryPath(category: string) {
  const map: Record<string, string> = {
    "공지사항": "notice", "자유게시판": "freeboard",
    "자료 공유실": "resources", "꿀팁": "tips",
  };
  return map[category] || encodeURIComponent(category);
}

export default function CommunityPage() {
  const { user, profile, localProfile, loading: authLoading } = useAuth();

  // ─── 목록 상태 ────────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState("공지사항");
  const [posts, setPosts]                         = useState<CommunityPost[]>([]);
  const [selectedPost, setSelectedPost]           = useState<CommunityPost | null>(null);
  const [loading, setLoading]                     = useState(true);
  const [searchQuery, setSearchQuery]             = useState("");
  const [searchInput, setSearchInput]             = useState("");

  // ─── 글쓰기 / 수정 모달 ───────────────────────────────────────────────────
  const [writeModalOpen, setWriteModalOpen]       = useState(false);
  const [editingPost, setEditingPost]             = useState<CommunityPost | null>(null);
  const [postTitle, setPostTitle]                 = useState("");
  const [postContent, setPostContent]             = useState("");
  const [postTag, setPostTag]                     = useState("");
  const [attachedFile, setAttachedFile]           = useState<File | null>(null);
  const [uploading, setUploading]                 = useState(false);
  const [formError, setFormError]                 = useState("");

  // ─── 좋아요 ───────────────────────────────────────────────────────────────
  const [likeCounts,   setLikeCounts]   = useState<Record<string, number>>({});
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [likeLoading,  setLikeLoading]  = useState<Record<string, boolean>>({});

  // ─── 댓글 ─────────────────────────────────────────────────────────────────
  const [comments,       setComments]       = useState<Comment[]>([]);
  const [commentCounts,  setCommentCounts]  = useState<Record<string, number>>({});
  const [commentText,    setCommentText]    = useState("");
  const [commentSaving,  setCommentSaving]  = useState(false);

  // ─── 삭제 확인 ────────────────────────────────────────────────────────────
  const [deleteConfirmPost, setDeleteConfirmPost] = useState<CommunityPost | null>(null);
  const [deleting, setDeleting]                   = useState(false);

  // ─── 관리자 모달 ──────────────────────────────────────────────────────────
  const [manageModalOpen, setManageModalOpen]     = useState(false);
  const [searchIdentifier, setSearchIdentifier]   = useState("");
  const [searchedProfile, setSearchedProfile]     = useState<ProfileEntry | null>(null);
  const [manageMessage, setManageMessage]         = useState("");
  const [roleLoading, setRoleLoading]             = useState(false);

  // ─── Toast ────────────────────────────────────────────────────────────────
  const [toastMessage, setToastMessage]           = useState<string | null>(null);
  const [toastType, setToastType]                 = useState<"success"|"error">("success");
  const searchRef = useRef<HTMLInputElement>(null);

  const isAdmin       = profile?.role === "admin" || profile?.role === "staff";
  const isStrictAdmin = profile?.role === "admin";
  const canPostNotice = profile?.role === "admin" || profile?.role === "staff";

  const showToast = useCallback((msg: string, type: "success"|"error" = "success") => {
    setToastMessage(msg); setToastType(type);
    window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // 본인 글 또는 관리자 여부
  const canManagePost = useCallback((post: CommunityPost) => {
    if (!user) return false;
    return isAdmin || post.user_id === user.id;
  }, [user, isAdmin]);

  // ─── 인터랙션(좋아요·댓글 수) 로드 ─────────────────────────────────────
  const loadPostInteractions = useCallback(async (postIds: string[]) => {
    if (postIds.length === 0) return;
    const [likesRes, countRes] = await Promise.all([
      getPostLikes(postIds),
      getCommentCountsByPosts(postIds),
    ]);
    if (!likesRes.error && likesRes.data) {
      const counts: Record<string, number> = {};
      const liked  = new Set<string>();
      (likesRes.data as { post_id: string; user_id: string }[]).forEach(({ post_id, user_id: uid }) => {
        counts[post_id] = (counts[post_id] ?? 0) + 1;
        if (uid === user?.id) liked.add(post_id);
      });
      setLikeCounts(counts);
      setLikedPostIds(liked);
    }
    if (!countRes.error && countRes.data) {
      const counts: Record<string, number> = {};
      (countRes.data as { post_id: string }[]).forEach(({ post_id }) => {
        counts[post_id] = (counts[post_id] ?? 0) + 1;
      });
      setCommentCounts(counts);
    }
  }, [user?.id]);

  // ─── 댓글 로드 ───────────────────────────────────────────────────────────
  const loadComments = useCallback(async (postId: string) => {
    const res = await getCommentsByPost(postId);
    setComments(!res.error && res.data ? (res.data as Comment[]) : []);
  }, []);

  // ─── 데이터 로드 ──────────────────────────────────────────────────────────
  const loadPosts = useCallback(async (query?: string) => {
    setLoading(true);
    const res = await getCommunityPosts(selectedCategory, query);
    if (res.error) {
      setPosts([]); setSelectedPost(null);
    } else {
      const data = (res.data ?? []) as CommunityPost[];
      setPosts(data);
      setSelectedPost((prev) => {
        if (!prev) return data[0] ?? null;
        const still = data.find((p) => p.id === prev.id);
        return still ?? data[0] ?? null;
      });
      loadPostInteractions(data.map((p) => p.id));
    }
    setLoading(false);
  }, [selectedCategory, loadPostInteractions]);

  useEffect(() => { loadPosts(searchQuery || undefined); }, [selectedCategory]);

  // ─── 검색 ────────────────────────────────────────────────────────────────
  const handleSearch = () => {
    setSearchQuery(searchInput);
    loadPosts(searchInput || undefined);
  };

  const handleClearSearch = () => {
    setSearchInput(""); setSearchQuery("");
    loadPosts(undefined);
  };

  // ─── 글쓰기 열기 ─────────────────────────────────────────────────────────
  const handleOpenWrite = (post?: CommunityPost) => {
    if (post) {
      // 수정 모드: 기존 내용 채우기
      setEditingPost(post);
      setPostTitle(post.title);
      // 태그 추출: "[태그] 내용" 형식이면 분리
      const tagMatch = post.content.match(/^\[([^\]]+)\]\s*/);
      if (tagMatch) {
        setPostTag(tagMatch[1]);
        setPostContent(post.content.slice(tagMatch[0].length));
      } else {
        setPostTag(""); setPostContent(post.content);
      }
      setAttachedFile(null);
    } else {
      setEditingPost(null);
      setPostTitle(""); setPostContent(""); setPostTag(""); setAttachedFile(null);
    }
    setFormError(""); setWriteModalOpen(true);
  };

  const handleCloseWrite = () => {
    setWriteModalOpen(false); setEditingPost(null); setAttachedFile(null); setFormError("");
  };

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file) setAttachedFile(file);
  };

  // ─── 게시글 등록 / 수정 ──────────────────────────────────────────────────
  const handleSubmitPost = async () => {
    if (authLoading) return;
    if (!user) { setFormError("로그인 후에 글을 작성할 수 있습니다."); return; }
    if (!postTitle.trim() || !postContent.trim()) { setFormError("제목과 내용을 모두 입력해주세요."); return; }

    setUploading(true); setFormError("");

    const finalContent = `${postTag.trim() ? `[${postTag.trim()}] ` : ""}${postContent.trim()}`;

    // 새 파일 업로드 (첨부파일이 있을 때만)
    let fileUrl: string | null = editingPost?.file_url ?? null;
    let fileName: string | null = editingPost?.file_name ?? null;

    if (attachedFile) {
      const safeName     = sanitizeFileName(attachedFile.name);
      const categoryPath = sanitizeCategoryPath(selectedCategory);
      const storagePath  = `${user.id}/${categoryPath}/${safeName}`;
      const uploadRes = await uploadBoardAttachment("board_attachments", storagePath, attachedFile);
      if (uploadRes.error) {
        setFormError(uploadRes.error.message);
        showToast("첨부 파일 업로드에 실패했습니다.", "error");
        setUploading(false); return;
      }
      fileUrl  = storagePath;
      fileName = attachedFile.name;
    }

    if (editingPost) {
      // 수정
      const res = await updateCommunityPost(editingPost.id, {
        title: postTitle.trim(), content: finalContent,
        file_url: fileUrl, file_name: fileName,
      });
      if (res.error) {
        console.error("updateCommunityPost error", res.error);
        showToast(res.error.message || "수정에 실패했습니다.", "error");
      } else {
        handleCloseWrite();
        await loadPosts(searchQuery || undefined);
        showToast("게시글이 수정되었습니다.", "success");
      }
    } else {
      // 신규
      const authorName =
        localProfile.nickname.trim() ||
        profile?.name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] || "익명 사용자";
      const res = await createCommunityPost({
        user_id: user.id, author_name: authorName,
        category: selectedCategory,
        title: postTitle.trim(), content: finalContent,
        file_url: fileUrl, file_name: fileName,
      });
      if (res.error) {
        console.error("createCommunityPost error", res.error);
        setFormError(res.error.message);
        showToast("게시글 등록에 실패했습니다.", "error");
      } else {
        handleCloseWrite();
        await loadPosts(searchQuery || undefined);
        showToast("게시글이 등록되었습니다.", "success");
      }
    }
    setUploading(false);
  };

  // ─── 게시글 선택 시 댓글 로드 ────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPost) { setComments([]); setCommentText(""); return; }
    loadComments(selectedPost.id);
    setCommentText("");
  }, [selectedPost?.id, loadComments]);

  // 유저 변경 시 좋아요 상태 갱신
  useEffect(() => {
    if (posts.length > 0) loadPostInteractions(posts.map((p) => p.id));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 좋아요 토글 ─────────────────────────────────────────────────────────
  const handleToggleLike = async (postId: string) => {
    if (!user) { showToast("로그인 후 좋아요를 누를 수 있습니다.", "error"); return; }
    if (likeLoading[postId]) return;
    const wasLiked = likedPostIds.has(postId);
    setLikedPostIds((prev) => { const n = new Set(prev); wasLiked ? n.delete(postId) : n.add(postId); return n; });
    setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 0) + (wasLiked ? -1 : 1)) }));
    setLikeLoading((prev) => ({ ...prev, [postId]: true }));
    const res = wasLiked ? await removePostLike(postId, user.id) : await addPostLike(postId, user.id);
    setLikeLoading((prev) => ({ ...prev, [postId]: false }));
    if (res.error) {
      setLikedPostIds((prev) => { const n = new Set(prev); wasLiked ? n.add(postId) : n.delete(postId); return n; });
      setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + (wasLiked ? 1 : -1) }));
    }
  };

  // ─── 댓글 추가 ───────────────────────────────────────────────────────────
  const handleAddComment = async () => {
    if (!user || !selectedPost || !commentText.trim()) return;
    const authorName = localProfile.nickname.trim() || user.email?.split("@")[0] || "익명";
    setCommentSaving(true);
    const res = await createComment({ post_id: selectedPost.id, user_id: user.id, author_name: authorName, content: commentText.trim() });
    setCommentSaving(false);
    if (res.error) { showToast("댓글 등록에 실패했습니다.", "error"); return; }
    setCommentText("");
    await loadComments(selectedPost.id);
    setCommentCounts((prev) => ({ ...prev, [selectedPost.id]: (prev[selectedPost.id] ?? 0) + 1 }));
  };

  // ─── 댓글 삭제 ───────────────────────────────────────────────────────────
  const handleDeleteComment = async (commentId: string) => {
    const res = await deleteComment(commentId);
    if (res.error) { showToast("댓글 삭제에 실패했습니다.", "error"); return; }
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    if (selectedPost) setCommentCounts((prev) => ({ ...prev, [selectedPost.id]: Math.max(0, (prev[selectedPost.id] ?? 0) - 1) }));
  };

  // ─── 삭제 ────────────────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmPost) return;
    setDeleting(true);
    const res = await deleteCommunityPost(deleteConfirmPost.id);
    if (res.error) {
      console.error("deleteCommunityPost error", res.error);
      showToast(res.error.message || "삭제에 실패했습니다.", "error");
    } else {
      if (selectedPost?.id === deleteConfirmPost.id) setSelectedPost(null);
      setDeleteConfirmPost(null);
      await loadPosts(searchQuery || undefined);
      showToast("게시글이 삭제되었습니다.", "success");
    }
    setDeleting(false);
  };

  // ─── 파일 다운로드 / 링크 복사 ───────────────────────────────────────────
  const handleDownloadFile = async (filePath: string) => {
    const res = await getSignedAttachmentUrl("board_attachments", filePath);
    if (res.error || !res.data?.signedUrl) { showToast("파일을 가져오지 못했습니다.", "error"); return; }
    window.open(res.data.signedUrl, "_blank");
  };

  const handleCopyLink = async (filePath: string) => {
    const res = await getSignedAttachmentUrl("board_attachments", filePath);
    if (res.error || !res.data?.signedUrl) { showToast("링크 생성에 실패했습니다.", "error"); return; }
    await navigator.clipboard.writeText(res.data.signedUrl);
    showToast("링크가 클립보드에 복사되었습니다.", "success");
  };

  // ─── 관리자 권한 관리 ─────────────────────────────────────────────────────
  const handleSearchProfile = async () => {
    if (!searchIdentifier.trim()) { setManageMessage("이메일 또는 UID를 입력해주세요."); return; }
    setRoleLoading(true); setManageMessage("");
    const res = await getProfileByIdentifier(searchIdentifier.trim());
    if (res.error) { setManageMessage(res.error.message); setSearchedProfile(null); }
    else if (!res.data) { setManageMessage("해당 유저를 찾을 수 없습니다."); setSearchedProfile(null); }
    else setSearchedProfile(res.data as ProfileEntry);
    setRoleLoading(false);
  };

  const handleApplyRoleChange = async () => {
    if (!searchedProfile) { setManageMessage("먼저 유저를 검색해주세요."); return; }
    setRoleLoading(true); setManageMessage("");
    const targetRole = searchedProfile.role === "staff" ? "user" : "staff";
    const res = await updateProfileRole(searchedProfile.id, targetRole);
    if (res.error) setManageMessage(res.error.message);
    else {
      setManageMessage(`${searchedProfile.email} 님의 권한이 ${targetRole}로 변경되었습니다.`);
      setSearchedProfile({ ...searchedProfile, role: targetRole });
    }
    setRoleLoading(false);
  };

  const filteredCategoryLabel = useMemo(
    () => categoryTabs.find((t) => t.value === selectedCategory)?.label ?? selectedCategory,
    [selectedCategory],
  );

  if (authLoading) return <LoadingCard />;

  return (
    <div className="space-y-6">
      {/* ── 헤더 ──────────────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">💬 커뮤니티</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">Smart Grade 게시판</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">자유로운 게시글, 자료 공유, 꿀팁을 나눠요.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isStrictAdmin && (
              <button type="button" onClick={() => { setSearchIdentifier(""); setSearchedProfile(null); setManageMessage(""); setManageModalOpen(true); }}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                🔒 권한 관리
              </button>
            )}
            {user && (selectedCategory !== "공지사항" || canPostNotice) && (
              <button type="button" onClick={() => handleOpenWrite()}
                className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
                {selectedCategory === "공지사항" ? "⚙️ 공지 작성" : "✏️ 글쓰기"}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── 게시판 본문 ───────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8 dark:bg-slate-900">
        {/* 카테고리 탭 + 검색 */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {categoryTabs.map((tab) => (
              <button key={tab.value} type="button"
                onClick={() => { setSelectedCategory(tab.value); setSearchInput(""); setSearchQuery(""); }}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  selectedCategory === tab.value
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* 검색창 */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                ref={searchRef}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                placeholder="제목 또는 내용 검색"
                className="h-9 w-56 rounded-full border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              {searchInput && (
                <button type="button" onClick={handleClearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            <button type="button" onClick={handleSearch}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">
              검색
            </button>
          </div>
        </div>

        {/* 검색 중 배너 */}
        {searchQuery && (
          <div className="mt-3 flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300 w-fit">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            "{searchQuery}" 검색 중 · {filteredCategoryLabel}
            <button type="button" onClick={handleClearSearch} className="ml-1 text-sky-500 hover:text-sky-700">✕</button>
          </div>
        )}

        {/* 게시글 테이블 */}
        <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-200 dark:border-slate-700">
          {/* 헤더 */}
          <div className="hidden grid-cols-[48px_1fr_140px_120px_100px_80px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700 dark:bg-slate-950 sm:grid">
            <div>#</div>
            <div>제목</div>
            <div>작성자</div>
            <div>등록일</div>
            <div>첨부</div>
            <div className="text-right">관리</div>
          </div>

          {loading ? (
            <div className="p-6"><LoadingCard /></div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  {searchQuery ? "검색 결과가 없습니다" : "게시물이 없습니다"}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {searchQuery ? `"${searchQuery}" 와 일치하는 글이 없어요.` : "첫 번째 글을 작성해보세요!"}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {posts.map((post, idx) => (
                <div
                  key={post.id}
                  className={`group flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/40 ${selectedPost?.id === post.id ? "bg-sky-50/50 dark:bg-sky-950/10" : "bg-white dark:bg-slate-900"}`}
                >
                  {/* 번호 */}
                  <span className="hidden w-12 shrink-0 text-xs font-semibold text-slate-400 sm:block">{idx + 1}</span>

                  {/* 제목+내용 (클릭 = 선택) */}
                  <button type="button" onClick={() => setSelectedPost(post)} className="min-w-0 flex-1 text-left">
                    <p className={`truncate text-sm font-semibold ${selectedPost?.id === post.id ? "text-sky-700 dark:text-sky-300" : "text-slate-900 dark:text-slate-100"}`}>
                      {post.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{post.content}</p>
                      {(likeCounts[post.id] ?? 0) > 0 && (
                        <span className="shrink-0 text-[10px] text-rose-400">❤️ {likeCounts[post.id]}</span>
                      )}
                      {(commentCounts[post.id] ?? 0) > 0 && (
                        <span className="shrink-0 text-[10px] text-slate-400">💬 {commentCounts[post.id]}</span>
                      )}
                    </div>
                  </button>

                  {/* 작성자 */}
                  <span className="hidden w-36 shrink-0 truncate text-xs text-slate-600 dark:text-slate-400 sm:block">
                    {post.author_name}
                    {post.user_id === user?.id && (
                      <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-700 dark:bg-sky-950/50 dark:text-sky-400">나</span>
                    )}
                  </span>

                  {/* 날짜 */}
                  <span className="hidden w-24 shrink-0 text-xs text-slate-500 dark:text-slate-500 sm:block">
                    {new Date(post.created_at).toLocaleDateString("ko-KR")}
                  </span>

                  {/* 첨부 */}
                  <span className="hidden w-24 shrink-0 text-right sm:block">
                    {post.file_name
                      ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">📎</span>
                      : <span className="text-xs text-slate-300">—</span>}
                  </span>

                  {/* 수정/삭제 — 본인 글 또는 관리자 */}
                  <div className="flex w-20 shrink-0 items-center justify-end gap-1">
                    {canManagePost(post) && (
                      <>
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleOpenWrite(post); }}
                          title="수정"
                          className="rounded-full p-1.5 text-slate-400 opacity-0 transition hover:bg-sky-50 hover:text-sky-600 group-hover:opacity-100 dark:hover:bg-sky-950/30">
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setDeleteConfirmPost(post); }}
                          title="삭제"
                          className="rounded-full p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-950/30">
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 게시글 상세 + 사이드바 */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_280px]">
          {/* 상세 */}
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-950">
            {selectedPost ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                      {selectedPost.category}
                    </span>
                    <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedPost.title}</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {selectedPost.author_name} · {new Date(selectedPost.created_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                  {/* 상세 영역의 수정/삭제 버튼 */}
                  {canManagePost(selectedPost) && (
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => handleOpenWrite(selectedPost)}
                        className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 dark:border-sky-800 dark:bg-transparent dark:text-sky-300">
                        수정
                      </button>
                      <button type="button" onClick={() => setDeleteConfirmPost(selectedPost)}
                        className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-800 dark:bg-transparent dark:text-rose-300">
                        삭제
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                    <p className="whitespace-pre-line text-sm leading-7 text-slate-700 dark:text-slate-300">{selectedPost.content}</p>
                  </div>

                  {selectedPost.file_url && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">첨부 파일</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          📎 {selectedPost.file_name ?? "첨부파일"}
                        </span>
                        <button type="button" onClick={() => handleDownloadFile(selectedPost.file_url!)}
                          className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
                          다운로드
                        </button>
                        <button type="button" onClick={() => handleCopyLink(selectedPost.file_url!)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-400">
                          링크 복사
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── 좋아요 ─────────────────────────────────────── */}
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleToggleLike(selectedPost.id)}
                      disabled={likeLoading[selectedPost.id]}
                      className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                        likedPostIds.has(selectedPost.id)
                          ? "border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400"
                          : "border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-500 dark:border-slate-700 dark:bg-transparent dark:text-slate-400"
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                        fill={likedPostIds.has(selectedPost.id) ? "currentColor" : "none"}
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                      좋아요 {likeCounts[selectedPost.id] ?? 0}
                    </button>
                    <span className="text-sm text-slate-400 dark:text-slate-500">💬 댓글 {commentCounts[selectedPost.id] ?? 0}</span>
                  </div>

                  {/* ── 댓글 ───────────────────────────────────────── */}
                  <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        댓글 {commentCounts[selectedPost.id] ?? 0}
                      </p>
                    </div>

                    {/* 댓글 목록 */}
                    {comments.length === 0 ? (
                      <div className="px-5 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                        첫 번째 댓글을 작성해보세요
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {comments.map((c) => (
                          <div key={c.id} className="group flex items-start gap-3 px-5 py-4">
                            {c.user_id === user?.id && localProfile.avatarUrl ? (
                              <img src={localProfile.avatarUrl} alt={c.author_name}
                                className="h-7 w-7 shrink-0 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                {(c.author_name[0] ?? "?").toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{c.author_name}</span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatTimeAgo(c.created_at)}</span>
                              </div>
                              <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words">{c.content}</p>
                            </div>
                            {c.user_id === user?.id && (
                              <button type="button" onClick={() => handleDeleteComment(c.id)}
                                className="shrink-0 rounded-full p-1 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100 dark:hover:bg-rose-950/30 dark:hover:text-rose-400">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 댓글 입력 */}
                    {user ? (
                      <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                        <div className="flex gap-2">
                          <input
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                            placeholder="댓글을 입력하세요..."
                            className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          />
                          <button type="button" onClick={handleAddComment}
                            disabled={commentSaving || !commentText.trim()}
                            className="rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60">
                            {commentSaving ? "…" : "등록"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                        <p className="text-xs text-slate-400 dark:text-slate-500">댓글을 작성하려면 로그인이 필요합니다.</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 0 2 2z"/>
                </svg>
                <p className="text-sm text-slate-500 dark:text-slate-400">게시글을 선택하면 내용을 확인할 수 있습니다.</p>
              </div>
            )}
          </div>

          {/* 사이드바 안내 */}
          <div className="space-y-4">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">게시판 안내</p>
              <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <p>• 공지사항은 staff/admin만 작성합니다.</p>
                <p>• 자유/자료/꿀팁은 누구나 작성 가능합니다.</p>
                <p>• 본인 글은 수정·삭제할 수 있습니다.</p>
                <p>• 첨부 파일은 안전한 스토리지에 저장됩니다.</p>
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">선택된 카테고리</p>
              <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">{filteredCategoryLabel}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {selectedCategory === "공지사항"
                  ? "관리자가 게시합니다. 일반 사용자는 읽기 전용입니다."
                  : "자유롭게 게시물을 등록하고 파일을 첨부할 수 있습니다."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 글쓰기 / 수정 모달 ───────────────────────────── */}
      {writeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {editingPost ? "게시글 수정" : "게시물 작성"}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {editingPost ? `"${editingPost.title}" 수정 중` : `${selectedCategory}에 새로운 글을 등록합니다.`}
                </p>
              </div>
              <button type="button" onClick={handleCloseWrite}
                className="rounded-full px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                닫기
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">제목 *</label>
                <input value={postTitle} onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="제목을 입력하세요"
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">태그</label>
                <input value={postTag} onChange={(e) => setPostTag(e.target.value)}
                  placeholder="예: 질문, 팁, 자료"
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">내용 *</label>
                <textarea value={postContent} onChange={(e) => setPostContent(e.target.value)}
                  rows={7} placeholder="내용을 입력하세요"
                  className="mt-2 w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {/* 첨부 파일 */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">첨부 파일</label>
                <div onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop}
                  className="mt-2 rounded-[1.5rem] border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950">
                  <p>드래그하거나 버튼을 클릭하세요</p>
                  <input type="file" accept="*" id="community-file-input" className="hidden"
                    onChange={(e) => setAttachedFile(e.target.files?.[0] ?? null)} />
                  <label htmlFor="community-file-input"
                    className="mt-3 inline-flex cursor-pointer rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">
                    파일 선택
                  </label>
                </div>
                {attachedFile && (
                  <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <span className="truncate">📎 {attachedFile.name}</span>
                    <button type="button" onClick={() => setAttachedFile(null)}
                      className="ml-2 shrink-0 text-slate-400 hover:text-rose-500">✕</button>
                  </div>
                )}
                {editingPost?.file_name && !attachedFile && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">기존 첨부: 📎 {editingPost.file_name} (새 파일 선택 시 교체됩니다)</p>
                )}
              </div>

              {formError && <p className="text-xs text-rose-600 dark:text-rose-400">{formError}</p>}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={handleCloseWrite}
                  className="rounded-3xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                  취소
                </button>
                <button type="button" onClick={handleSubmitPost} disabled={uploading}
                  className="rounded-3xl bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {uploading ? "저장 중..." : editingPost ? "수정 완료" : "게시글 등록"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 삭제 확인 모달 ───────────────────────────────── */}
      {deleteConfirmPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/40">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600 dark:text-rose-400">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">게시글을 삭제할까요?</h2>
                <p className="mt-1 max-w-xs truncate text-sm text-slate-500 dark:text-slate-400">{deleteConfirmPost.title}</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">삭제 후에는 복구할 수 없습니다.</p>
              </div>
              <div className="flex w-full gap-3">
                <button type="button" onClick={() => setDeleteConfirmPost(null)}
                  className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  취소
                </button>
                <button type="button" onClick={handleDeleteConfirm} disabled={deleting}
                  className="flex-1 rounded-3xl bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50">
                  {deleting ? "삭제 중..." : "삭제"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 권한 관리 모달 ───────────────────────────────── */}
      {manageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">유저 권한 관리</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">이메일 또는 UID로 유저를 검색해 staff 권한을 부여하거나 박탈합니다.</p>
              </div>
              <button type="button" onClick={() => setManageModalOpen(false)}
                className="rounded-full px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800">
                닫기
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="flex gap-2">
                <input value={searchIdentifier} onChange={(e) => setSearchIdentifier(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSearchProfile(); }}
                  placeholder="이메일 또는 UID"
                  className="flex-1 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <button type="button" onClick={handleSearchProfile} disabled={roleLoading}
                  className="rounded-3xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
                  검색
                </button>
              </div>

              {searchedProfile && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950">
                  <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                    <p><span className="font-semibold">이메일:</span> {searchedProfile.email}</p>
                    <p><span className="font-semibold">UID:</span> {searchedProfile.id}</p>
                    <p><span className="font-semibold">현재 역할:</span> {searchedProfile.role}</p>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <button type="button" onClick={handleApplyRoleChange}
                      disabled={roleLoading || searchedProfile.role === "admin"}
                      className="rounded-3xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
                      {searchedProfile.role === "staff" ? "staff 권한 박탈" : "staff 권한 부여"}
                    </button>
                    {searchedProfile.role === "admin" && (
                      <span className="text-xs text-slate-500">admin은 권한 변경 불가</span>
                    )}
                  </div>
                </div>
              )}

              {manageMessage && <p className="text-sm text-slate-700 dark:text-slate-300">{manageMessage}</p>}
            </div>
          </div>
        </div>
      )}

      {toastMessage && <ToastMessage message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} />}
    </div>
  );
}
