import { state } from "../state";
import { uiState } from "../core/ui-state";
import { Graphic } from "../types";
import { SHAPES, buildPrims } from "./shapes";
import { flatten, distToPolylines, handlePoints } from "./primitives";

export let activeShape: string | null = null;
export let previewGraphic: Graphic | null = null;
export function setActiveShape(kind: string | null) { activeShape = kind; }

type Drag = { mode: "create" | "move" | "p1" | "p2" | "bow"; g: Graphic; ox: number; oy: number; base: Graphic };
let drag: Drag | null = null;

function hitDist(g: Graphic, x: number, y: number) { return distToPolylines(flatten(buildPrims(g)), x, y); }

export function graphicAt(x: number, y: number, tol = 7): Graphic | null {
    const gs = state.getGraphics();
    for (let i = gs.length - 1; i >= 0; i--)
        if (hitDist(gs[i], x, y) <= tol + (gs[i].lineWidth ?? uiState.globalLineWidth)) return gs[i];
    return null;
}
function handleAt(g: Graphic, x: number, y: number) {
    return handlePoints(g).find(h => Math.hypot(h.x - x, h.y - y) <= 8) ?? null;
}

function makeGraphic(kind: string, x: number, y: number): Graphic {
    const def = SHAPES[kind];
    return { id: state.getNextId(), kind, x1: x, y1: y, x2: x, y2: y,
             color: uiState.globalColor, lineWidth: uiState.globalLineWidth, ...(def.defaults ?? {}) };
}

export function graphicsMouseDown(x: number, y: number, e: MouseEvent, render: () => void): boolean {
    if (e.button !== 0) return false;

    if (uiState.editMode === "shape" && activeShape) {
        const def = SHAPES[activeShape];
        if (def.fixed) {
            state.saveState();
            state.addGraphic(makeGraphic(activeShape, x, y));
            render(); return true;
        }
        previewGraphic = makeGraphic(activeShape, x, y);
        drag = { mode: "create", g: previewGraphic, ox: x, oy: y, base: { ...previewGraphic } };
        return true;
    }

    if (uiState.editMode !== "select" && uiState.editMode !== "move") return false;

    // Erst Handles bereits selektierter Grafiken, dann Körper
    for (const id of state.getSelectedGraphicIds()) {
        const g = state.getGraphics().find(q => q.id === id);
        if (!g) continue;
        const h = handleAt(g, x, y);
        if (h) { state.saveState(); drag = { mode: h.role, g, ox: x, oy: y, base: { ...g } }; return true; }
    }
    const hit = graphicAt(x, y);
    if (!hit) return false;
    state.selectGraphics([hit.id]);
    state.clearSelection();
    state.saveState();
    drag = { mode: "move", g: hit, ox: x, oy: y, base: { ...hit } };
    render(); return true;
}

export function graphicsMouseMove(x: number, y: number, e: MouseEvent, render: () => void): boolean {
    if (!drag) return false;
    const dx = x - drag.ox, dy = y - drag.oy;
    const g = drag.g, b = drag.base;

    if (drag.mode === "create" || drag.mode === "p2") {
        g.x2 = x; g.y2 = y;
        if (e.shiftKey) {                                     // 15°-Raster
            const a = Math.round(Math.atan2(y - g.y1, x - g.x1) / (Math.PI / 12)) * (Math.PI / 12);
            const l = Math.hypot(x - g.x1, y - g.y1);
            g.x2 = g.x1 + Math.cos(a) * l; g.y2 = g.y1 + Math.sin(a) * l;
        }
    } else if (drag.mode === "p1") { g.x1 = x; g.y1 = y; }
    else if (drag.mode === "move") { g.x1 = b.x1 + dx; g.y1 = b.y1 + dy; g.x2 = b.x2 + dx; g.y2 = b.y2 + dy; }
    else if (drag.mode === "bow") {
        const vx = g.x2 - g.x1, vy = g.y2 - g.y1, l = Math.hypot(vx, vy) || 1;
        const mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2;
        g.bow = (-(x - mx) * (vy / l) + (y - my) * (vx / l)) / (l * 0.5);
    }
    render(); return true;
}

export function graphicsMouseUp(_x: number, _y: number, _e: MouseEvent, render: () => void): boolean {
    if (!drag) return false;
    if (drag.mode === "create") {
        const g = drag.g;
        if (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) > 8) { state.saveState(); state.addGraphic(g); }
        previewGraphic = null;
    }
    drag = null; render(); return true;
}

export function deleteSelectedGraphics(render: () => void): boolean {
    const sel = state.getSelectedGraphicIds();
    if (!sel.size) return false;
    state.saveState();
    state.removeGraphics(sel);
    state.clearGraphicSelection();
    render(); return true;
}