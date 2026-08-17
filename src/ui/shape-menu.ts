import { SHAPES } from "../graphics/shapes";
import { setActiveShape, activeShape } from "../graphics/graphics-tool";
import { primsToSVG, SHADOW_DEF } from "../graphics/primitives";
import { setMode } from "./toolbar";
import { uiState } from "../core/ui-state";
import { state } from "../state";

function icon(kind: string): string {
    const def = SHAPES[kind];
    const demo: any = { id: 0, kind, x1: 7, y1: 20, x2: 41, y2: 8, bow: 0.35, radius: 5, lineWidth: 1.6 };
    if (def.fixed) { demo.x1 = 24; demo.y1 = 14; demo.x2 = 24; demo.y2 = 14; }
    if (def.group === "Boxes") { demo.x1 = 5; demo.y1 = 5; demo.x2 = 43; demo.y2 = 23; }
    return `<svg viewBox="0 0 48 28" width="48" height="28">${SHADOW_DEF}${primsToSVG(def.build(demo), "#222", 1.6)}</svg>`;
}

export function initShapeMenu(render: () => void) {
    const panel = document.getElementById("shape-panel");
    if (!panel) return;
    const groups = ["Arrows", "Curved", "Boxes", "Marks"] as const;

    panel.innerHTML = "";
    groups.forEach(gr => {
        const kinds = Object.keys(SHAPES).filter(k => SHAPES[k].group === gr);
        if (!kinds.length) return;
        const h = document.createElement("div");
        h.textContent = gr;
        h.style.cssText = "font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#666;margin:10px 0 4px;";
        panel.appendChild(h);
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:4px;";
        kinds.forEach(k => {
            const b = document.createElement("button");
            b.dataset.shape = k;
            b.title = SHAPES[k].label;
            b.innerHTML = icon(k);
            b.style.cssText = "display:flex;align-items:center;justify-content:center;padding:4px;border:1px solid #ddd;" +
                              "border-radius:7px;background:#fff;cursor:pointer;";
            b.onclick = () => {
                setActiveShape(k); setMode("shape");
                panel.querySelectorAll("button[data-shape]").forEach(x =>
                    (x as HTMLElement).style.background = (x as HTMLElement).dataset.shape === k ? "#dbeafe" : "#fff");
                render();
            };
            wrap.appendChild(b);
        });
        panel.appendChild(wrap);
    });

    // Zahleneingaben statt Slider
    const opts = document.createElement("div");
    opts.style.cssText = "margin-top:12px;display:grid;grid-template-columns:auto 70px;gap:6px;align-items:center;font-size:12px;";
    const bindNum = (label: string, get: () => number, set: (v: number) => void, step = 1) => {
        const l = document.createElement("span"); l.textContent = label;
        const i = document.createElement("input");
        i.type = "number"; i.step = String(step); i.value = String(get());
        i.style.cssText = "width:100%;padding:3px;";
        i.oninput = () => { const v = parseFloat(i.value); if (!Number.isNaN(v)) { set(v); render(); } };
        opts.append(l, i);
    };
    const selGraphics = () => state.getGraphics().filter(g => state.getSelectedGraphicIds().has(g.id));
    bindNum("Line width", () => uiState.globalLineWidth,
            v => { uiState.globalLineWidth = v; uiState.saveStyle(); selGraphics().forEach(g => g.lineWidth = v); }, 0.5);
    bindNum("Bow (curved)", () => selGraphics()[0]?.bow ?? 0.4,
            v => selGraphics().forEach(g => { if (g.bow !== undefined) g.bow = v; }), 0.05);
    bindNum("Corner radius", () => selGraphics()[0]?.radius ?? 10,
            v => selGraphics().forEach(g => { if (g.radius !== undefined) g.radius = v; }), 1);
    panel.appendChild(opts);
}