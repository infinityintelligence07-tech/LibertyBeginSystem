import { useState, useMemo, useRef, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { AdminMonthFilter } from "@/components/AdminMonthFilter";
import { useAdminFilter } from "@/contexts/AdminFilterContext";
import { useMembers, useSessionCatalog } from "@/hooks/useAdminData";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { initials, toTitleCase, shortName, normalizeText, matchesSearch } from "@/lib/formatName";
import { Search, ChevronDown, ChevronUp, Users, Target, CheckCircle2, AlertTriangle, Plus, Edit, Trash2, Upload, Download, KeyRound, Loader2, AlertCircle, UserCog, Send, Power, ListTodo, Copy, GitMerge } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { MemberSessionEditor } from "@/components/MemberSessionEditor";
import { AdminMemberNote } from "@/components/AdminMemberNote";
import { LibertyMark } from "@/components/LibertyMark";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AvatarUpload } from "@/components/AvatarUpload";
import { AccessCredentialsDialog, AccessCredentialsData } from "@/components/AccessCredentialsDialog";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface MemberForm {
  full_name: string;
  email: string;
  company_name: string;
  phone: string;
  program_start_date: string;
  program_end_date: string;
  member_tier: "begin" | "liberty";
}

const emptyForm: MemberForm = {
  full_name: "",
  email: "",
  company_name: "",
  phone: "",
  program_start_date: "",
  program_end_date: "",
  member_tier: "begin",
};

interface ImportResult {
  email: string;
  full_name: string;
  status: "created" | "skipped" | "updated" | "error";
  password?: string;
  message?: string;
}

// Full profile template — column header → profile field key
const FULL_TEMPLATE_COLUMNS: { header: string; field: string; example: string }[] = [
  { header: "Nome Completo", field: "full_name", example: "Maria Silva" },
  { header: "E-mail", field: "email", example: "maria.silva@empresa.com" },
  { header: "Telefone", field: "phone", example: "(11) 98765-4321" },
  { header: "Tipo de Membro", field: "member_tier", example: "begin" },
  { header: "Data de Início", field: "program_start_date", example: "2026-01-15" },
  { header: "Data de Término", field: "program_end_date", example: "2026-12-15" },
  { header: "Data de Nascimento", field: "birth_date", example: "1985-04-22" },
  { header: "Estado Civil", field: "marital_status", example: "Casado(a)" },
  { header: "Cidade/Estado", field: "city_state", example: "São Paulo/SP" },
  { header: "Instagram Pessoal", field: "instagram_personal", example: "@mariasilva" },
  { header: "História Pessoal", field: "personal_story", example: "Empreendedora há 8 anos..." },
  { header: "Chocolate Favorito", field: "favorite_chocolate", example: "Lacta ao leite" },
  { header: "Restrição Alimentar", field: "dietary_restriction", example: "Sem glúten" },
  { header: "Empresa", field: "company_name", example: "Empresa Exemplo Ltda" },
  { header: "Segmento da Empresa", field: "company_segment", example: "Varejo de moda" },
  { header: "Endereço da Empresa", field: "company_address", example: "Rua X, 123 - São Paulo/SP" },
  { header: "Descrição do Negócio", field: "business_description", example: "Loja de roupas femininas..." },
  { header: "Instagram da Empresa", field: "company_instagram", example: "@empresa" },
  { header: "Idade do Negócio", field: "business_age", example: "5 anos" },
  { header: "Nº de Funcionários", field: "employees_count", example: "12" },
  { header: "Faturamento Mensal", field: "monthly_revenue", example: "R$ 80.000" },
  { header: "Margem de Lucro", field: "profit_margin", example: "15%" },
  { header: "Compraria de si mesmo?", field: "would_buy_self", example: "Sim" },
  { header: "Controle Financeiro", field: "financial_control", example: "Planilha mensal" },
  { header: "Usa DRE?", field: "uses_dre", example: "Sim" },
  { header: "Custos e Despesas", field: "costs_expenses", example: "R$ 50.000/mês" },
  { header: "Desafio Financeiro", field: "financial_challenge", example: "Fluxo de caixa" },
  { header: "Desafio 2026", field: "challenge_2026", example: "Dobrar o faturamento" },
  { header: "Sonho 2026", field: "dream_2026", example: "Abrir segunda loja" },
  { header: "Expectativa do Programa", field: "program_expectation", example: "Estruturar a gestão" },
  { header: "Principal Dor", field: "main_pain", example: "Falta de processos" },
  { header: "Visão em 6 meses", field: "vision_6_months", example: "Equipe estruturada" },
  { header: "Setor a Desenvolver", field: "sector_to_develop", example: "Marketing" },
];

// Aliases para mapeamento flexível dos cabeçalhos da planilha original
const FIELD_ALIASES: Record<string, string[]> = {
  full_name: ["nome completo", "nome e sobrenome", "nome do membro", "nome do aluno", "qual seu nome", "nome", "name"],
  email: ["e-mail", "email", "e mail", "endereço de email", "endereco de email", "endereço de e-mail", "seu melhor email", "login"],
  phone: ["telefone", "telefone whatsapp", "telefone/whatsapp", "celular", "whatsapp", "whatssapp", "contato", "numero", "número", "phone", "tel"],
  member_tier: ["tipo de membro", "plano", "turma", "categoria", "tipo", "tier"],
  program_start_date: ["data de início", "data inicio", "início do programa", "inicio do programa", "início", "inicio", "start"],
  program_end_date: ["data de término", "data termino", "término", "termino", "fim", "end"],
  birth_date: ["nascimento", "data de nascimento", "data nascimento", "aniversário", "aniversario", "birth"],
  marital_status: ["estado civil", "civil"],
  city_state: ["cidade", "estado", "cidade/estado", "cidade e estado", "uf", "localidade", "onde mora"],
  instagram_personal: ["instagram pessoal", "insta pessoal", "instagram", "@ pessoal"],
  personal_story: ["história pessoal", "historia pessoal", "sua história", "sua historia", "conte sobre você", "conte sobre voce"],
  favorite_chocolate: ["chocolate"],
  dietary_restriction: ["restrição alimentar", "restricao alimentar", "alergia", "alimentar"],
  company_name: ["empresa", "nome da empresa", "nome do negócio", "nome do negocio", "razão social", "razao social"],
  company_segment: ["segmento", "ramo", "setor da empresa", "segmento da empresa", "nicho", "mercado de atuação", "mercado de atuacao"],
  company_address: ["endereço", "endereco", "endereço da empresa"],
  business_description: ["descrição do negócio", "descricao do negocio", "sobre a empresa", "o que faz", "descrição"],
  company_instagram: ["instagram da empresa", "instagram do negócio", "instagram do negocio", "@ empresa"],
  business_age: ["idade do negócio", "idade do negocio", "tempo de empresa", "anos de empresa", "há quanto tempo"],
  employees_count: ["funcionários", "funcionarios", "colaboradores", "equipe", "nº de funcionários"],
  monthly_revenue: ["faturamento", "receita mensal", "faturamento mensal"],
  profit_margin: ["margem", "margem de lucro", "lucro"],
  would_buy_self: ["compraria de si", "compraria de você", "compraria de voce", "compraria"],
  financial_control: ["controle financeiro", "controle"],
  uses_dre: ["dre", "usa dre"],
  costs_expenses: ["custos", "despesas", "custos e despesas"],
  financial_challenge: ["desafio financeiro", "dificuldade financeira"],
  challenge_2026: ["desafio 2026", "desafio do ano", "maior desafio"],
  dream_2026: ["sonho 2026", "sonho", "meta 2026"],
  program_expectation: ["expectativa", "expectativa do programa", "o que espera"],
  main_pain: ["principal dor", "dor principal", "dor", "maior dor"],
  vision_6_months: ["visão", "visao", "6 meses"],
  sector_to_develop: ["setor a desenvolver", "área a desenvolver", "area a desenvolver", "desenvolver"],
};

