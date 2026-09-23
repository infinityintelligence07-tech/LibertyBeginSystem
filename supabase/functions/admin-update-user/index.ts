// Atualiza e-mail/senha da conta (auth.users) e colunas do perfil (whitelist).
// Ao definir e-mail num perfil sem conta, cria a conta com senha aleatória e
// devolve `password` para o admin repassar. Só admin/super_admin; só
// super_admin altera contas de admin/super_admin.
import { handleOptions, json, errorJson } from "../_shared/cors.ts";
import { requireRole, assertCanManageUser, fetchUserRoles, toResponse, ADMIN_ROLES } from "../_shared/auth.ts";
import { normalizeEmail, assertValidEmail, findProfilesByEmail, ensureAuthUserForEmail, linkProfileToUser } from "../_shared/accounts.ts";
import { MIN_PASSWORD_LENGTH } from "../_shared/password.ts";

// Colunas de `profiles` que o admin pode editar por esta função.
// Cobre os formulários de AdminMembroEditar (todas as seções), AdminMentores (session_rate) e AdminMembros.
const ALLOWED_COLUMNS = new Set([
  "full_name", "phone", "avatar_url", "company_name",
  "program_start_date", "program_end_date",
  "member_tier", "birth_date", "instagram_personal", "city_state",
  "marital_status", "dietary_restriction", "favorite_chocolate",
  "personal_story", "company_segment", "company_address",
  "business_description", "business_story", "company_instagram", "business_age",
  "employees_count", "employees_count_num", "leaders_count",
  "monthly_revenue", "profit_margin",
  "would_buy_self", "financial_control", "uses_dre",
  "costs_expenses", "financial_challenge", "challenge_2026",
  "dream_2026", "program_expectation", "sector_to_develop",
  "vision_6_months", "main_pain", "admin_note",
  "session_rate", "google_calendar_email",
]);

const NUMERIC_COLUMNS = new Set(["employees_count_num", "leaders_count", "session_rate"]);
const DATE_COLUMNS = new Set(["program_start_date", "program_end_date", "birth_date"]);

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    const admin = ctx.supabaseAdmin;

    const body = await req.json().catch(() => ({}));
    const { profile_id, email, password, profile_updates, role: roleHint } = body as {
      profile_id?: string;
      email?: string;
      password?: string;
      profile_updates?: Record<string, unknown>;
      role?: string;
    };

    if (!profile_id) return errorJson("profile_id obrigatório", 400);

    const { data: target, error: pErr } = await admin
      .from("profiles").select("id, user_id, email, full_name").eq("id", profile_id).maybeSingle();
    if (pErr) throw pErr;
    if (!target) return errorJson("Perfil não encontrado", 404);

    // Hierarquia
    const targetRoles = target.user_id ? await fetchUserRoles(admin, target.user_id) : [];
    assertCanManageUser(ctx, { userId: target.user_id, roles: targetRoles });

    // Senha: se veio, precisa ser válida (não ignorar em silêncio)
    const newPassword = password !== undefined && password !== null && String(password) !== "" ? String(password) : null;
    if (newPassword !== null && newPassword.length < MIN_PASSWORD_LENGTH) {
      return errorJson(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`, 400);
    }

    // E-mail normalizado
    const newEmail = email !== undefined && email !== null ? normalizeEmail(email) : "";
    const currentEmail = normalizeEmail(target.email);
    const emailChanged = !!newEmail && newEmail !== currentEmail;

    if (emailChanged) {
      assertValidEmail(newEmail);
      const dup = await findProfilesByEmail(admin, newEmail, target.id);
      if (dup.length > 0) return errorJson("Já existe outro cadastro com este e-mail.", 409);
    }

    // 1) Conta de acesso (auth.users)
    let generatedPassword: string | null = null;
    let accountCreated = false;
    let userId: string | null = target.user_id;

    if (userId) {
      const authUpdate: Record<string, unknown> = {};
      if (emailChanged) {
        authUpdate.email = newEmail;
        authUpdate.email_confirm = true;
      }
      if (newPassword) authUpdate.password = newPassword;
      if (Object.keys(authUpdate).length > 0) {
        const { error: updErr } = await admin.auth.admin.updateUserById(userId, authUpdate);
        if (updErr) return errorJson("Auth: " + updErr.message, 400);
      }
    } else if (emailChanged) {
      // Perfil sem conta recebendo e-mail novo: cria a conta e vincula
      const account = await ensureAuthUserForEmail(admin, {
        email: newEmail,
        fullName: (profile_updates?.full_name as string | undefined) || target.full_name,
        profileId: target.id,
        password: newPassword ?? undefined,
      });
      userId = account.userId;
      generatedPassword = account.password;
      accountCreated = true;

      const existingRoles = await fetchUserRoles(admin, userId);
      assertCanManageUser(ctx, { userId, roles: existingRoles });
      const roleToAssign = existingRoles.length > 0
        ? existingRoles[0]
        : roleHint === "mentor" ? "mentor" : "liberty";
      await linkProfileToUser(admin, { profileId: target.id, userId, role: roleToAssign });
    }

    // 2) Perfil (whitelist)
    const finalUpdates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(profile_updates || {})) {
      if (!ALLOWED_COLUMNS.has(k)) continue;
      let value: unknown = v === "" ? null : v;
      if (value !== null && NUMERIC_COLUMNS.has(k)) {
        const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
        if (Number.isNaN(n)) return errorJson(`Valor inválido para ${k}.`, 400);
        value = n;
      }
      if (value !== null && DATE_COLUMNS.has(k) && typeof value === "string") {
        value = value.slice(0, 10);
      }
      if (k === "member_tier" && value !== null && !["begin", "liberty"].includes(String(value))) {
        return errorJson("member_tier inválido.", 400);
      }
      finalUpdates[k] = value;
    }
    if (typeof finalUpdates.full_name === "string") finalUpdates.full_name = finalUpdates.full_name.trim();
    // Só grava o e-mail no perfil depois do auth ter sido atualizado/criado com sucesso
    if (emailChanged) finalUpdates.email = newEmail;
    // Mesmo e-mail com caixa/espaços diferentes: só normaliza o valor gravado
    else if (newEmail && target.email && target.email !== newEmail) finalUpdates.email = newEmail;

    if (Object.keys(finalUpdates).length > 0) {
      const { error: profErr } = await admin.from("profiles").update(finalUpdates).eq("id", profile_id);
      if (profErr) {
        console.error("[admin-update-user] falha ao atualizar perfil", {
          profile_id, keys: Object.keys(finalUpdates), code: profErr.code,
        });
        return errorJson("Profile: " + profErr.message, 400);
      }
    }

    return json({
      success: true,
      user_id: userId,
      email: newEmail || currentEmail || null,
      ...(accountCreated ? { account_created: true, password: generatedPassword } : {}),
    });
  } catch (err) {
    return toResponse(err);
  }
});
