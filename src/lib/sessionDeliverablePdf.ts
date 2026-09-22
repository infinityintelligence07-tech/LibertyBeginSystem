import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import logoBegin from "@/assets/logo-begin.png";

export interface DeliverablePillar {
  number: string;
  title: string;
  description: string;
}
export interface DeliverableActionRow {
  sector: string;
  deliverable: string;
  deadline: string;
}
export interface DeliverableRisk {
  title: string;
  control: string;
}
export interface SessionDeliverableData {
  strategic_title: string;
  subtitle: string;
  goal_label: string;
  goal_title: string;
  goal_description: string;
  tags: string[];
  diagnosis: string;
  pillars: DeliverablePillar[];
  action_plan: DeliverableActionRow[];
  risks: DeliverableRisk[];
  next_steps: string[];
  suggested_tasks: string[]; // kept in type for compatibility; not rendered
  member_name: string;
  mentor_name: string;
  session_context?: string;
}

/* ------------------------------------------------------------------ */
/* Palette per session — subtle color rotation for infographic variety */
/* Begin identity: obsidian + silver base, gold as micro-accent only. */
/* Each session gets a distinct "accent" hue for its highlights.       */
/* ------------------------------------------------------------------ */

const ACCENTS = [
  { name: "silver", hex: "#a8b3c4", soft: "rgba(168,179,196,0.14)", ring: "rgba(168,179,196,0.32)" },
  { name: "teal",   hex: "#5cc0ad", soft: "rgba(92,192,173,0.12)",  ring: "rgba(92,192,173,0.30)" },
  { name: "sky",    hex: "#7aa8dc", soft: "rgba(122,168,220,0.12)", ring: "rgba(122,168,220,0.30)" },
  { name: "sand",   hex: "#d9b078", soft: "rgba(217,176,120,0.12)", ring: "rgba(217,176,120,0.30)" },
  { name: "coral",  hex: "#d97a6a", soft: "rgba(217,122,106,0.12)", ring: "rgba(217,122,106,0.30)" },
  { name: "plum",   hex: "#b088c8", soft: "rgba(176,136,200,0.12)", ring: "rgba(176,136,200,0.30)" },
  { name: "moss",   hex: "#79b087", soft: "rgba(121,176,135,0.12)", ring: "rgba(121,176,135,0.30)" },
];

const hashStr = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const pickAccent = (key: string) => ACCENTS[hashStr(key) % ACCENTS.length];

const escapeHtml = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------------------ */
/* HTML templates — each page is exactly 1600x900 (16:9 landscape).    */
/* ------------------------------------------------------------------ */

const PAGE_W = 1600;
const PAGE_H = 900;
const GOLD = "#c4a149";
const OBSIDIAN = "#0a0a08";
const SURFACE = "#12141a";
const SURFACE_2 = "#181b23";
const SILVER = "#ced3dc";
const SILVER_DIM = "#8b95a3";
const HAIRLINE = "rgba(255,255,255,0.06)";

const baseStyle = `
  font-family: 'Plus Jakarta Sans', -apple-system, 'Segoe UI', system-ui, sans-serif;
  width: ${PAGE_W}px; height: ${PAGE_H}px;
  background: ${OBSIDIAN}; color: ${SILVER};
  position: relative; overflow: hidden; box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
`;

const dotGrid = `
  position:absolute; inset:0; pointer-events:none;
  background-image: radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px);
  background-size: 28px 28px;
`;

const topBar = (kicker: string, logoDataUrl: string | null) => `
  <div style="position:absolute; top:36px; left:56px; right:56px; display:flex; justify-content:space-between; align-items:center;">
    ${
      logoDataUrl
        ? `<img src="${logoDataUrl}" style="height:34px; object-fit:contain;" />`
        : `<div style="color:${GOLD}; font-weight:700; letter-spacing:.14em; font-size:14px;">BEGIN BY LIBERTY</div>`
    }
    <div style="color:${GOLD}; font-weight:700; letter-spacing:.28em; font-size:11px;">${escapeHtml(kicker.toUpperCase())}</div>
  </div>
`;

