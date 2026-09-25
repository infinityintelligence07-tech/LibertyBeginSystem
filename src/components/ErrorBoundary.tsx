import { Component, Fragment, ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { PageContainer, SectionCard } from "@/components/ds";
import { clearAppCaches, clearReloadLock } from "@/lib/appReload";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  retryKey: number;
  attempts: number;
}

const RELOAD_FLAG = "liberty:auto-reload-at";
const RELOAD_COUNT = "liberty:error-reload-count";
const MAX_HARD_RELOADS = 2;

/** Erros de DOM causados por extensões/tradutor automático que mexem no HTML. */
const isTransientDomError = (error: Error) => {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return /insertBefore|removeChild|appendChild|NotFoundError|The node before which|não é filho/i.test(msg);
};

const isChunkError = (error: Error) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
    error?.message ?? "",
  );

const hardResetAndGo = async (path = "/login") => {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
    clearReloadLock();
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister().catch(() => undefined)));
    }
    await clearAppCaches();
  } catch {
    /* noop */
  }
  const url = new URL(path, window.location.origin);
  url.searchParams.set("app_refresh", String(Date.now()));
  window.location.replace(url.toString());
};

/**
 * Evita "tela preta": erros transitórios (tradutor do navegador, extensões,
 * chunk desatualizado depois de um deploy) são recuperados automaticamente.
 * Depois de poucas tentativas, para o loop e oferece ir ao login limpo.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryKey: 0, attempts: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary]", error, info);

    // Chunk antigo depois de um deploy: no máximo UMA recarga automática.
    if (isChunkError(error)) {
      const count = Number(sessionStorage.getItem(RELOAD_COUNT) ?? 0);
      const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
      if (count < MAX_HARD_RELOADS && Date.now() - last > 5_000) {
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
        sessionStorage.setItem(RELOAD_COUNT, String(count + 1));
        void hardResetAndGo(window.location.pathname || "/login");
        return;
      }
      return;
    }

    // Erro de DOM externo (Google Tradutor, extensões): remonta a árvore.
    if (isTransientDomError(error) && this.state.attempts < 4) {
      setTimeout(() => {
        this.setState((prev) => ({
          error: null,
          attempts: prev.attempts + 1,
          retryKey: prev.retryKey + 1,
        }));
      }, 150 * (this.state.attempts + 1));
    }
  }

  private handleReload = () => {
    const count = Number(sessionStorage.getItem(RELOAD_COUNT) ?? 0);
    sessionStorage.setItem(RELOAD_COUNT, String(count + 1));
    // Sempre volta ao login limpo — evita loop na mesma rota quebrada.
    void hardResetAndGo("/login");
  };

  private handleGoHome = () => {
    sessionStorage.removeItem(RELOAD_COUNT);
    sessionStorage.removeItem(RELOAD_FLAG);
    void hardResetAndGo("/admin/dashboard");
  };

  render() {
    if (!this.state.error) {
      return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
    }

    const stuck = Number(sessionStorage.getItem(RELOAD_COUNT) ?? 0) >= MAX_HARD_RELOADS;
    const detail = this.state.error?.message || "Erro inesperado";

    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center py-10">
        <PageContainer variant="narrow">
          <SectionCard role="status" className="max-w-sm mx-auto text-center space-y-5">
            <Logo size="sm" className="mx-auto" />
            <RefreshCw className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
            <div className="space-y-2">
              <h1 className="text-[22px] font-semibold text-foreground">
                {stuck ? "Não foi possível carregar" : "Nova versão disponível"}
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {stuck
                  ? "Limpe o cache ou abra em janela anônima. Se continuar, fale com o suporte."
                  : "Atualize para carregar a versão nova (isso limpa o cache)."}
              </p>
              {stuck && (
                <p className="text-xs text-muted-foreground break-words font-mono">{detail}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button type="button" size="lg" onClick={this.handleReload} className="w-full">
                {stuck ? "Ir para o login (limpo)" : "Atualizar"}
              </Button>
              {stuck && (
                <Button type="button" size="lg" variant="outline" onClick={this.handleGoHome} className="w-full">
                  Tentar painel admin
                </Button>
              )}
            </div>
          </SectionCard>
        </PageContainer>
      </div>
    );
  }
}
