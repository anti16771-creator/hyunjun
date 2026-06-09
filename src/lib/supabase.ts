import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const noClient = (message: string) => ({ data: null, error: new Error(message) });

async function getAuthenticatedUserId(userId?: string) {
  if (userId) {
    return { data: userId, error: null } as const;
  }

  if (!supabase) {
    return { data: null, error: new Error("Supabase client is not initialized.") } as const;
  }

  const { data, error } = await supabase.auth.getUser();
  if (error) {
    return { data: null, error } as const;
  }

  const currentUserId = data.user?.id ?? null;
  if (!currentUserId) {
    return { data: null, error: new Error("로그인이 필요합니다") } as const;
  }

  return { data: currentUserId, error: null } as const;
}

function logSupabaseError(context: string, error: any) {
  console.error("Supabase error -", context, (error as any)?.message, (error as any)?.details, (error as any)?.hint, error);
}

export async function getPlannerItems(userId: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase
    .from("planner_tasks")
    .select("*")
    .eq("user_id", userId)
    .order("due_date", { ascending: true });
}

export async function createPlannerItem(item: { user_id?: string; title: string; due_date: string }) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  const authResult = await getAuthenticatedUserId(item.user_id);
  if (authResult.error) {
    logSupabaseError("createPlannerItem missing user", authResult.error);
    return { data: null, error: authResult.error };
  }
  return supabase.from("planner_tasks").insert([{ ...item, user_id: authResult.data, is_completed: false }]).select();
}

export async function deletePlannerItem(id: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("planner_tasks").delete().eq("id", id);
}

export async function togglePlannerCompleted(id: string, is_completed: boolean) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("planner_tasks").update({ is_completed }).eq("id", id);
}

export async function getUserTimetable(userId: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase
    .from("timetable")
    .select("*")
    .eq("user_id", userId)
    .order("weekday", { ascending: true })
    .order("period", { ascending: true });
}

export async function getExamEvents(userId: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase
    .from("exam_events")
    .select("*")
    .eq("user_id", userId)
    .order("exam_date", { ascending: true });
}

export async function createExamEvent(item: {
  user_id?: string;
  subject_name: string;
  exam_type: "midterm" | "final" | "quiz";
  exam_date: string;
  exam_range: string;
  notes: string;
  created_at?: string;
}) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  const authResult = await getAuthenticatedUserId(item.user_id);
  if (authResult.error) {
    logSupabaseError("createExamEvent missing user", authResult.error);
    return { data: null, error: authResult.error };
  }
  return supabase.from("exam_events").insert([
    {
      ...item,
      user_id: authResult.data,
      exam_date: item.exam_date,
      created_at: item.created_at ?? new Date().toISOString(),
    },
  ]);
}

export async function createStudyCalendarEvent(item: {
  user_id?: string;
  subject_name: string;
  task: string;
  study_date: string;
  duration: number;
}) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  const authResult = await getAuthenticatedUserId(item.user_id);
  if (authResult.error) {
    logSupabaseError("createStudyCalendarEvent missing user", authResult.error);
    return { data: null, error: authResult.error };
  }
  return supabase.from("exam_events").insert([{
    user_id: authResult.data,
    subject_name: item.subject_name,
    exam_type: "study",
    exam_date: item.study_date,
    exam_range: item.task,
    notes: `${item.duration}분`,
    created_at: new Date().toISOString(),
  }]);
}

export async function getStudyPlansForDate(userId: string, date: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase
    .from("exam_events")
    .select("*")
    .eq("user_id", userId)
    .eq("exam_type", "study")
    .eq("exam_date", date)
    .order("created_at", { ascending: true });
}

export async function getUserTimetableSubjects(userId: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase
    .from("timetable")
    .select("subject")
    .eq("user_id", userId)
    .order("subject", { ascending: true });
}

export async function createTimetableEntry(entry: { subject: string; weekday: number | string; period: string; user_id?: string }) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  const authResult = await getAuthenticatedUserId(entry.user_id);
  if (authResult.error) {
    logSupabaseError("createTimetableEntry missing user", authResult.error);
    return { data: null, error: authResult.error };
  }
  return supabase.from("timetable").insert([
    {
      user_id: authResult.data,
      subject: String(entry.subject),
      weekday: String(entry.weekday),
      period: String(entry.period),
    },
  ]);
}

export async function deleteTimetableEntry(id: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("timetable").delete().eq("id", id);
}

export async function getStudyLogs(userId?: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  const query = supabase.from("study_logs").select("*").order("created_at", { ascending: false });
  if (userId) {
    return query.eq("user_id", userId);
  }
  return query;
}

