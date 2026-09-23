import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Shield, Loader2, Trash2, Users } from "lucide-react";
import { shortName, matchesSearch } from "@/lib/formatName";
import { UserAvatar } from "@/components/UserAvatar";
import {
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  SectionCard,
  SectionHeader,
  StatusPill,
  TextField,
} from "@/components/ds";

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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; user_id: string | null; full_name: string; email: string | null } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
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
    <SectionCard as="section">
      <SectionHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" aria-hidden /> Gestão de acessos
          </span>
        }
        description="Filtre por perfil, defina papéis e ative ou desative contas. Apenas Super Admins veem esta área."
      />

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por perfil">
          {TAB_ORDER.map((t) => (
            <Chip key={t} active={tab === t} onClick={() => setTab(t)} count={counts[t] || 0}>
              {TAB_LABELS[t]}
            </Chip>
          ))}
        </div>

        <TextField
          type="search"
          aria-label="Buscar por nome ou e-mail"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
        />
      </div>

      <div className="mt-4">
        {isLoading ? (
          <LoadingState variant="list" rows={5} />
        ) : isError ? (
          <ErrorState compact title="Não foi possível carregar os acessos" onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState compact icon={Users} title="Nenhum usuário encontrado" description="Ajuste o filtro ou a busca." />
        ) : (
          <ul className="space-y-2 max-h-[560px] overflow-y-auto pr-1" aria-label="Usuários">
            {filtered.map((u: any) => {
              const userRoles: Role[] = u.roles || [];
              const isLiberty = userRoles.includes("liberty");
              const inactive = u.is_active === false;
              const hasAccess = Boolean(u.user_id);
              return (
                <li key={u.id} className="flex flex-col lg:flex-row lg:items-center gap-3 p-3 rounded-ds border border-border bg-card">
                  <div className="flex items-center gap-3 min-w-0 lg:w-60">
                    <UserAvatar avatarUrl={u.avatar_url} name={u.full_name} size={36} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                        <span className="truncate">{shortName(u.full_name)}</span>
                        {!hasAccess && <StatusPill tone="warning" size="sm">Sem acesso</StatusPill>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{u.email || "Sem e-mail"}</div>
                    </div>
                  </div>

                  {/* Papéis */}
                  <div className="flex flex-wrap gap-1.5 flex-1" role="group" aria-label={`Papéis de ${shortName(u.full_name)}`}>
                    {ROLE_OPTIONS.map((r) => {
                      const has = userRoles.includes(r);
                      const isSaving = savingId === u.user_id + r;
                      return (
                        <span
                          key={r}
                          title={!hasAccess ? "Perfil sem login vinculado" : has ? `Remover ${ROLE_LABELS[r]}` : `Definir como ${ROLE_LABELS[r]}`}
                        >
                          <Chip
                            active={has}
                            disabled={!hasAccess || isSaving}
                            onClick={() => u.user_id && toggleRole(u.user_id, r, has)}
                          >
                            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                            {ROLE_LABELS[r]}
                          </Chip>
                        </span>
                      );
                    })}
                  </div>

                  {/* Programa (apenas membros) */}
                  {isLiberty && (
                    <div className="flex gap-1 shrink-0" role="group" aria-label="Programa">
                      <Chip active={u.member_tier !== "liberty"} disabled={savingId === u.id + "tier"} onClick={() => u.member_tier !== "begin" && setTier(u.id, "begin")}>
                        Begin
                      </Chip>
                      <Chip active={u.member_tier === "liberty"} disabled={savingId === u.id + "tier"} onClick={() => u.member_tier !== "liberty" && setTier(u.id, "liberty")}>
                        Liberty
                      </Chip>
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleActive(u.id, !inactive)}
                      disabled={savingId === u.id + "active"}
                      aria-label={inactive ? `Reativar ${shortName(u.full_name)}` : `Desativar ${shortName(u.full_name)}`}
                      aria-pressed={!inactive}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 hit-44"
                    >
                      <StatusPill tone={inactive ? "danger" : "success"} size="sm">{inactive ? "Inativo" : "Ativo"}</StatusPill>
                    </button>
                    <IconButton
                      aria-label={`Excluir conta de ${shortName(u.full_name)}`}
                      title="Excluir conta permanentemente"
                      size="sm"
                      className="hover:text-destructive"
                      disabled={savingId === u.id + "delete"}
                      onClick={() => setDeleteTarget({ id: u.id, user_id: u.user_id, full_name: u.full_name, email: u.email })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Excluir conta permanentemente?"
        description={
          deleteTarget ? (
            <>
              Esta ação apaga <strong>{shortName(deleteTarget.full_name) || deleteTarget.email}</strong> de forma definitiva.
              Perfil, login e vínculos serão removidos e não podem ser recuperados. Use apenas para contas de teste ou registros que precisam realmente sumir.
            </>
          ) : undefined
        }
        confirmLabel="Excluir definitivamente"
        destructive
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void deleteUser(target.id, target.user_id, target.full_name);
        }}
      />
    </SectionCard>
  );
};
