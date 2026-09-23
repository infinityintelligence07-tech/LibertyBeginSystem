import { useState, useEffect } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { FORGOT_PASSWORD_NEUTRAL_MESSAGE, SUPPORT_WHATSAPP_URL, translateAuthError } from "@/lib/authErrors";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Callout, IconButton, PageContainer, SectionCard, TextField } from "@/components/ds";

const RESET_PASSWORD_PATH = "/reset-password";

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { signIn, signOut, user, roles, rolesLoaded, rolesError, loading: authLoading } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user && rolesLoaded && roles.length > 0) {
      if (roles.includes("admin") || roles.includes("super_admin")) navigate("/admin/dashboard", { replace: true });
      else if (roles.includes("mentor")) navigate("/mentor/dashboard", { replace: true });
      else navigate("/dashboard", { replace: true });
    }
  }, [user, roles, rolesLoaded, authLoading, navigate]);

  // Autenticado mas sem papel: não deixar o usuário preso no Login sem feedback.
  const authenticatedWithoutRole = !authLoading && !!user && rolesLoaded && roles.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = normalizeEmail(email);
    setFormError(null);
    if (!normalizedEmail) {
      setFormError("Informe seu e-mail.");
      return;
    }
    setLoading(true);

    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`,
      });
      setLoading(false);
      if (error) {
        console.error("[Login] resetPasswordForEmail", error.message);
        const msg = error.message.toLowerCase();
        // Só expõe erros que não revelam se a conta existe (rede, limite de envios).
        if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("fetch") || msg.includes("network")) {
          setFormError(translateAuthError(error));
          return;
        }
      }
      // Mensagem sempre neutra (anti-enumeração): o GoTrue devolve 200 mesmo sem conta.
      toast.success(FORGOT_PASSWORD_NEUTRAL_MESSAGE, { duration: 10000 });
      setMode("login");
      return;
    }

    if (password !== password.trim()) {
      toast.warning("Sua senha tem espaço no início ou no fim. Confira antes de continuar.");
    }

    const { error } = await signIn(normalizedEmail, password);
    setLoading(false);
    if (error) {
      setFormError(translateAuthError(error));
    } else {
      toast.success("Acesso confirmado. Entrando...");
    }
    // Redirect is handled by the useEffect above once roles load
  };

  const switchMode = (next: "login" | "forgot") => {
    setFormError(null);
    setMode(next);
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center py-10 pt-[calc(env(safe-area-inset-top,0px)_+_2.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)_+_2.5rem)]">
      <PageContainer variant="narrow">
        <div className="w-full max-w-md mx-auto space-y-8">
          <div className="flex justify-center">
            <Logo size="md" />
          </div>

          <SectionCard className="space-y-6 p-6 sm:p-8">
            {authenticatedWithoutRole ? (
              <>
                <div className="space-y-2">
                  <h1 className="text-[24px] md:text-[28px] font-semibold leading-[1.2] tracking-[var(--ds-tracking-display)] text-foreground">
                    {rolesError ? "Não foi possível carregar seu acesso" : "Conta sem perfil de acesso"}
                  </h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {rolesError ?? "Sua conta ainda não tem um perfil de acesso. Fale com a equipe Liberty."}
                  </p>
                  {user?.email && (
                    <p className="text-xs text-muted-foreground">
                      Conectado como <span className="text-foreground font-medium">{user.email}</span>
                    </p>
                  )}
                </div>
                <Button type="button" size="lg" onClick={handleSignOut} disabled={loading} className="w-full">
                  {loading ? "Saindo..." : "Sair"}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <h1 className="text-[24px] md:text-[28px] font-semibold leading-[1.2] tracking-[var(--ds-tracking-display)] text-foreground">
                    {mode === "login" ? "Acessar plataforma" : "Recuperar senha"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {mode === "login"
                      ? "Entre com o e-mail e a senha recebidos da equipe Liberty."
                      : "Enviaremos um link para você criar uma nova senha."}
                  </p>
                </div>

                {formError && (
                  <Callout tone="danger" icon={AlertCircle}>
                    {formError}
                  </Callout>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <TextField
                    id="login-email"
                    name="email"
                    type="email"
                    label="E-mail"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmail((v) => normalizeEmail(v))}
                    placeholder="seu@email.com"
                    required
                  />

                  {mode === "login" && (
                    <div className="relative">
                      <TextField
                        id="login-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        label="Senha"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Sua senha"
                        className="pr-12"
                        required
                      />
                      <IconButton
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        aria-pressed={showPassword}
                        size="sm"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-1 bottom-0.5 h-10 w-10"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </IconButton>
                    </div>
                  )}

                  <Button type="submit" size="lg" disabled={loading} className="w-full">
                    {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Enviar link de recuperação"}
                  </Button>
                </form>

                <div className="flex justify-center">
                  {mode === "login" ? (
                    <Button type="button" variant="link" onClick={() => switchMode("forgot")} disabled={loading}>
                      Esqueci minha senha
                    </Button>
                  ) : (
                    <Button type="button" variant="link" onClick={() => switchMode("login")} disabled={loading}>
                      Voltar ao login
                    </Button>
                  )}
                </div>
              </>
            )}

            <div className="pt-5 border-t border-border">
              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                Dúvidas ou sem acesso?{" "}
                <a
                  href={SUPPORT_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-medium underline-offset-4 hover:underline rounded-ds focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Fale com a equipe Liberty no WhatsApp
                </a>
              </p>
            </div>
          </SectionCard>
        </div>
      </PageContainer>
    </div>
  );
};

export default LoginPage;