const footer = (page: number, total: number) => `
  <div style="position:absolute; bottom:32px; left:56px; right:56px; display:flex; justify-content:space-between; align-items:center;
    font-size:11px; color:${SILVER_DIM}; letter-spacing:.18em;">
    <div style="display:flex; align-items:center; gap:10px;">
      <span style="display:inline-block; width:22px; height:1px; background:${GOLD}; opacity:.7;"></span>
      BEGIN BY LIBERTY · ENTREGÁVEL ESTRATÉGICO
    </div>
    <div>${String(page).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
  </div>
`;

/* ---------- Cover ---------- */
const coverHtml = (d: SessionDeliverableData, accent: typeof ACCENTS[number], logo: string | null) => {
  const tagsHtml = (d.tags || []).slice(0, 4).map((t, i) => `
    <span style="display:inline-flex; align-items:center; padding:8px 14px; border-radius:999px;
      background:${i === 0 ? accent.hex : "rgba(255,255,255,0.05)"};
      color:${i === 0 ? OBSIDIAN : SILVER};
      font-size:11px; font-weight:700; letter-spacing:.14em; margin-right:8px; margin-top:8px;
      border:1px solid ${i === 0 ? "transparent" : HAIRLINE};">${escapeHtml(t.toUpperCase())}</span>
  `).join("");

  const goalCard = d.goal_title?.trim() ? `
    <div style="position:absolute; top:200px; right:56px; width:520px; padding:44px 42px;
      background: linear-gradient(180deg, ${SURFACE_2} 0%, ${SURFACE} 100%);
      border:1px solid ${accent.ring}; border-radius:20px;
      box-shadow: 0 20px 60px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.04);">
      <div style="color:${accent.hex}; font-size:11px; font-weight:800; letter-spacing:.28em; margin-bottom:16px;">
        ${escapeHtml((d.goal_label || "META").toUpperCase())}
      </div>
      <div style="color:#fff; font-size:32px; font-weight:800; line-height:1.15; letter-spacing:-0.01em;">
        ${escapeHtml(d.goal_title)}
      </div>
      ${d.goal_description ? `
      <div style="margin-top:20px; color:${SILVER}; font-size:14px; line-height:1.6;">
        ${escapeHtml(d.goal_description)}
      </div>` : ""}
      ${tagsHtml ? `<div style="margin-top:26px;">${tagsHtml}</div>` : ""}
    </div>` : "";

  return `
    <div style="${baseStyle}">
      <div style="${dotGrid}"></div>
      <!-- accent arc -->
      <div style="position:absolute; top:-260px; left:-260px; width:640px; height:640px;
        border:1px solid ${accent.ring}; border-radius:50%; opacity:.6;"></div>
      <div style="position:absolute; bottom:-180px; right:-120px; width:420px; height:420px;
        border:1px solid ${HAIRLINE}; border-radius:50%;"></div>
      ${topBar("Consultoria estratégica", logo)}
      <!-- title block -->
      <div style="position:absolute; top:230px; left:56px; width:920px;">
        <div style="display:inline-flex; align-items:center; gap:10px; margin-bottom:22px;">
          <span style="display:inline-block; width:36px; height:2px; background:${accent.hex};"></span>
          <span style="color:${accent.hex}; font-size:11px; font-weight:700; letter-spacing:.28em;">SESSÃO DE MENTORIA</span>
        </div>
        <div style="color:#fff; font-size:72px; font-weight:800; line-height:1.02; letter-spacing:-0.02em; max-width:880px;">
          ${escapeHtml(d.strategic_title || "Material da sessão")}
        </div>
        ${d.subtitle ? `
        <div style="margin-top:28px; color:${SILVER}; font-size:18px; line-height:1.55; max-width:760px;">
          ${escapeHtml(d.subtitle)}
        </div>` : ""}
      </div>
      ${goalCard}
      <!-- bottom meta strip -->
      <div style="position:absolute; bottom:80px; left:56px; right:56px; display:flex; align-items:center; gap:24px;
        padding-top:20px; border-top:1px solid ${HAIRLINE};">
        <div style="flex:1;">
          <div style="color:${SILVER_DIM}; font-size:10px; letter-spacing:.24em; font-weight:700;">ALUNO</div>
          <div style="color:#fff; font-size:16px; font-weight:600; margin-top:4px;">${escapeHtml(d.member_name || "Sem dados")}</div>
        </div>
        <div style="flex:1;">
          <div style="color:${SILVER_DIM}; font-size:10px; letter-spacing:.24em; font-weight:700;">MENTOR</div>
          <div style="color:#fff; font-size:16px; font-weight:600; margin-top:4px;">${escapeHtml(d.mentor_name || "Sem dados")}</div>
        </div>
        ${d.session_context ? `
        <div style="flex:1;">
          <div style="color:${SILVER_DIM}; font-size:10px; letter-spacing:.24em; font-weight:700;">CONTEXTO</div>
          <div style="color:#fff; font-size:16px; font-weight:600; margin-top:4px;">${escapeHtml(d.session_context)}</div>
        </div>` : ""}
      </div>
      ${footer(1, 3)}
    </div>
  `;
};

