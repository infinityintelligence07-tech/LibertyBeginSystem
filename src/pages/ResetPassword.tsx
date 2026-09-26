import { useState, useEffect } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SUPPORT_WHATSAPP_URL, translateAuthError } from "@/lib/authErrors";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Callout, IconButton, PageContainer, SectionCard, TextField } from "@/components/ds";

const MIN_PASSWORD_LENGTH = 6;

const titleClass =
  "text-[24px] md:text-[28px] font-semibold leading-[1.2] tracking-[var(--ds-tracking-display)] text-foreground";

const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const validate = async () => {
      const hash = window.location.hash.startsWith("#")
        ? new URLSearchParams(window.location.hash.slice(1))
        : new URLSearchParams();
      const query = new URLSearchParams(window.location.search);

      // Erro devolvido pelo GoTrue no próprio link (ex.: otp_expired).
      const linkError = query.get("error_description") || hash.get("error_description");
      if (linkError) {
        console.error("[ResetPassword] link error", linkError);
      }

      try {
        // 1) Novo formato (PKCE): ?code=...
        const code = query.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) console.error("[ResetPassword] exchangeCodeForSession", error.message);
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
          if (error) console.error("[ResetPassword] setSession", error.message);
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
          if (error) console.error("[ResetPassword] verifyOtp", error.message);
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
      } catch (err) {
        console.error("[ResetPassword] validate", err);
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
    setFormError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setFormError("As senhas não conferem. Digite a mesma senha nos dois campos.");
      return;
    }
    if (password !== password.trim()) {
      setFormError("A senha não pode começar nem terminar com espaço.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      console.error("[ResetPassword] updateUser", error.message);
      setFormError(translateAuthError(error));
      return;
    }
    // Encerra a sessão de recuperação para o membro entrar com a senha nova
    // (evita cair no dashboard sem ter confirmado o login e evita travar sem papel).
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) console.error("[ResetPassword] signOut", signOutError.message);
    setLoading(false);
    toast.success("Senha atualizada. Entre com a nova senha.");
    navigate("/login", { replace: true });
  };

  const shellClass =
    "min-h-[100dvh] bg-background flex items-center justify-center py-10 pt-[calc(env(safe-area-inset-top,0px)_+_2.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)_+_2.5rem)]";

  if (checking) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center" role="status" aria-live="polite">
        <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" aria-hidden />
        <span className="sr-only">Validando link...</span>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className={shellClass}>
        <PageContainer variant="narrow">
          <SectionCard className="w-full max-w-md mx-auto text-center space-y-5 p-6 sm:p-8">
            <Logo size="md" className="mx-auto" />
            <div className="space-y-2">
              <h1 className={titleClass}>Link inválido ou expirado</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Peça um novo link em "Esqueci minha senha" na tela de login. Se não receber o e-mail, fale com a equipe Liberty.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              <Button type="button" size="lg" onClick={() => navigate("/login")} className="w-full">
                Voltar ao login
              </Button>
              <Button variant="link" asChild>
                <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  Falar com a equipe Liberty no WhatsApp
                </a>
              </Button>
            </div>
          </SectionCard>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <PageContainer variant="narrow">
        <div className="w-full max-w-md mx-auto space-y-8">
          <div className="flex justify-center">
            <Logo size="md" />
          </div>
          <SectionCard className="space-y-6 p-6 sm:p-8">
            <div className="space-y-1">
              <h1 className={titleClass}>Nova senha</h1>
              <p className="text-sm text-muted-foreground">Escolha uma senha com pelo menos {MIN_PASSWORD_LENGTH} caracteres.</p>
            </div>

            {formError && (
              <Callout tone="danger" icon={AlertCircle}>
                {formError}
              </Callout>
            )}

            <form onSubmit={handleReset} className="space-y-4">
              <TextField
                id="new-password"
                name="new-password"
                type={showPassword ? "text" : "password"}
                label="Nova senha"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nova senha"
                required
                minLength={MIN_PASSWORD_LENGTH}
                trailing={
                  <IconButton
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                    size="sm"
                    onClick={() => setShowPassword(!showPassword)}
                    className="h-10 w-10"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </IconButton>
                }
              />

              <TextField
                id="confirm-password"
                name="confirm-password"
                type={showPassword ? "text" : "password"}
                label="Confirmar nova senha"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                required
                minLength={MIN_PASSWORD_LENGTH}
              />

              <Button type="submit" size="lg" disabled={loading} className="w-full">
                {loading ? "Atualizando..." : "Atualizar senha"}
              </Button>
            </form>

            <div className="flex justify-center">
              <Button type="button" variant="link" onClick={() => navigate("/login")} disabled={loading}>
                Voltar ao login
              </Button>
            </div>
          </SectionCard>
        </div>
      </PageContainer>
    </div>
  );
};

export default ResetPasswordPage;
