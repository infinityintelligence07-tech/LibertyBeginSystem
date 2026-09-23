// "Gerar acesso": cria a conta do perfil (se não existir) ou redefine a senha
// com uma senha temporária aleatória, devolvida na resposta para o admin
// repassar por WhatsApp. Nenhum e-mail é enviado. A senha nunca vai para logs.
import { handleOptions, json, errorJson } from "../_shared/cors.ts";
import { requireRole, assertCanManageUser, fetchUserRoles, toResponse, ADMIN_ROLES, type AppRole } from "../_shared/auth.ts";
import { normalizeEmail, ensureAuthUserForEmail, linkProfileToUser } from "../_shared/accounts.ts";
import { generateReadablePassword } from "../_shared/password.ts";

interface ProfileRow {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    const admin = ctx.supabaseAdmin;

    const body = await req.json().catch(() => ({}));
    const { profile_id, user_id: directUserId, role: roleHint } = body || {};
    if (!profile_id && !directUserId) {
      return errorJson("Informe profile_id ou user_id.", 400);
    }

    // Localiza o perfil
    let profile: ProfileRow | null = null;
    if (profile_id) {
      const { data, error } = await admin
        .from("profiles").select("id, user_id, email, full_name, phone").eq("id", profile_id).maybeSingle();
      if (error) throw error;
      profile = (data as ProfileRow | null) ?? null;
    } else {
      const { data, error } = await admin
        .from("profiles").select("id, user_id, email, full_name, phone").eq("user_id", directUserId).maybeSingle();
      if (error) throw error;
      profile = (data as ProfileRow | null) ?? null;
    }
    if (!profile) return errorJson("Cadastro não encontrado.", 404);

    const email = normalizeEmail(profile.email);
    if (!email) {
      return errorJson("Cadastro sem e-mail. Edite o cadastro e adicione o e-mail antes de gerar o acesso.", 400);
    }

    let userId: string | null = profile.user_id;

    // Hierarquia: só super_admin mexe em contas de admin/super_admin
    let userRoles: AppRole[] = userId ? await fetchUserRoles(admin, userId) : [];
    assertCanManageUser(ctx, { userId, roles: userRoles });

    let password: string;

    if (!userId) {
      // Sem conta: cria (ou reaproveita conta órfã com o mesmo e-mail) e vincula ao perfil
      const account = await ensureAuthUserForEmail(admin, {
        email,
        fullName: profile.full_name,
        profileId: profile.id,
      });
      userId = account.userId;
      password = account.password;

      const existingRoles = await fetchUserRoles(admin, userId);
      // Conta órfã reaproveitada pode ser de admin: re-checa a hierarquia antes de vincular.
      assertCanManageUser(ctx, { userId, roles: existingRoles });
      const roleToAssign: AppRole =
        existingRoles.length > 0
          ? existingRoles[0]
          : roleHint === "mentor" ? "mentor" : "liberty";
      await linkProfileToUser(admin, { profileId: profile.id, userId, role: roleToAssign });
      userRoles = existingRoles.length > 0 ? existingRoles : [roleToAssign];
    } else {
      // Já tem conta: nova senha temporária. Sem email_confirm aqui (GoTrue devolve 422 sem troca de e-mail).
      password = generateReadablePassword();
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password });
      if (updErr) {
        console.error("[reset-and-invite] updateUserById falhou", { profile_id: profile.id });
        return errorJson(updErr.message, 400);
      }
    }

    const isMentor = userRoles.includes("mentor") || roleHint === "mentor";

    return json({
      success: true,
      email,
      full_name: profile.full_name,
      phone: profile.phone,
      password,
      role: isMentor ? "mentor" : "liberty",
      user_id: userId,
    });
  } catch (err) {
    return toResponse(err);
  }
});
