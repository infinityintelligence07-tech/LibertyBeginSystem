import type { ReactNode } from "react";
import {
  Phone, Mail, MapPin, Building2, Cake, Instagram, Heart, Briefcase,
  TrendingUp, DollarSign, AlertCircle, Trophy, Compass, User, Star, Calendar,
  CheckCircle2 as CheckMark, type LucideIcon,
} from "lucide-react";
import { LibertyMark } from "@/components/LibertyMark";
import { SectionCard, SectionHeader, StatusPill } from "@/components/ds";

interface Props {
  profile: Record<string, unknown> | null;
}

const Field = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: string | number | null }) => {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground break-words leading-snug">{String(value)}</p>
      </div>
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => {
  const arr = Array.isArray(children) ? children : [children];
  const hasContent = arr.some(Boolean);
  if (!hasContent) return null;
  return (
    <div className="space-y-3">
      <SectionHeader as="h3" title={title} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
};

const Narrative = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: string | null }) => {
  if (!value) return null;
  return (
    <SectionCard padding="compact">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </p>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{value}</p>
    </SectionCard>
  );
};

export const MemberProfilePanel = ({ profile }: Props) => {
  if (!profile) return null;
  const p = profile as Record<string, string | number | null | undefined>;
  const formatDate = (v?: string | number | null) => (v ? new Date(String(v) + "T12:00:00").toLocaleDateString("pt-BR") : null);
  const formatMoney = (v?: string | number | null) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "string" ? parseFloat(v.replace(/\./g, "").replace(",", ".")) : v;
    return Number.isNaN(n) ? String(v) : `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };
  const str = (v?: string | number | null) => (v === null || v === undefined ? null : String(v));

  return (
    <div className="px-4 py-4 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="ds-kicker">Sobre o aluno</p>
        {p.member_tier === "liberty" && (
          <StatusPill tone="neutral" withDot={false}>
            <LibertyMark size={12} /> Liberty
          </StatusPill>
        )}
      </div>

      <Section title="Contato">
        <Field icon={Mail} label="E-mail" value={str(p.email)} />
        <Field icon={Phone} label="Telefone" value={str(p.phone)} />
        <Field icon={MapPin} label="Cidade / Estado" value={str(p.city_state)} />
        <Field icon={Instagram} label="Instagram pessoal" value={str(p.instagram_personal)} />
        <Field icon={Cake} label="Nascimento" value={formatDate(p.birth_date)} />
        <Field icon={Heart} label="Estado civil" value={str(p.marital_status)} />
      </Section>

      <Section title="Empresa">
        <Field icon={Building2} label="Nome da empresa" value={str(p.company_name)} />
        <Field icon={Briefcase} label="Segmento" value={str(p.company_segment)} />
        <Field icon={MapPin} label="Endereço da empresa" value={str(p.company_address)} />
        <Field icon={Instagram} label="Instagram da empresa" value={str(p.company_instagram)} />
        <Field icon={TrendingUp} label="Tempo de mercado" value={str(p.business_age)} />
        <Field icon={User} label="Colaboradores" value={str(p.employees_count)} />
      </Section>

      <Section title="Saúde financeira">
        <Field icon={DollarSign} label="Faturamento mensal" value={formatMoney(p.monthly_revenue)} />
        <Field icon={TrendingUp} label="Margem de lucro" value={str(p.profit_margin)} />
        <Field icon={CheckMark} label="Compraria de si mesmo?" value={str(p.would_buy_self)} />
        <Field icon={CheckMark} label="Controle financeiro" value={str(p.financial_control)} />
        <Field icon={CheckMark} label="Usa DRE" value={str(p.uses_dre)} />
        <Field icon={CheckMark} label="Custos e despesas" value={str(p.costs_expenses)} />
      </Section>

      <Section title="Programa">
        <Field icon={Calendar} label="Início do programa" value={formatDate(p.program_start_date)} />
        <Field icon={Calendar} label="Fim do programa" value={formatDate(p.program_end_date)} />
        <Field icon={Compass} label="Setor a desenvolver" value={str(p.sector_to_develop)} />
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Narrative icon={User} label="História pessoal" value={str(p.personal_story)} />
        <Narrative icon={Briefcase} label="O que a empresa faz" value={str(p.business_description)} />
        <Narrative icon={AlertCircle} label="Principal dor" value={str(p.main_pain)} />
        <Narrative icon={AlertCircle} label="Desafio financeiro" value={str(p.financial_challenge)} />
        <Narrative icon={Trophy} label="Desafio 2026" value={str(p.challenge_2026)} />
        <Narrative icon={Star} label="Sonho 2026" value={str(p.dream_2026)} />
        <Narrative icon={Compass} label="Visão em 6 meses" value={str(p.vision_6_months)} />
        <Narrative icon={Trophy} label="Expectativa do programa" value={str(p.program_expectation)} />
      </div>
    </div>
  );
};