const IGNORED_HEADERS = ["carimbo de data", "timestamp", "data e hora", "hora de envio", "id", "pontuação", "pontuacao"];
const DATE_FIELDS = new Set(["program_start_date", "program_end_date", "birth_date"]);

const normalizeHeader = (h: string) =>
  h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const matchHeaderToField = (header: string): string | null => {
  const norm = normalizeHeader(header);
  if (!norm || IGNORED_HEADERS.some((h) => norm.includes(normalizeHeader(h)))) return null;
  // exact match against template headers
  for (const c of FULL_TEMPLATE_COLUMNS) {
    if (normalizeHeader(c.header) === norm) return c.field;
  }
  // alias keyword match
  let best: { field: string; score: number } | null = null;
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const a of aliases) {
      const an = normalizeHeader(a);
      if (!an) continue;
      if (norm === an || norm.includes(an) || an.includes(norm)) {
        const score = an.length;
        if (!best || score > best.score) best = { field, score };
      }
    }
  }
  return best?.field || null;
};

const extractEmail = (v: unknown) => {
  const match = String(v ?? "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0]?.trim() || "";
};

const buildDate = (y: number, mo: number, d: number, isBirth: boolean): string | undefined => {
  // Auto-swap day/month if month invalid but day looks like month
  if (mo > 12 && d <= 12) { const t = mo; mo = d; d = t; }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  // Handle 2-digit year heuristics
  if (y < 100) {
    const curYY = new Date().getFullYear() % 100;
    y = y <= curYY + 5 ? 2000 + y : 1900 + y;
  }
  // For birth dates, future years are clearly off (e.g. 2077 should be 1977)
  if (isBirth && y > new Date().getFullYear() - 5) {
    if (y >= 2000 && y <= 2099) y -= 100;
  }
  if (y < 1900 || y > 2100) return undefined;
  // Validate real calendar date
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

const parseImportDate = (v: unknown, field?: string): string | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const isBirth = field === "birth_date";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return buildDate(v.getFullYear(), v.getMonth() + 1, v.getDate(), isBirth);
  }
  if (typeof v === "number" && v > 1 && v < 80000) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed) return buildDate(parsed.y, parsed.m, parsed.d, isBirth);
  }
  const s = String(v).trim();
  if (!s) return undefined;
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), isBirth);
  const serial = Number(s.replace(",", "."));
  if (Number.isFinite(serial) && serial > 1 && serial < 80000 && !s.includes("/") && !s.includes("-")) {
    return parseImportDate(serial, field);
  }
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) return buildDate(Number(m[3]), Number(m[2]), Number(m[1]), isBirth);
  return undefined;
};

const cleanImportedValue = (field: string, value: unknown) => {
  if (DATE_FIELDS.has(field)) return parseImportDate(value, field);
  if (field === "email") return extractEmail(value);
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (["full_name", "company_name", "city_state"].includes(field)) return toTitleCase(text);
  if (field === "member_tier") return normalizeHeader(text).includes("liberty") ? "liberty" : "begin";
  return text;
};

