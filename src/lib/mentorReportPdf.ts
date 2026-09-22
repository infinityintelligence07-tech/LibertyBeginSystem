import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoBegin from "@/assets/logo-begin.png";

export interface MentorReportSession {
  date: string; // yyyy-mm-dd
  session_name: string;
  member_name: string;
  value: number;
  status?: string;
}

export interface MentorReportData {
  mentor_name: string;
  period_label: string; // "Novembro 2026" ou "Histórico completo"
  sessions: MentorReportSession[];
  rate: number;
}

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

  // Header band
  doc.setFillColor(...obsidian);
  doc.rect(0, 0, pageW, 110, "F");
  // Gold accent line
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

  // Mentor info card
  let y = 145;
  doc.setTextColor(...obsidian);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.mentor_name, 40, y);

  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(`Período: ${data.period_label}`, 40, y);
  doc.text(
    `Emitido em: ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`,
    pageW - 40,
    y,
    { align: "right" },
  );

  // Summary boxes
  y += 25;
  const completedSessions = data.sessions.filter(s => s.status === "completed");
  const scheduledSessions = data.sessions.filter(s => s.status !== "completed");
  const totalDone = completedSessions.reduce((s, r) => s + r.value, 0);
  const totalProjected = data.sessions.reduce((s, r) => s + r.value, 0);
  const boxW = (pageW - 80 - 30) / 4;
  const boxH = 60;
  const boxes = [
    { label: "Realizadas", value: String(completedSessions.length) },
    { label: "Agendadas", value: String(scheduledSessions.length) },
    { label: "A pagar (realizadas)", value: `R$ ${totalDone.toLocaleString("pt-BR")}` },
    { label: "Projeção total", value: `R$ ${totalProjected.toLocaleString("pt-BR")}`, accent: true },
  ];
  boxes.forEach((b, i) => {
    const x = 40 + i * (boxW + 10);
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
    doc.text(b.label.toUpperCase(), x + 10, y + 18);
    doc.setTextColor(...(b.accent ? gold : obsidian));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(b.value, x + 10, y + 42);
  });

  y += boxH + 25;

  // Sessions table
  autoTable(doc, {
    startY: y,
    head: [["Data", "Status", "Sessão", "Aluno(a)", "Valor"]],
    body: data.sessions.map((s) => [
      new Date(s.date + "T12:00:00").toLocaleDateString("pt-BR"),
      s.status === "completed" ? "Realizada" : "Agendada",
      s.session_name,
      s.member_name,
      `R$ ${s.value.toLocaleString("pt-BR")}`,
    ]),
    foot: [["", "", "", "Total projeção", `R$ ${totalProjected.toLocaleString("pt-BR")}`]],
    theme: "grid",
    margin: { left: 40, right: 40 },
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
      1: { cellWidth: 60 },
      4: { halign: "right", cellWidth: 80 },
    },
  });

  // Footer
  const footerY = pageH - 40;
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.5);
  doc.line(40, footerY - 12, pageW - 40, footerY - 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("Begin by Liberty • Programa de Mentoria", 40, footerY);
  doc.text(`Página 1`, pageW - 40, footerY, { align: "right" });

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
