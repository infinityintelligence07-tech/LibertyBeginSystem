import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface Profile {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  google_connected?: boolean;
  google_calendar_email: string | null;
  member_tier?: "begin" | "liberty" | null;
  is_active?: boolean;
  onboarding_completed?: boolean;
}

type AppRole = "super_admin" | "admin" | "mentor" | "liberty";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Pick<Profile, "full_name" | "phone" | "avatar_url">>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    // Retenta em falha de rede: sem isso o membro ficava numa tela sem dados.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!error) {
        if (data) setProfile(data as unknown as Profile);
        return;
      }
      console.error("[useAuth] fetchProfile", error.message);
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (!error) {
        if (data) setRoles(data.map((r: { role: AppRole }) => r.role));
        return;
      }
      console.error("[useAuth] fetchRoles", error.message);
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }, []);



  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
            fetchRoles(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      // Token de sessão corrompido/expirado: limpa e devolve para o login,
      // em vez de deixar o mentor numa tela travada sem conseguir entrar.
      if (error) {
        console.error("[useAuth] getSession", error.message);
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          /* noop */
        }
        setSession(null);
        setUser(null);
        setProfile(null);
        setRoles([]);
        setLoading(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchRoles(session.user.id);
      }
      setLoading(false);
    });


    return () => subscription.unsubscribe();
  }, [fetchProfile, fetchRoles]);

  const signIn = async (email: string, password: string) => {
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("Tempo esgotado. Verifique sua conexão e tente novamente.")), 20000);
    });

    try {
      const { data, error } = await Promise.race([
        supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }),
        timeout,
      ]);
      if (error) return { error: error as Error | null };

      // Do not depend only on the auth event: on some installed iPhones it can be
      // delayed while the app resumes from the background, leaving the login screen stuck.
      if (data.user) {
        setSession(data.session);
        setUser(data.user);
        await Promise.all([fetchProfile(data.user.id), fetchRoles(data.user.id)]);
      }
    } catch (error) {
      return { error: error instanceof Error ? error : new Error("Não foi possível entrar.") };
    }
    // Inactive members remain able to sign in and access their materials/history,
    // but scheduling and other actions are blocked in the UI.
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const updateProfile = async (data: Partial<Pick<Profile, "full_name" | "phone" | "avatar_url">>) => {
    if (!profile) return { error: new Error("No profile") };
    const { error } = await supabase
      .from("profiles")
      .update(data)
      .eq("id", profile.id);
    if (!error) {
      setProfile((prev) => prev ? { ...prev, ...data } : prev);
    }
    return { error: error as Error | null };
  };

  const hasRole = (role: AppRole) => {
    if (roles.includes(role)) return true;
    if (role === "admin" && roles.includes("super_admin")) return true;
    return false;
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, roles, loading, signIn, signUp, signOut, updateProfile, refreshProfile, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