export async function createStudyLog(item: {
  user_id?: string;
  subject: string;
  duration_seconds: number;
  minutes: number;
  date: string;
  created_at?: string;
}) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  const authResult = await getAuthenticatedUserId(item.user_id);
  if (authResult.error) {
    logSupabaseError("createStudyLog missing user", authResult.error);
    return { data: null, error: authResult.error };
  }
  return supabase.from("study_logs").insert([
    {
      ...item,
      user_id: authResult.data,
      created_at: item.created_at ?? new Date().toISOString(),
    },
  ]);
}

export async function deleteStudyLog(id: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("study_logs").delete().eq("id", id);
}

export async function getGrades() {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("grades").select("*").order("created_at", { ascending: false });
}

export async function createGrade(item: { course_name: string; credit: number; grade_value: number; grade_label: string }) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("grades").insert([item]);
}

export async function deleteGrade(id: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("grades").delete().eq("id", id);
}

export async function getExamStrategies(userId: string, examType: "midterm" | "final") {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase
    .from("exam_strategies")
    .select("*")
    .eq("user_id", userId)
    .eq("exam_type", examType)
    .order("created_at", { ascending: false });
}

export async function createExamStrategy(item: {
  user_id?: string;
  exam_type: "midterm" | "final";
  subject_name: string;
  is_major: boolean;
  credits: number;
  study_range: string;
  my_score?: number | null;
  average_score?: number | null;
}) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  const authResult = await getAuthenticatedUserId(item.user_id);
  if (authResult.error) {
    logSupabaseError("createExamStrategy missing user", authResult.error);
    return { data: null, error: authResult.error };
  }
  return supabase.from("exam_strategies").insert([
    {
      ...item,
      user_id: authResult.data,
      is_major: item.is_major,
      credits: item.credits,
      study_range: item.study_range,
      my_score: item.my_score ?? null,
      average_score: item.average_score ?? null,
      is_completed: false,
    },
  ]).select();
}

export async function toggleExamStrategyCompleted(id: string, is_completed: boolean) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("exam_strategies").update({ is_completed }).eq("id", id);
}

export async function updateExamStrategyScores(id: string, my_score: number | null, average_score: number | null) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("exam_strategies").update({ my_score, average_score }).eq("id", id);
}

export async function deleteExamStrategy(id: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("exam_strategies").delete().eq("id", id);
}

export async function getArchiveItems(userId: string, gradeLevel?: string, semester?: string, search?: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  let query = supabase.from("academic_archive").select("*").eq("user_id", userId);
  if (gradeLevel && gradeLevel !== "전체") {
    query = query.eq("grade_level", gradeLevel);
  }
  if (semester && semester !== "전체") {
    query = query.eq("semester", semester);
  }
  if (search) {
    const normalized = `%${search}%`;
    query = query.or(`subject_name.ilike.${normalized},file_name.ilike.${normalized}`);
  }
  return query.order("created_at", { ascending: false });
}

export async function createArchiveFolder(item: {
  user_id?: string;
  subject_name: string;
  grade_level: string;
  semester: string;
}) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  const authResult = await getAuthenticatedUserId(item.user_id);
  if (authResult.error) {
    logSupabaseError("createArchiveFolder missing user", authResult.error);
    return { data: null, error: authResult.error };
  }
  return supabase.from("academic_archive").insert([
    {
      ...item,
      user_id: authResult.data,
      file_url: null,
      file_name: null,
      file_type: null,
      created_at: new Date().toISOString(),
    },
  ]);
}

export async function createArchiveFile(item: {
  user_id?: string;
  subject_name: string;
  grade_level: string;
  semester: string;
  file_url: string;
  file_name: string;
  file_type: string;
}) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  const authResult = await getAuthenticatedUserId(item.user_id);
  if (authResult.error) {
    logSupabaseError("createArchiveFile missing user", authResult.error);
    return { data: null, error: authResult.error };
  }
  return supabase.from("academic_archive").insert([
    {
      ...item,
      user_id: authResult.data,
      created_at: new Date().toISOString(),
    },
  ]);
}

export async function deleteArchiveMeta(id: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("academic_archive").delete().eq("id", id);
}

export async function listArchiveFiles(bucket: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.storage.from(bucket).list("", { limit: 100 });
}

export async function uploadArchiveFile(bucket: string, filePath: string, file: File) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.storage.from(bucket).upload(filePath, file, {
    cacheControl: "3600",
    upsert: true,
  });
}

export async function deleteArchiveFile(bucket: string, filePath: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.storage.from(bucket).remove([filePath]);
}

export async function getCommunityPosts(category: string, search?: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  let query = supabase
    .from("community_posts")
    .select("*")
    .eq("category", category)
    .order("created_at", { ascending: false });
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(`title.ilike.${q},content.ilike.${q}`);
  }
  return query;
}

export async function updateCommunityPost(
  id: string,
  item: { title: string; content: string; file_url?: string | null; file_name?: string | null },
) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("community_posts").update(item).eq("id", id);
}

export async function deleteCommunityPost(id: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("community_posts").delete().eq("id", id);
}

