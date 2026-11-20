import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_Z = 0.15;
const MAX_Z = 2.5;
const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));

const NO_PAN = "input, textarea, select, button, a, label, [contenteditable='true'], [data-no-pan]";

interface View {
  x: number;
  y: number;
  z: number;
}

interface Props {
  children: ReactNode;
  className?: string;
  /** Margem livre no topo (barra fixa sobre o quadro). */
  topInset?: number;
}

/**
 * Quadro infinito no estilo Miro: arrastar o fundo move, roda/trackpad move,
 * Ctrl/Cmd + roda ou pinça dá zoom no ponto do cursor, dois dedos no toque.
 */
export const BoardCanvas = ({ children, className, topInset = 0 }: Props) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  const [animate, setAnimate] = useState(false);
  const [panning, setPanning] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  const apply = useCallback((next: View | ((v: View) => View), smooth = false) => {
    setAnimate(smooth);
    setView((v) => {
      const n = typeof next === "function" ? next(v) : next;
      return { ...n, z: clampZ(n.z) };
    });
  }, []);

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number, smooth = false) => {
      apply((v) => {
        const z = clampZ(v.z * factor);
        const k = z / v.z;
        return { z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      }, smooth);
    },
    [apply],
  );

  const viewportCenter = () => {
    const el = viewportRef.current;
    if (!el) return { cx: 0, cy: 0 };
    return { cx: el.clientWidth / 2, cy: (el.clientHeight + topInset) / 2 };
  };

  const fit = useCallback(
    (smooth = true) => {
      const vp = viewportRef.current;
      const ct = contentRef.current;
      if (!vp || !ct) return;
      const pad = 32;
      const vw = vp.clientWidth - pad * 2;
      const vh = vp.clientHeight - topInset - pad * 2 - 64;
      const cw = ct.offsetWidth;
      const ch = ct.offsetHeight;
      if (!cw || !ch) return;
      const z = clampZ(Math.min(vw / cw, vh / ch, 1));
      apply({ z, x: (vp.clientWidth - cw * z) / 2, y: topInset + pad + Math.max(0, (vh - ch * z) / 2) }, smooth);
    },
    [apply, topInset],
  );

  // Primeiro enquadramento: largura cheia, começando do topo, para ler a ordem do quadro.
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    const ct = contentRef.current;
    if (!vp || !ct) return;
    const pad = vp.clientWidth < 640 ? 12 : 32;
    const z = clampZ(Math.min((vp.clientWidth - pad * 2) / ct.offsetWidth, 1));
    setView({ z, x: (vp.clientWidth - ct.offsetWidth * z) / 2, y: topInset + pad });
  }, [topInset]);

  // Roda / trackpad (não passivo para poder bloquear o zoom da página).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        const box = (e.target as HTMLElement | null)?.closest?.("[data-board-scroll]") as HTMLElement | null;
        if (box && box.scrollHeight > box.clientHeight + 1) {
          const atTop = box.scrollTop <= 0;
          const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
          if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) return;
        }
      }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const delta = Math.max(-40, Math.min(40, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY));
        const factor = Math.exp(-delta * 0.006);
        zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        apply((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
      }
    };
    // Safari (pinça no trackpad não chega como wheel+ctrl).
    let gestureStart = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStart = viewRef.current.z;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      const rect = el.getBoundingClientRect();
      const target = clampZ(gestureStart * ge.scale);
      zoomAt(target / viewRef.current.z, ge.clientX - rect.left, ge.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
    };
  }, [apply, zoomAt]);

  // Atalhos: Cmd/Ctrl + / - / 0 e Shift+1 para enquadrar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true']");
      const mod = e.metaKey || e.ctrlKey;
      const { cx, cy } = viewportCenter();
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomAt(1.2, cx, cy, true);
      } else if (mod && e.key === "-") {
        e.preventDefault();
        zoomAt(1 / 1.2, cx, cy, true);
      } else if (mod && e.key === "0") {
        e.preventDefault();
        zoomAt(1 / viewRef.current.z, cx, cy, true);
      } else if (!typing && e.shiftKey && (e.key === "!" || e.key === "1")) {
        e.preventDefault();
        fit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, zoomAt]);

  // Arrastar (mouse) e pinça com dois dedos (toque).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (!viewportRef.current?.contains(target)) return;
    const interactive = !!target.closest(NO_PAN);
    if (e.pointerType === "mouse" && (e.button !== 0 || interactive)) {
      if (e.button !== 1) return;
    }
    if (e.pointerType !== "mouse" && interactive && pointers.current.size === 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY };
      setPanning(true);
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      drag.current = null;
    }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = viewportRef.current?.getBoundingClientRect();
    if (pointers.current.size >= 2 && pinch.current && rect) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const prev = pinch.current;
      apply((v) => {
        const z = clampZ(v.z * (dist / (prev.dist || dist)));
        const k = z / v.z;
        const cx = mx - rect.left;
        const cy = my - rect.top;
        return {
          z,
          x: cx - (cx - v.x) * k + (mx - prev.mx),
          y: cy - (cy - v.y) * k + (my - prev.my),
        };
      });
      pinch.current = { dist, mx, my };
    } else if (drag.current) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current = { x: e.clientX, y: e.clientY };
      apply((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      drag.current = { x: p.x, y: p.y };
    }
    if (pointers.current.size === 0) {
      drag.current = null;
      setPanning(false);
    }
  };

  // Ao focar um campo fora da área visível (Tab, toque), traz para a tela.
  const onFocusCapture = (e: React.FocusEvent) => {
    const vp = viewportRef.current;
    const el = e.target as HTMLElement;
    if (!vp || !el.getBoundingClientRect || !vp.contains(el)) return;
    const r = el.getBoundingClientRect();
    const v = vp.getBoundingClientRect();
    const margin = 48;
    let dx = 0;
    let dy = 0;
    if (r.left < v.left + margin) dx = v.left + margin - r.left;
    else if (r.right > v.right - margin) dx = Math.max(v.right - margin - r.right, v.left + margin - r.left);
    if (r.top < v.top + topInset + margin) dy = v.top + topInset + margin - r.top;
    else if (r.bottom > v.bottom - 96) dy = Math.max(v.bottom - 96 - r.bottom, v.top + topInset + margin - r.top);
    if (dx || dy) apply((s) => ({ ...s, x: s.x + dx, y: s.y + dy }), true);
  };

  const { cx, cy } = viewportCenter();
  const dot = Math.max(8, 24 * view.z);

  return (
    <div
      ref={viewportRef}
      className={cn(
        "relative h-full w-full overflow-hidden select-none touch-none bg-muted/40",
        panning ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      style={{
        backgroundImage: "radial-gradient(hsl(var(--border)) 1.2px, transparent 1.2px)",
        backgroundSize: `${dot}px ${dot}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onFocusCapture={onFocusCapture}
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
    >
      <div
        ref={contentRef}
        className={cn("absolute left-0 top-0 origin-top-left cursor-auto select-text", animate && "transition-transform duration-200 ease-out")}
        style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.z})` }}
        onTransitionEnd={() => setAnimate(false)}
      >
        {children}
      </div>

      <div
        data-no-pan
        className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-ds-lg border border-border bg-card p-1 shadow-sm"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <button
          type="button"
          onClick={() => zoomAt(1 / 1.25, cx, cy, true)}
          className="grid h-11 w-11 place-items-center rounded-md text-foreground hover:bg-muted sm:h-9 sm:w-9"
          aria-label="Diminuir zoom"
          title="Diminuir zoom (Cmd -)"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoomAt(1 / view.z, cx, cy, true)}
          className="h-11 min-w-[3.5rem] rounded-md px-2 text-xs font-semibold tabular-nums text-foreground hover:bg-muted sm:h-9"
          aria-label="Zoom em 100%"
          title="Voltar para 100% (Cmd 0)"
        >
          {Math.round(view.z * 100)}%
        </button>
        <button
          type="button"
          onClick={() => zoomAt(1.25, cx, cy, true)}
          className="grid h-11 w-11 place-items-center rounded-md text-foreground hover:bg-muted sm:h-9 sm:w-9"
          aria-label="Aumentar zoom"
          title="Aumentar zoom (Cmd +)"
        >
          <Plus className="h-4 w-4" />
        </button>
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <button
          type="button"
          onClick={() => fit()}
          className="grid h-11 w-11 place-items-center rounded-md text-foreground hover:bg-muted sm:h-9 sm:w-9"
          aria-label="Ver o quadro inteiro"
          title="Ver o quadro inteiro (Shift 1)"
        >
          <Maximize className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
