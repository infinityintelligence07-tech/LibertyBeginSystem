import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { Link, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { AppLayout } from "@/components/AppLayout";
import { AdminMonthFilter } from "@/components/AdminMonthFilter";
import { useAdminFilter } from "@/contexts/AdminFilterContext";
import { useMembers, useSessionCatalog } from "@/hooks/useAdminData";
import { toTitleCase, shortName, normalizeText, matchesSearch } from "@/lib/formatName";
import {
  Search, ChevronDown, ChevronRight, Users, CheckCircle2, AlertTriangle, Plus, Edit, Trash2, Upload, Download, KeyRound,
  Loader2, AlertCircle, UserCog, Send, Power, ListTodo, GitMerge, Clock, FileText,
} from "lucide-react";
import { PENDING_CONFIRMATION_HINT } from "@/lib/bookingStatus";
import { MemberSessionEditor } from "@/components/MemberSessionEditor";
import { AdminMemberNote } from "@/components/AdminMemberNote";
import { LibertyMark } from "@/components/LibertyMark";
import { UserAvatar } from "@/components/UserAvatar";
import { AvatarUpload } from "@/components/AvatarUpload";
import { AccessCredentialsDialog, AccessCredentialsData } from "@/components/AccessCredentialsDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  BottomSheet, Callout, Chip, ConfirmDialog, EmptyState, ErrorState, IconButton, ListRow, LoadingState,
  PageContainer, PageHeader, ProgressBar, SectionCard, SectionHeader, SelectField, StatusPill, TextField,
} from "@/components/ds";
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

interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

