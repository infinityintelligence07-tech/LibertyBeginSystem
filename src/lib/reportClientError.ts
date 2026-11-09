import { supabase } from "@/integrations/supabase/client";

const clip = (value: unknown, max: number) => String(value ?? "").slice(0, max);

const currentBuild = () => {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  return clip(script?.getAttribute("src") ?? "", 200);
};

let lastKey = "";

/** Grava o erro que derrubou a tela, sem nunca lançar. */
export const reportClientError = async (error: unknown, componentStack?: string | null) => {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const key = `${err.message}|${window.location.pathname}`;
    if (key === lastKey) return;
    lastKey = key;
    const { data } = await supabase.auth.getSession();
    await supabase.from("client_errors" as never).insert({
      user_id: data.session?.user?.id ?? null,
      path: clip(window.location.pathname + window.location.search, 500),
      message: clip(`${err.name}: ${err.message}`, 2000),
      stack: clip(err.stack, 8000),
      component_stack: clip(componentStack, 8000),
      user_agent: clip(navigator.userAgent, 500),
      build: currentBuild(),
    } as never);
  } catch {
    /* noop */
  }
};