/* ---------- Page 2: Diagnóstico + Pilares ---------- */
const diagnosisPillarsHtml = (d: SessionDeliverableData, accent: typeof ACCENTS[number], logo: string | null) => {
  const pillars = (d.pillars || []).slice(0, 4);
  // 2x2 grid always for consistent spacing
  const pillarCells = pillars.map((p, i) => `
    <div style="background:${SURFACE}; border:1px solid ${HAIRLINE}; border-radius:16px;
      padding:26px 28px; position:relative; overflow:hidden;">
      <div style="position:absolute; top:0; left:0; width:3px; height:100%; background:${accent.hex}; opacity:.85;"></div>
      <div style="display:flex; align-items:baseline; gap:16px;">
        <span style="color:${accent.hex}; font-size:34px; font-weight:800; letter-spacing:-.02em; line-height:1;">
          ${escapeHtml(p.number || String(i + 1).padStart(2, "0"))}
        </span>
        <span style="color:#fff; font-size:18px; font-weight:700; line-height:1.25;">
          ${escapeHtml(p.title || "")}
        </span>
      </div>
      <div style="margin-top:14px; color:${SILVER}; font-size:13.5px; line-height:1.6;">
        ${escapeHtml(p.description || "")}
      </div>
    </div>
  `).join("");

  return `
    <div style="${baseStyle}">
      <div style="${dotGrid}"></div>
      ${topBar("Diagnóstico & pilares", logo)}
      <div style="position:absolute; top:120px; left:56px; right:56px; bottom:80px; display:grid;
        grid-template-columns: 1fr 1fr; gap:40px;">
        <!-- Diagnóstico -->
        <div style="display:flex; flex-direction:column;">
          <div style="display:inline-flex; align-items:center; gap:10px; margin-bottom:16px;">
            <span style="display:inline-block; width:28px; height:2px; background:${accent.hex};"></span>
            <span style="color:${accent.hex}; font-size:11px; font-weight:700; letter-spacing:.28em;">DIAGNÓSTICO</span>
          </div>
          <div style="color:#fff; font-size:38px; font-weight:800; line-height:1.1; letter-spacing:-.02em; margin-bottom:24px;">
            O que está em jogo
          </div>
          <div style="background:${SURFACE}; border:1px solid ${HAIRLINE}; border-radius:20px; padding:32px;
            color:${SILVER}; font-size:16px; line-height:1.7; flex:1;">
            ${escapeHtml(d.diagnosis || "").split(/\n+/).map(p => `<p style="margin:0 0 14px 0;">${p}</p>`).join("")}
          </div>
        </div>
        <!-- Pilares -->
        <div style="display:flex; flex-direction:column;">
          <div style="display:inline-flex; align-items:center; gap:10px; margin-bottom:16px;">
            <span style="display:inline-block; width:28px; height:2px; background:${GOLD};"></span>
            <span style="color:${GOLD}; font-size:11px; font-weight:700; letter-spacing:.28em;">PILARES DO PROJETO</span>
          </div>
          <div style="color:#fff; font-size:38px; font-weight:800; line-height:1.1; letter-spacing:-.02em; margin-bottom:24px;">
            ${pillars.length} frente${pillars.length === 1 ? "" : "s"} de execução
          </div>
          <div style="flex:1; display:grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap:16px;">
            ${pillarCells || `<div style="color:${SILVER_DIM}; font-size:14px;">Sem pilares definidos.</div>`}
          </div>
        </div>
      </div>
      ${footer(2, 3)}
    </div>
  `;
};

