// Autenticação/autorização compartilhada das Edge Functions.
//
// Uso:
//   const ctx = await requireRole(req, ["admin", "super_admin"]);
//   ...
//   catch (err) { return toResponse(err); }
//
// `requireRole` lança um `Response` (401/403 com JSON { error }) quando o
// chamador não está autenticado ou não tem o papel exigido. `toResponse`
// converte esse Response (ou qualquer erro) na resposta final da função.
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.99.2";
import { errorJson } from "./cors.ts";

export type AppRole = "liberty" | "mentor" | "admin" | "super_admin";

export const ALL_ROLES: AppRole[] = ["liberty", "mentor", "admin", "super_admin"];
export const ADMIN_ROLES: AppRole[] = ["admin", "super_admin"];
export const STAFF_ROLES: AppRole[] = ["mentor", "admin", "super_admin"];

export interface AuthContext {
  /** Usuário autenticado; null quando a chamada veio com a service role key (cron). */
  user: User | null;
  roles: AppRole[];
  supabaseAdmin: SupabaseClient;
  isServiceRole: boolean;
}

export interface RequireRoleOptions {
  /** Aceita `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (chamadas server-to-server/cron). */
  allowServiceRole?: boolean;
}

const MSG_UNAUTHENTICATED = "Sessão inválida ou expirada. Faça login novamente.";
const MSG_FORBIDDEN = "Você não tem permissão para executar esta ação.";
const MSG_ONLY_SUPER_ADMIN = "Apenas um super administrador pode criar, alterar ou excluir contas de administrador.";
const MSG_SELF_LOCKOUT = "Você não pode excluir, inativar ou rebaixar o próprio acesso.";

export function getAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

export async function fetchUserRoles(admin: SupabaseClient, userId: string): Promise<AppRole[]> {
  const { data, error } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Falha ao carregar papéis: ${error.message}`);
  return (data || [])
    .map((r: { role: string }) => r.role as AppRole)
    .filter((r) => ALL_ROLES.includes(r));
}

export const isPrivileged = (roles: readonly string[]): boolean =>
  roles.some((r) => ADMIN_ROLES.includes(r as AppRole));

export const isSuperAdmin = (ctx: AuthContext): boolean =>
  ctx.isServiceRole || ctx.roles.includes("super_admin");

/**
 * Exige um chamador autenticado com pelo menos um dos papéis informados.
 * `roles` vazio = qualquer usuário autenticado.
 * Lança `Response` 401/403 (com CORS + JSON { error }) em caso de falha.
 */
export async function requireRole(
  req: Request,
  roles: readonly AppRole[],
  opts: RequireRoleOptions = {},
): Promise<AuthContext> {
  const token = bearerToken(req);
  if (!token) throw errorJson(MSG_UNAUTHENTICATED, 401);

  const supabaseAdmin = getAdminClient();

  if (opts.allowServiceRole) {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (serviceKey && timingSafeEqual(token, serviceKey)) {
      return { user: null, roles: [...ALL_ROLES], supabaseAdmin, isServiceRole: true };
    }
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw errorJson(MSG_UNAUTHENTICATED, 401);

  const userRoles = await fetchUserRoles(supabaseAdmin, data.user.id);
  if (roles.length > 0 && !roles.some((r) => userRoles.includes(r))) {
    throw errorJson(MSG_FORBIDDEN, 403);
  }

  return { user: data.user, roles: userRoles, supabaseAdmin, isServiceRole: false };
}

/** Só super_admin pode atribuir `admin`/`super_admin`. */
export function assertCanAssignRole(ctx: AuthContext, role: string): void {
  if (ADMIN_ROLES.includes(role as AppRole) && !isSuperAdmin(ctx)) {
    throw errorJson(MSG_ONLY_SUPER_ADMIN, 403);
  }
}

export interface ManagedTarget {
  userId: string | null | undefined;
  roles: readonly AppRole[];
}

/**
 * Hierarquia: só super_admin pode alterar/excluir usuários com papel admin/super_admin
 * e só super_admin pode executar ações destrutivas (excluir, inativar, rebaixar) em si mesmo.
 */
export function assertCanManageUser(
  ctx: AuthContext,
  target: ManagedTarget,
  opts: { destructive?: boolean } = {},
): void {
  if (isSuperAdmin(ctx)) return;
  if (isPrivileged(target.roles)) throw errorJson(MSG_ONLY_SUPER_ADMIN, 403);
  if (opts.destructive && target.userId && ctx.user && target.userId === ctx.user.id) {
    throw errorJson(MSG_SELF_LOCKOUT, 403);
  }
}

/** Carrega papéis do alvo (se tiver conta) e aplica `assertCanManageUser`. */
export async function assertCanManageUserId(
  ctx: AuthContext,
  targetUserId: string | null | undefined,
  opts: { destructive?: boolean } = {},
): Promise<AppRole[]> {
  const roles = targetUserId ? await fetchUserRoles(ctx.supabaseAdmin, targetUserId) : [];
  assertCanManageUser(ctx, { userId: targetUserId, roles }, opts);
  return roles;
}

/** Converte um erro lançado (Response ou Error) na resposta final da função. */
export function toResponse(err: unknown): Response {
  if (err instanceof Response) return err;
  const message = err instanceof Error ? err.message : String(err);
  console.error("[edge-function] erro inesperado:", message);
  return errorJson(message || "Erro interno", 500);
}
