import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Guarda a posição de rolagem de cada entrada do histórico e restaura
 * quando o usuário volta (botão "Voltar" do app ou do navegador).
 * Em navegações novas (PUSH), sobe para o topo como esperado.
 */
const KEY = "lb_scroll_memory";

const readStore = (): Record<string, number> => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
};

const writeStore = (store: Record<string, number>) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
};

export const ScrollMemory = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const currentKey = useRef<string>(`${location.key}`);

  // Salva a posição da entrada anterior antes de trocar de tela.
  useEffect(() => {
    const prevKey = currentKey.current;
    if (prevKey && prevKey !== location.key) {
      const store = readStore();
      store[prevKey] = window.scrollY;
      writeStore(store);
    }
    currentKey.current = `${location.key}`;

    if (navType === "POP") {
      const saved = readStore()[`${location.key}`];
      if (typeof saved === "number") {
        // Aguarda o conteúdo renderizar/hidratar antes de restaurar.
        let tries = 0;
        const tick = () => {
          window.scrollTo({ top: saved, behavior: "auto" });
          if (++tries < 8 && Math.abs(window.scrollY - saved) > 4) {
            setTimeout(tick, 60);
          }
        };
        requestAnimationFrame(tick);
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.key, navType]);

  // Também salva ao sair da aba / fechar o app.
  useEffect(() => {
    const save = () => {
      const store = readStore();
      store[currentKey.current] = window.scrollY;
      writeStore(store);
    };
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
    };
  }, []);

  return null;
};
