/**
 * Demo data — visible ONLY when an admin/super_admin enables the toggle.
 * These objects are never persisted to the database; they are merged into
 * query results client-side via the DemoDataContext flag.
 */
import { addDays, format } from "date-fns";

const today = new Date();
const d = (offset: number) => format(addDays(today, offset), "yyyy-MM-dd");

export const DEMO_FLAG = "__demo__";

export interface DemoMember {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  member_tier: "begin" | "liberty";
  is_active: boolean;
  company_name: string;
  monthly_revenue: string;
  program_start_date: string;
  __demo__: true;
  user_id: string;
}

export const demoMembers: DemoMember[] = [
  {
    id: "demo-m-1",
    user_id: "demo-u-1",
    full_name: "Ana Beatriz Silva",
    email: "ana.silva@exemplo.com",
    phone: "(11) 98888-1111",
    avatar_url: null,
    member_tier: "begin",
    is_active: true,
    company_name: "Doceria Doce Ana",
    monthly_revenue: "R$ 18.000",
    program_start_date: d(-60),
    __demo__: true,
  },
  {
    id: "demo-m-2",
    user_id: "demo-u-2",
    full_name: "Carlos Mendes",
    email: "carlos.mendes@exemplo.com",
    phone: "(21) 97777-2222",
    avatar_url: null,
    member_tier: "begin",
    is_active: true,
    company_name: "Mendes Marketing",
    monthly_revenue: "R$ 32.500",
    program_start_date: d(-90),
    __demo__: true,
  },
  {
    id: "demo-m-3",
    user_id: "demo-u-3",
    full_name: "Juliana Pereira",
    email: "juliana.p@exemplo.com",
    phone: "(31) 96666-3333",
    avatar_url: null,
    member_tier: "liberty",
    is_active: true,
    company_name: "Estúdio Jujuba",
    monthly_revenue: "R$ 45.000",
    program_start_date: d(-180),
    __demo__: true,
  },
];

export interface DemoMentor {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  session_rate: number;
  is_active: boolean;
  __demo__: true;
}

export const demoMentors: DemoMentor[] = [
  {
    id: "demo-mentor-1",
    user_id: "demo-mu-1",
    full_name: "Ricardo Almeida",
    email: "ricardo.almeida@exemplo.com",
    avatar_url: null,
    session_rate: 350,
    is_active: true,
    __demo__: true,
  },
  {
    id: "demo-mentor-2",
    user_id: "demo-mu-2",
    full_name: "Patrícia Souza",
    email: "patricia.souza@exemplo.com",
    avatar_url: null,
    session_rate: 400,
    is_active: true,
    __demo__: true,
  },
];

export interface DemoBooking {
  id: string;
  liberty_id: string;
  mentor_id: string;
  session_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "completed" | "cancelled";
  zoom_link: string | null;
  __demo__: true;
  liberty?: { full_name: string; avatar_url: string | null };
  mentor?: { full_name: string; avatar_url: string | null };
  session?: { name: string; pillar: string | null };
}

/** Usa SEMPRE sessões reais da jornada Begin (ids/nomes do banco). */
export const demoBookings: DemoBooking[] = [
  {
    id: "demo-b-1",
    liberty_id: "demo-m-1",
    mentor_id: "demo-mentor-1",
    session_id: "0c66bfa4-8ba9-4cb0-a6de-9b412a699654",
    scheduled_date: d(-21),
    start_time: "09:00:00",
    end_time: "12:00:00",
    status: "completed",
    zoom_link: null,
    __demo__: true,
    liberty: { full_name: "Ana Beatriz Silva", avatar_url: null },
    mentor: { full_name: "Ricardo Almeida", avatar_url: null },
    session: { name: "Mapeamento do Negócio", pillar: null },
  },
  {
    id: "demo-b-2",
    liberty_id: "demo-m-2",
    mentor_id: "demo-mentor-2",
    session_id: "f3461844-1828-4a81-91d9-748fea629dd3",
    scheduled_date: d(-14),
    start_time: "14:00:00",
    end_time: "15:30:00",
    status: "completed",
    zoom_link: null,
    __demo__: true,
    liberty: { full_name: "Carlos Mendes", avatar_url: null },
    mentor: { full_name: "Patrícia Souza", avatar_url: null },
    session: { name: "Cultura Organizacional", pillar: null },
  },
  {
    id: "demo-b-5",
    liberty_id: "demo-m-2",
    mentor_id: "demo-mentor-2",
    session_id: "60ceadd4-7060-492c-ab44-bd3e426a6501",
    scheduled_date: d(-5),
    start_time: "10:00:00",
    end_time: "11:30:00",
    status: "completed",
    zoom_link: null,
    __demo__: true,
    liberty: { full_name: "Carlos Mendes", avatar_url: null },
    mentor: { full_name: "Patrícia Souza", avatar_url: null },
    session: { name: "Organograma", pillar: null },
  },
  {
    id: "demo-b-3",
    liberty_id: "demo-m-3",
    mentor_id: "demo-mentor-1",
    session_id: "3f253459-2f59-4493-ab32-42e438848b00",
    scheduled_date: d(3),
    start_time: "09:00:00",
    end_time: "10:30:00",
    status: "scheduled",
    zoom_link: "https://zoom.us/j/demo",
    __demo__: true,
    liberty: { full_name: "Juliana Pereira", avatar_url: null },
    mentor: { full_name: "Ricardo Almeida", avatar_url: null },
    session: { name: "Financeiro 1", pillar: null },
  },
  {
    id: "demo-b-4",
    liberty_id: "demo-m-1",
    mentor_id: "demo-mentor-2",
    session_id: "9e4a7e01-d38e-47dc-ae01-aaed21a4f36b",
    scheduled_date: d(7),
    start_time: "16:00:00",
    end_time: "17:30:00",
    status: "scheduled",
    zoom_link: "https://zoom.us/j/demo2",
    __demo__: true,
    liberty: { full_name: "Ana Beatriz Silva", avatar_url: null },
    mentor: { full_name: "Patrícia Souza", avatar_url: null },
    session: { name: "Vendas", pillar: null },
  },
];


export const isDemoId = (id?: string | null) => !!id && id.startsWith("demo-");
