import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoBegin from "@/assets/logo-begin.png";

export interface SessionReportPdfData {
  mentor_name: string;
  member_name: string;
  session_name: string;
  session_date: string; // yyyy-mm-dd
  summary: string;
  delivered?: string | null;
  next_steps?: string | null;
  ai_alert?: string | null;
  ai_strategy?: string | null;
  suggested_tasks: string[]; // final list already approved
  tool_link?: string | null;
}

const loadImage = (src: string): Promise<{ data: string; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      c.getContext("2d")?.drawImage(img, 0, 0);
      resolve({ data: c.toDataURL("image/png"), width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = src;
  });

export const generateSessionReportPdf = async (d: SessionReportPdfData): Promise<Blob> => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const obsidian: [number, number, number] = [10, 10, 8];
  const gold: [number, number, number] = [196, 161, 73];
  const silverLight: [number, number, number] = [206, 211, 220];
  const muted: [number, number, number] = [110, 115, 125];

  // Header
  doc.setFillColor(...obsidian);
  doc.rect(0, 0, pageW, 110, "F");
  doc.setFillColor(...gold);
  doc.rect(0, 110, pageW, 3, "F");

  try {
    const logo = await loadImage(logoBegin);
    const maxH = 55, maxW = 160;
    const r = logo.width / logo.height;
    let dw = maxH * r, dh = maxH;
    if (dw > maxW) { dw = maxW; dh = maxW / r; }
    doc.addImage(logo.data, "PNG", 40, 28 + (55 - dh) / 2, dw, dh);
  } catch {
    doc.setTextColor(...gold);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Begin by Liberty", 40, 60);
  }

  doc.setTextColor(...silverLight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("RELATÓRIO DE SESSÃO", pageW - 40, 50, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Mentoria", pageW - 40, 72, { align: "right" });

  let y = 145;
  doc.setTextColor(...obsidian);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(d.session_name, 40, y);

  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  const dateStr = new Date(d.session_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(`Aluno(a): ${d.member_name}`, 40, y);
  doc.text(`Mentor: ${d.mentor_name}`, 40, y + 14);
  doc.text(dateStr, pageW - 40, y, { align: "right" });

  y += 40;

  const section = (title: string, body: string | null | undefined) => {
    if (!body || !body.trim()) return;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...obsidian);
    doc.text(title.toUpperCase(), 40, y);
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.8);
    doc.line(40, y + 4, 40 + doc.getTextWidth(title.toUpperCase()), y + 4);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 55);
    const lines = doc.splitTextToSize(body.trim(), pageW - 80);
    lines.forEach((line: string) => {
      if (y > pageH - 60) { doc.addPage(); y = 60; }
      doc.text(line, 40, y);
      y += 14;
    });
    y += 12;
  };

  section("Resumo", d.summary);
  section("O que foi entregue", d.delivered);
  section("Próximos passos", d.next_steps);
  section("Alerta estratégico", d.ai_alert);
  section("Sugestão estratégica", d.ai_strategy);

  if (d.tool_link) {
    if (y > pageH - 80) { doc.addPage(); y = 60; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...obsidian);
    doc.text("FERRAMENTA / MATERIAL", 40, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 90, 180);
    doc.textWithLink(d.tool_link, 40, y, { url: d.tool_link });
    y += 24;
  }

  if (d.suggested_tasks.length) {
    if (y > pageH - 120) { doc.addPage(); y = 60; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...obsidian);
    doc.text("TAREFAS SUGERIDAS PARA O ALUNO", 40, y);
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.8);
    doc.line(40, y + 4, 40 + doc.getTextWidth("TAREFAS SUGERIDAS PARA O ALUNO"), y + 4);
    y += 14;
    autoTable(doc, {
      startY: y,
      head: [["#", "Tarefa"]],
      body: d.suggested_tasks.map((t, i) => [String(i + 1), t]),
      theme: "grid",
      margin: { left: 40, right: 40 },
      headStyles: { fillColor: obsidian, textColor: gold, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 10, cellPadding: 8, textColor: [40, 40, 40] },
      alternateRowStyles: { fillColor: [250, 250, 248] },
      columnStyles: { 0: { cellWidth: 30, halign: "center" } },
    });
  }

  // Footer on all pages
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const fy = pageH - 30;
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.5);
    doc.line(40, fy - 10, pageW - 40, fy - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text("Begin by Liberty • Relatório de sessão", 40, fy);
    doc.text(`Página ${p} de ${total}`, pageW - 40, fy, { align: "right" });
  }

  return doc.output("blob");
};

export const downloadSessionReportPdf = async (d: SessionReportPdfData) => {
  const blob = await generateSessionReportPdf(d);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeMember = d.member_name.replace(/[^a-zA-Z0-9]+/g, "_");
  const safeSession = d.session_name.replace(/[^a-zA-Z0-9]+/g, "_");
  a.download = `Sessao_${safeSession}_${safeMember}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
