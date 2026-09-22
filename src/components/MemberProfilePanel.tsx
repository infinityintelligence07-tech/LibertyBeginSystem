import {
  Phone, Mail, MapPin, Building2, Cake, Instagram, Heart, Briefcase,
  TrendingUp, DollarSign, AlertCircle, Trophy, Compass, User, Star,
} from "lucide-react";
import { LibertyMark } from "@/components/LibertyMark";

interface Props {
  profile: any;
}

const Field = ({ icon: Icon, label, value }: { icon: any; label: string; value?: string | number | null }) => {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className="text-xs text-foreground break-words leading-snug">{String(value)}</p>
      </div>
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => {
  const arr = Array.isArray(children) ? children : [children];
  const hasContent = arr.some(Boolean);
  if (!hasContent) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80 mb-2">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
};

const Narrative = ({ icon: Icon, label, value, tone = "default" }: { icon: any; label: string; value?: string | null; tone?: "default" | "warn" | "good" }) => {
  if (!value) return null;
  const toneClass =
    tone === "warn" ? "border-status-yellow/30 bg-status-yellow/5" :
    tone === "good" ? "border-status-green/30 bg-status-green/5" :
    "border-border bg-muted/20";
  return (
    <div className={`rounded-lg border ${toneClass} p-3`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
};

export const MemberProfilePanel = ({ profile }: Props) => {
  if (!profile) return null;
  const p = profile;
  const formatDate = (v?: string | null) => v ? new Date(v + "T12:00:00").toLocaleDateString("pt-BR") : null;
  const formatMoney = (v?: string | number | null) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "string" ? parseFloat(v) : v;
    return isNaN(n) ? String(v) : `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="px-4 py-4 bg-card/40 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">Sobre o aluno</p>
        {p.member_tier === "liberty" && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
            <LibertyMark size={12} /> Liberty
          </span>
        )}
      </div>

      <Section title="Contato">
        <Field icon={Mail} label="E-mail" value={p.email} />
        <Field icon={Phone} label="Telefone" value={p.phone} />
        <Field icon={MapPin} label="Cidade / Estado" value={p.city_state} />
        <Field icon={Instagram} label="Instagram pessoal" value={p.instagram_personal} />
        <Field icon={Cake} label="Nascimento" value={formatDate(p.birth_date)} />
        <Field icon={Heart} label="Estado civil" value={p.marital_status} />
      </Section>

      <Section title="Empresa">
        <Field icon={Building2} label="Nome da empresa" value={p.company_name} />
        <Field icon={Briefcase} label="Segmento" value={p.company_segment} />
        <Field icon={MapPin} label="Endereço da empresa" value={p.company_address} />
        <Field icon={Instagram} label="Instagram da empresa" value={p.company_instagram} />
        <Field icon={TrendingUp} label="Tempo de mercado" value={p.business_age} />
        <Field icon={User} label="Colaboradores" value={p.employees_count} />
      </Section>

      <Section title="Saúde financeira">
        <Field icon={DollarSign} label="Faturamento mensal" value={formatMoney(p.monthly_revenue)} />
        <Field icon={TrendingUp} label="Margem de lucro" value={p.profit_margin} />
        <Field icon={CheckMark} label="Compraria de si mesmo?" value={p.would_buy_self} />
        <Field icon={CheckMark} label="Controle financeiro" value={p.financial_control} />
        <Field icon={CheckMark} label="Usa DRE" value={p.uses_dre} />
        <Field icon={CheckMark} label="Custos & despesas" value={p.costs_expenses} />
      </Section>

      <Section title="Programa">
        <Field icon={Calendar} label="Início do programa" value={formatDate(p.program_start_date)} />
        <Field icon={Calendar} label="Fim do programa" value={formatDate(p.program_end_date)} />
        <Field icon={Compass} label="Setor a desenvolver" value={p.sector_to_develop} />
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Narrative icon={User} label="História pessoal" value={p.personal_story} />
        <Narrative icon={Briefcase} label="O que a empresa faz" value={p.business_description} />
        <Narrative icon={AlertCircle} label="Principal dor" value={p.main_pain} tone="warn" />
        <Narrative icon={AlertCircle} label="Desafio financeiro" value={p.financial_challenge} tone="warn" />
        <Narrative icon={Trophy} label="Desafio 2026" value={p.challenge_2026} />
        <Narrative icon={Star} label="Sonho 2026" value={p.dream_2026} tone="good" />
        <Narrative icon={Compass} label="Visão em 6 meses" value={p.vision_6_months} />
        <Narrative icon={Trophy} label="Expectativa do programa" value={p.program_expectation} tone="good" />
      </div>
    </div>
  );
};

// Local imports kept lean
import { Calendar } from "lucide-react";
import { CheckCircle2 as CheckMark } from "lucide-react";
