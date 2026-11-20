import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { shortName } from "@/lib/formatName";
import { brandBookShareUrl, normalizeBrandBook, type BrandBookData } from "@/lib/brandBook";
import { BrandBookWorkspace } from "./BrandBookWorkspace";

interface Props {
  application: { id: string; answers: Json; status: string; share_token: string };
  member: { full_name: string | null; company_name: string | null } | null;
  backPath: string;
}

export const BrandBookEditor = ({ application, member, backPath }: Props) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [data, setData] = useState<BrandBookData>(() => normalizeBrandBook(application.answers));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(application.status === "completed");
  const dataRef = useRef(data);
  dataRef.current = data;
  const savingRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (!data.nome && member?.company_name) setData((d) => (d.nome ? d : { ...d, nome: member.company_name || "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.company_name]);

  const persist = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) await savingRef.current;
    const snapshot = dataRef.current;
    setSaving(true);
    const run = (async () => {
      const { error } = await supabase
        .from("tool_applications")
        .update({ answers: snapshot as unknown as Json })
        .eq("id", application.id);
      return !error;
    })();
    savingRef.current = run;
    const ok = await run;
    savingRef.current = null;
    setSaving(false);
    if (!ok) {
      toast.error("Não foi possível salvar. Confira a conexão.");
      return false;
    }
    if (dataRef.current === snapshot) setDirty(false);
    setSavedAt(new Date());
    return true;
  }, [application.id]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => void persist(), 1200);
    return () => clearTimeout(t);
  }, [dirty, data, persist]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onPatch = (fn: (d: BrandBookData) => BrandBookData) => {
    setData((d) => fn(d));
    setDirty(true);
  };

  const exit = async () => {
    if (dirty) await persist();
    qc.invalidateQueries({ queryKey: ["tool-applications"] });
    navigate(backPath);
  };

  const complete = async () => {
    setCompleting(true);
    try {
      if (!(await persist())) return;
      if (completed) {
        await exit();
        return;
      }
      const { error } = await supabase.rpc("complete_brand_book", { _application_id: application.id });
      if (error) {
        toast.error("Não foi possível concluir", { description: error.message });
        return;
      }
      setCompleted(true);
      qc.invalidateQueries({ queryKey: ["tool-application", application.id] });
      qc.invalidateQueries({ queryKey: ["tool-applications"] });
      toast.success("Brand Book enviado ao aluno", { description: "Já aparece na área de ferramentas dele." });
    } finally {
      setCompleting(false);
    }
  };

  return (
    <BrandBookWorkspace
      mode="edit"
      data={data}
      onPatch={onPatch}
      subtitle={shortName(member?.full_name || "Aluno")}
      ownerLabel={member?.full_name ? `Sessão de branding com ${shortName(member.full_name)}` : undefined}
      onExit={exit}
      saving={saving}
      savedAt={savedAt}
      shareUrl={brandBookShareUrl(application.share_token)}
      completed={completed}
      completing={completing}
      onComplete={complete}
    />
  );
};
