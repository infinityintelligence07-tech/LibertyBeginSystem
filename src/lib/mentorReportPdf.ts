import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoBegin from "@/assets/logo-begin.png";
import { bookingStatusConfig } from "@/lib/bookingStatus";

export interface MentorReportSession {
  date: string; // yyyy-mm-dd
  session_name: string;
  member_name: string;
  value: number;
  /** Status EFETIVO (regra única): scheduled | pending_confirmation | awaiting_report | completed | ... */
  status?: string;
  /** Registro histórico lançado pelo admin (sessão feita fora da plataforma). */
  is_retroactive?: boolean;
}

export interface MentorReportData {
  mentor_name: string;
  period_label: string; // "Novembro 2026" ou "Histórico completo"
  sessions: MentorReportSession[];
  /** Valor-base por sessão (exibido no cabeçalho). */
  rate: number;
}

/** Categorias de repasse derivadas do status efetivo. */
export type PayoutCategory = "realized" | "scheduled" | "pending_confirmation" | "excluded";

export const payoutCategoryOf = (status?: string | null): PayoutCategory => {
  switch (status) {
    case "completed":
    case "awaiting_report":
      return "realized";
    case "scheduled":
    case "rescheduled":
      return "scheduled";
    case "pending_confirmation":
      return "pending_confirmation";
    default:
      // cancelled, not_realized, pending_approval e desconhecidos ficam fora da projeção
      return "excluded";
  }
};

export const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 2 });

const statusLabelOf = (status?: string | null) =>
  bookingStatusConfig[status || ""]?.label || "Agendada";

const formatDateBR = (date: string) => {
  const [y, m, d] = date.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : date;
};

