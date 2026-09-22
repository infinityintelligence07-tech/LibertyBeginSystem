import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Volta para o último lugar onde o usuário estava.
 * Se não houver histórico (link direto, PWA aberto na rota), usa a rota de fallback.
 */
export const useGoBack = (fallback: string) => {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as any)?.idx;
    if (typeof idx === "number" ? idx > 0 : window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(fallback, { replace: true });
  }, [navigate, fallback]);
};
