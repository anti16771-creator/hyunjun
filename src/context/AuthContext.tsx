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
};

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const profileResult = await getUserProfile<UserProfile>(userId);
    if (!profileResult.error && profileResult.data) {
      setProfile(profileResult.data);
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
    () => ({ user, profile, loading, refreshProfile, logout }),
    [user, profile, loading]
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
