import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/Logo";
import { InstallAndNotify } from "@/components/InstallAndNotify";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import iconBegin from "@/assets/icon-begin.png";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const navigate = useNavigate();
  const { signIn, signUp, user, roles, loading: authLoading } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user && roles.length > 0) {
      if (roles.includes("admin") || roles.includes("super_admin")) navigate("/admin/dashboard", { replace: true });
      else if (roles.includes("mentor")) navigate("/mentor/dashboard", { replace: true });
      else navigate("/dashboard", { replace: true });
    }
  }, [user, roles, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === "forgot") {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setLoading(false);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
        setMode("login");
      }
      return;
    }

    if (mode === "signup") {
      const { error } = await signUp(email, password, fullName);
      setLoading(false);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Conta criada! Verifique seu email para confirmar.");
        setMode("login");
      }
      return;
    }

    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      const isTimeout = error.message.includes("Tempo esgotado");
      toast.error(isTimeout ? error.message : "Email ou senha incorretos. Use ‘Esqueci minha senha’ se necessário.");
    } else {
      toast.success("Acesso confirmado. Entrando...");
    }
    // Redirect is handled by the useEffect above once roles load
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden px-6 sm:px-10">
      <img
        src={iconBegin}
        alt=""
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] opacity-[0.04] pointer-events-none hidden lg:block"
      />

      <div className="w-full max-w-5xl flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-16 relative z-10">
        <div className="hidden lg:flex flex-col justify-center items-start flex-1 max-w-md">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Logo size="lg" className="mb-12" />
            <h1 className="text-5xl font-bold text-foreground leading-tight mb-4">
              Sua jornada<br />começa aqui.
            </h1>
            <p className="text-muted-foreground font-light text-lg">
              Desenvolvimento empresarial com propósito.
            </p>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="w-full max-w-md">
          <div className="lg:hidden flex justify-center mb-10">
            <Logo size="md" />
          </div>

          <div className="glass-card p-8 sm:p-10">
            <h2 className="text-xl font-medium text-foreground mb-2">
              {mode === "login" ? "Acessar plataforma" : mode === "signup" ? "Criar conta" : "Recuperar senha"}
            </h2>
            <div className="w-8 h-px bg-primary mb-8" />

            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === "signup" && (
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Nome completo</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" className="input-begin w-full" required />
                </div>
              )}

              <div>
                <label className="block text-sm text-muted-foreground mb-2">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="input-begin w-full" required />
              </div>

              {mode !== "forgot" && (
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Senha</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input-begin w-full pr-10" required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-silver w-full text-sm tracking-wider uppercase disabled:opacity-50">
                {loading ? "Aguarde..." : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar email de recuperação"}
              </button>
            </form>

            <div className="mt-6 text-center space-y-2">
              {mode === "login" && (
                <>
                  <button onClick={() => setMode("forgot")} className="text-sm text-muted-foreground hover:text-primary transition-colors block w-full">Esqueci minha senha</button>
                  <button onClick={() => setMode("signup")} className="text-sm text-muted-foreground hover:text-primary transition-colors block w-full">
                    Não tem conta? <span className="text-primary">Criar conta</span>
                  </button>
                </>
              )}
              {mode !== "login" && (
                <button onClick={() => setMode("login")} className="text-sm text-muted-foreground hover:text-primary transition-colors">← Voltar ao login</button>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-border text-center">
              <p className="text-xs text-muted-foreground">
                Dúvidas?{" "}
                <a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-silver-light transition-colors">Fale com o nosso suporte</a>
              </p>
            </div>
            <div className="mt-4">
              <InstallAndNotify />
            </div>
          </div>
        </motion.div>
      </div>

    </div>
  );
};

export default LoginPage;
