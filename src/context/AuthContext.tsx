"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, getUserProfile, signOut } from "@/src/lib/supabase";

export type UserProfile = {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  avatar_url?: string;
};

export type LocalProfile = {
  nickname: string;
  school: string;
  department: string;
  avatarUrl: string;
};

const LS_NICKNAME   = "smartgrade_nickname";
const LS_SCHOOL     = "smartgrade_school";
const LS_DEPARTMENT = "smartgrade_department";
const LS_AVATAR_URL = "smartgrade_avatar_url";

function lsRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
  catch { return fallback; }
}
function lsWrite(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  localProfile: LocalProfile;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateLocalProfile: (p: Partial<LocalProfile>) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [localProfile, setLocalProfile] = useState<LocalProfile>({ nickname: "", school: "", department: "", avatarUrl: "" });

  useEffect(() => {
    setLocalProfile({
      nickname:   lsRead(LS_NICKNAME, ""),
      school:     lsRead(LS_SCHOOL, ""),
      department: lsRead(LS_DEPARTMENT, ""),
      avatarUrl:  lsRead(LS_AVATAR_URL, ""),
    });
  }, []);

  const updateLocalProfile = (p: Partial<LocalProfile>) => {
    setLocalProfile((prev) => {
      const next = { ...prev, ...p };
      if (p.nickname   !== undefined) lsWrite(LS_NICKNAME,   p.nickname);
      if (p.school     !== undefined) lsWrite(LS_SCHOOL,     p.school);
      if (p.department !== undefined) lsWrite(LS_DEPARTMENT, p.department);
      if (p.avatarUrl  !== undefined) lsWrite(LS_AVATAR_URL, p.avatarUrl);
      return next;
    });
  };

  const loadProfile = async (userId: string) => {
    const profileResult = await getUserProfile<UserProfile>(userId);
    if (!profileResult.error && profileResult.data) {
      setProfile(profileResult.data);
      // DB에 avatar_url 있으면 localStorage 캐시에 동기화 (타임스탬프로 캐시 무효화)
      const raw = profileResult.data.avatar_url ?? "";
      if (raw) {
        const url = raw.includes("?t=")
          ? raw.replace(/\?t=\d+/, `?t=${Date.now()}`)
          : `${raw}${raw.includes("?") ? "&" : "?"}t=${Date.now()}`;
        lsWrite(LS_AVATAR_URL, url);
        setLocalProfile((prev) => ({ ...prev, avatarUrl: url }));
      }
    } else {
      setProfile(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | null = null;

    const initAuth = async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      const currentUser = data.session?.user ?? null;
      if (!mounted) return;
      setUser(currentUser);

      if (currentUser) {
        await loadProfile(currentUser.id);
      } else {
        setProfile(null);
      }

      setLoading(false);

      const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);

        if (nextUser) {
          await loadProfile(nextUser.id);
        } else {
          setProfile(null);
        }
      });

      cleanup = () => listener.subscription.unsubscribe();
    };

    initAuth();

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, []);

  const refreshProfile = async () => {
    if (!user) return;
    await loadProfile(user.id);
  };

  const logout = async () => {
    setUser(null);
    setProfile(null);
    setLoading(true);
    await signOut();
    setLoading(false);
  };

  const value = useMemo(
    () => ({ user, profile, localProfile, loading, refreshProfile, updateLocalProfile, logout }),
    [user, profile, localProfile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