const AdminMembrosPage = () => {
  const { data: members, isLoading } = useMembers();
  const { data: sessions } = useSessionCatalog();
  const { mode, monthKey } = useAdminFilter();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "on_track" | "behind" | "zero" | "no_bookings">("all");
  const [sortMode, setSortMode] = useState<"name" | "priority">("name");
  const [tierTab, setTierTab] = useState<"begin" | "liberty" | "inactive">("begin");
  const [reportModal, setReportModal] = useState<{ booking_id: string; session_name: string } | null>(null);

  // Apply URL params on mount (e.g. ?filter=on_track or ?expand=<id>)
  useEffect(() => {
    const f = searchParams.get("filter");
    if (f && ["all", "on_track", "behind", "zero", "no_bookings"].includes(f)) {
      setFilter(f as any);
    }
    const ex = searchParams.get("expand");
    if (ex) setExpandedId(ex);
  }, [searchParams]);
  
  // CRUD state
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Translate common backend errors to Portuguese for friendly display
  const translateErrorToPt = (msg: string): string => {
    if (!msg) return "Ocorreu um erro inesperado. Tente novamente.";
    const m = msg.toLowerCase();
    if (/edge function|non-2xx|failed to fetch|networkerror|failed to send/i.test(m))
      return "Falha de comunicação com o servidor. Verifique sua conexão e tente novamente.";
    if (/already.*(registered|exists)|duplicate|já existe/i.test(m))
      return "Este registro já existe no sistema.";
    if (/invalid.*token|jwt|unauthor/i.test(m))
      return "Sessão expirada. Faça login novamente.";
    if (/not authorized|forbidden|permission/i.test(m))
      return "Você não tem permissão para esta ação.";
    if (/invalid.*email/i.test(m)) return "E-mail inválido.";
    if (/password/i.test(m) && /short|weak|min/i.test(m)) return "Senha muito curta ou fraca.";
    if (/missing.*required|required field/i.test(m)) return "Preencha os campos obrigatórios.";
    if (/timeout/i.test(m)) return "Tempo esgotado. Tente novamente.";
    // Already Portuguese? return as-is
    if (/[áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]|não|já|erro|falha|inválid/i.test(msg)) return msg;
    return msg;
  };

  // Read structured error body from a Supabase Functions error (non-2xx)
  const readFnError = async (error: unknown): Promise<{ status?: number; message: string }> => {
    const err = error as { message?: string; context?: Response };
    let msg = err?.message || "Erro desconhecido";
    let status: number | undefined;
    try {
      const ctx = err?.context;
      if (ctx) {
        status = ctx.status;
        if (typeof ctx.json === "function") {
          const body = await ctx.clone().json();
          if (body?.error) msg = body.error;
        }
      }
    } catch { /* ignore */ }
    return { status, message: msg };
  };


  // Import state
  const fileRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importTier, setImportTier] = useState<"begin" | "liberty">("begin");
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [importSummary, setImportSummary] = useState<{ total: number; created: number; skipped?: number; updated?: number; errors: number } | null>(null);

  const downloadFullTemplate = () => {
    const headers = FULL_TEMPLATE_COLUMNS.map(c => c.header);
    const example = FULL_TEMPLATE_COLUMNS.map(c => c.example);
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = headers.map(h => ({ wch: Math.max(18, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Membros (completo)");
    XLSX.writeFile(wb, "modelo_membros_completo.xlsx");
    toast.success("Modelo completo baixado");
  };

  const downloadCredentials = () => {
    if (!importResults) return;
    const created = importResults.filter((r) => r.status === "created");
    if (created.length === 0) { toast.error("Nenhuma credencial gerada"); return; }
    const rows = [
      ["Nome Completo", "E-mail (login)", "Senha temporária"],
      ...created.map((r) => [r.full_name, r.email, r.password ?? ""]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 28 }, { wch: 32 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Credenciais");
    XLSX.writeFile(wb, `credenciais_membros_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Credenciais baixadas");
  };

  // Export active members to a well-organized spreadsheet (Begin + Liberty sheets)
  const exportActiveMembers = () => {
    const active = (members || []).filter((m) => m.is_active !== false && !m.full_name.includes("(demo)"));
    if (active.length === 0) { toast.error("Nenhum membro ativo para exportar"); return; }

    const fmtDate = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—");
    const headers = [
      "Nome", "Empresa", "E-mail", "Telefone", "Tipo",
      "Início do programa", "Encerramento previsto",
      "Sessões realizadas", "Sessões agendadas", "Progresso (12)",
      "Próxima sessão", "Última sessão", "Tarefas pendentes",
    ];
    const cols = [
      { wch: 30 }, { wch: 28 }, { wch: 30 }, { wch: 18 }, { wch: 10 },
      { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
      { wch: 16 }, { wch: 16 }, { wch: 16 },
    ];

    const toRow = (m: typeof active[number]) => [
      toTitleCase(m.full_name),
      m.company_name || "—",
      m.email || "—",
      m.phone || "—",
      m.member_tier === "liberty" ? "Liberty" : "Begin",
      fmtDate(m.program_start_date),
      fmtDate(m.program_end_date),
      m.total_completed,
      m.total_scheduled,
      `${Math.min(100, Math.round((m.total_completed / 12) * 100))}%`,
      m.has_next_session ? "Sim" : "Não",
      fmtDate(m.last_session_date),
      m.pending_tasks_count,
    ];

    const buildSheet = (list: typeof active) => {
      const sorted = [...list].sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));
      const ws = XLSX.utils.aoa_to_sheet([headers, ...sorted.map(toRow)]);
      ws["!cols"] = cols;
      ws["!freeze"] = { xSplit: "0", ySplit: "1" } as any;
      ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sorted.length, c: headers.length - 1 } }) };
      return ws;
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildSheet(active), "Todos os ativos");
    const begin = active.filter((m) => m.member_tier === "begin");
    const liberty = active.filter((m) => m.member_tier === "liberty");
    if (begin.length) XLSX.utils.book_append_sheet(wb, buildSheet(begin), "Begin");
    if (liberty.length) XLSX.utils.book_append_sheet(wb, buildSheet(liberty), "Liberty");

    const resumo = XLSX.utils.aoa_to_sheet([
      ["Relatório de membros ativos"],
      ["Gerado em", new Date().toLocaleString("pt-BR")],
      [],
      ["Indicador", "Valor"],
      ["Membros ativos (total)", active.length],
      ["Membros Begin", begin.length],
      ["Membros Liberty", liberty.length],
      ["Sessões realizadas (total)", active.reduce((s, m) => s + m.total_completed, 0)],
      ["Sessões agendadas (total)", active.reduce((s, m) => s + m.total_scheduled, 0)],
      ["Jornadas completas (12 sessões)", active.filter((m) => m.total_completed >= 12).length],
      ["Sem nenhuma sessão realizada", active.filter((m) => m.total_completed === 0).length],
    ]);
    resumo["!cols"] = [{ wch: 34 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, resumo, "Resumo");

    XLSX.writeFile(wb, `membros_ativos_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${active.length} membros exportados`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResults(null);
    setImportSummary(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
      const headerIndex = rawRows.findIndex((row) =>
        row.filter((cell) => matchHeaderToField(String(cell || ""))).length >= 2
      );
      if (headerIndex < 0) throw new Error("Não consegui identificar Nome e E-mail na planilha");

      const headers = rawRows[headerIndex].map((h) => String(h || "").trim());
      const headerMap: Record<string, string> = {};
      headers.forEach((rawHeader, index) => {
        const field = matchHeaderToField(rawHeader);
        if (field && !Object.values(headerMap).includes(field)) {
          headerMap[String(index)] = field;
        }
      });

      const members = rawRows.slice(headerIndex + 1).map((row) => {
        const out: Record<string, unknown> = {};
        for (const [index, field] of Object.entries(headerMap)) {
          const value = cleanImportedValue(field, row[Number(index)]);
          if (value !== undefined && value !== "") out[field] = value;
        }
        if (!out.member_tier) out.member_tier = importTier;
        return out as { full_name?: string; email?: string };
      }).filter((m) => m.full_name && m.email);

      if (members.length === 0) { toast.error("Nenhum membro válido na planilha"); setImporting(false); return; }
      const { data, error } = await supabase.functions.invoke("bulk-upsert-members-full", { body: { members } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na importação");
      setImportResults(data.results);
      setImportSummary(data.summary);
      toast.success(`${data.summary.created} criados · ${data.summary.updated} atualizados`);
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
    } catch (err) {
      toast.error((err as Error).message || "Erro ao processar planilha");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const filterKey = mode === "month" ? monthKey : null;

  const { data: mentorsList } = useQuery({
    queryKey: ["mentors-list"],
    queryFn: async () => {
      const { data: roleRows, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "mentor");
      if (rErr) throw rErr;
      const ids = (roleRows || []).map((r: any) => r.user_id).filter(Boolean);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("user_id", ids)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: report } = useQuery({
    queryKey: ["booking-report", reportModal?.booking_id],
    queryFn: async () => {
      if (!reportModal) return null;
      const { data, error } = await supabase
        .from("booking_reports")
        .select("*")
        .eq("booking_id", reportModal.booking_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!reportModal?.booking_id,
  });

  const openAdd = () => {
    setForm(emptyForm);
    setEditingMemberId(null);
    setAddOpen(true);
  };

  const openEdit = (member: any) => {
    setForm({
      full_name: member.full_name || "",
      email: member.email || "",
      company_name: member.company_name || "",
      phone: member.phone || "",
      program_start_date: member.program_start_date || "",
      program_end_date: member.program_end_date || "",
      member_tier: member.member_tier === "liberty" ? "liberty" : "begin",
    });
    setEditingMemberId(member.id);
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!editingMemberId && !form.phone.trim()) {
      toast.error("Telefone é obrigatório (e-mail é opcional)");
      return;
    }
    setSaving(true);
    try {
      if (editingMemberId) {
        // Update existing profile (no auth changes)
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: form.full_name.trim(),
            email: form.email.trim() || null,
            company_name: form.company_name.trim() || null,
            phone: form.phone.trim() || null,
            program_start_date: form.program_start_date || null,
            program_end_date: form.program_end_date || null,
            member_tier: form.member_tier,
          } as any)
          .eq("id", editingMemberId);
        if (error) throw error;
        toast.success("Membro atualizado");
        setEditOpen(false);
      } else {
        // Create new member.
        //  - With email -> cria conta de acesso (senha padrão).
        //  - Sem email  -> cria só o cadastro; o acesso pode ser gerado depois.
        const { data, error } = await supabase.functions.invoke("create-user", {
          body: {
            email: form.email.trim() || undefined,
            full_name: form.full_name.trim(),
            role: "liberty",
            phone: form.phone.trim() || undefined,
            company_name: form.company_name.trim() || undefined,
            program_start_date: form.program_start_date || undefined,
            program_end_date: form.program_end_date || undefined,
            member_tier: form.member_tier,
          },
        });
        if (error) {
          // supabase-js swallows the response body on non-2xx — recover it here
          let msg = error.message;
          let status: number | undefined;
          try {
            const ctx = (error as { context?: Response }).context;
            if (ctx) {
              status = ctx.status;
              if (typeof ctx.json === "function") {
                const body = await ctx.clone().json();
                if (body?.error) msg = body.error;
              }
            }
          } catch { /* ignore */ }
          // Duplicate / conflict — mostra aviso, não erro
          if (status === 409 || /já\s+existe|already\s+(been\s+)?registered|duplicate/i.test(msg)) {
            toast.warning("Este membro já está cadastrado", {
              description: msg || "Edite o cadastro existente ou use outro e-mail.",
            });
            setSaving(false);
            return;
          }
          throw new Error(translateErrorToPt(msg));
        }
        if (data?.error) throw new Error(translateErrorToPt(data.error));
        if (data?.password) {
          toast.success(`Membro criado! Senha: ${data.password}`);
        } else {
          toast.success("Membro criado sem acesso. Adicione um e-mail depois para gerar a senha.");
        }
        setAddOpen(false);
      }
      setForm(emptyForm);
      setEditingMemberId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
    } catch (e: any) {
      toast.error(translateErrorToPt(e?.message || "") || "Erro ao salvar membro");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir DEFINITIVAMENTE o membro "${name}"?\n\nIsso remove o acesso, todas as sessões, tarefas, relatórios e notificações associados. Esta ação não pode ser desfeita.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { profile_id: id },
      });
      if (error) {
        const { message } = await readFnError(error);
        throw new Error(translateErrorToPt(message));
      }
      if ((data as any)?.error) throw new Error(translateErrorToPt((data as any).error));
      toast.success("Membro excluído definitivamente");
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
    } catch (e: any) {
      toast.error(translateErrorToPt(e?.message || "") || "Não foi possível excluir o membro");
    }
  };

  const handleRemoveBooking = async (bookingId: string, sessionName: string) => {
    if (!confirm(`Remover a sessão "${sessionName}"? Esta ação apaga o agendamento, tarefas e relatório associados.`)) return;
    try {
      await supabase.from("session_tasks").delete().eq("booking_id", bookingId);
      await supabase.from("booking_reports").delete().eq("booking_id", bookingId);
      const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
      if (error) throw error;
      toast.success("Sessão removida");
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
    } catch (e: any) {
      toast.error(translateErrorToPt(e?.message || "") || "Não foi possível remover a sessão");
    }
  };

  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [credentialsDialog, setCredentialsDialog] = useState<AccessCredentialsData | null>(null);
  const handleInvite = async (member: any) => {
    if (!member.email) { toast.error("Membro sem e-mail cadastrado"); return; }
    const ok = confirm(`Gerar acesso para ${member.full_name}?\n\nIsso vai redefinir a senha para a padrão e abrir uma janela com a mensagem pronta para copiar.`);
    if (!ok) return;
    setInvitingId(member.id);
    try {
      const { data, error } = await supabase.functions.invoke("reset-and-invite", {
        body: { profile_id: member.id },
      });
      if (error) {
        const { message } = await readFnError(error);
        throw new Error(translateErrorToPt(message));
      }
      if (data?.error) throw new Error(translateErrorToPt(data.error));
      setCredentialsDialog({
        full_name: data.full_name || member.full_name,
        email: data.email,
        password: data.password,
        role: data.role === "mentor" ? "mentor" : "liberty",
      });
    } catch (e: any) {
      toast.error(translateErrorToPt(e?.message || "") || "Não foi possível gerar o acesso");
    } finally {
      setInvitingId(null);
    }
  };

  const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);
  const handleToggleActive = async (member: any) => {
    const nextActive = !member.is_active;
    const verb = nextActive ? "reativar" : "inativar";
    const extra = !nextActive ? "\n\nSessões futuras agendadas serão canceladas automaticamente." : "";
    if (!confirm(`Deseja ${verb} o membro "${member.full_name}"?${extra}`)) return;
    setTogglingActiveId(member.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-set-user-active", {
        body: { profile_id: member.id, active: nextActive },
      });
      if (error) {
        const { message } = await readFnError(error);
        throw new Error(translateErrorToPt(message));
      }
      if ((data as any)?.error) throw new Error(translateErrorToPt((data as any).error));
      const cancelled = (data as any)?.cancelledBookings || 0;
      toast.success(
        nextActive
          ? "Membro reativado"
          : `Membro inativado${cancelled ? ` · ${cancelled} sessão(ões) cancelada(s)` : ""}`
      );
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
    } catch (e: any) {
      toast.error(translateErrorToPt(e?.message || "") || "Não foi possível alterar o status");
    } finally {
      setTogglingActiveId(null);
    }
  };

  // ---- Duplicate detection ---------------------------------------------------
  const [dupOpen, setDupOpen] = useState(false);
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<{ winner: any; loser: any; key: string } | null>(null);
  const [mergeBlockers, setMergeBlockers] = useState<string[]>([]);
  const [mergeBusy, setMergeBusy] = useState(false);

  const duplicateGroups = useMemo(() => {
    if (!members) return [] as { key: string; profiles: typeof members }[];
    const groups = new Map<string, typeof members>();
    for (const m of members) {
      const parts = normalizeText(m.full_name).split(" ").filter(Boolean);
      if (parts.length === 0) continue;
      // Group by FIRST + LAST name normalized — both must match exactly,
      // so people like "Edina ... Lisboa" and "Eduardo ... Lisboa" never fall
      // into the same group.
      const key = parts.length === 1 ? parts[0] : `${parts[0]}|${parts[parts.length - 1]}`;
      const arr = groups.get(key) || [];
      arr.push(m);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .filter(([, arr]) => arr.length > 1)
      .map(([key, profiles]) => ({ key, profiles }));
  }, [members]);

  // Merge history (allows undoing a wrong merge)
  const { data: mergeLog, refetch: refetchMergeLog } = useQuery({
    queryKey: ["profile-merge-log"],
    enabled: dupOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_merge_log")
        .select("id, winner_name, loser_name, created_at, undone_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  const openMergeConfirm = (winner: any, loser: any, key: string) => {
    setMergeBlockers([]);
    setMergeTarget({ winner, loser, key });
  };

  const runMerge = async () => {
    if (!mergeTarget) return;
    const { winner, loser, key } = mergeTarget;
    setMergeBusy(true);
    setMergingKey(key + winner.id + loser.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-merge-profiles", {
        body: { winner_id: winner.id, loser_id: loser.id },
      });
      const payload: any = data;
      if (payload?.blocked || (error && payload?.blockers)) {
        setMergeBlockers(payload.blockers || [payload.error]);
        toast.error(payload.error || "Mesclagem bloqueada por segurança");
        return;
      }
      if (error) {
        const { message } = await readFnError(error);
        let parsed: any = null;
        try { parsed = JSON.parse(message); } catch { /* not json */ }
        if (parsed?.blocked || /bloqueada por seguran/i.test(message)) {
          setMergeBlockers(parsed?.blockers || [parsed?.error || message]);
          toast.error(parsed?.error || message);
          return;
        }
        throw new Error(translateErrorToPt(message));
      }
      if (payload?.error) throw new Error(translateErrorToPt(payload.error));
      toast.success("Perfis mesclados. Você pode desfazer no histórico de mesclagens.");
      setMergeTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      refetchMergeLog();
    } catch (e: any) {
      toast.error(translateErrorToPt(e?.message || "") || "Não foi possível mesclar os perfis");
    } finally {
      setMergeBusy(false);
      setMergingKey(null);
    }
  };

  const undoMerge = async (logId: string) => {
    if (!confirm("Desfazer esta mesclagem? O perfil removido será restaurado com os dados e sessões que tinha antes.")) return;
    setMergeBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-merge-profiles", {
        body: { action: "undo", log_id: logId },
      });
      if (error) {
        const { message } = await readFnError(error);
        throw new Error(translateErrorToPt(message));
      }
      if ((data as any)?.error) throw new Error(translateErrorToPt((data as any).error));
      toast.success("Mesclagem desfeita. O perfil foi restaurado.");
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      refetchMergeLog();
    } catch (e: any) {
      toast.error(translateErrorToPt(e?.message || "") || "Não foi possível desfazer a mesclagem");
    } finally {
      setMergeBusy(false);
    }
  };





  const filtered = useMemo(() => {
    if (!members) return [];
    let list = tierTab === "inactive"
      ? members.filter((m) => m.is_active === false)
      : members.filter((m) => m.member_tier === tierTab && m.is_active !== false);
    if (search) {
      list = list.filter(
        (m) => matchesSearch(m.full_name, search) || matchesSearch(m.company_name || "", search) || matchesSearch(m.email || "", search)
      );
    }
    if (filter === "no_bookings") {
      // Sem próxima sessão: nada futuro confirmado nem aguardando confirmação do mentor.
      list = list.filter((m) => !m.has_next_session);
    } else if (filterKey) {
      if (filter === "on_track") list = list.filter((m) => (m.monthly_counts[filterKey] || 0) >= 2);
      else if (filter === "behind") list = list.filter((m) => (m.monthly_counts[filterKey] || 0) === 1);
      else if (filter === "zero") list = list.filter((m) => (m.monthly_counts[filterKey] || 0) === 0);
    } else {
      if (filter === "on_track") list = list.filter((m) => m.total_completed >= 12);
      else if (filter === "behind") list = list.filter((m) => m.total_completed > 0 && m.total_completed < 12);
      else if (filter === "zero") list = list.filter((m) => m.total_completed === 0);
    }
    if (sortMode === "priority") {
      // Priority: no bookings at all → zero completed → least completed → name
      list = [...list].sort((a, b) => {
        const aNoBookings = a.has_next_session ? 1 : 0;
        const bNoBookings = b.has_next_session ? 1 : 0;
        if (aNoBookings !== bNoBookings) return aNoBookings - bNoBookings;
        if (a.total_completed !== b.total_completed) return a.total_completed - b.total_completed;
        return a.full_name.localeCompare(b.full_name);
      });
    }
    return list;
  }, [members, search, filter, filterKey, tierTab, sortMode]);

  const getMonthColor = (count: number) => {
    if (count >= 2) return "bg-status-green text-status-green";
    if (count === 1) return "bg-status-yellow text-status-yellow";
    return "bg-destructive text-destructive";
  };

  const getMonthBadgeBg = (count: number) => {
    if (count >= 2) return "bg-status-green/15 border-border";
    if (count === 1) return "bg-status-yellow/15 border-status-yellow/30";
    return "bg-destructive/15 border-border";
  };

  const monthColumns = useMemo(() => {
    const year = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, "0")}`
    );
  }, []);

  const formatMonthShort = (key: string) => {
    const [y, m] = key.split("-");
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
  };

  const formatShortDate = (date?: string | null) =>
    date ? new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "Sem dados";

  const isOverview = mode === "overview";

  const renderMemberForm = () => (
    <div className="space-y-4">
      {editingMemberId && (
        <div className="pb-4 border-b border-border">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Foto de perfil</label>
          <AvatarUpload
            profileId={editingMemberId}
            fullName={form.full_name || "Membro"}
            avatarUrl={members?.find(m => m.id === editingMemberId)?.avatar_url ?? null}
            size={72}
          />
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Nome completo *</label>
          <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="Nome completo" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Telefone *</label>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="+55 11 99999-9999" />
        </div>
        <div className="lg:col-span-2">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Email (opcional, pode preencher depois)</label>
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="email@exemplo.com (gera o acesso)" disabled={!!editingMemberId} />
        </div>
        {!editingMemberId && (
          <div className="lg:col-span-2 text-[10px] text-muted-foreground bg-muted/40 rounded-lg p-3">
            <KeyRound className="inline h-3 w-3 mr-1" />
            Com e-mail: criamos a conta automaticamente com a senha padrão <strong>Liberty@2026</strong>. Sem e-mail: salvamos só o cadastro. Depois, é só adicionar o e-mail e clicar em <strong>Gerar acesso</strong>.
          </div>
        )}
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Empresa</label>
          <input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="Nome da empresa" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Início do programa</label>
          <input type="date" value={form.program_start_date} onChange={e => setForm(f => ({ ...f, program_start_date: e.target.value }))} className="input-begin text-sm h-10 w-full" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Fim do programa</label>
          <input type="date" value={form.program_end_date} onChange={e => setForm(f => ({ ...f, program_end_date: e.target.value }))} className="input-begin text-sm h-10 w-full" />
        </div>
        <div className="lg:col-span-2">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Tipo de membro *</label>
          <div className="flex gap-2">
            {(["begin", "liberty"] as const).map((t) => {
              const active = form.member_tier === t;
              const isLib = t === "liberty";
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, member_tier: t }))}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    active
                      ? isLib
                        ? "bg-amber-500/15 border-amber-500/60 text-amber-400"
                        : "bg-primary/15 border-primary/50 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isLib ? (<span className="inline-flex items-center gap-1.5"><LibertyMark size={14} /> Liberty (premium)</span>) : "Begin"}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AppLayout role="admin">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Membros {tierTab === "liberty" ? <span className="text-amber-400">Liberty</span> : tierTab === "inactive" ? <span className="text-muted-foreground">Encerrados</span> : <span>Begin</span>}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {tierTab === "inactive"
                ? `${(members?.filter(m => m.is_active === false).length ?? 0)} membros encerrados · sem acesso a agendamentos`
                : `${(members?.filter(m => m.member_tier === tierTab && m.is_active !== false).length ?? 0)} membros · Meta: 2 sessões/mês · 12 sessões = jornada completa`}
            </p>
          </div>
                       <div className="flex items-center gap-3 min-w-0 flex-wrap">
           {duplicateGroups.length > 0 && (
             <button onClick={() => setDupOpen(true)} className="text-xs px-4 py-2.5 flex items-center gap-1.5 h-10 rounded-lg border border-status-yellow/40 bg-status-yellow/10 text-status-yellow hover:bg-status-yellow/20 transition-colors">
               <GitMerge className="h-3.5 w-3.5" /> {duplicateGroups.length} duplicata{duplicateGroups.length > 1 ? "s" : ""}
             </button>
           )}
           <button onClick={exportActiveMembers} className="text-xs px-4 py-2.5 flex items-center gap-1.5 h-10 rounded-lg border border-border text-foreground hover:bg-muted transition-colors">
             <Download className="h-3.5 w-3.5" /> Exportar planilha
           </button>
           <button onClick={() => { setImportResults(null); setImportSummary(null); setImportTier(tierTab === "inactive" ? "begin" : tierTab); setImportOpen(true); }} className="text-xs px-4 py-2.5 flex items-center gap-1.5 h-10 rounded-lg border border-border text-foreground hover:bg-muted transition-colors">
             <Upload className="h-3.5 w-3.5" /> Importar planilha
           </button>

           <button onClick={openAdd} className="btn-silver text-xs px-4 py-2.5 flex items-center gap-1.5 h-10 rounded-lg">
             <Plus className="h-3.5 w-3.5" /> Novo membro
           </button>
           <AdminMonthFilter />
          </div>
        </motion.div>

        {/* Tier tabs */}
        <motion.div variants={fadeUpItem} className="flex gap-2 border-b border-border overflow-x-auto scrollbar-hide">
          {([
            { key: "begin", label: "Membros Begin", count: members?.filter(m => m.member_tier === "begin" && m.is_active !== false).length ?? 0 },
            { key: "liberty", label: "Membros Liberty", count: members?.filter(m => m.member_tier === "liberty" && m.is_active !== false).length ?? 0 },
            { key: "inactive", label: "Encerrados", count: members?.filter(m => m.is_active === false).length ?? 0 },
          ] as const).map((t) => {
            const active = tierTab === t.key;
            const isLib = t.key === "liberty";
            const isInactive = t.key === "inactive";
            return (
              <button
                key={t.key}
                onClick={() => setTierTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 shrink-0 whitespace-nowrap -mb-px transition-colors flex items-center gap-2 ${
                  active
                    ? isLib
                      ? "border-amber-500 text-amber-400"
                      : isInactive
                        ? "border-muted-foreground text-foreground"
                        : "border-primary/20 text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {isLib && <LibertyMark size={14} />}
                {t.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  active ? (isLib ? "bg-amber-500/20" : isInactive ? "bg-muted" : "bg-primary/20") : "bg-muted"
                }`}>{t.count}</span>
              </button>
            );
          })}
        </motion.div>

        {/* Filters */}
        <motion.div variants={fadeUpItem} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar membro ou empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-begin w-full pl-10 text-sm"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: "all", label: "Todos", icon: Users },
              { key: "on_track", label: "No ritmo", icon: CheckCircle2 },
              { key: "behind", label: "Parcial", icon: Target },
              { key: "zero", label: "Sem sessão", icon: AlertTriangle },
              { key: "no_bookings", label: "Sem próxima sessão", icon: AlertTriangle },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key as any)}
                className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors font-medium flex items-center gap-1.5 ${
                  filter === f.key
                    ? "bg-primary text-primary-foreground border-primary/20"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <f.icon className="h-3 w-3" />
                {f.label}
              </button>
            ))}
            <button
              onClick={() => setSortMode(sortMode === "priority" ? "name" : "priority")}
              title="Priorizar membros sem sessões / menor progresso no topo"
              className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors font-medium flex items-center gap-1.5 ${
                sortMode === "priority"
                  ? "bg-status-yellow text-background border-status-yellow"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlertTriangle className="h-3 w-3" />
              {sortMode === "priority" ? "Pendentes no topo ✓" : "Priorizar pendentes"}
            </button>
          </div>
        </motion.div>

        {/* Members table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse h-16" />
            ))}
          </div>
        ) : (
          <motion.div variants={fadeUpItem} className="space-y-2">
            {/* Header row */}
            <div className={`hidden lg:grid ${isOverview ? "grid-cols-[minmax(320px,2fr),minmax(120px,1fr),repeat(12,36px)]" : "grid-cols-[minmax(320px,2fr),minmax(120px,1fr),1fr,1fr]"} gap-2 px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider`}>
              <span>Membro</span>
              <span>Progresso</span>
              {isOverview ? (
                monthColumns.map((mc) => (
                  <span key={mc} className="text-center">{formatMonthShort(mc)}</span>
                ))
              ) : (
                <>
                  <span>Sessões no mês</span>
                  <span>Status</span>
                </>
              )}
            </div>

            {filtered.map((member) => {
              const progress = (member.total_completed / 12) * 100;
              const monthCount = filterKey ? (member.monthly_counts[filterKey] || 0) : member.total_completed;
              const isExpanded = expandedId === member.id;
              const isComplete = member.total_completed >= 12;

              return (
                <div key={member.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedId(isExpanded ? null : member.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedId(isExpanded ? null : member.id);
                      }
                    }}
                    className={`glass-card p-4 w-full text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                      isComplete
                        ? "ring-1 ring-status-green/40 bg-status-green/5"
                        : member.member_tier === "liberty"
                          ? "ring-1 ring-amber-500/40 bg-amber-500/5"
                          : ""
                    }`}
                  >
                    <div className={`lg:grid ${isOverview ? "lg:grid-cols-[minmax(320px,2fr),minmax(120px,1fr),repeat(12,36px)]" : "lg:grid-cols-[minmax(320px,2fr),minmax(120px,1fr),1fr,1fr]"} lg:gap-2 lg:items-center flex flex-col gap-3`}>
                      {/* Name */}
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden ${isComplete ? "bg-status-green text-background" : "bg-muted text-foreground"}`}>
                          {member.avatar_url ? (
                            <img src={member.avatar_url} alt={member.full_name} className="w-full h-full object-cover" />
                          ) : initials(member.full_name)}
                        </div>
                         <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                              <Link
                                to={`/admin/membros/${member.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-sm font-medium text-foreground leading-tight hover:text-primary transition-colors"
                              >
                               {shortName(member.full_name)}
                               {member.is_active === false && (
                                 <span className="ml-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30">Inativo</span>
                               )}
                             </Link>
                             <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/90 tabular-nums shrink-0 leading-tight">
                               <span>{formatShortDate(member.program_start_date)}</span>
                               <span className="text-muted-foreground/50">→</span>
                               <span>{formatShortDate(member.program_end_date)}</span>
                             </span>
                           </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {member.company_name && (
                              <p className="text-[10px] text-muted-foreground truncate leading-tight">{toTitleCase(member.company_name)}</p>
                            )}
                            {member.pending_tasks_count > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-status-yellow shrink-0">
                                <ListTodo className="h-3 w-3" />
                                {member.pending_tasks_count} pend.
                              </span>
                            )}
                            {member.last_session_date && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                · Última: {new Date(member.last_session_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                              </span>
                            )}
                          </div>
                        </div>
                        <TooltipProvider delayDuration={150}>
                          <div className="flex items-center gap-1 ml-auto">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleInvite(member); }}
                                  disabled={invitingId === member.id}
                                  aria-label="Enviar convite por WhatsApp"
                                  className="p-1.5 rounded-lg hover:bg-status-green/10 text-muted-foreground hover:text-status-green transition-colors disabled:opacity-50"
                                >
                                  {invitingId === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">Enviar convite por WhatsApp (e-mail e senha)</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link
                                  to={`/admin/membros/${member.id}/editar`}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label="Editar cadastro completo"
                                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <UserCog className="h-3.5 w-3.5" />
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent side="top">Editar cadastro completo</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openEdit(member); }}
                                  aria-label="Editar dados básicos"
                                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">Editar dados básicos</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleToggleActive(member); }}
                                  disabled={togglingActiveId === member.id}
                                  aria-label={member.is_active ? "Inativar membro" : "Reativar membro"}
                                  className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${member.is_active ? "hover:bg-status-yellow/10 text-muted-foreground hover:text-status-yellow" : "bg-destructive/10 text-destructive hover:bg-destructive/20"}`}
                                >
                                  {togglingActiveId === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">{member.is_active ? "Inativar acesso do membro" : "Reativar acesso do membro"}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleDelete(member.id, member.full_name); }}
                                  aria-label="Excluir membro"
                                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">Excluir membro permanentemente</TooltipContent>
                            </Tooltip>
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground lg:hidden" /> : <ChevronDown className="h-4 w-4 text-muted-foreground lg:hidden" />}
                          </div>
                        </TooltipProvider>
                      </div>

                      {/* Progress */}
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 max-w-[120px] rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isComplete ? "bg-status-green" : "bg-primary"}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className={`text-xs tabular-nums whitespace-nowrap ${isComplete ? "text-status-green font-semibold" : "text-muted-foreground"}`}>
                          {isComplete ? "✓ 12/12" : `${member.total_completed}/12`}
                        </span>
                      </div>

                      {isOverview ? (
                        <div className="hidden lg:contents">
                          {monthColumns.map((mc) => {
                            const c = member.monthly_counts[mc] || 0;
                            return (
                              <div key={mc} className="flex justify-center">
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border ${getMonthBadgeBg(c)}`}>
                                  <span className={getMonthColor(c).split(" ")[1]}>{c}</span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="text-lg font-semibold text-foreground tabular-nums">{monthCount}</span>
                            <span className="text-xs text-muted-foreground ml-1">de 2</span>
                          </div>
                          <div>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${getMonthBadgeBg(monthCount)}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${getMonthColor(monthCount).split(" ")[0]}`} />
                              <span className={getMonthColor(monthCount).split(" ")[1]}>
                                {monthCount >= 2 ? "No ritmo" : monthCount === 1 ? "Parcial" : "Sem sessão"}
                              </span>
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <AdminMemberNote memberId={member.id} initialNote={member.admin_note} />



                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="glass-card p-5 mt-1 border-primary/20">
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 text-xs text-muted-foreground">
                            <div>
                              <span className="font-semibold text-foreground block">Nome completo</span>
                              {member.full_name}
                            </div>
                            <div>
                              <span className="font-semibold text-foreground block">Email</span>
                              {member.email || "Sem dados"}
                            </div>
                            <div>
                              <span className="font-semibold text-foreground block">Empresa</span>
                              {member.company_name || "Sem dados"}
                            </div>
                            <div>
                              <span className="font-semibold text-foreground block">Telefone</span>
                              {member.phone || "Sem dados"}
                            </div>
                            <div>
                              <span className="font-semibold text-foreground block">Início do programa</span>
                              {member.program_start_date ? new Date(member.program_start_date + "T12:00:00").toLocaleDateString("pt-BR") : "Sem dados"}
                            </div>
                            <div>
                              <span className="font-semibold text-foreground block">Fim previsto</span>
                              {member.program_end_date ? new Date(member.program_end_date + "T12:00:00").toLocaleDateString("pt-BR") : "Sem dados"}
                            </div>
                            <div>
                              <span className="font-semibold text-foreground block">Sessões realizadas</span>
                              <span className="text-status-green font-semibold">{member.total_completed}</span> de 12
                            </div>
                            <div>
                              <span className="font-semibold text-foreground block">Faltam</span>
                              {Math.max(0, 12 - member.total_completed)} sessões
                            </div>
                          </div>

                          {member.completed_sessions.length > 0 && (
                            <div className="mb-4">
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                                Sessões realizadas ({member.completed_sessions.length})
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                {member.completed_sessions.map((cs) => (
                                  <div
                                    key={cs.booking_id}
                                    className="group relative flex items-center gap-2 rounded-lg text-xs bg-status-green/10 border border-border text-status-green hover:bg-status-green/20 transition-colors"
                                  >
                                    <Link
                                      to={`/admin/sessoes/${cs.booking_id}/relatorio`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex items-center gap-2 px-3 py-2 flex-1 min-w-0"
                                      title="Ver detalhes da sessão"
                                    >
                                      <span className="w-4 h-4 rounded-full bg-status-green text-background flex items-center justify-center text-[8px] font-bold shrink-0">
                                        ✓
                                      </span>
                                      <span className="truncate">{cs.session_name}</span>
                                    </Link>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleRemoveBooking(cs.booking_id, cs.session_name); }}
                                      title="Remover esta sessão"
                                      aria-label={`Remover sessão ${cs.session_name}`}
                                      className="shrink-0 p-1.5 mr-1 rounded-md text-status-green/70 hover:text-destructive hover:bg-destructive/10 transition-all opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <MemberSessionEditor
                            member={member}
                            sessions={sessions || []}
                            mentors={mentorsList || []}
                            filterKey={filterKey}
                            onReportClick={(booking_id, session_name) => setReportModal({ booking_id, session_name })}
                          />

                          {isOverview && (
                            <div className="lg:hidden mt-4 pt-4 border-t border-border">
                              <h4 className="text-xs font-semibold text-foreground mb-2">Sessões por mês</h4>
                              <div className="flex gap-2 flex-wrap">
                                {monthColumns.map((mc) => {
                                  const c = member.monthly_counts[mc] || 0;
                                  return (
                                    <div key={mc} className="text-center">
                                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold border ${getMonthBadgeBg(c)}`}>
                                        <span className={getMonthColor(c).split(" ")[1]}>{c}</span>
                                      </span>
                                      <span className="text-[9px] text-muted-foreground mt-0.5 block">{formatMonthShort(mc)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="mt-4 pt-4 border-t border-border flex justify-end">
                            <Link
                              to={`/admin/membros/${member.id}`}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/15 transition-colors"
                            >
                              Ver mais informações sobre o membro →
                            </Link>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <EmptyState
                icon={Users}
                title="Nenhum membro neste período"
                description="Ajuste o filtro de mês ou cadastre um novo membro."
              />
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Add Member Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">Novo membro</DialogTitle>
          </DialogHeader>
          {renderMemberForm()}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">Editar membro</DialogTitle>
          </DialogHeader>
          {renderMemberForm()}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Members Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">Importar membros via planilha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Suba <strong className="text-foreground">qualquer planilha sua</strong> (.xlsx, .xls ou .csv). Reconhecemos os cabeçalhos automaticamente. Só Nome e E-mail são obrigatórios. Se o e-mail já existir, o perfil é atualizado; caso contrário, criamos o membro com senha temporária. Datas em AAAA-MM-DD ou DD/MM/AAAA.
            </p>
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">Tipo de membro desta planilha</p>
              <div className="flex gap-2">
                {(["begin", "liberty"] as const).map((t) => {
                  const active = importTier === t;
                  const isLib = t === "liberty";
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setImportTier(t)}
                      disabled={importing}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${active ? (isLib ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-primary/20 bg-primary/10 text-foreground") : "border-border text-muted-foreground hover:bg-muted"}`}
                    >
                      {isLib ? (<span className="inline-flex items-center gap-1.5"><LibertyMark size={14} /> Liberty (premium)</span>) : "Begin"}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Aplicado a todas as linhas sem a coluna “Tipo de Membro”. Linhas com “Liberty” na planilha sempre viram Liberty.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Button onClick={downloadFullTemplate} variant="outline" className="w-full">
                <Download className="size-4 mr-2" /> Baixar modelo (opcional)
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} disabled={importing} className="hidden" />
              <Button onClick={() => fileRef.current?.click()} disabled={importing} className="w-full">
                {importing ? <><Loader2 className="size-4 mr-2 animate-spin" />Processando…</> : <><Upload className="size-4 mr-2" />Selecionar arquivo</>}
              </Button>
            </div>

            {importSummary && importResults && (
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {importSummary.created} criados
                    {importSummary.updated !== undefined && ` · ${importSummary.updated} atualizados`}
                    {importSummary.skipped !== undefined && ` · ${importSummary.skipped} ignorados`}
                    {` · ${importSummary.errors} erros`}
                  </p>
                  {importSummary.created > 0 && (
                    <Button size="sm" onClick={downloadCredentials}>
                      <KeyRound className="size-4 mr-2" /> Baixar senhas
                    </Button>
                  )}
                </div>
                <div className="max-h-64 overflow-auto rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                      <tr>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Nome</th>
                        <th className="text-left p-2">E-mail</th>
                        <th className="text-left p-2">Senha / Mensagem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResults.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2">
                            {r.status === "created" && <span className="inline-flex items-center gap-1 text-emerald-500"><CheckCircle2 className="size-3" /> Criado</span>}
                            {r.status === "updated" && <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 className="size-3" /> Atualizado</span>}
                            {r.status === "skipped" && <span className="inline-flex items-center gap-1 text-amber-500"><AlertCircle className="size-3" /> Ignorado</span>}
                            {r.status === "error" && <span className="inline-flex items-center gap-1 text-destructive"><AlertCircle className="size-3" /> Erro</span>}
                          </td>
                          <td className="p-2">{r.full_name}</td>
                          <td className="p-2 text-muted-foreground">{r.email}</td>
                          <td className="p-2 font-mono">{r.status === "created" ? r.password : r.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setImportOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Modal */}
      <Dialog open={!!reportModal} onOpenChange={() => setReportModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">Relatório: {reportModal?.session_name}</DialogTitle>
          </DialogHeader>
          {report ? (
            <div className="space-y-4 text-sm">
              {report.summary && (
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Resumo</h4>
                  <p className="text-muted-foreground whitespace-pre-wrap">{report.summary}</p>
                </div>
              )}
              {report.goals && (
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Metas</h4>
                  <p className="text-muted-foreground whitespace-pre-wrap">{report.goals}</p>
                </div>
              )}
              {report.action_plan && (
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Plano de ação</h4>
                  <p className="text-muted-foreground whitespace-pre-wrap">{report.action_plan}</p>
                </div>
              )}
              {report.mentor_impressions && (
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Impressões do mentor</h4>
                  <p className="text-muted-foreground whitespace-pre-wrap">{report.mentor_impressions}</p>
                </div>
              )}
              {!report.summary && !report.goals && !report.action_plan && !report.mentor_impressions && (
                <p className="text-muted-foreground text-center py-4">Relatório ainda não preenchido</p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8 text-sm">Nenhum relatório encontrado para esta sessão</p>
          )}
        </DialogContent>
      </Dialog>
      <AccessCredentialsDialog data={credentialsDialog} onClose={() => setCredentialsDialog(null)} />

      {/* Duplicates Dialog */}
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-status-yellow" /> Perfis duplicados
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2 mb-3">
            Detectamos {duplicateGroups.length} grupo(s) de possíveis duplicatas (mesmo primeiro e último nome).
            Escolha qual perfil manter. O outro será mesclado no principal e removido.
          </p>
          <div className="space-y-4">
            {duplicateGroups.map((g) => (
              <div key={g.key} className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  {g.profiles[0].full_name}
                </div>
                <div className="grid gap-2">
                  {g.profiles.map((p) => (
                    <div key={p.id} className="rounded-md bg-background/40 border border-border p-3 text-xs">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <div className="text-foreground font-medium">{toTitleCase(p.full_name)}</div>
                          <div className="text-muted-foreground truncate">
                            {p.email || "sem e-mail"} · {p.phone || "sem telefone"} · {p.member_tier}
                          </div>
                          <div className="text-muted-foreground">
                            {p.total_completed} realizadas · {p.total_scheduled} agendadas
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {g.profiles.filter((o) => o.id !== p.id).map((other) => {
                            const busy = mergingKey === g.key + p.id + other.id;
                            return (
                              <button
                                key={other.id}
                                onClick={() => openMergeConfirm(p, other, g.key)}
                                disabled={!!mergingKey}
                                className="text-[10px] px-2 py-1 rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 inline-flex items-center gap-1"
                              >
                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
                                Manter este e mesclar
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {duplicateGroups.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">
                Nenhuma duplicata detectada 🎉
              </p>
            )}
          </div>

          {mergeLog && mergeLog.length > 0 && (
            <div className="mt-4 rounded-lg border border-border p-3">
              <div className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                Últimas mesclagens
              </div>
              <div className="space-y-2">
                {mergeLog.map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="text-foreground truncate">
                        {toTitleCase(l.loser_name || "")} → {toTitleCase(l.winner_name || "")}
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                        {l.undone_at ? " · desfeita" : ""}
                      </div>
                    </div>
                    {!l.undone_at && (
                      <Button size="sm" variant="outline" disabled={mergeBusy} onClick={() => undoMerge(l.id)}>
                        Desfazer
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDupOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge confirmation */}
      <Dialog open={!!mergeTarget} onOpenChange={(o) => { if (!o) setMergeTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-status-yellow" /> Confirmar mesclagem
            </DialogTitle>
          </DialogHeader>
          {mergeTarget && (
            <div className="space-y-3 text-xs">
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-primary mb-1">Perfil que será mantido</div>
                <div className="text-foreground font-medium">{toTitleCase(mergeTarget.winner.full_name)}</div>
                <div className="text-muted-foreground">{mergeTarget.winner.email || "sem e-mail"} · {mergeTarget.winner.member_tier}</div>
              </div>
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-destructive mb-1">Perfil que será removido</div>
                <div className="text-foreground font-medium">{toTitleCase(mergeTarget.loser.full_name)}</div>
                <div className="text-muted-foreground">{mergeTarget.loser.email || "sem e-mail"} · {mergeTarget.loser.member_tier}</div>
                <div className="text-muted-foreground">{mergeTarget.loser.total_completed} realizadas · {mergeTarget.loser.total_scheduled} agendadas</div>
              </div>
              <p className="text-muted-foreground">
                As sessões, relatórios e o acesso do perfil removido passam para o perfil mantido.
                A mesclagem fica guardada em “Últimas mesclagens” e pode ser desfeita.
              </p>

              {mergeBlockers.length > 0 && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-2">
                  <div className="text-destructive font-semibold flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> Parece que são pessoas diferentes
                  </div>
                  <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                    {mergeBlockers.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                  <p className="text-muted-foreground">
                    A mesclagem foi bloqueada e não pode ser forçada. Corrija os cadastros separadamente.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setMergeTarget(null)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={mergeBusy || mergeBlockers.length > 0}
              onClick={runMerge}
            >
              {mergeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <GitMerge className="h-3.5 w-3.5 mr-1" />}
              Mesclar perfis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
};

export default AdminMembrosPage;
