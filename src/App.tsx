import { useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SplashScreen } from "@/components/SplashScreen";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminFilterProvider } from "@/contexts/AdminFilterContext";
import { ViewAsProvider } from "@/contexts/ViewAsContext";
import { DemoDataProvider } from "@/contexts/DemoDataContext";
import { ThemeProvider } from "@/hooks/useTheme";
import LoginPage from "./pages/Login";
import ResetPasswordPage from "./pages/ResetPassword";
import OnboardingPage from "./pages/Onboarding";
import { ScrollMemory } from "@/components/ScrollMemory";
import DashboardPage from "./pages/Dashboard";
import JourneyPage from "./pages/Journey";
import SupportPage from "./pages/Support";
import ConteudosPage from "./pages/Conteudos";
import FerramentasPage from "./pages/Ferramentas";
import EventosPage from "./pages/Eventos";
import RankingPage from "./pages/Ranking";
import MentorDashboardPage from "./pages/MentorDashboard";
import AdminDashboardPage from "./pages/AdminDashboard";
import AdminAgendaPage from "./pages/AdminAgenda";
import AdminMembrosPage from "./pages/AdminMembros";
import AdminEncerramentosPage from "./pages/AdminEncerramentos";
import AdminMembroEditarPage from "./pages/AdminMembroEditar";
import AdminMembroDetalhesPage from "./pages/AdminMembroDetalhes";
import AdminMentoresPage from "./pages/AdminMentores";
import AdminFinanceiroPage from "./pages/AdminFinanceiro";
import AdminSessoesPage from "./pages/AdminSessoes";
import AdminConteudosPage from "./pages/AdminConteudos";
import AdminEventosPage from "./pages/AdminEventos";
import AdminConfiguracoesPage from "./pages/AdminConfiguracoes";


import AgendarSessaoPage from "./pages/AgendarSessao";
import MentorRelatorioPage from "./pages/MentorRelatorio";
import MentorDisponibilidadePage from "./pages/MentorDisponibilidade";
import MentorSessoesPage from "./pages/MentorSessoes";
import MentorAlunosPage from "./pages/MentorAlunos";
import MentorFerramentasPage from "./pages/MentorFerramentas";
import FerramentaModeloPage from "./pages/FerramentaModelo";
import FerramentaAplicacaoPage from "./pages/FerramentaAplicacao";
import AgendaOverviewPage from "./pages/AgendaOverview";
import ProfilePage from "./pages/Profile";
import NpsFormPage from "./pages/NpsForm";
import AdminNpsPage from "./pages/AdminNps";
import NotFound from "./pages/NotFound";
import TarefasPage from "./pages/TarefasPage";

import { GlobalLoadingBar } from "@/components/GlobalLoadingBar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mantém dados "frescos" por 60s → navegar entre páginas usa cache instantâneo
      staleTime: 60_000,
      // Guarda no cache por 10 min mesmo sem uso → voltar em uma tela mostra dados na hora
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

