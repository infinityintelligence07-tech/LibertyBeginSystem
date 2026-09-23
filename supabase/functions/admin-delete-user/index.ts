// Exclui definitivamente um perfil, sua conta de acesso e dados relacionados.
// Só admin/super_admin; só super_admin exclui contas de admin/super_admin ou a própria.
import { handleOptions, json, errorJson } from "../_shared/cors.ts";
import { requireRole, assertCanManageUserId, toResponse, ADMIN_ROLES } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    const admin = ctx.supabaseAdmin;

    const body = await req.json().catch(() => ({}));
    const { profile_id } = body as { profile_id?: string };
    if (!profile_id) return errorJson("profile_id é obrigatório", 400);

    const { data: target, error: pErr } = await admin
      .from("profiles").select("id, user_id, full_name").eq("id", profile_id).maybeSingle();
    if (pErr) throw pErr;
    if (!target) return errorJson("Perfil não encontrado", 404);

    await assertCanManageUserId(ctx, target.user_id, { destructive: true });

    // Bookings em que o perfil é mentor ou membro
    const { data: bks } = await admin
      .from("bookings").select("id").or(`liberty_id.eq.${profile_id},mentor_id.eq.${profile_id}`);
    const bookingIds = (bks || []).map((b: { id: string }) => b.id);

    if (bookingIds.length > 0) {
      await admin.from("session_tasks").delete().in("booking_id", bookingIds);
      await admin.from("booking_reports").delete().in("booking_id", bookingIds);
      await admin.from("bookings").delete().in("id", bookingIds);
    }

    await admin.from("nps_responses").delete().or(`liberty_id.eq.${profile_id},mentor_id.eq.${profile_id}`);
    await admin.from("mentor_availability").delete().eq("mentor_id", profile_id);
    await admin.from("mentor_sessions").delete().eq("mentor_id", profile_id);
    await admin.from("user_oauth_tokens").delete().eq("profile_id", profile_id);

    if (target.user_id) {
      await admin.from("notifications").delete().eq("user_id", target.user_id);
      await admin.from("push_subscriptions").delete().eq("user_id", target.user_id);
      await admin.from("user_roles").delete().eq("user_id", target.user_id);
    }

    await admin.from("profile_user_lookup").delete().eq("profile_id", profile_id);
    const { error: delErr } = await admin.from("profiles").delete().eq("id", profile_id);
    if (delErr) return errorJson(delErr.message, 400);

    let authDeleted = false;
    if (target.user_id) {
      const { error: authErr } = await admin.auth.admin.deleteUser(target.user_id);
      if (authErr) {
        console.error("[admin-delete-user] falha ao excluir conta de acesso", { profile_id, code: authErr.status });
        return errorJson(
          "Cadastro excluído, mas a conta de acesso não pôde ser removida. Remova-a em Authentication no painel do Supabase.",
          500,
          { partial: true, deleted_bookings: bookingIds.length, auth_deleted: false },
        );
      }
      authDeleted = true;
    }

    return json({ success: true, deleted_bookings: bookingIds.length, auth_deleted: authDeleted });
  } catch (err) {
    return toResponse(err);
  }
});
