import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Shield, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { shortName, matchesSearch } from "@/lib/formatName";
import { UserAvatar } from "@/components/UserAvatar";

type Role = "super_admin" | "admin" | "mentor" | "liberty";
type Tab = "all" | "admin" | "mentor" | "begin" | "liberty" | "inactive";

const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  mentor: "Mentor",
  liberty: "Membro",
};

const ROLE_OPTIONS: Role[] = ["super_admin", "admin", "mentor", "liberty"];

const TAB_LABELS: Record<Tab, string> = {
  all: "Todos",
  admin: "Admins",
  mentor: "Mentores",
  begin: "Membros Begin",
  liberty: "Membros Liberty",
  inactive: "Inativos",
};

const TAB_ORDER: Tab[] = ["all", "admin", "mentor", "begin", "liberty", "inactive"];

export const AccessManagement = () => {
  const { roles: myRoles } = useAuth();
  const isSuperAdmin = myRoles.includes("super_admin");
  const qc = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["access-management-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, avatar_url, is_active, member_tier")
        .order("full_name");
      if (error) throw error;
      const userIds = (profiles || []).map((p) => p.user_id).filter(Boolean) as string[];
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      const map = new Map<string, Role[]>();
      (rolesData || []).forEach((r: any) => {
        const arr = map.get(r.user_id) || [];
        arr.push(r.role as Role);
        map.set(r.user_id, arr);
      });
      return (profiles || []).map((p: any) => ({
        ...p,
        roles: (p.user_id ? map.get(p.user_id) : []) || [],
      }));
    },
    enabled: isSuperAdmin,
  });

  const classify = (u: any): Tab[] => {
    const tags: Tab[] = ["all"];
    const r: Role[] = u.roles || [];
    if (u.is_active === false) tags.push("inactive");
    if (r.includes("admin") || r.includes("super_admin")) tags.push("admin");
    if (r.includes("mentor")) tags.push("mentor");
    if (r.includes("liberty")) {
      if (u.member_tier === "liberty") tags.push("liberty");
      else tags.push("begin");
    }
    return tags;
  };

  const enriched = useMemo(() => (data || []).map((u: any) => ({ ...u, _tabs: classify(u) })), [data]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, admin: 0, mentor: 0, begin: 0, liberty: 0, inactive: 0 };
    enriched.forEach((u: any) => u._tabs.forEach((t: Tab) => { c[t]++; }));
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    return enriched.filter((u: any) => {
      if (!u._tabs.includes(tab)) return false;
      if (!search.trim()) return true;
      return matchesSearch(`${u.full_name || ""} ${u.email || ""}`, search);
    });
  }, [enriched, tab, search]);

  if (!isSuperAdmin) return null;

  const toggleRole = async (userId: string, role: Role, has: boolean) => {
    setSavingId(userId + role);
    try {
      if (has) {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
      }
      toast.success("Acesso atualizado");
      qc.invalidateQueries({ queryKey: ["access-management-users"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar acesso");
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (profileId: string, currentlyActive: boolean) => {
    setSavingId(profileId + "active");
    try {
      const { error } = await supabase.from("profiles").update({ is_active: !currentlyActive }).eq("id", profileId);
      if (error) throw error;
      toast.success(currentlyActive ? "Conta desativada" : "Conta reativada");
      qc.invalidateQueries({ queryKey: ["access-management-users"] });
    } catch (e: any) {
      toast.error(e.message || "Erro");
    } finally {
      setSavingId(null);
    }
  };

  const deleteUser = async (profileId: string, userId: string | null, name: string) => {
    setSavingId(profileId + "delete");
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { profile_id: profileId, user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${shortName(name) || "Conta"} excluída definitivamente`);
      qc.invalidateQueries({ queryKey: ["access-management-users"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir conta");
    } finally {
      setSavingId(null);
    }
  };

  const setTier = async (profileId: string, tier: "begin" | "liberty") => {
    setSavingId(profileId + "tier");
    try {
      const { error } = await supabase.from("profiles").update({ member_tier: tier }).eq("id", profileId);
      if (error) throw error;
      toast.success(tier === "liberty" ? "Marcado como Liberty" : "Marcado como Begin");
      qc.invalidateQueries({ queryKey: ["access-management-users"] });
    } catch (e: any) {
      toast.error(e.message || "Erro");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="glass-card p-6">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
        <Shield className="h-4 w-4 text-primary" /> Gestão de Acessos
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Filtre por perfil, defina papéis e ative/desative contas. Apenas Super Admins veem essa área.
      </p>

      {/* Segmented filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {TAB_ORDER.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors inline-flex items-center gap-1.5 ${
              tab === t
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            {TAB_LABELS[t]}
            <span className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded-full ${tab === t ? "bg-primary-foreground/20" : "bg-muted/40"}`}>
              {counts[t] || 0}
            </span>
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nome ou e-mail…"
        className="input-begin text-sm h-10 w-full mb-4"
      />

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {filtered.map((u: any) => {
            const userRoles: Role[] = u.roles || [];
            const isLiberty = userRoles.includes("liberty");
            return (
              <div key={u.id} className="flex flex-col lg:flex-row lg:items-center gap-3 p-3 rounded-lg bg-background/40 border border-border">
                <div className="flex items-center gap-3 min-w-0 lg:w-56">
                  <UserAvatar avatarUrl={u.avatar_url} name={u.full_name} size={36} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{shortName(u.full_name)}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  </div>
                </div>

                {/* Role toggles */}
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {ROLE_OPTIONS.map((r) => {
                    const has = userRoles.includes(r);
                    const isSaving = savingId === u.user_id + r;
                    return (
                      <button
                        key={r}
                        disabled={!u.user_id || isSaving}
                        onClick={() => u.user_id && toggleRole(u.user_id, r, has)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                          has
                            ? "bg-primary/15 text-primary border-primary/40"
                            : "bg-transparent text-muted-foreground border-border hover:border-primary/30"
                        } disabled:opacity-50`}
                        title={has ? `Remover ${ROLE_LABELS[r]}` : `Definir como ${ROLE_LABELS[r]}`}
                      >
                        {isSaving ? "…" : ROLE_LABELS[r]}
                      </button>
                    );
                  })}
                </div>

                {/* Tier toggle (only for members) */}
                {isLiberty && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => u.member_tier !== "begin" && setTier(u.id, "begin")}
                      disabled={savingId === u.id + "tier"}
                      className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                        u.member_tier !== "liberty"
                          ? "bg-primary/15 text-primary border-primary/40"
                          : "bg-transparent text-muted-foreground border-border hover:border-primary/30"
                      }`}
                    >
                      Begin
                    </button>
                    <button
                      onClick={() => u.member_tier !== "liberty" && setTier(u.id, "liberty")}
                      disabled={savingId === u.id + "tier"}
                      className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                        u.member_tier === "liberty"
                          ? "bg-amber-500/15 text-amber-500 border-amber-500/40"
                          : "bg-transparent text-muted-foreground border-border hover:border-amber-500/30"
                      }`}
                    >
                      Liberty
                    </button>
                  </div>
                )}

                <button
                  onClick={() => toggleActive(u.id, u.is_active !== false)}
                  disabled={savingId === u.id + "active"}
                  className={`text-[11px] px-3 py-1.5 rounded-md border transition-colors shrink-0 ${
                    u.is_active === false
                      ? "bg-destructive/10 text-destructive border-border"
                      : "bg-status-green/10 text-status-green border-border"
                  }`}
                >
                  {u.is_active === false ? "Inativo" : "Ativo"}
                </button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      disabled={savingId === u.id + "delete"}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 disabled:opacity-50"
                      title="Excluir conta permanentemente"
                      aria-label="Excluir conta"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>

                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir conta permanentemente?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação apaga <strong>{shortName(u.full_name) || u.email}</strong> de forma
                        definitiva. Perfil, login e vínculos serão removidos e não podem ser recuperados.
                        Use apenas para contas de teste ou registros que precisam realmente sumir.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteUser(u.id, u.user_id, u.full_name)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Excluir definitivamente
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8">Nenhum usuário encontrado.</div>
          )}
        </div>
      )}
    </div>
  );
};
