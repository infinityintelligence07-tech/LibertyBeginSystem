import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDemoData } from "@/contexts/DemoDataContext";

export interface RankedMember {
  id: string;
  full_name: string;
  photo_url: string | null;
  company_name: string | null;
  points: number;
  is_featured: boolean;
  featured_position: number | null;
  tier: string | null;
  role_label?: string;
}

const DEMO_MEMBERS: RankedMember[] = [
  { id: "demo-1", full_name: "Ana Beatriz Silva", photo_url: null, company_name: "AB Confecções", points: 320, is_featured: true, featured_position: 1, tier: "begin", role_label: "Liberty Begin" },
  { id: "demo-2", full_name: "Rafael Almeida Costa", photo_url: null, company_name: "Costa Logística", points: 285, is_featured: true, featured_position: 2, tier: "begin", role_label: "Liberty Begin" },
  { id: "demo-3", full_name: "Juliana Ferreira Rocha", photo_url: null, company_name: "JFR Marketing", points: 260, is_featured: true, featured_position: 3, tier: "liberty", role_label: "Liberty" },
  { id: "demo-4", full_name: "Mateus Oliveira Souza", photo_url: null, company_name: "Mentor Liberty", points: 240, is_featured: false, featured_position: null, tier: null, role_label: "Mentor" },
  { id: "demo-5", full_name: "Camila Rodrigues Mendes", photo_url: null, company_name: "Doce Camila", points: 215, is_featured: false, featured_position: null, tier: "begin", role_label: "Liberty Begin" },
  { id: "demo-6", full_name: "Bruno Henrique Lima", photo_url: null, company_name: "BH Construtora", points: 190, is_featured: false, featured_position: null, tier: "begin", role_label: "Liberty Begin" },
  { id: "demo-7", full_name: "Fernanda Duarte Alves", photo_url: null, company_name: "Estúdio Fê", points: 175, is_featured: false, featured_position: null, tier: "liberty", role_label: "Liberty" },
  { id: "demo-8", full_name: "Pedro Henrique Santos", photo_url: null, company_name: "PH Consultoria", points: 160, is_featured: false, featured_position: null, tier: "begin", role_label: "Liberty Begin" },
  { id: "demo-9", full_name: "Larissa Campos Freitas", photo_url: null, company_name: "LCF Educação", points: 145, is_featured: false, featured_position: null, tier: "begin", role_label: "Liberty Begin" },
  { id: "demo-10", full_name: "Tiago Barbosa Ribeiro", photo_url: null, company_name: "Barbosa Auto", points: 130, is_featured: false, featured_position: null, tier: "liberty", role_label: "Liberty" },
  { id: "demo-11", full_name: "Marina Cavalcante Nunes", photo_url: null, company_name: "Studio Marina", points: 115, is_featured: false, featured_position: null, tier: "begin", role_label: "Liberty Begin" },
  { id: "demo-12", full_name: "Diego Martins Peixoto", photo_url: null, company_name: "DMP Tech", points: 95, is_featured: false, featured_position: null, tier: "begin", role_label: "Liberty Begin" },
];

export const DEMO_TESTIMONIALS = [
  { id: "dt-1", member_id: "demo-1", headline: "Fatirei R$ 120k em 4 meses após o programa", content: "Antes da Liberty eu tinha uma loja pequena e vivia apagando incêndios. Depois das primeiras sessões consegui estruturar time, processo e vendas. Em 4 meses o faturamento triplicou.", result_metric: "+280% em faturamento", created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
  { id: "dt-2", member_id: "demo-2", headline: "Contratei 6 pessoas e saí da operação", content: "A mentoria me ajudou a delegar de verdade. Hoje minha equipe roda sem mim e eu foco em estratégia e novos mercados.", result_metric: "6 contratações estratégicas", created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: "dt-3", member_id: "demo-3", headline: "Abri a segunda unidade este ano", content: "O acompanhamento próximo do meu mentor mudou minha forma de tomar decisão. Consegui financiamento, estruturei o time e abri a segunda unidade em 8 meses.", result_metric: "2ª unidade aberta", created_at: new Date(Date.now() - 8 * 86400000).toISOString() },
  { id: "dt-4", member_id: "demo-5", headline: "Aumentei ticket médio em 60%", content: "Reposicionamento de marca e nova estratégia comercial. Resultado veio na 6ª sessão.", result_metric: "+60% ticket médio", created_at: new Date(Date.now() - 12 * 86400000).toISOString() },
];

export const useRankingData = () => {
  const { demoEnabled } = useDemoData();

  return useQuery({
    queryKey: ["ranking-members", demoEnabled ? "demo" : "live"],
    staleTime: 60_000,
    queryFn: async (): Promise<RankedMember[]> => {
      const [profilesRes, pointsRes, rolesRes, lookupRes] = await Promise.all([
        supabase.rpc("get_ranking_board"),
        supabase.rpc("get_ranking_totals"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("profile_user_lookup").select("profile_id, user_id"),
      ]);

      const pointsMap = new Map<string, number>();
      (pointsRes.data || []).forEach((p: any) => {
        pointsMap.set(p.member_id, Number(p.points) || 0);
      });

      const roleByUser = new Map<string, string>();
      (rolesRes.data || []).forEach((r: any) => {
        // Priority: admin > mentor > liberty
        const cur = roleByUser.get(r.user_id);
        const rank = (v: string) => v === "super_admin" || v === "admin" ? 3 : v === "mentor" ? 2 : 1;
        if (!cur || rank(r.role) > rank(cur)) roleByUser.set(r.user_id, r.role);
      });
      const roleByProfile = new Map<string, string>();
      (lookupRes.data || []).forEach((l: any) => {
        const r = roleByUser.get(l.user_id);
        if (r) roleByProfile.set(l.profile_id, r);
      });

      const roleLabel = (r?: string, tier?: string | null) => {
        if (r === "admin" || r === "super_admin") return "Admin";
        if (r === "mentor") return "Mentor";
        if (tier === "liberty") return "Liberty";
        return "Liberty Begin";
      };

      const members: RankedMember[] = (profilesRes.data || []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name || "Membro",
        photo_url: p.avatar_url,
        company_name: p.company_name,
        points: pointsMap.get(p.id) || 0,
        is_featured: !!p.is_ranking_featured,
        featured_position: p.featured_position ?? null,
        tier: p.member_tier ?? null,
        role_label: roleLabel(roleByProfile.get(p.id), p.member_tier),
      }));

      const combined = demoEnabled ? [...DEMO_MEMBERS, ...members] : members;

      combined.sort((a, b) => {
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        if (a.is_featured && b.is_featured) {
          return (a.featured_position ?? 999) - (b.featured_position ?? 999);
        }
        return b.points - a.points;
      });

      return combined;
    },
  });
};
