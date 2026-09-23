// Ativa/inativa um perfil (profiles.is_active) e cancela sessões futuras ao inativar.
// Só admin/super_admin; só super_admin mexe em contas de admin/super_admin ou em si mesmo.
import { handleOptions, json, errorJson } from "../_shared/cors.ts";
import { requireRole, assertCanManageUserId, toResponse, ADMIN_ROLES } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    const admin = ctx.supabaseAdmin;

    const body = await req.json().catch(() => ({}));
    const { profile_id, active } = body as { profile_id?: string; active?: boolean };

    if (!profile_id || typeof active !== "boolean") {
      return errorJson("profile_id e active são obrigatórios", 400);
    }

    const { data: target, error: pErr } = await admin
      .from("profiles").select("id, user_id, full_name").eq("id", profile_id).maybeSingle();
    if (pErr) throw pErr;
    if (!target) return errorJson("Perfil não encontrado", 404);

    // Inativar é destrutivo (bloqueia o próprio admin de se inativar)
    await assertCanManageUserId(ctx, target.user_id, { destructive: !active });

    const { error: upErr } = await admin
      .from("profiles").update({ is_active: active }).eq("id", profile_id);
    if (upErr) return errorJson(upErr.message, 400);

    let cancelledBookings = 0;
    if (!active) {
      // Cancela sessões futuras (como mentor OU membro)
      const today = new Date().toISOString().slice(0, 10);
      const reason = "Cancelada automaticamente: usuário inativado pela administração";

      const { data: futureAsMentor } = await admin
        .from("bookings").select("id")
        .eq("mentor_id", profile_id).gte("scheduled_date", today)
        .in("status", ["scheduled", "pending_approval"]);

      const { data: futureAsLiberty } = await admin
        .from("bookings").select("id")
        .eq("liberty_id", profile_id).gte("scheduled_date", today)
        .in("status", ["scheduled", "pending_approval"]);

      const ids = [
        ...(futureAsMentor || []).map((b: { id: string }) => b.id),
        ...(futureAsLiberty || []).map((b: { id: string }) => b.id),
      ];

      if (ids.length > 0) {
        const { error: cErr } = await admin
          .from("bookings")
          .update({ status: "cancelled", cancellation_reason: reason })
          .in("id", ids);
        if (!cErr) cancelledBookings = ids.length;
      }
    }

    return json({ success: true, cancelledBookings });
  } catch (err) {
    return toResponse(err);
  }
});
