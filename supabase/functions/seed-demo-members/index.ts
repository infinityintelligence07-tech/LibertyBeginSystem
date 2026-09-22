import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? "create";

    const members = [
      {
        email: "demo.novo@libertydemo.com",
        full_name: "Beatriz Demo (Novo)",
        password: "Demo@2026",
        onboarding_completed: false,
        phone: "(11) 90000-0001",
      },
      {
        email: "demo.completo@libertydemo.com",
        full_name: "Rafaela Demo (Completa)",
        password: "Demo@2026",
        onboarding_completed: true,
        phone: "(11) 90000-0002",
        company_name: "Demo Confeitaria",
        company_segment: "Alimentação",
        business_description: "Confeitaria artesanal",
        company_instagram: "@demo.confeitaria",
        business_age: "3 anos",
        employees_count: "4",
        monthly_revenue: "R$ 35.000",
        profit_margin: "20%",
        birth_date: "1990-05-15",
        city_state: "São Paulo/SP",
        marital_status: "Casada",
        dietary_restriction: "Nenhuma",
        favorite_chocolate: "Meio amargo",
        personal_story: "Empreendedora há 3 anos no ramo de confeitaria.",
        would_buy_self: "Sim",
        financial_control: "Planilha",
        uses_dre: "Sim",
        costs_expenses: "Controlados",
        financial_challenge: "Aumentar margem",
        challenge_2026: "Abrir segunda loja",
        dream_2026: "Faturar R$ 100k/mês",
        program_expectation: "Estruturar o negócio",
        sector_to_develop: "Marketing",
        vision_6_months: "Loja consolidada",
        main_pain: "Falta de tempo",
      },
    ];

    if (action === "delete") {
      const results: any[] = [];
      for (const m of members) {
        // Find user
        let uid: string | null = null;
        for (let page = 1; page < 20 && !uid; page++) {
          const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          const found = list?.users?.find((u: any) => (u.email || "").toLowerCase() === m.email);
          if (found) uid = found.id;
          if (!list || (list.users?.length || 0) < 200) break;
        }
        if (uid) {
          await admin.auth.admin.deleteUser(uid);
          results.push({ email: m.email, deleted: true });
        } else {
          results.push({ email: m.email, deleted: false, reason: "not found" });
        }
      }
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];
    for (const m of members) {
      const { email, password, full_name, ...profileFields } = m;
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (cErr || !created?.user) {
        results.push({ email, error: cErr?.message });
        continue;
      }
      const uid = created.user.id;
      await admin.from("profiles").upsert(
        { user_id: uid, email, full_name, member_tier: "liberty", ...profileFields },
        { onConflict: "user_id" }
      );
      await admin.from("user_roles").upsert(
        { user_id: uid, role: "liberty" },
        { onConflict: "user_id,role" }
      );
      results.push({ email, password, user_id: uid });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
