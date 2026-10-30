import jsPDF from "jspdf";
import logoBegin from "@/assets/logo-begin.png";
import {
  diagnosticPillarsForAnswers,
  maturityLabel,
  overallScore,
  pillarCurrentKey,
  pillarGoalKey,
  pillarScore,
  pillarSessionGoalKey,
  type Answers,
} from "@/lib/diagnosticoBegin";

export interface DiagnosticPdfData {
  memberName: string;
  companyName?: string | null;
  mentorName?: string | null;
  date?: string | null;
  phaseLabel: string;
  answers: Answers;
}

const loadImage = (src: string): Promise<{ data: string; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      c.getContext("2d")?.drawImage(img, 0, 0);
      resolve({ data: c.toDataURL("image/png"), width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = src;
  });

export const generateDiagnosticPdf = async (d: DiagnosticPdfData): Promise<Blob> => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 40;
  const width = pageW - 80;

  const obsidian: [number, number, number] = [10, 10, 8];
  const gold: [number, number, number] = [196, 161, 73];
  const silverLight: [number, number, number] = [206, 211, 220];
  const muted: [number, number, number] = [110, 115, 125];
  const track: [number, number, number] = [234, 235, 238];

  doc.setFillColor(...obsidian);
  doc.rect(0, 0, pageW, 110, "F");
  doc.setFillColor(...gold);
  doc.rect(0, 110, pageW, 3, "F");

  try {
    const logo = await loadImage(logoBegin);
    const maxH = 55;
    const maxW = 160;
    const ratio = logo.width / logo.height;
    let dw = maxH * ratio;
    let dh = maxH;
    if (dw > maxW) {
      dw = maxW;
      dh = maxW / ratio;
    }
    doc.addImage(logo.data, "PNG", left, 28 + (55 - dh) / 2, dw, dh);
  } catch {
    doc.setTextColor(...gold);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Begin by Liberty", left, 60);
  }

  doc.setTextColor(...silverLight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("MAPEAMENTO DO NEGÓCIO", pageW - left, 50, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(d.phaseLabel, pageW - left, 72, { align: "right" });

  let y = 145;
  doc.setTextColor(...obsidian);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(d.companyName || d.memberName, left, y);

  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(`Aluno(a): ${d.memberName}`, left, y);
  if (d.mentorName) doc.text(`Mentor: ${d.mentorName}`, left, y + 14);
  if (d.date) {
    const dateStr = new Date(`${d.date.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    doc.text(dateStr, pageW - left, y, { align: "right" });
  }

  const pillars = diagnosticPillarsForAnswers(d.answers);
  const scores = Object.fromEntries(pillars.map((p) => [p.id, pillarScore(p, d.answers)]));
  const total = overallScore(scores);

  y += 44;
  doc.setFillColor(248, 247, 243);
  doc.roundedRect(left, y, width, 58, 8, 8, "F");
  doc.setTextColor(...obsidian);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(`${total.toFixed(1)}/5`, left + 18, y + 38);
  doc.setFontSize(12);
  doc.text(`Maturidade geral: ${maturityLabel(total).label}`, left + 110, y + 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(maturityLabel(total).hint, left + 110, y + 42);
  y += 86;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 60) {
      doc.addPage();
      y = 60;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...obsidian);
    doc.text(title.toUpperCase(), left, y);
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.8);
    doc.line(left, y + 4, left + doc.getTextWidth(title.toUpperCase()), y + 4);
    y += 22;
  };

  sectionTitle("Maturidade por área");
  const labelW = 170;
  const barX = left + labelW;
  const barW = width - labelW - 50;
  pillars.forEach((pillar) => {
    ensureSpace(22);
    const score = scores[pillar.id] || 0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 45);
    doc.text(pillar.name, left, y + 8);
    doc.setFillColor(...track);
    doc.roundedRect(barX, y, barW, 10, 5, 5, "F");
    if (score > 0) {
      doc.setFillColor(...gold);
      doc.roundedRect(barX, y, Math.max(10, (barW * score) / 5), 10, 5, 5, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.text(score > 0 ? score.toFixed(1) : "-", pageW - left, y + 8, { align: "right" });
    y += 22;
  });
  y += 10;

  const paragraph = (label: string, value: string) => {
    const lines = doc.splitTextToSize(value, width - 12);
    ensureSpace(16 + lines.length * 13);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text(label, left + 12, y);
    y += 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 45);
    lines.forEach((line: string) => {
      ensureSpace(13);
      doc.text(line, left + 12, y);
      y += 13;
    });
    y += 6;
  };

  const planned = pillars.filter((pillar) =>
    [pillarCurrentKey(pillar.id), pillarGoalKey(pillar.id), pillarSessionGoalKey(pillar.id)].some(
      (key) => (d.answers[key] || "").trim(),
    ),
  );

  if (planned.length) {
    sectionTitle("Estado atual e metas");
    planned.forEach((pillar) => {
      ensureSpace(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...obsidian);
      doc.text(pillar.name, left, y);
      y += 15;
      const current = (d.answers[pillarCurrentKey(pillar.id)] || "").trim();
      const goal = (d.answers[pillarGoalKey(pillar.id)] || "").trim();
      const nextGoal = (d.answers[pillarSessionGoalKey(pillar.id)] || "").trim();
      if (current) paragraph("Hoje", current);
      if (goal) paragraph("Meta", goal);
      if (nextGoal) paragraph("Meta para o próximo encontro", nextGoal);
      y += 6;
    });
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const fy = pageH - 30;
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.5);
    doc.line(left, fy - 10, pageW - left, fy - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text("Begin by Liberty • Mapeamento do Negócio", left, fy);
    doc.text(`Página ${p} de ${pages}`, pageW - left, fy, { align: "right" });
  }

  return doc.output("blob");
};

export const diagnosticPdfFileName = (memberName: string) =>
  `Mapeamento_do_Negocio_${memberName.replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`;

export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