/* ---------- Page 3: Plano de Ação + Riscos + Próximos passos ---------- */
const actionRisksHtml = (d: SessionDeliverableData, accent: typeof ACCENTS[number], logo: string | null) => {
  const rows = (d.action_plan || []).slice(0, 6);
  const actionRows = rows.length
    ? rows.map((r, i) => `
      <tr style="background:${i % 2 ? "rgba(255,255,255,0.015)" : "transparent"};">
        <td style="padding:14px 18px; border-bottom:1px solid ${HAIRLINE}; color:#fff; font-weight:700; font-size:13px; width:24%;">
          ${escapeHtml(r.sector)}
        </td>
        <td style="padding:14px 18px; border-bottom:1px solid ${HAIRLINE}; color:${SILVER}; font-size:13px; line-height:1.5;">
          ${escapeHtml(r.deliverable)}
        </td>
        <td style="padding:14px 18px; border-bottom:1px solid ${HAIRLINE}; color:${accent.hex}; font-weight:700; font-size:12px; letter-spacing:.06em; text-align:right; width:20%;">
          ${escapeHtml(r.deadline)}
        </td>
      </tr>`).join("")
    : `<tr><td colspan="3" style="padding:26px; color:${SILVER_DIM}; font-size:13px; text-align:center;">Plano de ação será detalhado nas próximas semanas.</td></tr>`;

  const risks = (d.risks || []).slice(0, 4);
  const riskCards = risks.map(r => `
    <div style="background:${SURFACE}; border:1px solid ${HAIRLINE}; border-radius:12px; padding:16px 18px; position:relative;">
      <div style="position:absolute; top:0; left:0; width:3px; height:100%; background:${GOLD}; opacity:.7; border-radius:12px 0 0 12px;"></div>
      <div style="color:#fff; font-size:13.5px; font-weight:700; margin-bottom:6px; padding-left:6px;">
        ${escapeHtml(r.title)}
      </div>
      <div style="color:${SILVER}; font-size:12px; line-height:1.55; padding-left:6px;">
        ${escapeHtml(r.control)}
      </div>
    </div>
  `).join("");

  const steps = (d.next_steps || []).slice(0, 5);
  const stepsHtml = steps.map((s, i) => `
    <div style="display:flex; gap:14px; align-items:flex-start; padding:12px 0; border-bottom:1px solid ${HAIRLINE};">
      <div style="flex-shrink:0; width:26px; height:26px; border-radius:50%; background:${accent.hex}; color:${OBSIDIAN};
        display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px;">${i + 1}</div>
      <div style="color:${SILVER}; font-size:13.5px; line-height:1.5; flex:1;">${escapeHtml(s)}</div>
    </div>
  `).join("");

  return `
    <div style="${baseStyle}">
      <div style="${dotGrid}"></div>
      ${topBar("Plano de ação · riscos · próximos passos", logo)}
      <div style="position:absolute; top:120px; left:56px; right:56px; bottom:80px; display:grid;
        grid-template-columns: 1.35fr 1fr; gap:32px;">
        <!-- LEFT: Action plan -->
        <div style="display:flex; flex-direction:column;">
          <div style="display:inline-flex; align-items:center; gap:10px; margin-bottom:14px;">
            <span style="display:inline-block; width:28px; height:2px; background:${accent.hex};"></span>
            <span style="color:${accent.hex}; font-size:11px; font-weight:700; letter-spacing:.28em;">PLANO DE AÇÃO</span>
          </div>
          <div style="color:#fff; font-size:30px; font-weight:800; line-height:1.1; letter-spacing:-.02em; margin-bottom:20px;">
            Execução por frente
          </div>
          <div style="background:${SURFACE}; border:1px solid ${HAIRLINE}; border-radius:16px; overflow:hidden; flex:1;">
            <table style="width:100%; border-collapse:collapse;">
              <thead>
                <tr style="background:rgba(255,255,255,0.03);">
                  <th style="padding:14px 18px; text-align:left; color:${accent.hex}; font-size:10px; font-weight:800; letter-spacing:.22em; border-bottom:1px solid ${accent.ring};">SETOR</th>
                  <th style="padding:14px 18px; text-align:left; color:${accent.hex}; font-size:10px; font-weight:800; letter-spacing:.22em; border-bottom:1px solid ${accent.ring};">ENTREGA PRINCIPAL</th>
                  <th style="padding:14px 18px; text-align:right; color:${accent.hex}; font-size:10px; font-weight:800; letter-spacing:.22em; border-bottom:1px solid ${accent.ring};">PRAZO</th>
                </tr>
              </thead>
              <tbody>${actionRows}</tbody>
            </table>
          </div>
        </div>
        <!-- RIGHT: Risks + steps -->
        <div style="display:flex; flex-direction:column; gap:20px;">
          ${risks.length ? `
          <div style="flex:1; display:flex; flex-direction:column;">
            <div style="display:inline-flex; align-items:center; gap:10px; margin-bottom:12px;">
              <span style="display:inline-block; width:22px; height:2px; background:${GOLD};"></span>
              <span style="color:${GOLD}; font-size:11px; font-weight:700; letter-spacing:.28em;">RISCOS CRÍTICOS</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">${riskCards}</div>
          </div>` : ""}
          ${steps.length ? `
          <div style="flex:1; display:flex; flex-direction:column;">
            <div style="display:inline-flex; align-items:center; gap:10px; margin-bottom:12px;">
              <span style="display:inline-block; width:22px; height:2px; background:${accent.hex};"></span>
              <span style="color:${accent.hex}; font-size:11px; font-weight:700; letter-spacing:.28em;">PRÓXIMOS PASSOS</span>
            </div>
            <div style="background:${SURFACE}; border:1px solid ${HAIRLINE}; border-radius:16px; padding:6px 20px;">
              ${stepsHtml}
            </div>
          </div>` : ""}
        </div>
      </div>
      ${footer(3, 3)}
    </div>
  `;
};