export async function createCommunityPost(item: {
  user_id?: string;
  author_name: string;
  category: string;
  title: string;
  content: string;
  file_url?: string | null;
  file_name?: string | null;
}) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  const authResult = await getAuthenticatedUserId(item.user_id);
  if (authResult.error) {
    logSupabaseError("createCommunityPost missing user", authResult.error);
    return { data: null, error: authResult.error };
  }
  return supabase.from("community_posts").insert([
    {
      ...item,
      user_id: authResult.data,
      created_at: new Date().toISOString(),
    },
  ]);
}

const PROFILE_TABLES = ["profiles", "user_profiles"] as const;

type ProfileTableName = typeof PROFILE_TABLES[number];

type ProfileQueryRunner<T> = (table: ProfileTableName) => Promise<{ data: T; error: any }> | any;

async function runProfileQuery<T>(runner: ProfileQueryRunner<T>) {
  if (!supabase) return noClient("Supabase client is not initialized.");

  const primary = await runner(PROFILE_TABLES[0]);
  if (!primary.error) return primary;

  const msg = primary.error?.message || "";
  if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("unknown catalog")) {
    return runner(PROFILE_TABLES[1]);
  }

  return primary;
}

export async function getProfileByIdentifier(identifier: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");

  return runProfileQuery((table) => {
    const query = supabase.from(table).select("id,email,name,role").limit(1);
    if (identifier.includes("@")) {
      return query.eq("email", identifier).maybeSingle();
    }
    return query.or(`id.eq.${identifier},email.eq.${identifier}`).maybeSingle();
  });
}

export async function updateProfileRole(userId: string, role: "user" | "staff") {
  return runProfileQuery((table) => supabase!.from(table).update({ role }).eq("id", userId));
}

export async function uploadBoardAttachment(bucket: string, filePath: string, file: File) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.storage.from(bucket).upload(filePath, file, {
    cacheControl: "3600",
    upsert: false,
  });
}

export async function getSignedAttachmentUrl(bucket: string, filePath: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.storage.from(bucket).createSignedUrl(filePath, 60);
}

export async function createArchiveSignedUrl(bucket: string, filePath: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.storage.from(bucket).createSignedUrl(filePath, 60);
}

export async function getCurrentUserSession() {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.auth.getSession();
}

export async function getUserProfile<T = any>(userId: string) {
  return runProfileQuery<T>((table) => supabase!.from(table).select("*").eq("id", userId).single());
}

export async function getAllUserProfiles<T = any>() {
  return runProfileQuery<T>((table) => supabase!.from(table).select("*").order("created_at", { ascending: false }));
}

export async function findProfilesByName<T = any>(name: string) {
  return runProfileQuery<T>((table) => supabase!.from(table).select("*").ilike("name", `%${name}%`).limit(20));
}

export async function updateUserRole(userId: string, role: string) {
  return runProfileQuery((table) => supabase!.from(table).update({ role }).eq("id", userId));
}

export async function signUpWithEmail(email: string, password: string, name: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  });
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.auth.signOut();
}

export async function sendPasswordResetEmail(email: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
}

// ── Post Likes ───────────────────────────────────────────────────────────────

export async function getPostLikes(postIds: string[]) {
  if (!supabase || postIds.length === 0) return { data: [] as { post_id: string; user_id: string; type: string }[], error: null };
  return supabase.from("post_likes").select("post_id, user_id, type").in("post_id", postIds);
}

export async function addPostLike(postId: string, userId: string, type: "like" | "dislike" = "like") {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("post_likes").insert({ post_id: postId, user_id: userId, type });
}

export async function removePostLike(postId: string, userId: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
}

// ── Comments ─────────────────────────────────────────────────────────────────

export async function getCommentsByPost(postId: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("comments").select("*").eq("post_id", postId).order("created_at", { ascending: true });
}

export async function createComment(item: { post_id: string; user_id: string; author_name: string; content: string }) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("comments").insert([item]).select();
}

export async function deleteComment(id: string) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.from("comments").delete().eq("id", id);
}

export async function getCommentCountsByPosts(postIds: string[]) {
  if (!supabase || postIds.length === 0) return { data: [] as { post_id: string }[], error: null };
  return supabase.from("comments").select("post_id").in("post_id", postIds);
}

// ── Avatar ────────────────────────────────────────────────────────────────────

export async function uploadAvatar(path: string, file: File) {
  if (!supabase) return noClient("Supabase client is not initialized.");
  return supabase.storage.from("avatars").upload(path, file, { cacheControl: "3600", upsert: true });
}

export function getAvatarPublicUrl(path: string): string {
  if (!supabase) return "";
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

export async function updateProfileAvatarUrl(userId: string, avatarUrl: string) {
  return runProfileQuery((table) => supabase!.from(table).update({ avatar_url: avatarUrl }).eq("id", userId));
}