type MemberFilter = "all" | "on_track" | "behind" | "zero" | "no_bookings";

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
  const { data: members, isLoading, isError, refetch } = useMembers();
  const { data: sessions } = useSessionCatalog();
  const { mode, monthKey } = useAdminFilter();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<MemberFilter>("all");
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

  // Confirmações (substituem window.confirm): a ação só roda depois do "Confirmar".
  const [confirmState, setConfirmState] = useState<ConfirmRequest | null>(null);
  const askConfirm = (req: ConfirmRequest) => setConfirmState(req);

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
      "Sessões realizadas", "Sessões agendadas", "A confirmar", "Progresso (12)",
      "Próxima sessão", "Última sessão", "Tarefas pendentes",
    ];
    const cols = [
      { wch: 30 }, { wch: 28 }, { wch: 30 }, { wch: 18 }, { wch: 10 },
      { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 14 },
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
      m.total_pending_confirmation ?? 0,
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
      ["Sessões a confirmar (passaram sem confirmação do mentor)", active.reduce((s, m) => s + (m.total_pending_confirmation ?? 0), 0)],
      ["Jornadas completas (12 sessões)", active.filter((m) => m.total_completed >= 12).length],
      ["Sem nenhuma sessão realizada", active.filter((m) => m.total_completed === 0).length],
    ]);
    resumo["!cols"] = [{ wch: 52 }, { wch: 24 }];
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
        //  - With email -> cria conta de acesso com senha aleatória (devolvida em data.password).
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
          toast.success("Membro criado com acesso");
          setCredentialsDialog({
            full_name: form.full_name.trim(),
            email: data.email || form.email.trim().toLowerCase(),
            password: data.password,
            role: "liberty",
          });
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

  const handleDelete = (id: string, name: string) => askConfirm({
    title: `Excluir definitivamente "${name}"?`,
    description: "Isso remove o acesso, todas as sessões, tarefas, relatórios e notificações associados. Esta ação não pode ser desfeita.",
    confirmLabel: "Excluir",
    destructive: true,
    onConfirm: () => performDelete(id),
  });

  const performDelete = async (id: string) => {
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

  const handleRemoveBooking = (bookingId: string, sessionName: string) => askConfirm({
    title: `Remover a sessão "${sessionName}"?`,
    description: "Esta ação apaga o agendamento, as tarefas e o relatório associados.",
    confirmLabel: "Remover",
    destructive: true,
    onConfirm: () => performRemoveBooking(bookingId),
  });

  const performRemoveBooking = async (bookingId: string) => {
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
  const handleInvite = (member: any) => {
    if (!member.email) { toast.error("Membro sem e-mail cadastrado"); return; }
    askConfirm({
      title: `Gerar acesso para ${shortName(member.full_name)}?`,
      description: "Uma nova senha temporária aleatória será gerada (a senha atual deixa de valer) e a mensagem pronta para enviar aparece em seguida.",
      confirmLabel: "Gerar acesso",
      onConfirm: () => performInvite(member),
    });
  };

  const performInvite = async (member: any) => {
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
  const handleToggleActive = (member: any) => {
    const nextActive = !member.is_active;
    askConfirm({
      title: nextActive ? `Reativar ${shortName(member.full_name)}?` : `Inativar ${shortName(member.full_name)}?`,
      description: nextActive
        ? "O membro volta a acessar a plataforma e a agendar sessões."
        : "Sessões futuras agendadas serão canceladas automaticamente.",
      confirmLabel: nextActive ? "Reativar" : "Inativar",
      destructive: !nextActive,
      onConfirm: () => performToggleActive(member, nextActive),
    });
  };

  const performToggleActive = async (member: any, nextActive: boolean) => {
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

  const undoMerge = (logId: string) => askConfirm({
    title: "Desfazer esta mesclagem?",
    description: "O perfil removido será restaurado com os dados e sessões que tinha antes.",
    confirmLabel: "Desfazer",
    onConfirm: () => performUndoMerge(logId),
  });

  const performUndoMerge = async (logId: string) => {
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

  const tierCounts = {
    begin: members?.filter((m) => m.member_tier === "begin" && m.is_active !== false).length ?? 0,
    liberty: members?.filter((m) => m.member_tier === "liberty" && m.is_active !== false).length ?? 0,
    inactive: members?.filter((m) => m.is_active === false).length ?? 0,
  };

  // Base da aba atual (tier + busca), usada só para os contadores dos chips de filtro.
  const baseList = useMemo(() => {
    if (!members) return [];
    let list = tierTab === "inactive"
      ? members.filter((m) => m.is_active === false)
      : members.filter((m) => m.member_tier === tierTab && m.is_active !== false);
    if (search) {
      list = list.filter(
        (m) => matchesSearch(m.full_name, search) || matchesSearch(m.company_name || "", search) || matchesSearch(m.email || "", search)
      );
    }
    return list;
  }, [members, tierTab, search]);

  const matchesFilter = (m: NonNullable<typeof members>[number], key: MemberFilter) => {
    if (key === "all") return true;
    if (key === "no_bookings") return !m.has_next_session;
    if (filterKey) {
      const c = m.monthly_counts[filterKey] || 0;
      if (key === "on_track") return c >= 2;
      if (key === "behind") return c === 1;
      return c === 0;
    }
    if (key === "on_track") return m.total_completed >= 12;
    if (key === "behind") return m.total_completed > 0 && m.total_completed < 12;
    return m.total_completed === 0;
  };

  const filterOptions: { key: MemberFilter; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "on_track", label: filterKey ? "No ritmo" : "Jornada completa" },
    { key: "behind", label: filterKey ? "Parcial" : "Em andamento" },
    { key: "zero", label: "Sem sessão" },
    { key: "no_bookings", label: "Sem próxima sessão" },
  ];

  const monthTone = (count: number): "success" | "warning" | "danger" => (count >= 2 ? "success" : count === 1 ? "warning" : "danger");
  const monthPillTone = (completed: number, scheduled: number): "success" | "warning" | "info" | "danger" =>
    completed >= 2 ? "success" : completed === 1 ? "warning" : scheduled > 0 ? "info" : "danger";
  const monthCellClass = (count: number) => {
    const tone = monthTone(count);
    if (tone === "success") return "border border-border text-foreground";
    if (tone === "warning") return "border border-border text-muted-foreground";
    return "border border-border text-destructive";
  };
  const monthStatusLabel = (completed: number, scheduled = 0) =>
    completed >= 2 ? "No ritmo" : completed === 1 ? "Parcial" : scheduled > 0 ? "Agendada" : "Sem sessão";

  const openImport = () => {
    setImportResults(null);
    setImportSummary(null);
    setImportTier(tierTab === "inactive" ? "begin" : tierTab);
    setImportOpen(true);
  };

  const pageTitle = tierTab === "liberty" ? "Membros Liberty" : tierTab === "inactive" ? "Membros encerrados" : "Membros Begin";
  const pageDescription = tierTab === "inactive"
    ? `${tierCounts.inactive} membros encerrados · sem acesso a agendamentos`
    : `${tierCounts[tierTab]} membros · Meta: 2 sessões por mês · 12 sessões = jornada completa`;

  const renderMemberForm = () => (
    <div className="space-y-4">
      {editingMemberId && (
        <div className="pb-4 border-b border-border">
          <p className="text-sm font-medium text-foreground mb-2">Foto de perfil</p>
          <AvatarUpload
            profileId={editingMemberId}
            fullName={form.full_name || "Membro"}
            avatarUrl={members?.find((m) => m.id === editingMemberId)?.avatar_url ?? null}
            size={72}
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField
          label="Nome completo *"
          value={form.full_name}
          onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          placeholder="Nome completo"
          autoComplete="off"
        />
        <TextField
          label="Telefone *"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="+55 11 99999-9999"
          inputMode="tel"
        />
        <TextField
          containerClassName="sm:col-span-2"
          label="E-mail"
          hint={editingMemberId ? "O e-mail é alterado em Editar cadastro completo." : "Opcional. Com e-mail, o acesso é criado automaticamente."}
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="email@exemplo.com"
          disabled={!!editingMemberId}
        />
        {!editingMemberId && (
          <div className="sm:col-span-2">
            <Callout tone="info" icon={KeyRound}>
              Com e-mail: criamos a conta com uma senha temporária aleatória, exibida em seguida para você enviar por WhatsApp.
              Sem e-mail: salvamos só o cadastro. Depois, é só adicionar o e-mail e usar Gerar acesso.
            </Callout>
          </div>
        )}
        <TextField
          label="Empresa"
          value={form.company_name}
          onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
          placeholder="Nome da empresa"
        />
        <SelectField
          label="Tipo de membro *"
          value={form.member_tier}
          onChange={(e) => setForm((f) => ({ ...f, member_tier: e.target.value as "begin" | "liberty" }))}
        >
          <option value="begin">Begin</option>
          <option value="liberty">Liberty (premium)</option>
        </SelectField>
        <TextField
          label="Início do programa"
          type="date"
          value={form.program_start_date}
          onChange={(e) => setForm((f) => ({ ...f, program_start_date: e.target.value }))}
        />
        <TextField
          label="Fim do programa"
          type="date"
          value={form.program_end_date}
          onChange={(e) => setForm((f) => ({ ...f, program_end_date: e.target.value }))}
        />
      </div>
    </div>
  );

  type MemberRow = NonNullable<typeof members>[number];

  const renderActions = (member: MemberRow) => (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <IconButton
        aria-label={`Gerar acesso e mensagem de convite para ${shortName(member.full_name)}`}
        title="Gerar acesso (e-mail e senha)"
        size="sm"
        disabled={invitingId === member.id}
        onClick={() => handleInvite(member)}
      >
        {invitingId === member.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </IconButton>
      <Link
        to={`/admin/membros/${member.id}/editar`}
        aria-label={`Editar cadastro completo de ${shortName(member.full_name)}`}
        title="Editar cadastro completo"
        className="btn-ghost btn-icon btn-sm h-8 w-8 hit-44 text-muted-foreground hover:text-foreground"
      >
        <UserCog className="h-4 w-4" />
      </Link>
      <IconButton
        aria-label={`Editar dados básicos de ${shortName(member.full_name)}`}
        title="Editar dados básicos"
        size="sm"
        onClick={() => openEdit(member)}
      >
        <Edit className="h-4 w-4" />
      </IconButton>
      <IconButton
        aria-label={member.is_active ? `Inativar ${shortName(member.full_name)}` : `Reativar ${shortName(member.full_name)}`}
        title={member.is_active ? "Inativar acesso do membro" : "Reativar acesso do membro"}
        size="sm"
        disabled={togglingActiveId === member.id}
        onClick={() => handleToggleActive(member)}
        className={member.is_active ? "" : "text-destructive hover:text-destructive"}
      >
        {togglingActiveId === member.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
      </IconButton>
      <IconButton
        aria-label={`Excluir ${shortName(member.full_name)} permanentemente`}
        title="Excluir membro permanentemente"
        size="sm"
        onClick={() => handleDelete(member.id, member.full_name)}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </div>
  );

  const renderIdentity = (member: MemberRow, pendingConfirmationCount: number) => {
    const isComplete = member.total_completed >= 12;
    return (
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar name={member.full_name} avatarUrl={member.avatar_url} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <Link
              to={`/admin/membros/${member.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-foreground leading-tight hover:underline underline-offset-2 truncate"
            >
              {shortName(member.full_name)}
            </Link>
            {member.member_tier === "liberty" && (
              <StatusPill tone="neutral" size="sm" withDot={false}><LibertyMark size={10} /> Liberty</StatusPill>
            )}
            {member.is_active === false && <StatusPill tone="neutral" size="sm" withDot={false}>Inativo</StatusPill>}
            {!member.email && <StatusPill tone="warning" size="sm" withDot={false}>Sem e-mail</StatusPill>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
            {member.company_name && <span className="truncate">{toTitleCase(member.company_name)}</span>}
            {member.pending_tasks_count > 0 && (
              <span className="inline-flex items-center gap-1 shrink-0">
                <ListTodo className="h-3 w-3" aria-hidden /> {member.pending_tasks_count} tarefa{member.pending_tasks_count > 1 ? "s" : ""}
              </span>
            )}
            {pendingConfirmationCount > 0 && (
              <span className="inline-flex items-center gap-1 text-status-orange shrink-0" title={PENDING_CONFIRMATION_HINT}>
                <Clock className="h-3 w-3" aria-hidden /> {pendingConfirmationCount} a confirmar
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderExpanded = (member: MemberRow) => (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {[
          ["Nome completo", member.full_name],
          ["E-mail", member.email || "Sem dados"],
          ["Empresa", member.company_name || "Sem dados"],
          ["Telefone", member.phone || "Sem dados"],
          ["Início do programa", member.program_start_date ? new Date(member.program_start_date + "T12:00:00").toLocaleDateString("pt-BR") : "Sem dados"],
          ["Fim previsto", member.program_end_date ? new Date(member.program_end_date + "T12:00:00").toLocaleDateString("pt-BR") : "Sem dados"],
          ["Sessões realizadas", `${member.total_completed} de 12`],
          ["Faltam", `${Math.max(0, 12 - member.total_completed)} sessões`],
          ["Última sessão", formatShortDate(member.last_session_date)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-foreground font-medium truncate">{value}</dd>
          </div>
        ))}
      </dl>

      {(member.pending_confirmation_sessions?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <SectionHeader
            as="h3"
            title={
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" aria-hidden /> A confirmar ({member.pending_confirmation_sessions!.length})
              </span>
            }
            description={PENDING_CONFIRMATION_HINT}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {member.pending_confirmation_sessions!.map((ps) => (
              <Link
                key={ps.booking_id}
                to={`/admin/agenda?booking=${ps.booking_id}`}
                onClick={(e) => e.stopPropagation()}
                title="Confirmar na agenda"
                className="flex items-center gap-2 rounded-ds text-sm px-3 min-h-[40px] border border-border text-foreground hover:bg-accent transition-colors min-w-0"
              >
                <span className="h-2 w-2 rounded-full bg-status-orange shrink-0" aria-hidden />
                <span className="truncate">{ps.session_name}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">{formatShortDate(ps.date)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {member.completed_sessions.length > 0 && (
        <div className="space-y-2">
          <SectionHeader as="h3" title={`Relatórios das sessões realizadas (${member.completed_sessions.length})`} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {member.completed_sessions.map((cs) => (
              <div
                key={cs.booking_id}
                className="flex items-center gap-1 rounded-ds text-sm border border-border text-foreground min-h-[40px] pr-1"
              >
                <Link
                  to={`/admin/sessoes/${cs.booking_id}/relatorio`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 px-3 py-2 flex-1 min-w-0 hover:underline underline-offset-2"
                  title="Ver detalhes da sessão"
                >
                  <span className="h-2 w-2 rounded-full bg-status-green shrink-0" aria-hidden />
                  <span className="truncate">{cs.session_name}</span>
                </Link>
                <IconButton
                  aria-label={`Remover sessão ${cs.session_name}`}
                  title="Remover esta sessão"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); handleRemoveBooking(cs.booking_id, cs.session_name); }}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
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
        <div className="lg:hidden pt-4 border-t border-border space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Sessões por mês</h3>
          <div className="flex gap-2 flex-wrap">
            {monthColumns.map((mc) => {
              const c = member.monthly_counts[mc] || 0;
              return (
                <div key={mc} className="text-center">
                  <span className={`w-9 h-9 rounded-ds flex items-center justify-center text-xs font-semibold tabular-nums ${monthCellClass(c)}`}>{c}</span>
                  <span className="text-[11px] text-muted-foreground mt-0.5 block">{formatMonthShort(mc)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-border flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/admin/membros/${member.id}`}>Ver perfil completo <ChevronRight className="h-4 w-4" /></Link>
        </Button>
      </div>
    </div>
  );

  const renderTable = () => (
    <SectionCard padding="none" className="hidden lg:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-muted-foreground border-b border-border">
            <th scope="col" className="h-10 px-4 font-medium">Membro</th>
            <th scope="col" className="h-10 px-3 font-medium whitespace-nowrap">Programa</th>
            <th scope="col" className="h-10 px-3 font-medium">Progresso</th>
            {isOverview ? (
              monthColumns.map((mc) => (
                <th key={mc} scope="col" className="h-10 px-1 font-medium text-center w-10">{formatMonthShort(mc)}</th>
              ))
            ) : (
              <>
                <th scope="col" className="h-10 px-3 font-medium whitespace-nowrap">Sessões no mês</th>
                <th scope="col" className="h-10 px-3 font-medium">Ritmo</th>
              </>
            )}
            <th scope="col" className="h-10 px-3 font-medium text-right">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((member) => {
            const monthCount = filterKey ? (member.monthly_counts[filterKey] || 0) : member.total_completed;
            const monthScheduled = filterKey ? (member.monthly_scheduled_counts[filterKey] || 0) : member.total_scheduled;
            const pendingConfirmationCount = filterKey
              ? (member.monthly_pending_confirmation_counts?.[filterKey] || 0)
              : (member.total_pending_confirmation || 0);
            const isExpanded = expandedId === member.id;
            const isComplete = member.total_completed >= 12;
            const colSpan = 4 + (isOverview ? 12 : 2);
            return (
              <Fragment key={member.id}>
                <tr
                  onClick={() => setExpandedId(isExpanded ? null : member.id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedId(isExpanded ? null : member.id); }
                  }}
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  className={`h-[52px] border-b border-border cursor-pointer transition-colors duration-ds-1 hover:bg-accent/40 focus-visible:outline-none focus-visible:bg-accent/40 ${isExpanded ? "bg-accent/30" : ""}`}
                >
                  <td className="px-4 py-2 align-middle min-w-[280px]">{renderIdentity(member, pendingConfirmationCount)}</td>
                  <td className="px-3 py-2 align-middle text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatShortDate(member.program_start_date)} a {formatShortDate(member.program_end_date)}
                  </td>
                  <td className="px-3 py-2 align-middle min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={member.total_completed} max={12} tone={isComplete ? "success" : "brand"} className="flex-1 max-w-[110px]" label={`${member.total_completed} de 12 sessões`} />
                      <span className={`text-xs tabular-nums whitespace-nowrap ${isComplete ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {member.total_completed}/12
                      </span>
                    </div>
                  </td>
                  {isOverview ? (
                    monthColumns.map((mc) => {
                      const c = member.monthly_counts[mc] || 0;
                      return (
                        <td key={mc} className="px-1 py-2 align-middle text-center">
                          <span
                            className={`inline-flex w-8 h-8 rounded-ds items-center justify-center text-xs font-semibold tabular-nums ${monthCellClass(c)}`}
                            title={`${formatMonthShort(mc)}: ${c} sessão${c === 1 ? "" : "ões"}`}
                          >
                            {c}
                          </span>
                        </td>
                      );
                    })
                  ) : (
                    <>
                      <td className="px-3 py-2 align-middle whitespace-nowrap">
                        <span className="text-base font-semibold text-foreground tabular-nums">{monthCount}</span>
                        <span className="text-xs text-muted-foreground ml-1">de 2</span>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <StatusPill tone={monthPillTone(monthCount, monthScheduled)} size="sm">{monthStatusLabel(monthCount, monthScheduled)}</StatusPill>
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2 align-middle">
                    <div className="flex items-center justify-end gap-1">
                      {renderActions(member)}
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-ds-1 ${isExpanded ? "rotate-180" : ""}`} aria-hidden />
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td colSpan={colSpan} className="p-0">
                    <div className="px-4 py-2">
                      <AdminMemberNote memberId={member.id} initialNote={member.admin_note} />
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-5 pt-2 border-t border-border">
                        {renderExpanded(member)}
                      </div>
                    )}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </SectionCard>
  );

  const renderMobileList = () => (
    <SectionCard padding="none" className="lg:hidden">
      {filtered.map((member, i) => {
        const monthCount = filterKey ? (member.monthly_counts[filterKey] || 0) : member.total_completed;
        const monthScheduled = filterKey ? (member.monthly_scheduled_counts[filterKey] || 0) : member.total_scheduled;
        const pendingConfirmationCount = filterKey
          ? (member.monthly_pending_confirmation_counts?.[filterKey] || 0)
          : (member.total_pending_confirmation || 0);
        const isExpanded = expandedId === member.id;
        const isComplete = member.total_completed >= 12;
        const last = i === filtered.length - 1;
        return (
          <div key={member.id} className={last && !isExpanded ? "" : "border-b border-border"}>
            <ListRow
              last
              onPress={() => setExpandedId(isExpanded ? null : member.id)}
              aria-expanded={isExpanded}
              leading={<UserAvatar name={member.full_name} avatarUrl={member.avatar_url} size={40} />}
              title={
                <span className="inline-flex items-center gap-2 flex-wrap">
                  {shortName(member.full_name)}
                  {member.member_tier === "liberty" && <StatusPill tone="neutral" size="sm" withDot={false}>Liberty</StatusPill>}
                  {member.is_active === false && <StatusPill tone="neutral" size="sm" withDot={false}>Inativo</StatusPill>}
                  {!member.email && <StatusPill tone="warning" size="sm" withDot={false}>Sem e-mail</StatusPill>}
                </span>
              }
              subtitle={
                <span className="inline-flex items-center gap-2 flex-wrap">
                  {member.company_name && <span className="truncate">{toTitleCase(member.company_name)}</span>}
                  <span className={`tabular-nums ${isComplete ? "text-foreground font-medium" : ""}`}>{member.total_completed}/12</span>
                  {pendingConfirmationCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-status-orange"><Clock className="h-3 w-3" aria-hidden /> {pendingConfirmationCount} a confirmar</span>
                  )}
                </span>
              }
              trailing={
                <>
                  {!isOverview && <StatusPill tone={monthPillTone(monthCount, monthScheduled)} size="sm">{monthStatusLabel(monthCount, monthScheduled)}</StatusPill>}
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-ds-1 ${isExpanded ? "rotate-180" : ""}`} aria-hidden />
                </>
              }
            />
            {isExpanded && (
              <div className="px-4 pb-5 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
                  <ProgressBar value={member.total_completed} max={12} tone={isComplete ? "success" : "brand"} className="flex-1 min-w-[120px]" label={`${member.total_completed} de 12 sessões`} />
                  {renderActions(member)}
                </div>
                <AdminMemberNote memberId={member.id} initialNote={member.admin_note} />
                {renderExpanded(member)}
              </div>
            )}
          </div>
        );
      })}
    </SectionCard>
  );

  const importStatusPill = (status: ImportResult["status"]) => {
    switch (status) {
      case "created": return <StatusPill tone="success" size="sm">Criado</StatusPill>;
      case "updated": return <StatusPill tone="info" size="sm">Atualizado</StatusPill>;
      case "skipped": return <StatusPill tone="warning" size="sm">Ignorado</StatusPill>;
      case "error": return <StatusPill tone="danger" size="sm">Erro</StatusPill>;
      default: {
        const _exhaustive: never = status;
        return _exhaustive;
      }
    }
  };

  return (
    <AppLayout role="admin">
      <PageContainer variant="wide">
        <div className="space-y-6">
          <div>
            <PageHeader
              eyebrow="Admin"
              title={pageTitle}
              description={pageDescription}
              actions={
                <>
                  {duplicateGroups.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setDupOpen(true)}>
                      <GitMerge className="h-4 w-4" /> {duplicateGroups.length} duplicata{duplicateGroups.length > 1 ? "s" : ""}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={exportActiveMembers}>
                    <Download className="h-4 w-4" /> Exportar
                  </Button>
                  <Button variant="outline" size="sm" onClick={openImport}>
                    <Upload className="h-4 w-4" /> Importar
                  </Button>
                  <Button size="sm" onClick={openAdd}>
                    <Plus className="h-4 w-4" /> Novo membro
                  </Button>
                </>
              }
            />
          </div>

          {/* Barra de filtros */}
          <div className="space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Tipo de membro">
                <Chip active={tierTab === "begin"} onClick={() => setTierTab("begin")} count={tierCounts.begin}>Begin</Chip>
                <Chip active={tierTab === "liberty"} onClick={() => setTierTab("liberty")} count={tierCounts.liberty}>
                  <LibertyMark size={12} /> Liberty
                </Chip>
                <Chip active={tierTab === "inactive"} onClick={() => setTierTab("inactive")} count={tierCounts.inactive}>Encerrados</Chip>
              </div>
              <AdminMonthFilter />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 sm:max-w-sm">
                <TextField
                  type="search"
                  aria-label="Buscar membro, empresa ou e-mail"
                  placeholder="Buscar membro, empresa ou e-mail"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  leading={<Search />}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {filterOptions.map((f) => (
                  <Chip
                    key={f.key}
                    active={filter === f.key}
                    onClick={() => setFilter(f.key)}
                    count={baseList.filter((m) => matchesFilter(m, f.key)).length}
                  >
                    {f.label}
                  </Chip>
                ))}
                <Chip
                  active={sortMode === "priority"}
                  onClick={() => setSortMode(sortMode === "priority" ? "name" : "priority")}
                >
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Pendentes no topo
                </Chip>
              </div>
            </div>
          </div>

          {/* Lista */}
          {isLoading ? (
            <LoadingState variant="list" rows={8} />
          ) : isError ? (
            <ErrorState title="Não foi possível carregar os membros" onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={search ? "Nenhum membro encontrado" : "Nenhum membro neste filtro"}
              description={search ? "Tente outro nome, empresa ou e-mail." : "Ajuste o filtro de mês ou cadastre um novo membro."}
              action={!search ? <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4" /> Novo membro</Button> : undefined}
            />
          ) : (
            <div>
              {renderTable()}
              {renderMobileList()}
            </div>
          )}
        </div>
      </PageContainer>

      {/* Novo membro */}
      <BottomSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Novo membro"
        description="Nome e telefone são obrigatórios. O e-mail cria o acesso."
        locked={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando" : "Adicionar"}</Button>
          </>
        }
      >
        {renderMemberForm()}
      </BottomSheet>

      {/* Editar membro */}
      <BottomSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Editar membro"
        description="Dados básicos. Para o cadastro completo, use Editar cadastro completo."
        locked={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando" : "Salvar"}</Button>
          </>
        }
      >
        {renderMemberForm()}
      </BottomSheet>

      {/* Importar planilha */}
      <BottomSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar membros via planilha"
        description="Aceita .xlsx, .xls ou .csv. Reconhecemos os cabeçalhos automaticamente; só Nome e E-mail são obrigatórios."
        size="lg"
        locked={importing}
        footer={<Button variant="ghost" onClick={() => setImportOpen(false)} disabled={importing}>Fechar</Button>}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Se o e-mail já existir, o perfil é atualizado; caso contrário, criamos o membro com senha temporária. Datas em AAAA-MM-DD ou DD/MM/AAAA.
          </p>
          <SectionCard padding="compact" className="space-y-2">
            <p className="text-sm font-medium text-foreground">Tipo de membro desta planilha</p>
            <div className="flex gap-2">
              <Chip active={importTier === "begin"} onClick={() => setImportTier("begin")} disabled={importing}>Begin</Chip>
              <Chip active={importTier === "liberty"} onClick={() => setImportTier("liberty")} disabled={importing}>
                <LibertyMark size={12} /> Liberty (premium)
              </Chip>
            </div>
            <p className="text-xs text-muted-foreground">
              Aplicado a todas as linhas sem a coluna “Tipo de Membro”. Linhas com “Liberty” na planilha sempre viram Liberty.
            </p>
          </SectionCard>

          <div className="grid sm:grid-cols-2 gap-3">
            <Button onClick={downloadFullTemplate} variant="outline" className="w-full">
              <Download className="h-4 w-4" /> Baixar modelo (opcional)
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} disabled={importing} className="hidden" aria-label="Selecionar planilha" />
            <Button onClick={() => fileRef.current?.click()} disabled={importing} className="w-full">
              {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando</> : <><Upload className="h-4 w-4" /> Selecionar arquivo</>}
            </Button>
          </div>

          {importSummary && importResults && (
            <SectionCard padding="compact" className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {importSummary.created} criados
                  {importSummary.updated !== undefined && ` · ${importSummary.updated} atualizados`}
                  {importSummary.skipped !== undefined && ` · ${importSummary.skipped} ignorados`}
                  {` · ${importSummary.errors} erros`}
                </p>
                {importSummary.created > 0 && (
                  <Button size="sm" onClick={downloadCredentials}>
                    <KeyRound className="h-4 w-4" /> Baixar senhas
                  </Button>
                )}
              </div>
              <div className="max-h-64 overflow-auto rounded-ds border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                    <tr>
                      <th scope="col" className="text-left p-2 font-medium">Status</th>
                      <th scope="col" className="text-left p-2 font-medium">Nome</th>
                      <th scope="col" className="text-left p-2 font-medium">E-mail</th>
                      <th scope="col" className="text-left p-2 font-medium">Senha / Mensagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResults.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2">{importStatusPill(r.status)}</td>
                        <td className="p-2">{r.full_name}</td>
                        <td className="p-2 text-muted-foreground">{r.email}</td>
                        <td className="p-2 font-mono">{r.status === "created" ? r.password : r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>
      </BottomSheet>

      {/* Relatório */}
      <BottomSheet
        open={!!reportModal}
        onOpenChange={(o) => !o && setReportModal(null)}
        title={`Relatório: ${reportModal?.session_name ?? ""}`}
        size="sm"
      >
        {report ? (
          <div className="space-y-4 text-sm">
            {[
              ["Resumo", report.summary],
              ["Metas", report.goals],
              ["Plano de ação", report.action_plan],
              ["Impressões do mentor", report.mentor_impressions],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label}>
                <h3 className="text-sm font-semibold text-foreground mb-1">{label}</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">{value}</p>
              </div>
            ))}
            {!report.summary && !report.goals && !report.action_plan && !report.mentor_impressions && (
              <EmptyState compact icon={FileText} title="Relatório ainda não preenchido" />
            )}
          </div>
        ) : (
          <EmptyState compact icon={FileText} title="Nenhum relatório encontrado para esta sessão" />
        )}
      </BottomSheet>

      <AccessCredentialsDialog data={credentialsDialog} onClose={() => setCredentialsDialog(null)} />

      {/* Duplicatas */}
      <BottomSheet
        open={dupOpen}
        onOpenChange={setDupOpen}
        title={<span className="inline-flex items-center gap-2"><GitMerge className="h-4 w-4 text-muted-foreground" aria-hidden /> Perfis duplicados</span>}
        description={`Detectamos ${duplicateGroups.length} grupo(s) de possíveis duplicatas (mesmo primeiro e último nome). Escolha qual perfil manter; o outro será mesclado no principal e removido.`}
        size="lg"
        footer={<Button variant="ghost" onClick={() => setDupOpen(false)}>Fechar</Button>}
      >
        <div className="space-y-4">
          {duplicateGroups.map((g) => (
            <SectionCard key={g.key} padding="compact" className="space-y-2">
              <SectionHeader as="h3" title={toTitleCase(g.profiles[0].full_name)} />
              <div className="grid gap-2">
                {g.profiles.map((p) => (
                  <div key={p.id} className="rounded-ds border border-border p-3 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm text-foreground font-medium">{toTitleCase(p.full_name)}</div>
                        <div className="text-muted-foreground truncate">
                          {p.email || "sem e-mail"} · {p.phone || "sem telefone"} · {p.member_tier}
                        </div>
                        <div className="text-muted-foreground tabular-nums">
                          {p.total_completed} realizadas · {p.total_scheduled} agendadas
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {g.profiles.filter((o) => o.id !== p.id).map((other) => {
                          const busy = mergingKey === g.key + p.id + other.id;
                          return (
                            <Button
                              key={other.id}
                              variant="outline"
                              size="sm"
                              onClick={() => openMergeConfirm(p, other, g.key)}
                              disabled={!!mergingKey}
                            >
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
                              Manter este e mesclar
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
          {duplicateGroups.length === 0 && (
            <EmptyState compact icon={CheckCircle2} title="Nenhuma duplicata detectada" />
          )}

          {mergeLog && mergeLog.length > 0 && (
            <SectionCard padding="none">
              <div className="px-4 pt-3 pb-1">
                <SectionHeader as="h3" title="Últimas mesclagens" />
              </div>
              {mergeLog.map((l: any, i: number) => (
                <ListRow
                  key={l.id}
                  last={i === mergeLog.length - 1}
                  title={`${toTitleCase(l.loser_name || "")} → ${toTitleCase(l.winner_name || "")}`}
                  subtitle={`${new Date(l.created_at).toLocaleString("pt-BR")}${l.undone_at ? " · desfeita" : ""}`}
                  trailing={
                    !l.undone_at ? (
                      <Button size="sm" variant="outline" disabled={mergeBusy} onClick={() => undoMerge(l.id)}>Desfazer</Button>
                    ) : (
                      <StatusPill tone="neutral" size="sm" withDot={false}>Desfeita</StatusPill>
                    )
                  }
                />
              ))}
            </SectionCard>
          )}
        </div>
      </BottomSheet>

      {/* Confirmar mesclagem */}
      <BottomSheet
        open={!!mergeTarget}
        onOpenChange={(o) => { if (!o) setMergeTarget(null); }}
        title={<span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden /> Confirmar mesclagem</span>}
        description="As sessões, relatórios e o acesso do perfil removido passam para o perfil mantido. A mesclagem fica em Últimas mesclagens e pode ser desfeita."
        size="sm"
        locked={mergeBusy}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMergeTarget(null)} disabled={mergeBusy}>Cancelar</Button>
            <Button disabled={mergeBusy || mergeBlockers.length > 0} onClick={runMerge}>
              {mergeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              Mesclar perfis
            </Button>
          </>
        }
      >
        {mergeTarget && (
          <div className="space-y-3 text-sm">
            <SectionCard padding="compact">
              <p className="ds-kicker mb-1">Perfil que será mantido</p>
              <p className="text-foreground font-medium">{toTitleCase(mergeTarget.winner.full_name)}</p>
              <p className="text-xs text-muted-foreground">{mergeTarget.winner.email || "sem e-mail"} · {mergeTarget.winner.member_tier}</p>
            </SectionCard>
            <SectionCard padding="compact">
              <p className="ds-kicker mb-1">Perfil que será removido</p>
              <p className="text-foreground font-medium">{toTitleCase(mergeTarget.loser.full_name)}</p>
              <p className="text-xs text-muted-foreground">{mergeTarget.loser.email || "sem e-mail"} · {mergeTarget.loser.member_tier}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{mergeTarget.loser.total_completed} realizadas · {mergeTarget.loser.total_scheduled} agendadas</p>
            </SectionCard>

            {mergeBlockers.length > 0 && (
              <Callout tone="danger" icon={AlertCircle} title="Parece que são pessoas diferentes">
                <ul className="list-disc pl-4 space-y-0.5">
                  {mergeBlockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
                <p className="mt-2">A mesclagem foi bloqueada e não pode ser forçada. Corrija os cadastros separadamente.</p>
              </Callout>
            )}
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={!!confirmState}
        onOpenChange={(o) => !o && setConfirmState(null)}
        title={confirmState?.title ?? ""}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel}
        destructive={confirmState?.destructive}
        onConfirm={async () => {
          const req = confirmState;
          setConfirmState(null);
          if (req) await req.onConfirm();
        }}
      />
    </AppLayout>
  );
};

export default AdminMembrosPage;
