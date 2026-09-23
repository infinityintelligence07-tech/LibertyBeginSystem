// Cria um membro/mentor (com conta de acesso quando há e-mail, ou só o cadastro).
// Somente admin/super_admin. Apenas super_admin pode criar admin/super_admin.
// A senha temporária é aleatória e devolvida na resposta (`password`) para o
// admin repassar por WhatsApp; nunca é registrada em logs.
import { handleOptions, json, errorJson } from "../_shared/cors.ts";
import { requireRole, assertCanAssignRole, toResponse, ALL_ROLES, ADMIN_ROLES, type AppRole } from "../_shared/auth.ts";
import { normalizeEmail, findProfilesByEmail, ensureAuthUserForEmail } from "../_shared/accounts.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    const admin = ctx.supabaseAdmin;

    const body = await req.json().catch(() => ({}));
    const {
      email: rawEmail,
      password: providedPassword,
      full_name,
      role,
      phone,
      company_name,
      program_start_date,
      program_end_date,
      session_rate,
      member_tier,
    } = body || {};

    if (!full_name || !role) {
      return errorJson("Campos obrigatórios: full_name e role.", 400);
    }
    if (!ALL_ROLES.includes(role as AppRole)) {
      return errorJson("Papel inválido.", 400);
    }
    assertCanAssignRole(ctx, role);

    const normalizedEmail = normalizeEmail(rawEmail);
    const fullName = String(full_name).trim();

    // Dois modos:
    //  - com e-mail: cria conta de acesso + perfil + papel
    //  - sem e-mail: cria só o cadastro; o admin gera o acesso depois (reset-and-invite)
    let userId: string | null = null;
    let password: string | null = null;

    if (normalizedEmail) {
      const existing = await findProfilesByEmail(admin, normalizedEmail);
      const withAccount = existing.find((p) => p.user_id);
      if (withAccount) {
        return errorJson(
          "Já existe um membro cadastrado com este e-mail e com conta de acesso. Edite o cadastro existente ou use outro e-mail.",
          409,
        );
      }
      if (existing.length > 0) {
        return errorJson(
          "Já existe um cadastro com este e-mail, ainda sem conta de acesso. Abra esse cadastro e use Gerar acesso.",
          409,
        );
      }

      // Cria a conta; se já existir conta órfã (sem perfil) com o mesmo e-mail, reaproveita.
      const account = await ensureAuthUserForEmail(admin, {
        email: normalizedEmail,
        fullName,
        password: providedPassword ? String(providedPassword) : undefined,
      });
      userId = account.userId;
      password = account.password;
    }

    const profileUpdate: Record<string, unknown> = { full_name: fullName };
    if (userId) profileUpdate.user_id = userId;
    if (normalizedEmail) profileUpdate.email = normalizedEmail;
    if (phone) profileUpdate.phone = String(phone).trim();
    if (company_name) profileUpdate.company_name = String(company_name).trim();
    if (program_start_date) profileUpdate.program_start_date = program_start_date;
    if (program_end_date) profileUpdate.program_end_date = program_end_date;
    if (session_rate !== undefined && session_rate !== null && session_rate !== "") {
      const rate = Number(session_rate);
      if (Number.isNaN(rate)) return errorJson("session_rate inválido.", 400);
      profileUpdate.session_rate = rate;
    }
    if (member_tier && ["begin", "liberty"].includes(member_tier)) profileUpdate.member_tier = member_tier;

    let profileId: string | null = null;
    if (userId) {
      // O trigger handle_new_user pode já ter criado/vinculado o perfil: upsert por user_id.
      const { error: profileError } = await admin
        .from("profiles")
        .upsert(profileUpdate, { onConflict: "user_id" });
      if (profileError) {
        await admin.auth.admin.deleteUser(userId);
        return errorJson(profileError.message, 400);
      }
      const { error: roleError } = await admin
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
      if (roleError) {
        await admin.auth.admin.deleteUser(userId);
        return errorJson(roleError.message, 400);
      }
      const { data: profileData } = await admin
        .from("profiles").select("id").eq("user_id", userId).maybeSingle();
      profileId = profileData?.id ?? null;
    } else {
      const { data: inserted, error: profileError } = await admin
        .from("profiles")
        .insert(profileUpdate)
        .select("id")
        .single();
      if (profileError) return errorJson(profileError.message, 400);
      profileId = inserted?.id ?? null;
    }

    return json({
      success: true,
      user_id: userId,
      profile_id: profileId,
      email: normalizedEmail || null,
      password,
      message: userId
        ? `Usuário criado com papel ${role}`
        : "Cadastro criado sem conta de acesso (gere o acesso depois)",
    });
  } catch (err) {
    return toResponse(err);
  }
});
