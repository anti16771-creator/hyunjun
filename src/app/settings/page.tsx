"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";
import { supabase, getAvatarPublicUrl, updateProfileAvatarUrl, uploadAvatar } from "@/src/lib/supabase";

// ── localStorage helpers ──────────────────────────────────────────────────────
const LS = {
  DARK:          "smartgrade_dark_mode",
  NOTIFICATIONS: "smartgrade_notifications",
  TIMER_SOUND:   "smartgrade_timer_sound",
  DAILY_GOAL:    "smartgrade_daily_goal_hours",
  POMO_FOCUS:    "smartgrade_pomodoro_focus",
  POMO_BREAK:    "smartgrade_pomodoro_break",
  NICKNAME:      "smartgrade_nickname",
  SCHOOL:        "smartgrade_school",
  DEPARTMENT:    "smartgrade_department",
};

function lsGet<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
  catch { return fallback; }
}
function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ── ToggleSwitch ──────────────────────────────────────────────────────────────
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
        checked ? "bg-sky-600" : "bg-slate-200 dark:bg-slate-700"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── SettingRow ────────────────────────────────────────────────────────────────
function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {children}
    </div>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
function SettingInput({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</label>
      <input
        {...props}
        className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-900/30"
      />
    </div>
  );
}

// ── RangeRow ──────────────────────────────────────────────────────────────────
function RangeRow({
  label, value, unit, min, max, step, accentClass, minLabel, maxLabel, onChange,
}: {
  label: string; value: number; unit: string; min: number; max: number; step: number;
  accentClass: string; minLabel: string; maxLabel: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</span>
        <span className={`text-sm font-bold ${accentClass}`}>{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-2 w-full ${accentClass.replace("text-","accent-")}`}
        style={{ accentColor: undefined }}
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>{minLabel}</span><span>{maxLabel}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, profile, localProfile, logout, updateLocalProfile } = useAuth();
  const router = useRouter();

  // Appearance
  const [darkMode,       setDarkModeState] = useState(false);

  // Notifications
  const [notifications,  setNotifications] = useState(true);
  const [timerSound,     setTimerSound]    = useState(true);

  // Focus
  const [dailyGoal,      setDailyGoal]     = useState(4);
  const [pomoFocus,      setPomoFocus]     = useState(25);
  const [pomoBreak,      setPomoBreak]     = useState(5);

  // Profile
  const [nickname,       setNickname]      = useState("");
  const [school,         setSchool]        = useState("");
  const [department,     setDepartment]    = useState("");
  const [profileSaving,  setProfileSaving] = useState(false);
  const [profileSaved,   setProfileSaved]  = useState(false);
  const [focusSaved,     setFocusSaved]    = useState(false);

  // Avatar
  const [avatarFile,     setAvatarFile]    = useState<File | null>(null);
  const [avatarPreview,  setAvatarPreview] = useState("");
  const avatarInputRef                     = useRef<HTMLInputElement>(null);

  // Account management
  const [newEmail,       setNewEmail]      = useState("");
  const [emailSaving,    setEmailSaving]   = useState(false);
  const [newPwd,         setNewPwd]        = useState("");
  const [confirmPwd,     setConfirmPwd]    = useState("");
  const [pwdError,       setPwdError]      = useState("");
  const [pwdSaving,      setPwdSaving]     = useState(false);

  // Toast
  const [toast,          setToast]         = useState<string | null>(null);
  const [toastType,      setToastType]     = useState<"success" | "error">("success");
  const toastTimer                          = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    setToastType(type);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  // 로그인 방식 (소셜 여부)
  const provider = user?.app_metadata?.provider ?? "email";
  const isSocial = provider !== "email";

  // Load all settings from localStorage on mount
  useEffect(() => {
    setDarkModeState(lsGet(LS.DARK, false));
    setNotifications(lsGet(LS.NOTIFICATIONS, true));
    setTimerSound(lsGet(LS.TIMER_SOUND, true));
    setDailyGoal(lsGet(LS.DAILY_GOAL, 4));
    setPomoFocus(lsGet(LS.POMO_FOCUS, 25));
    setPomoBreak(lsGet(LS.POMO_BREAK, 5));
    setNickname(lsGet(LS.NICKNAME, ""));
    setSchool(lsGet(LS.SCHOOL, ""));
    setDepartment(lsGet(LS.DEPARTMENT, ""));
  }, []);

  // Prefill nickname from profile if not yet stored
  useEffect(() => {
    if (profile?.name && !lsGet(LS.NICKNAME, "")) setNickname(profile.name);
  }, [profile]);

  // Dark mode toggle — persists and applies immediately
  const setDarkMode = (next: boolean) => {
    setDarkModeState(next);
    lsSet(LS.DARK, next);
    document.documentElement.classList.toggle("dark", next);
  };

  // Notification toggles — persist immediately
  const handleNotifications = (v: boolean) => { setNotifications(v); lsSet(LS.NOTIFICATIONS, v); };
  const handleTimerSound     = (v: boolean) => { setTimerSound(v);    lsSet(LS.TIMER_SOUND, v); };

  // Profile save
  const handleProfileSave = async () => {
    setProfileSaving(true);
    lsSet(LS.NICKNAME, nickname.trim());
    lsSet(LS.SCHOOL, school.trim());
    lsSet(LS.DEPARTMENT, department.trim());
    updateLocalProfile({ nickname: nickname.trim(), school: school.trim(), department: department.trim() });

    // 아바타 업로드
    if (avatarFile && user) {
      const ext  = avatarFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/avatar.${ext}`;
      const uploadRes = await uploadAvatar(path, avatarFile);
      if (uploadRes.error) {
        showToast("사진 업로드에 실패했습니다.", "error");
      } else {
        const publicUrl = `${getAvatarPublicUrl(path)}?t=${Date.now()}`;
        await updateProfileAvatarUrl(user.id, publicUrl);
        updateLocalProfile({ avatarUrl: publicUrl });
        setAvatarFile(null);
        setAvatarPreview("");
      }
    }

    await new Promise((r) => setTimeout(r, 200));
    setProfileSaving(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
    showToast("프로필이 저장되었습니다.");
  };

  // Focus save
  const handleFocusSave = () => {
    lsSet(LS.DAILY_GOAL, dailyGoal);
    lsSet(LS.POMO_FOCUS, pomoFocus);
    lsSet(LS.POMO_BREAK, pomoBreak);
    setFocusSaved(true);
    setTimeout(() => setFocusSaved(false), 2500);
    showToast("집중 설정이 저장되었습니다.");
  };

  // Email change
  const handleEmailChange = async () => {
    if (!supabase || !newEmail.trim()) return;
    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailSaving(false);
    if (error) showToast(`이메일 변경 실패: ${error.message}`, "error");
    else { setNewEmail(""); showToast("확인 이메일을 발송했습니다. 새 이메일에서 링크를 클릭해주세요."); }
  };

  // Password change
  const handlePasswordChange = async () => {
    setPwdError("");
    if (newPwd.length < 6) { setPwdError("비밀번호는 최소 6자 이상이어야 합니다."); return; }
    if (newPwd !== confirmPwd) { setPwdError("새 비밀번호가 일치하지 않습니다."); return; }
    if (!supabase) return;
    setPwdSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setPwdSaving(false);
    if (error) { setPwdError(error.message); showToast("비밀번호 변경에 실패했습니다.", "error"); }
    else { setNewPwd(""); setConfirmPwd(""); showToast("비밀번호가 변경되었습니다. ✓"); }
  };

  // Logout
  const handleLogout = async () => {
    await logout();
    router.push("/auth");
  };

  // Account deletion
  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "정말 탈퇴하시겠어요?\n\n모든 학습 기록, 성적, 플래너 데이터가 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.",
    );
    if (!confirmed) return;
    await logout();
    router.push("/auth");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">⚙️ 설정</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">개인 맞춤 설정</h1>
      </div>

      {/* ── 프로필 ─────────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">프로필</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">표시될 이름과 학교 정보를 설정하세요.</p>
        <div className="mt-5 space-y-4">
          {/* ── 프로필 사진 ───────────────────────────────── */}
          <div className="flex justify-center pb-2">
            <div className="relative">
              <button
                type="button"
                aria-label="프로필 사진 변경"
                onClick={() => avatarInputRef.current?.click()}
                className="group relative block h-24 w-24 overflow-hidden rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                {(avatarPreview || localProfile.avatarUrl) ? (
                  <img
                    src={avatarPreview || localProfile.avatarUrl}
                    alt="프로필 사진"
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-sky-600 text-3xl font-bold text-white select-none">
                    {(nickname.trim() || user?.email || "?")[0].toUpperCase()}
                  </div>
                )}
                {/* 호버 오버레이 */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <span className="text-[10px] font-semibold text-white">변경</span>
                </div>
              </button>
              {avatarPreview && (
                <button
                  type="button"
                  aria-label="선택 취소"
                  onClick={() => { setAvatarPreview(""); setAvatarFile(null); }}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm hover:bg-rose-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (!file) return;
                setAvatarFile(file);
                const prev = URL.createObjectURL(file);
                setAvatarPreview(prev);
                e.target.value = "";
              }}
            />
          </div>

          <SettingInput
            label="닉네임"
            type="text"
            value={nickname}
            onChange={(e) => setNickname((e.target as HTMLInputElement).value)}
            placeholder="표시 이름"
          />
          <SettingInput
            label="학교"
            type="text"
            value={school}
            onChange={(e) => setSchool((e.target as HTMLInputElement).value)}
            placeholder="예: 서울대학교"
          />
          <SettingInput
            label="학과"
            type="text"
            value={department}
            onChange={(e) => setDepartment((e.target as HTMLInputElement).value)}
            placeholder="예: 컴퓨터공학과"
          />
          <div className="pt-1">
            <button
              type="button"
              onClick={handleProfileSave}
              disabled={profileSaving}
              className="rounded-2xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
            >
              {profileSaving ? "저장 중…" : profileSaved ? "저장됨 ✓" : "저장하기"}
            </button>
          </div>
        </div>
      </section>

      {/* ── 외관 ───────────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">외관</h2>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <SettingRow label="다크 모드" description="앱 전체에 어두운 테마를 적용합니다.">
            <ToggleSwitch checked={darkMode} onChange={setDarkMode} />
          </SettingRow>
        </div>
      </section>

      {/* ── 집중 설정 ───────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">집중 설정</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">타이머 기본값으로 사용됩니다.</p>
        <div className="mt-5 space-y-6">
          <RangeRow
            label="하루 목표 집중 시간"
            value={dailyGoal}
            unit="시간"
            min={1}
            max={12}
            step={0.5}
            accentClass="text-sky-600 dark:text-sky-400"
            minLabel="1시간"
            maxLabel="12시간"
            onChange={setDailyGoal}
          />
          <RangeRow
            label="포모도로 집중 시간"
            value={pomoFocus}
            unit="분"
            min={5}
            max={60}
            step={5}
            accentClass="text-sky-600 dark:text-sky-400"
            minLabel="5분"
            maxLabel="60분"
            onChange={setPomoFocus}
          />
          <RangeRow
            label="포모도로 휴식 시간"
            value={pomoBreak}
            unit="분"
            min={1}
            max={30}
            step={1}
            accentClass="text-emerald-600 dark:text-emerald-400"
            minLabel="1분"
            maxLabel="30분"
            onChange={setPomoBreak}
          />
          <div className="pt-1">
            <button
              type="button"
              onClick={handleFocusSave}
              className="rounded-2xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              {focusSaved ? "저장됨 ✓" : "저장하기"}
            </button>
          </div>
        </div>
      </section>

      {/* ── 알림 ───────────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">알림</h2>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <SettingRow
            label="집중 완료 알림"
            description="타이머 세션 완료 시 브라우저 알림을 보냅니다."
          >
            <ToggleSwitch checked={notifications} onChange={handleNotifications} />
          </SettingRow>
          <SettingRow
            label="타이머 완료 소리"
            description="세션 완료 시 알림 소리를 재생합니다."
          >
            <ToggleSwitch checked={timerSound} onChange={handleTimerSound} />
          </SettingRow>
        </div>
      </section>

      {/* ── 연동 계정 ──────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">연동 계정</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">현재 로그인 방식입니다.</p>
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
          {isSocial ? (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Google 계정으로 연결됨</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
              </div>
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-sky-500" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2 4 12 13 22 4"/>
              </svg>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">이메일 로그인</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── 이메일 변경 ─────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">이메일 변경</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">변경 시 새 이메일로 확인 링크가 발송됩니다.</p>
        <div className="mt-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">현재 이메일</p>
            <div className="mt-1.5 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              {user?.email ?? "—"}
            </div>
          </div>
          <SettingInput
            label="새 이메일"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail((e.target as HTMLInputElement).value)}
            placeholder="새 이메일 주소 입력"
          />
          <div className="pt-1">
            <button
              type="button"
              onClick={handleEmailChange}
              disabled={emailSaving || !newEmail.trim()}
              className="rounded-2xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
            >
              {emailSaving ? "처리 중…" : "변경하기"}
            </button>
          </div>
        </div>
      </section>

      {/* ── 비밀번호 변경 (소셜 로그인 유저 숨김) ─────────── */}
      {!isSocial && (
        <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">비밀번호 변경</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">최소 6자 이상의 새 비밀번호를 입력하세요.</p>
          <div className="mt-5 space-y-4">
            <SettingInput
              label="새 비밀번호"
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd((e.target as HTMLInputElement).value)}
              placeholder="최소 6자 이상"
            />
            <SettingInput
              label="새 비밀번호 확인"
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd((e.target as HTMLInputElement).value)}
              placeholder="비밀번호를 다시 입력하세요"
            />
            {pwdError && (
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{pwdError}</p>
            )}
            <div className="pt-1">
              <button
                type="button"
                onClick={handlePasswordChange}
                disabled={pwdSaving}
                className="rounded-2xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
              >
                {pwdSaving ? "변경 중…" : "변경하기"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── 로그아웃 / 탈퇴 ────────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">로그아웃 / 탈퇴</h2>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800"
          >
            로그아웃
          </button>
          <button
            type="button"
            onClick={handleDeleteAccount}
            className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
          >
            회원탈퇴
          </button>
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg md:bottom-8 ${
          toastType === "error"
            ? "bg-rose-600 text-white"
            : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
        }`}>
          {toast}
        </div>
      )}
    </div>
  );
}