const loadImage = (src: string): Promise<{ data: string; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve({ data: canvas.toDataURL("image/png"), width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = src;
  });

export const generateMentorReportPdf = async (data: MentorReportData): Promise<Blob> => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Brand colors (Liberty Begin)
  const obsidian: [number, number, number] = [10, 10, 8];
  const gold: [number, number, number] = [196, 161, 73];
  const silverLight: [number, number, number] = [206, 211, 220];
  const muted: [number, number, number] = [140, 145, 155];
  const orange: [number, number, number] = [214, 122, 32];

  // Header band
  doc.setFillColor(...obsidian);
  doc.rect(0, 0, pageW, 110, "F");
  doc.setFillColor(...gold);
  doc.rect(0, 110, pageW, 3, "F");

  // Logo (preserve aspect ratio)
  try {
    const logo = await loadImage(logoBegin);
    const maxH = 55;
    const maxW = 160;
    const ratio = logo.width / logo.height;
    let drawW = maxH * ratio;
    let drawH = maxH;
    if (drawW > maxW) { drawW = maxW; drawH = maxW / ratio; }
    doc.addImage(logo.data, "PNG", 40, 28 + (55 - drawH) / 2, drawW, drawH);
  } catch {
    doc.setTextColor(...gold);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Begin by Liberty", 40, 60);
  }

  // Title right
  doc.setTextColor(...silverLight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("RELATÓRIO DE REPASSE", pageW - 40, 50, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Mentoria", pageW - 40, 72, { align: "right" });

  // Mentor info
  let y = 145;
  doc.setTextColor(...obsidian);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.mentor_name, 40, y);

  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(`Período: ${data.period_label} · Valor-base por sessão: ${formatBRL(data.rate)}`, 40, y);
  doc.text(
    `Emitido em: ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`,
    pageW - 40,
    y,
    { align: "right" },
  );

  // Canceladas / não realizadas / pendentes de aprovação nunca entram no relatório de repasse.
  const sessions = data.sessions
    .filter((s) => payoutCategoryOf(s.status) !== "excluded")
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const realized = sessions.filter((s) => payoutCategoryOf(s.status) === "realized");
  const scheduled = sessions.filter((s) => payoutCategoryOf(s.status) === "scheduled");
  const pendingConfirmation = sessions.filter((s) => payoutCategoryOf(s.status) === "pending_confirmation");
  const totalDone = realized.reduce((s, r) => s + r.value, 0);
  const totalProjected = sessions.reduce((s, r) => s + r.value, 0);

  // Summary boxes
  y += 25;
  const boxGap = 8;
  const boxCount = 5;
  const boxW = (pageW - 80 - boxGap * (boxCount - 1)) / boxCount;
  const boxH = 60;
  const boxes: Array<{ label: string; value: string; accent?: boolean; warn?: boolean }> = [
    { label: "Realizadas", value: String(realized.length) },
    { label: "Agendadas", value: String(scheduled.length) },
    { label: "A confirmar", value: String(pendingConfirmation.length), warn: pendingConfirmation.length > 0 },
    { label: "A pagar (realizadas)", value: formatBRL(totalDone) },
    { label: "Projeção total", value: formatBRL(totalProjected), accent: true },
  ];
  boxes.forEach((b, i) => {
    const x = 40 + i * (boxW + boxGap);
    doc.setFillColor(248, 248, 246);
    doc.roundedRect(x, y, boxW, boxH, 6, 6, "F");
    if (b.accent) {
      doc.setDrawColor(...gold);
      doc.setLineWidth(1.2);
      doc.roundedRect(x, y, boxW, boxH, 6, 6, "S");
    }
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(b.label.toUpperCase(), x + 8, y + 18);
    doc.setTextColor(...(b.accent ? gold : b.warn ? orange : obsidian));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(b.value, x + 8, y + 42);
  });

  y += boxH + 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(
    "Sessões que passaram sem confirmação do mentor (A confirmar) não entram no repasse até serem confirmadas.",
    40,
    y,
  );
  if (realized.some((s) => s.is_retroactive)) {
    y += 11;
    doc.text("(hist.) = registro histórico lançado pelo administrador.", 40, y);
  }

  y += 16;

  const drawFooter = () => {
    const footerY = pageH - 40;
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.5);
    doc.line(40, footerY - 12, pageW - 40, footerY - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text("Begin by Liberty · Programa de Mentoria", 40, footerY);
    doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, pageW - 40, footerY, { align: "right" });
  };

  // Sessions table
  autoTable(doc, {
    startY: y,
    head: [["Data", "Status", "Sessão", "Membro", "Valor"]],
    body: sessions.map((s) => {
      const category = payoutCategoryOf(s.status);
      return [
        formatDateBR(s.date),
        statusLabelOf(s.status),
        `${s.session_name}${s.is_retroactive ? " (hist.)" : ""}`,
        s.member_name,
        category === "pending_confirmation" ? `${formatBRL(s.value)} *` : formatBRL(s.value),
      ];
    }),
    foot: [
      ["", "", "", "A pagar (realizadas)", formatBRL(totalDone)],
      ["", "", "", "Projeção total", formatBRL(totalProjected)],
    ],
    theme: "grid",
    margin: { left: 40, right: 40, bottom: 70 },
    headStyles: {
      fillColor: obsidian,
      textColor: gold,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: 8,
    },
    bodyStyles: { fontSize: 9, cellPadding: 7, textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [250, 250, 248] },
    footStyles: {
      fillColor: [248, 248, 246],
      textColor: obsidian,
      fontStyle: "bold",
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 65 },
      1: { cellWidth: 95 },
      4: { halign: "right", cellWidth: 80 },
    },
    didDrawPage: drawFooter,
  });

  if (pendingConfirmation.length > 0) {
    const lastTable = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable;
    const noteY = (lastTable?.finalY ?? y) + 14;
    if (noteY < pageH - 70) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...orange);
      doc.text("* A confirmar: valor só entra no repasse após a confirmação do mentor.", 40, noteY);
    }
  }

  return doc.output("blob");
};

export const downloadMentorReportPdf = async (data: MentorReportData) => {
  const blob = await generateMentorReportPdf(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = data.mentor_name.replace(/[^a-zA-Z0-9]+/g, "_");
  const safePeriod = data.period_label.replace(/[^a-zA-Z0-9]+/g, "_");
  a.download = `Repasse_${safeName}_${safePeriod}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
