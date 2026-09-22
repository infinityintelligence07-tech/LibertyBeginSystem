import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Logo } from "@/components/Logo";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const validate = async () => {
      const hash = window.location.hash.startsWith("#")
        ? new URLSearchParams(window.location.hash.slice(1))
        : new URLSearchParams();
      const query = new URLSearchParams(window.location.search);

      try {
        // 1) Novo formato (PKCE): ?code=...
        const code = query.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && !cancelled) {
            setValid(true);
            setChecking(false);
            return;
          }
        }

        // 2) Formato antigo: #access_token=...&refresh_token=...&type=recovery
        const access_token = hash.get("access_token");
        const refresh_token = hash.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (!error && !cancelled) {
            setValid(true);
            setChecking(false);
            return;
          }
        }

        // 3) Formato token_hash (verifyOtp)
        const token_hash = query.get("token_hash") || hash.get("token_hash");
        if (token_hash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: "recovery" });
          if (!error && !cancelled) {
            setValid(true);
            setChecking(false);
            return;
          }
        }

        // 4) O cliente já pode ter consumido o link e criado a sessão automaticamente.
        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          setValid(!!data.session);
          setChecking(false);
        }
      } catch {
        if (!cancelled) {
          setValid(false);
          setChecking(false);
        }
      }
    };

    validate();
    return () => {
      cancelled = true;
    };
  }, []);


  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Senha atualizada com sucesso!");
      navigate("/login");
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/20 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!valid) {

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Logo size="md" className="mx-auto mb-6" />
          <p className="text-muted-foreground">Link inválido ou expirado.</p>
          <button onClick={() => navigate("/login")} className="btn-silver mt-4 text-sm">
            Voltar ao login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo size="md" />
        </div>
        <div className="glass-card p-8">
          <h2 className="text-xl font-medium text-foreground mb-2">Nova senha</h2>
          <div className="w-8 h-px bg-primary mb-8" />
          <form onSubmit={handleReset} className="space-y-5">
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Nova senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-begin w-full"
                required
                minLength={6}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-silver w-full text-sm tracking-wider uppercase disabled:opacity-50">
              {loading ? "Atualizando..." : "Atualizar senha"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPasswordPage;
