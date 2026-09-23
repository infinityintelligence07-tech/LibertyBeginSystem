// Utilitários para criar/vincular contas de acesso (auth.users <-> profiles).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";
import { errorJson } from "./cors.ts";
import { generateReadablePassword } from "./password.ts";

export const normalizeEmail = (email: unknown): string =>
  String(email ?? "").trim().toLowerCase();

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function assertValidEmail(email: string): void {
  if (!isValidEmail(email)) throw errorJson("E-mail inválido.", 400);
}

/** Escapa % e _ para uso com ilike (igualdade case-insensitive). */
const ilikeLiteral = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface ProfileRow {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
}

/** Perfis com o e-mail informado (case-insensitive), opcionalmente excluindo um id. */
export async function findProfilesByEmail(
  admin: SupabaseClient,
  email: string,
  excludeProfileId?: string,
): Promise<ProfileRow[]> {
  let query = admin
    .from("profiles")
    .select("id, user_id, email, full_name")
    .ilike("email", ilikeLiteral(email));
  if (excludeProfileId) query = query.neq("id", excludeProfileId);
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao consultar perfis: ${error.message}`);
  return (data || []) as ProfileRow[];
}

/** Procura um usuário em auth.users pelo e-mail (paginado). */
export async function findAuthUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = normalizeEmail(email);
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Falha ao consultar usuários: ${error.message}`);
    const users = data?.users || [];
    const found = users.find((u) => normalizeEmail(u.email) === target);
    if (found) return found.id;
    if (users.length < 200) break;
  }
  return null;
}

const isDuplicateAuthError = (message: string): boolean =>
  /already been registered|already exists|already registered|duplicate/i.test(message);

export interface EnsureAuthUserResult {
  userId: string;
  password: string;
  /** true quando já existia conta em auth.users e ela foi reaproveitada. */
  linkedExisting: boolean;
}

/**
 * Garante que exista uma conta em auth.users para o e-mail, com senha temporária nova.
 * - Se não existir: cria com `email_confirm: true`.
 * - Se já existir: verifica que não está vinculada a OUTRO perfil (409) e redefine a senha.
 * Nunca registra a senha em logs.
 */
export async function ensureAuthUserForEmail(
  admin: SupabaseClient,
  params: { email: string; fullName?: string | null; profileId?: string | null; password?: string },
): Promise<EnsureAuthUserResult> {
  const email = normalizeEmail(params.email);
  assertValidEmail(email);
  const password = params.password && params.password.length >= 6 ? params.password : generateReadablePassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: params.fullName ? { full_name: params.fullName } : undefined,
  });

  if (!createErr && created?.user) {
    return { userId: created.user.id, password, linkedExisting: false };
  }

  const message = createErr?.message || "Falha ao criar conta de acesso";
  if (!isDuplicateAuthError(message)) throw errorJson(message, 400);

  // Já existe conta com este e-mail: reaproveitar, desde que não pertença a outro perfil.
  const existingUserId = await findAuthUserIdByEmail(admin, email);
  if (!existingUserId) throw errorJson("Já existe uma conta com este e-mail, mas não foi possível localizá-la.", 409);

  const { data: owner, error: ownerErr } = await admin
    .from("profiles").select("id").eq("user_id", existingUserId).maybeSingle();
  if (ownerErr) throw new Error(`Falha ao verificar vínculo da conta: ${ownerErr.message}`);
  if (owner && owner.id !== params.profileId) {
    throw errorJson("Este e-mail já possui conta vinculada a outro cadastro. Use Gerar acesso no cadastro correto ou mescle os perfis.", 409);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(existingUserId, { password });
  if (updErr) throw errorJson(updErr.message, 400);

  return { userId: existingUserId, password, linkedExisting: true };
}

/** Vincula `profiles.user_id` e garante a role em `user_roles`, checando erros. */
export async function linkProfileToUser(
  admin: SupabaseClient,
  params: { profileId: string; userId: string; role: string },
): Promise<void> {
  const { error: linkErr } = await admin
    .from("profiles").update({ user_id: params.userId }).eq("id", params.profileId);
  if (linkErr) throw errorJson(`Não foi possível vincular a conta ao cadastro: ${linkErr.message}`, 400);

  const { error: roleErr } = await admin
    .from("user_roles").upsert({ user_id: params.userId, role: params.role }, { onConflict: "user_id,role" });
  if (roleErr) throw errorJson(`Não foi possível definir o papel do usuário: ${roleErr.message}`, 400);
}
