// Importa/atualiza membros a partir da planilha completa. Só admin/super_admin.
// Cria a conta com senha aleatória (devolvida em `results[].password`) quando o
// membro ainda não tem acesso. Nunca registra senhas em logs.
import { handleOptions, json, errorJson } from "../_shared/cors.ts";
import { requireRole, toResponse, ADMIN_ROLES } from "../_shared/auth.ts";
import { normalizeEmail, findProfilesByEmail, ensureAuthUserForEmail, linkProfileToUser } from "../_shared/accounts.ts";

interface MemberInput {
  full_name: string;
  email: string;
  [key: string]: unknown;
}

interface UpsertResult {
  email: string;
  full_name: string;
  status: "created" | "updated" | "error";
  password?: string;
  message?: string;
}

const PROFILE_FIELDS = [
  "phone","company_name","program_start_date","program_end_date","member_tier",
  "birth_date","marital_status","city_state","instagram_personal","personal_story",
  "favorite_chocolate","dietary_restriction","company_segment","company_address",
  "business_description","business_story","company_instagram","business_age","employees_count",
  "employees_count_num","leaders_count",
  "monthly_revenue","profit_margin","would_buy_self","financial_control","uses_dre",
  "costs_expenses","financial_challenge","challenge_2026","dream_2026",
  "program_expectation","main_pain","vision_6_months","sector_to_develop",
];

const DATE_FIELDS = new Set(["program_start_date", "program_end_date", "birth_date"]);
const INT_FIELDS = new Set(["employees_count_num", "leaders_count"]);

function sanitizeDate(s: string): string | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function buildUpdate(m: MemberInput): Record<string, unknown> {
  const upd: Record<string, unknown> = {};
  if (m.full_name) upd.full_name = String(m.full_name).trim();
  for (const f of PROFILE_FIELDS) {
    const v = m[f];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    if (DATE_FIELDS.has(f)) {
      const safe = sanitizeDate(s);
      if (safe) upd[f] = safe;
      continue;
    }
    if (INT_FIELDS.has(f)) {
      const n = parseInt(s.replace(/\D/g, ""), 10);
      if (!Number.isNaN(n)) upd[f] = n;
      continue;
    }
    if (f === "member_tier") {
      upd[f] = s.toLowerCase() === "liberty" ? "liberty" : "begin";
    } else {
      upd[f] = s;
    }
  }
  return upd;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    const admin = ctx.supabaseAdmin;

    const body = await req.json().catch(() => ({}));
    const members: MemberInput[] = Array.isArray(body?.members) ? body.members : [];
    if (members.length === 0) return errorJson("Nenhum membro enviado", 400);

    const results: UpsertResult[] = [];

    for (const m of members) {
      const email = normalizeEmail(m.email);
      const full_name = String(m.full_name || "").trim();
      if (!email || !full_name) {
        results.push({ email, full_name, status: "error", message: "Nome e e-mail obrigatórios" });
        continue;
      }

      try {
        const existingList = await findProfilesByEmail(admin, email);
        const existing = existingList.find((p) => p.user_id) ?? existingList[0] ?? null;
        const update = buildUpdate(m);

        if (existing) {
          if (Object.keys(update).length > 0) {
            const { error: uErr } = await admin.from("profiles").update(update).eq("id", existing.id);
            if (uErr) throw uErr;
          }
          if (existing.user_id) {
            results.push({ email, full_name, status: "updated", message: "Perfil atualizado" });
          } else {
            // Perfil existente sem acesso: cria a conta e vincula
            const account = await ensureAuthUserForEmail(admin, { email, fullName: full_name, profileId: existing.id });
            await linkProfileToUser(admin, { profileId: existing.id, userId: account.userId, role: "liberty" });
            results.push({ email, full_name, status: "updated", password: account.password, message: "Perfil atualizado e acesso criado" });
          }
          continue;
        }

        const account = await ensureAuthUserForEmail(admin, { email, fullName: full_name });
        const userId = account.userId;
        const { error: profileError } = await admin
          .from("profiles")
          .upsert({ ...update, user_id: userId, full_name, email }, { onConflict: "user_id" });
        if (profileError) {
          if (!account.linkedExisting) await admin.auth.admin.deleteUser(userId);
          results.push({ email, full_name, status: "error", message: profileError.message });
          continue;
        }
        const { error: roleError } = await admin
          .from("user_roles")
          .upsert({ user_id: userId, role: "liberty" }, { onConflict: "user_id,role" });
        if (roleError) {
          if (!account.linkedExisting) await admin.auth.admin.deleteUser(userId);
          results.push({ email, full_name, status: "error", message: roleError.message });
          continue;
        }
        results.push({ email, full_name, status: "created", password: account.password });
      } catch (err) {
        let message = (err as Error).message || "Erro desconhecido";
        if (err instanceof Response) {
          try { message = ((await err.json()) as { error?: string }).error || message; } catch { /* ignore */ }
        }
        results.push({ email, full_name, status: "error", message });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter(r => r.status === "created").length,
      updated: results.filter(r => r.status === "updated").length,
      errors: results.filter(r => r.status === "error").length,
    };

    return json({ success: true, summary, results });
  } catch (err) {
    return toResponse(err);
  }
});
