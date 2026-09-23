import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from "react";
import { deleteToken, getToken } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";
import { getMessagingSafe } from "@/lib/firebase";
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
  /** true enquanto a sessão inicial ainda está sendo resolvida. */
  loading: boolean;
  /** true quando perfil e papéis do usuário atual já foram carregados (com ou sem sucesso). */
  rolesLoaded: boolean;
  /** Mensagem PT quando não foi possível carregar os papéis (falha de rede/RLS). */
  rolesError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Pick<Profile, "full_name" | "phone" | "avatar_url">>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
  /** Recarrega perfil e papéis do usuário atual (usado na tela "sem acesso"). */
  reloadAccess: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
}

const ROLES_LOAD_ERROR_MESSAGE = "Não foi possível carregar seu perfil de acesso. Verifique a conexão e tente novamente.";
const PUSH_CLEANUP_TIMEOUT_MS = 3000;
const RESET_PASSWORD_PATH = "/reset-password";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Remove o token push deste dispositivo (tabela `push_subscriptions` + FCM) para que
 * o aparelho não continue recebendo notificações do usuário que saiu.
 * Nunca lança: falhas são apenas logadas para não travar o logout.
 */
async function cleanupPushSubscription(userId: string | undefined) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const timeout = new Promise<null>((resolve) => {
    window.setTimeout(() => resolve(null), PUSH_CLEANUP_TIMEOUT_MS);
  });

  try {
    const messaging = await getMessagingSafe();
    if (!messaging) return;

    const registration = "serviceWorker" in navigator
      ? await Promise.race([navigator.serviceWorker.getRegistration("/"), timeout])
      : null;
    if (!registration) return;

    const token = await Promise.race([
      getToken(messaging, { serviceWorkerRegistration: registration }).catch(() => null),
      timeout,
    ]);
    if (!token) return;

    let query = supabase.from("push_subscriptions").delete().eq("token", token);
    if (userId) query = query.eq("user_id", userId);
    const { error } = await query;
    if (error) console.error("[useAuth] cleanupPushSubscription", error.message);

    await Promise.race([deleteToken(messaging).catch(() => false), timeout]);
  } catch (err) {
    console.error("[useAuth] cleanupPushSubscription", err);
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);

  // Evita carregar perfil/papéis duas vezes para o mesmo usuário
  // (signIn manual + evento SIGNED_IN + TOKEN_REFRESHED).
  const loadedForUserRef = useRef<string | null>(null);
  const inflightRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  const fetchProfile = useCallback(async (userId: string): Promise<boolean> => {
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
        setProfile(data ? (data as unknown as Profile) : null);
        return true;
      }
      console.error("[useAuth] fetchProfile", error.message);
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    return false;
  }, []);

  const fetchRoles = useCallback(async (userId: string): Promise<boolean> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (!error) {
        setRoles((data ?? []).map((r: { role: AppRole }) => r.role));
        return true;
      }
      console.error("[useAuth] fetchRoles", error.message);
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    return false;
  }, []);

  const loadUserContext = useCallback(
    async (userId: string, options?: { force?: boolean }) => {
      if (!options?.force && loadedForUserRef.current === userId) return;
      if (inflightRef.current?.userId === userId) return inflightRef.current.promise;

      setRolesLoaded(false);
      setRolesError(null);

      const promise = (async () => {
        const [, rolesOk] = await Promise.all([fetchProfile(userId), fetchRoles(userId)]);
        if (!rolesOk) {
          setRoles([]);
          setRolesError(ROLES_LOAD_ERROR_MESSAGE);
        }
        loadedForUserRef.current = userId;
        setRolesLoaded(true);
      })().finally(() => {
        if (inflightRef.current?.userId === userId) inflightRef.current = null;
      });

      inflightRef.current = { userId, promise };
      return promise;
    },
    [fetchProfile, fetchRoles],
  );

  const clearUserContext = useCallback(() => {
    loadedForUserRef.current = null;
    inflightRef.current = null;
    setProfile(null);
    setRoles([]);
    setRolesLoaded(false);
    setRolesError(null);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Link de recuperação que caiu fora de /reset-password (ex.: Site URL "/"):
      // leva para a tela de nova senha em vez de redirecionar ao dashboard.
      if (event === "PASSWORD_RECOVERY" && !window.location.pathname.startsWith(RESET_PASSWORD_PATH)) {
        window.location.replace(RESET_PASSWORD_PATH);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const userId = session.user.id;
        setTimeout(() => {
          loadUserContext(userId);
        }, 0);
      } else {
        clearUserContext();
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      // Token de sessão corrompido/expirado: limpa e devolve para o login,
      // em vez de deixar o mentor numa tela travada sem conseguir entrar.
      if (error) {
        console.error("[useAuth] getSession", error.message);
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch (err) {
          console.error("[useAuth] signOut(local)", err);
        }
        setSession(null);
        setUser(null);
        clearUserContext();
        setLoading(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserContext(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadUserContext, clearUserContext]);

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
        await loadUserContext(data.user.id, { force: true });
      }
    } catch (error) {
      console.error("[useAuth] signIn", error);
      return { error: error instanceof Error ? error : new Error("Não foi possível entrar.") };
    }
    // Inactive members remain able to sign in and access their materials/history,
    // but scheduling and other actions are blocked in the UI.
    return { error: null };
  };

  const signOut = async () => {
    await cleanupPushSubscription(user?.id);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[useAuth] signOut", error.message);
      // Garante que o estado local seja limpo mesmo se o servidor falhar.
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (err) {
        console.error("[useAuth] signOut(local)", err);
      }
    }
    setSession(null);
    setUser(null);
    clearUserContext();
  };

  const updateProfile = async (data: Partial<Pick<Profile, "full_name" | "phone" | "avatar_url">>) => {
    if (!profile) return { error: new Error("Perfil não carregado.") };
    const { error } = await supabase
      .from("profiles")
      .update(data)
      .eq("id", profile.id);
    if (error) {
      console.error("[useAuth] updateProfile", error.message);
    } else {
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

  const reloadAccess = async () => {
    if (user) await loadUserContext(user.id, { force: true });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        loading,
        rolesLoaded,
        rolesError,
        signIn,
        signOut,
        updateProfile,
        refreshProfile,
        reloadAccess,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
