import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.99.2/cors";

const MENTORS: { full_name: string; email: string; sessions: string[] }[] = [
  { full_name: "Lucas Garcez", email: "lucas.garcez@libertybegin.com", sessions: ["Cultura Organizacional", "SWOT Inovações", "Organograma", "Marketing de Tração", "Equipe Autogerenciável"] },
  { full_name: "Morgana Costa", email: "morgana.costa@libertybegin.com", sessions: ["Organograma", "Financeiro 2"] },
  { full_name: "Richard Costa", email: "richard.costa@libertybegin.com", sessions: ["Mapa do Negócio", "Financeiro 1"] },
  { full_name: "Rinaldo Alves", email: "rinaldo.alves@libertybegin.com", sessions: ["Gestão de Processos"] },
  { full_name: "Rubens Júnior", email: "rubens.junior@libertybegin.com", sessions: ["Mapa do Negócio", "Gestão de Processos"] },
  { full_name: "Matheus Cardoso", email: "matheus.cardoso@libertybegin.com", sessions: ["Branding Book", "Marketing de Tração"] },
  { full_name: "Djeniffer", email: "djeniffer@libertybegin.com", sessions: ["Vendas", "Liderança"] },
  { full_name: "Patrícia Zordenunes", email: "patricia.zordenunes@libertybegin.com", sessions: ["Equipe Autogerenciável"] },
  { full_name: "Samuel Castilho", email: "samuel.castilho@libertybegin.com", sessions: ["Liderança", "Organograma", "Cultura Organizacional"] },
];

function genPwd() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (const b of bytes) out += abc[b % abc.length];
  return out + "!" + Math.floor(Math.random() * 90 + 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Require an authenticated admin/super_admin caller.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const anonClient = createClient(url, anon);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: uErr } = await anonClient.auth.getUser(token);
    if (uErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(url, srk);
    const { data: roleData } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id)
      .in("role", ["admin", "super_admin"]).maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load sessions catalog
    const { data: sessions } = await admin.from("sessions").select("id, name");
    const sessionByName = new Map((sessions || []).map((s: any) => [s.name, s.id]));

    const results: any[] = [];
    for (const m of MENTORS) {
      try {
        const { data: existing } = await admin.from("profiles").select("id, user_id").eq("email", m.email).maybeSingle();
        let profileId = existing?.id as string | undefined;
        let userId = existing?.user_id as string | undefined;
        let password: string | undefined;

        if (!profileId) {
          password = genPwd();
          const { data: newUser, error: cErr } = await admin.auth.admin.createUser({
            email: m.email, password, email_confirm: true, user_metadata: { full_name: m.full_name },
          });
          if (cErr || !newUser?.user) { results.push({ email: m.email, status: "error", message: cErr?.message }); continue; }
          userId = newUser.user.id;
          const { data: prof } = await admin.from("profiles").select("id").eq("user_id", userId).single();
          profileId = prof?.id;
        }

        if (userId) {
          await admin.from("user_roles").upsert({ user_id: userId, role: "mentor" }, { onConflict: "user_id,role" });
        }

        const sessionIds = m.sessions.map((n) => sessionByName.get(n)).filter(Boolean) as string[];
        for (const sid of sessionIds) {
          const { data: ex } = await admin.from("mentor_sessions").select("id").eq("mentor_id", profileId).eq("session_id", sid).maybeSingle();
          if (!ex) await admin.from("mentor_sessions").insert({ mentor_id: profileId, session_id: sid, is_active: true });
        }

        results.push({ email: m.email, status: existing ? "updated" : "created", password, sessions: sessionIds.length });
      } catch (e) {
        results.push({ email: m.email, status: "error", message: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
