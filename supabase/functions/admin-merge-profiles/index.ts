// Mescla dois perfis duplicados (ou desfaz uma mesclagem). Só admin/super_admin;
// só super_admin mescla perfis com conta de admin/super_admin.
import { handleOptions, json } from "../_shared/cors.ts";
import { requireRole, assertCanManageUserId, toResponse, ADMIN_ROLES } from "../_shared/auth.ts";

const norm = (s: string | null | undefined) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const nameParts = (s: string | null | undefined) => norm(s).split(" ").filter(Boolean);

const MERGEABLE = [
  "email","phone","company_name","program_start_date","program_end_date","member_tier","avatar_url",
  "birth_date","marital_status","city_state","instagram_personal","personal_story","favorite_chocolate",
  "dietary_restriction","company_segment","company_address","business_description","company_instagram",
  "business_age","employees_count","monthly_revenue","profit_margin","would_buy_self","financial_control",
  "uses_dre","costs_expenses","financial_challenge","challenge_2026","dream_2026","program_expectation",
  "main_pain","vision_6_months","sector_to_develop","admin_note","business_story","leaders_count",
  "employees_count_num","session_rate","google_calendar_email",
];

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    const adminClient = ctx.supabaseAdmin;
    const caller = ctx.user!;

    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "merge";

    // ---------------------------------------------------------------- UNDO ---
    if (action === "undo") {
      const logId = body.log_id;
      if (!logId) return json({ error: "log_id é obrigatório" }, 400);

      const { data: log } = await adminClient
        .from("profile_merge_log").select("*").eq("id", logId).maybeSingle();
      if (!log) return json({ error: "Registro de mesclagem não encontrado" }, 404);
      if (log.undone_at) return json({ error: "Esta mesclagem já foi desfeita" }, 409);

      const loserBefore = log.loser_before as Record<string, unknown>;
      const winnerBefore = log.winner_before as Record<string, unknown>;

      // Free the auth link before restoring it on the original profile
      if (loserBefore.user_id) {
        await adminClient.from("profiles").update({ user_id: null })
          .eq("user_id", loserBefore.user_id as string);
      }

      // Restore the deleted profile with its original id and data
      const { error: insErr } = await adminClient.from("profiles").upsert(loserBefore as never);
      if (insErr) throw insErr;

      // Restore the winner's original field values
      const restore: Record<string, unknown> = {};
      for (const f of [...MERGEABLE, "user_id"]) restore[f] = winnerBefore[f] ?? null;
      const { error: wErr } = await adminClient.from("profiles").update(restore).eq("id", log.winner_id);
      if (wErr) throw wErr;

      // Move reassigned records back
      const moved = (log.moved || {}) as Record<string, string[]>;
      for (const id of moved.bookings_liberty || []) {
        await adminClient.from("bookings").update({ liberty_id: log.loser_id }).eq("id", id);
      }
      for (const id of moved.bookings_mentor || []) {
        await adminClient.from("bookings").update({ mentor_id: log.loser_id }).eq("id", id);
      }
      for (const id of moved.nps_mentor || []) {
        await adminClient.from("nps_responses").update({ mentor_id: log.loser_id }).eq("id", id);
      }

      await adminClient.from("profile_merge_log")
        .update({ undone_at: new Date().toISOString(), undone_by: caller.id })
        .eq("id", logId);

      return json({ success: true, restored_profile_id: log.loser_id });
    }

    // --------------------------------------------------------------- MERGE ---
    const { winner_id, loser_id } = body;
    if (!winner_id || !loser_id || winner_id === loser_id) {
      return json({ error: "winner_id e loser_id são obrigatórios e distintos" }, 400);
    }

    const { data: winner } = await adminClient.from("profiles").select("*").eq("id", winner_id).maybeSingle();
    const { data: loser } = await adminClient.from("profiles").select("*").eq("id", loser_id).maybeSingle();
    if (!winner || !loser) return json({ error: "Perfil não encontrado" }, 404);

    // Hierarquia: perfis com conta de admin/super_admin só podem ser mesclados por super_admin
    await assertCanManageUserId(ctx, winner.user_id);
    await assertCanManageUserId(ctx, loser.user_id, { destructive: true });

    // ---- Safety guards: never merge two different people -------------------
    const wp = nameParts(winner.full_name);
    const lp = nameParts(loser.full_name);
    const firstOk = wp[0] && lp[0] && (wp[0] === lp[0] || wp[0].startsWith(lp[0]) || lp[0].startsWith(wp[0]));
    const lastOk = wp.length > 0 && lp.length > 0 && wp[wp.length - 1] === lp[lp.length - 1];
    const sameFullName = norm(winner.full_name) === norm(loser.full_name);

    const emailsDiffer =
      !!winner.email && !!loser.email && norm(winner.email) !== norm(loser.email);
    const bothHaveAuth = !!winner.user_id && !!loser.user_id && winner.user_id !== loser.user_id;

    const blockers: string[] = [];
    if (!sameFullName && (!firstOk || !lastOk)) {
      blockers.push(
        `os nomes são de pessoas diferentes: "${winner.full_name?.trim()}" e "${loser.full_name?.trim()}"`,
      );
    }
    if (emailsDiffer) {
      blockers.push(`os e-mails são diferentes: ${winner.email} e ${loser.email}`);
    }
    if (bothHaveAuth) {
      blockers.push("os dois perfis têm conta de acesso própria — um dos acessos seria removido");
    }

    if (blockers.length > 0) {
      return json(
        {
          error: `Mesclagem bloqueada por segurança: ${blockers.join("; ")}.`,
          blocked: true,
          blockers,
          winner: { id: winner.id, full_name: winner.full_name, email: winner.email, has_login: !!winner.user_id },
          loser: { id: loser.id, full_name: loser.full_name, email: loser.email, has_login: !!loser.user_id },
        },
        409,
      );
    }

    // Different programs are different identities for merge purposes. This is
    // deliberately not overrideable from the client.
    if (winner.member_tier !== loser.member_tier) {
      return json(
        {
          error: `Mesclagem bloqueada por segurança: os perfis são de programas diferentes (${winner.member_tier} e ${loser.member_tier}).`,
          blocked: true,
          blockers: ["programas diferentes"],
        },
        409,
      );
    }

    // ---- Snapshot everything BEFORE touching anything (reversible) ---------
    const { data: loserBookingsLiberty } = await adminClient
      .from("bookings").select("id").eq("liberty_id", loser_id);
    const { data: loserBookingsMentor } = await adminClient
      .from("bookings").select("id").eq("mentor_id", loser_id);
    const { data: loserNps } = await adminClient
      .from("nps_responses").select("id").eq("mentor_id", loser_id);

    const moved = {
      bookings_liberty: (loserBookingsLiberty || []).map((r) => r.id),
      bookings_mentor: (loserBookingsMentor || []).map((r) => r.id),
      nps_mentor: (loserNps || []).map((r) => r.id),
    };

    const { data: logRow, error: logErr } = await adminClient
      .from("profile_merge_log")
      .insert({
        winner_id,
        loser_id,
        winner_name: winner.full_name,
        loser_name: loser.full_name,
        winner_before: winner,
        loser_before: loser,
        moved,
        performed_by: caller.id,
      })
      .select("id")
      .maybeSingle();
    if (logErr) throw logErr;

    // 1) Merge profile fields — winner wins; fill nulls from loser
    const updates: Record<string, unknown> = {};
    for (const f of MERGEABLE) {
      if ((winner as any)[f] == null && (loser as any)[f] != null) updates[f] = (loser as any)[f];
    }
    if (winner.member_tier !== "liberty" && loser.member_tier === "liberty") updates.member_tier = "liberty";

    // 2) Reassign bookings & related records (by profile.id)
    await adminClient.from("bookings").update({ liberty_id: winner_id }).eq("liberty_id", loser_id);
    await adminClient.from("bookings").update({ mentor_id: winner_id }).eq("mentor_id", loser_id);
    await adminClient.from("nps_responses").update({ mentor_id: winner_id }).eq("mentor_id", loser_id);

    // 3) Auth account handling
    const loserUserId = loser.user_id as string | null;
    let deleteLoserAuth = false;

    if (loserUserId && !winner.user_id) {
      await adminClient.from("profiles").update({ user_id: null }).eq("id", loser_id);
      updates.user_id = loserUserId;
    } else if (loserUserId && winner.user_id && loserUserId !== winner.user_id) {
      const winnerUserId = winner.user_id as string;
      await adminClient.from("notifications").update({ user_id: winnerUserId }).eq("user_id", loserUserId);
      await adminClient.from("push_subscriptions").delete().eq("user_id", loserUserId);
      await adminClient.from("user_roles").delete().eq("user_id", loserUserId);
      await adminClient.from("profiles").update({ user_id: null }).eq("id", loser_id);
      deleteLoserAuth = true;
    }

    // 4) Apply winner updates
    if (Object.keys(updates).length > 0) {
      const { error: uErr } = await adminClient.from("profiles").update(updates).eq("id", winner_id);
      if (uErr) throw uErr;
    }

    // 5) Delete loser profile (snapshot kept in profile_merge_log for undo)
    const { error: dErr } = await adminClient.from("profiles").delete().eq("id", loser_id);
    if (dErr) throw dErr;

    // 6) Never delete the auth account automatically — keeps the merge reversible.
    //    (deleteLoserAuth is recorded only for the admin's information)

    return json({ success: true, log_id: logRow?.id ?? null, auth_kept: deleteLoserAuth });
  } catch (err) {
    return toResponse(err);
  }
});