/* ------------------------------------------------------------------ */
/* Render pipeline: build offscreen DOM → html2canvas → jsPDF          */
/* ------------------------------------------------------------------ */

const loadDataUrl = (src: string): Promise<string | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d")?.drawImage(img, 0, 0);
        resolve(c.toDataURL("image/png"));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

const renderPage = async (html: string): Promise<string> => {
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed; left:-99999px; top:0; width:${PAGE_W}px; height:${PAGE_H}px; z-index:-1;`;
  holder.innerHTML = html;
  document.body.appendChild(holder);
  // Wait for fonts to be ready so text doesn't shift after capture
  try { await (document as any).fonts?.ready; } catch { /* noop */ }
  const canvas = await html2canvas(holder.firstElementChild as HTMLElement, {
    width: PAGE_W,
    height: PAGE_H,
    scale: 2,
    backgroundColor: OBSIDIAN,
    useCORS: true,
    logging: false,
  });
  document.body.removeChild(holder);
  return canvas.toDataURL("image/jpeg", 0.92);
};

export const generateSessionDeliverablePdf = async (d: SessionDeliverableData): Promise<Blob> => {
  const logo = await loadDataUrl(logoBegin);
  const accent = pickAccent(`${d.strategic_title}·${d.member_name}`);

  const pagesHtml = [
    coverHtml(d, accent, logo),
    diagnosisPillarsHtml(d, accent, logo),
    actionRisksHtml(d, accent, logo),
  ];

  const images: string[] = [];
  for (const h of pagesHtml) images.push(await renderPage(h));

  // Landscape A4-like at 16:9 — use custom format so it matches exactly.
  const doc = new jsPDF({ unit: "px", format: [PAGE_W, PAGE_H], orientation: "landscape", compress: true });
  images.forEach((img, i) => {
    if (i > 0) doc.addPage([PAGE_W, PAGE_H], "landscape");
    doc.addImage(img, "JPEG", 0, 0, PAGE_W, PAGE_H, undefined, "FAST");
  });

  return doc.output("blob");
};

export const downloadSessionDeliverablePdf = async (d: SessionDeliverableData, filename?: string) => {
  const blob = await generateSessionDeliverablePdf(d);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeTitle = (d.strategic_title || "Material_da_sessao").replace(/[^a-zA-Z0-9]+/g, "_");
  const safeMember = (d.member_name || "").replace(/[^a-zA-Z0-9]+/g, "_");
  a.download = filename || `${safeTitle}_${safeMember}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