const App = () => {
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashComplete = useCallback(() => setSplashDone(true), []);

  if (!splashDone) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <AuthProvider>
        <ViewAsProvider>
        <DemoDataProvider>
        <TooltipProvider>
          <Sonner />
          <GlobalLoadingBar />
          <BrowserRouter>
            <ScrollMemory />
            <Routes>
              {/* Public */}
              <Route path="/" element={<LoginPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/onboarding" element={<ProtectedRoute allowedRoles={["liberty"]}><OnboardingPage /></ProtectedRoute>} />


              {/* Liberty */}
              <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["liberty"]}><DashboardPage /></ProtectedRoute>} />
              <Route path="/jornada" element={<ProtectedRoute allowedRoles={["liberty"]}><JourneyPage /></ProtectedRoute>} />
              <Route path="/agenda" element={<ProtectedRoute allowedRoles={["liberty"]}><AgendaOverviewPage /></ProtectedRoute>} />
              <Route path="/agenda/agendar" element={<ProtectedRoute allowedRoles={["liberty"]}><AgendarSessaoPage /></ProtectedRoute>} />
              <Route path="/agenda/overview" element={<ProtectedRoute allowedRoles={["liberty"]}><AgendaOverviewPage /></ProtectedRoute>} />
              <Route path="/conteudos" element={<ProtectedRoute allowedRoles={["liberty"]}><ConteudosPage /></ProtectedRoute>} />
              <Route path="/ferramentas" element={<ProtectedRoute allowedRoles={["liberty"]}><FerramentasPage /></ProtectedRoute>} />
              <Route path="/eventos" element={<ProtectedRoute allowedRoles={["liberty"]}><EventosPage /></ProtectedRoute>} />
              <Route path="/perfil" element={<ProtectedRoute allowedRoles={["liberty"]}><ProfilePage role="liberty" /></ProtectedRoute>} />
              <Route path="/suporte" element={<ProtectedRoute allowedRoles={["liberty"]}><SupportPage /></ProtectedRoute>} />
              <Route path="/nps" element={<ProtectedRoute allowedRoles={["liberty"]}><NpsFormPage /></ProtectedRoute>} />
              <Route path="/nps/:bookingId" element={<ProtectedRoute allowedRoles={["liberty"]}><NpsFormPage /></ProtectedRoute>} />
              <Route path="/tarefas" element={<ProtectedRoute allowedRoles={["liberty"]}><TarefasPage role="liberty" /></ProtectedRoute>} />
              <Route path="/ranking" element={<ProtectedRoute allowedRoles={["liberty","mentor","admin"]}><RankingPage /></ProtectedRoute>} />

              {/* Mentor */}
              <Route path="/mentor/dashboard" element={<ProtectedRoute allowedRoles={["mentor"]}><MentorDashboardPage /></ProtectedRoute>} />
              <Route path="/mentor/sessoes" element={<ProtectedRoute allowedRoles={["mentor"]}><MentorSessoesPage /></ProtectedRoute>} />
              <Route path="/mentor/alunos" element={<ProtectedRoute allowedRoles={["mentor"]}><MentorAlunosPage /></ProtectedRoute>} />
              <Route path="/mentor/alunos/:id" element={<ProtectedRoute allowedRoles={["mentor"]}><AdminMembroDetalhesPage /></ProtectedRoute>} />
              <Route path="/mentor/alunos/:id/editar" element={<ProtectedRoute allowedRoles={["mentor"]}><AdminMembroEditarPage /></ProtectedRoute>} />
              <Route path="/mentor/disponibilidade" element={<ProtectedRoute allowedRoles={["mentor"]}><MentorDisponibilidadePage /></ProtectedRoute>} />
              <Route path="/mentor/sessoes/:bookingId/relatorio" element={<ProtectedRoute allowedRoles={["mentor"]}><MentorRelatorioPage /></ProtectedRoute>} />
              <Route path="/mentor/perfil" element={<ProtectedRoute allowedRoles={["mentor"]}><ProfilePage role="mentor" /></ProtectedRoute>} />
              <Route path="/mentor/tarefas" element={<ProtectedRoute allowedRoles={["mentor"]}><TarefasPage role="mentor" /></ProtectedRoute>} />
              <Route path="/mentor/ferramentas" element={<ProtectedRoute allowedRoles={["mentor"]}><MentorFerramentasPage /></ProtectedRoute>} />
              <Route path="/mentor/ferramentas/modelo" element={<ProtectedRoute allowedRoles={["mentor"]}><FerramentaModeloPage /></ProtectedRoute>} />
              <Route path="/mentor/ferramentas/:id" element={<ProtectedRoute allowedRoles={["mentor"]}><FerramentaAplicacaoPage /></ProtectedRoute>} />

              {/* Admin — wrapped with filter context */}
              <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={["admin"]}><AdminFilterProvider><AdminDashboardPage /></AdminFilterProvider></ProtectedRoute>} />
              <Route path="/admin/membros" element={<ProtectedRoute allowedRoles={["admin"]}><AdminFilterProvider><AdminMembrosPage /></AdminFilterProvider></ProtectedRoute>} />
              <Route path="/admin/encerramentos" element={<ProtectedRoute allowedRoles={["admin"]}><AdminFilterProvider><AdminEncerramentosPage /></AdminFilterProvider></ProtectedRoute>} />
              <Route path="/admin/membros/:id" element={<ProtectedRoute allowedRoles={["admin"]}><AdminMembroDetalhesPage /></ProtectedRoute>} />
              <Route path="/admin/membros/:id/editar" element={<ProtectedRoute allowedRoles={["admin"]}><AdminMembroEditarPage /></ProtectedRoute>} />
              <Route path="/admin/sessoes/:bookingId/relatorio" element={<ProtectedRoute allowedRoles={["admin"]}><MentorRelatorioPage /></ProtectedRoute>} />
              <Route path="/admin/mentores" element={<ProtectedRoute allowedRoles={["admin"]}><AdminFilterProvider><AdminMentoresPage /></AdminFilterProvider></ProtectedRoute>} />
              <Route path="/admin/agenda" element={<ProtectedRoute allowedRoles={["admin"]}><AdminFilterProvider><AdminAgendaPage /></AdminFilterProvider></ProtectedRoute>} />
              <Route path="/admin/sessoes" element={<ProtectedRoute allowedRoles={["admin"]}><AdminFilterProvider><AdminSessoesPage /></AdminFilterProvider></ProtectedRoute>} />
              <Route path="/admin/ferramentas" element={<ProtectedRoute allowedRoles={["admin"]}><MentorFerramentasPage role="admin" /></ProtectedRoute>} />
              <Route path="/admin/ferramentas/modelo" element={<ProtectedRoute allowedRoles={["admin"]}><FerramentaModeloPage role="admin" /></ProtectedRoute>} />
              <Route path="/admin/ferramentas/:id" element={<ProtectedRoute allowedRoles={["admin"]}><FerramentaAplicacaoPage role="admin" /></ProtectedRoute>} />
              <Route path="/admin/financeiro" element={<ProtectedRoute allowedRoles={["admin"]}><AdminFilterProvider><AdminFinanceiroPage /></AdminFilterProvider></ProtectedRoute>} />
              <Route path="/admin/conteudos" element={<ProtectedRoute allowedRoles={["admin"]}><AdminConteudosPage /></ProtectedRoute>} />
              <Route path="/admin/eventos" element={<ProtectedRoute allowedRoles={["admin"]}><AdminEventosPage /></ProtectedRoute>} />
              
              <Route path="/admin/nps" element={<ProtectedRoute allowedRoles={["admin"]}><AdminFilterProvider><AdminNpsPage /></AdminFilterProvider></ProtectedRoute>} />
              <Route path="/admin/configuracoes" element={<ProtectedRoute allowedRoles={["admin"]}><AdminConfiguracoesPage /></ProtectedRoute>} />
              <Route path="/admin/perfil" element={<ProtectedRoute allowedRoles={["admin"]}><ProfilePage role="admin" /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
        </DemoDataProvider>
        </ViewAsProvider>
      </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
