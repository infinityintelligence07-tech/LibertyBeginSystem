import { Component, Fragment, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { clearReloadLock, reloadAppSafely } from "@/lib/appReload";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  retryKey: number;
  attempts: number;
}

const RELOAD_FLAG = "liberty:auto-reload-at";

/** Erros de DOM causados por extensões/tradutor automático que mexem no HTML. */
const isTransientDomError = (error: Error) => {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return (
    /insertBefore|removeChild|appendChild|NotFoundError|The node before which|não é filho/i.test(msg) ||
    /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg)
  );
};

const isChunkError = (error: Error) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
    error?.message ?? "",
  );

/**
 * Evita "tela preta": erros transitórios (tradutor do navegador, extensões,
 * chunk desatualizado depois de um deploy) são recuperados automaticamente,
 * sem o aluno ver mensagem de erro. Só mostra a tela de falha se o erro
 * persistir depois das tentativas de recuperação.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryKey: 0, attempts: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary]", error, info);

    // Chunk antigo depois de um deploy: recarrega uma vez para pegar a versão nova.
    if (isChunkError(error)) {
      const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
        reloadAppSafely({ bustCache: true });
        return;
      }
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

  private handleReload = async () => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
      clearReloadLock();
    } catch {
      /* noop */
    }
    const reloaded = await reloadAppSafely({ bustCache: true });
    if (!reloaded && navigator.onLine === false) {
      this.setState({ error: null, retryKey: this.state.retryKey + 1 });
    }
  };

  render() {
    if (!this.state.error) {
      return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
    }


    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <h1 className="text-xl font-semibold text-foreground">Algo travou por aqui</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Seus dados foram guardados. Recarregue a tela para continuar de onde parou.
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            Se estiver com a tradução automática do navegador ligada nesta página, desative-a — ela
            costuma travar a tela.
          </p>
          <Button type="button" onClick={this.handleReload} className="w-full">
            Recarregar
          </Button>
        </div>
      </div>
    );
  }
}
