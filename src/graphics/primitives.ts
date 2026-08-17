import { Graphic } from "../types";

export type Seg =
    | ["M", number, number]
    | ["L", number, number]
    | ["Q", number, number, number, number]
    | ["Z"];

export interface Prim {
    d?: Seg[];
    rect?: { x: number; y: number; w: number; h: number; r?: number };
    ellipse?: { cx: number; cy: number; rx: number; ry: number };
    fill?: boolean;          // mit Linienfarbe füllen
    fillColor?: string;      // explizite Füllfarbe (z.B. weiß hinter Schatten)
    stroke?: boolean;        // default true
    dash?: number[];
    shadow?: boolean;
    lw?: number;             // Multiplikator auf die Linienbreite
}

export const M = (x: number, y: number): Seg => ["M", x, y];
export const L = (x: number, y: number): Seg => ["L", x, y];
export const Q = (cx: number, cy: number, x: number, y: number): Seg => ["Q", cx, cy, x, y];
export const Z = (): Seg => ["Z"];

export function paintPrims(ctx: CanvasRenderingContext2D, prims: Prim[], color: string, lw: number) {
    ctx.save();
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (const p of prims) {
        ctx.beginPath();
        if (p.rect) {
            const { x, y, w, h, r } = p.rect;
            if (r && (ctx as any).roundRect) (ctx as any).roundRect(x, y, w, h, r);
            else ctx.rect(x, y, w, h);
        } else if (p.ellipse) {
            const e = p.ellipse;
            ctx.ellipse(e.cx, e.cy, Math.abs(e.rx), Math.abs(e.ry), 0, 0, Math.PI * 2);
        } else if (p.d) {
            for (const s of p.d) {
                if (s[0] === "M") ctx.moveTo(s[1], s[2]);
                else if (s[0] === "L") ctx.lineTo(s[1], s[2]);
                else if (s[0] === "Q") ctx.quadraticCurveTo(s[1], s[2], s[3], s[4]);
                else ctx.closePath();
            }
        }
        ctx.setLineDash(p.dash ?? []);
        ctx.lineWidth = lw * (p.lw ?? 1);
        ctx.strokeStyle = color;
        ctx.fillStyle = p.fillColor ?? color;
        if (p.shadow) { ctx.shadowColor = "rgba(0,0,0,0.30)"; ctx.shadowBlur = 8; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3; }
        else { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
        if (p.fill || p.fillColor) ctx.fill();
        ctx.shadowColor = "transparent";                 // Stroke ohne Doppelschatten
        if (p.stroke !== false) ctx.stroke();
    }
    ctx.restore();
}

function segsToD(d: Seg[]): string {
    return d.map(s =>
        s[0] === "M" ? `M ${s[1]} ${s[2]}` :
        s[0] === "L" ? `L ${s[1]} ${s[2]}` :
        s[0] === "Q" ? `Q ${s[1]} ${s[2]} ${s[3]} ${s[4]}` : "Z").join(" ");
}

export function primsToSVG(prims: Prim[], color: string, lw: number): string {
    let out = "";
    for (const p of prims) {
        const w = lw * (p.lw ?? 1);
        const common =
            `fill="${p.fill ? color : (p.fillColor ?? "none")}" stroke="${p.stroke === false ? "none" : color}" ` +
            `stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"` +
            (p.dash ? ` stroke-dasharray="${p.dash.join(",")}"` : "") +
            (p.shadow ? ` filter="url(#chemable-shadow)"` : "");
        if (p.rect) out += `  <rect x="${p.rect.x}" y="${p.rect.y}" width="${p.rect.w}" height="${p.rect.h}" rx="${p.rect.r ?? 0}" ${common} />\n`;
        else if (p.ellipse) out += `  <ellipse cx="${p.ellipse.cx}" cy="${p.ellipse.cy}" rx="${Math.abs(p.ellipse.rx)}" ry="${Math.abs(p.ellipse.ry)}" ${common} />\n`;
        else if (p.d) out += `  <path d="${segsToD(p.d)}" ${common} />\n`;
    }
    return out;
}

export const SHADOW_DEF =
    `  <defs><filter id="chemable-shadow" x="-20%" y="-20%" width="150%" height="150%">` +
    `<feDropShadow dx="3" dy="3" stdDeviation="3" flood-opacity="0.3"/></filter></defs>\n`;

// Prims -> Polylinien (Hit-Test, backend-unabhängig)
export function flatten(prims: Prim[]): number[][][] {
    const out: number[][][] = [];
    for (const p of prims) {
        if (p.rect) {
            const { x, y, w, h } = p.rect;
            out.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]);
        } else if (p.ellipse) {
            const e = p.ellipse, pts: number[][] = [];
            for (let i = 0; i <= 24; i++) {
                const t = (i / 24) * Math.PI * 2;
                pts.push([e.cx + e.rx * Math.cos(t), e.cy + e.ry * Math.sin(t)]);
            }
            out.push(pts);
        } else if (p.d) {
            let cur: number[][] = [], last: number[] = [0, 0];
            for (const s of p.d) {
                if (s[0] === "M") { if (cur.length > 1) out.push(cur); cur = [[s[1], s[2]]]; last = [s[1], s[2]]; }
                else if (s[0] === "L") { cur.push([s[1], s[2]]); last = [s[1], s[2]]; }
                else if (s[0] === "Q") {
                    for (let i = 1; i <= 14; i++) {
                        const t = i / 14, u = 1 - t;
                        cur.push([u * u * last[0] + 2 * u * t * s[1] + t * t * s[3],
                                  u * u * last[1] + 2 * u * t * s[2] + t * t * s[4]]);
                    }
                    last = [s[3], s[4]];
                } else if (s[0] === "Z" && cur.length) cur.push(cur[0]);
            }
            if (cur.length > 1) out.push(cur);
        }
    }
    return out;
}

export function distToPolylines(polys: number[][][], px: number, py: number): number {
    let best = Infinity;
    for (const poly of polys) for (let i = 1; i < poly.length; i++) {
        const [x1, y1] = poly[i - 1], [x2, y2] = poly[i];
        const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
        best = Math.min(best, Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)));
    }
    return best;
}

export function handlePoints(g: Graphic): { x: number; y: number; role: "p1" | "p2" | "bow" }[] {
    const pts: { x: number; y: number; role: "p1" | "p2" | "bow" }[] = [
        { x: g.x1, y: g.y1, role: "p1" }, { x: g.x2, y: g.y2, role: "p2" }];
    if (g.bow !== undefined) {
        const dx = g.x2 - g.x1, dy = g.y2 - g.y1, len = Math.hypot(dx, dy) || 1;
        pts.push({ x: (g.x1 + g.x2) / 2 - (dy / len) * g.bow * len * 0.5,
                   y: (g.y1 + g.y2) / 2 + (dx / len) * g.bow * len * 0.5, role: "bow" });
    }
    return pts;
}

export function paintHandles(ctx: CanvasRenderingContext2D, g: Graphic) {
    ctx.save();
    ctx.strokeStyle = "#0088ff"; ctx.fillStyle = "#fff"; ctx.lineWidth = 1.5; ctx.setLineDash([]);
    handlePoints(g).forEach(h => {
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.role === "bow" ? 4 : 5, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
    });
    ctx.restore();
}