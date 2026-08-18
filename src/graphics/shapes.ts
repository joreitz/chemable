import { Graphic } from "../types";
import { Prim, Seg, M, L, Q, Z } from "./primitives";

export interface ShapeDef {
    label: string;
    group: "Arrows" | "Curved" | "Boxes" | "Marks";
    fixed?: boolean;                 // per Klick statt Ziehen platziert
    defaults?: Partial<Graphic>;
    build(g: Graphic): Prim[];
    z?: number; 
}

const HEAD = 12;
const ang = (g: Graphic) => Math.atan2(g.y2 - g.y1, g.x2 - g.x1);
const len = (g: Graphic) => Math.hypot(g.x2 - g.x1, g.y2 - g.y1) || 1;
const bbox = (g: Graphic) => ({
    x: Math.min(g.x1, g.x2), y: Math.min(g.y1, g.y2),
    w: Math.abs(g.x2 - g.x1), h: Math.abs(g.y2 - g.y1)
});

// Gefüllte Spitze mit Kerbe (ChemDraw-Look)
function head(x: number, y: number, a: number, size = HEAD): Prim {
    const b = Math.PI / 7;
    return { d: [M(x, y),
                 L(x - size * Math.cos(a - b), y - size * Math.sin(a - b)),
                 L(x - size * 0.72 * Math.cos(a), y - size * 0.72 * Math.sin(a)),
                 L(x - size * Math.cos(a + b), y - size * Math.sin(a + b)), Z()],
             fill: true, stroke: false };
}
function barb(x: number, y: number, a: number, side: 1 | -1, size = HEAD): Prim {
    const b = side * Math.PI / 7;
    return { d: [M(x, y), L(x - size * Math.cos(a + b), y - size * Math.sin(a + b))] };
}
function shortened(g: Graphic, byEnd: number, byStart = 0): [number, number, number, number] {
    const a = ang(g);
    return [g.x1 + Math.cos(a) * byStart, g.y1 + Math.sin(a) * byStart,
            g.x2 - Math.cos(a) * byEnd,  g.y2 - Math.sin(a) * byEnd];
}
function offsetLine(g: Graphic, off: number): [number, number, number, number] {
    const a = ang(g), nx = -Math.sin(a) * off, ny = Math.cos(a) * off;
    return [g.x1 + nx, g.y1 + ny, g.x2 + nx, g.y2 + ny];
}
function ctrl(g: Graphic) {
    const l = len(g), dx = (g.x2 - g.x1) / l, dy = (g.y2 - g.y1) / l, bow = g.bow ?? 0.4;
    return { cx: (g.x1 + g.x2) / 2 - dy * bow * l, cy: (g.y1 + g.y2) / 2 + dx * bow * l };
}

export const SHAPES: Record<string, ShapeDef> = {
    arrow: { label: "Reaction", group: "Arrows", build: g => {
        const [ax, ay, bx, by] = shortened(g, HEAD * 0.7);
        return [{ d: [M(ax, ay), L(bx, by)] }, head(g.x2, g.y2, ang(g))];
    }},
    arrow_resonance: { label: "Resonance", group: "Arrows", build: g => {
        const [ax, ay, bx, by] = shortened(g, HEAD * 0.7, HEAD * 0.7);
        return [{ d: [M(ax, ay), L(bx, by)] }, head(g.x2, g.y2, ang(g)), head(g.x1, g.y1, ang(g) + Math.PI)];
    }},
    arrow_equilibrium: { label: "Equilibrium", group: "Arrows", build: g => {
        const a = ang(g), l = len(g), sh = l * 0.12;
        const top = offsetLine({ ...g, x1: g.x1 + Math.cos(a) * sh, y1: g.y1 + Math.sin(a) * sh }, -4);
        const bot = offsetLine({ ...g, x2: g.x2 - Math.cos(a) * sh, y2: g.y2 - Math.sin(a) * sh }, 4);
        return [{ d: [M(top[0], top[1]), L(top[2], top[3])] }, barb(top[2], top[3], a, 1),
                { d: [M(bot[0], bot[1]), L(bot[2], bot[3])] }, barb(bot[0], bot[1], a + Math.PI, 1)];
    }},
    arrow_retro: { label: "Retrosynthesis", group: "Arrows", build: g => {
        const a = ang(g), [ax, ay, bx, by] = shortened(g, HEAD * 0.9);
        const u = offsetLine({ ...g, x1: ax, y1: ay, x2: bx, y2: by }, -3.5);
        const d = offsetLine({ ...g, x1: ax, y1: ay, x2: bx, y2: by }, 3.5);
        return [{ d: [M(u[0], u[1]), L(u[2], u[3])] }, { d: [M(d[0], d[1]), L(d[2], d[3])] },
                barb(g.x2, g.y2, a, 1, HEAD * 1.2), barb(g.x2, g.y2, a, -1, HEAD * 1.2)];
    }},
    arrow_dashed: { label: "Dashed", group: "Arrows", build: g => {
        const [ax, ay, bx, by] = shortened(g, HEAD * 0.7);
        return [{ d: [M(ax, ay), L(bx, by)], dash: [7, 5] }, head(g.x2, g.y2, ang(g))];
    }},
    arrow_curved: { label: "Electron pair", group: "Curved", defaults: { bow: 0.4 }, build: g => {
        const c = ctrl(g), a = Math.atan2(g.y2 - c.cy, g.x2 - c.cx);
        return [{ d: [M(g.x1, g.y1), Q(c.cx, c.cy, g.x2 - Math.cos(a) * HEAD * 0.6, g.y2 - Math.sin(a) * HEAD * 0.6)] },
                head(g.x2, g.y2, a)];
    }},
    arrow_fishhook: { label: "Single electron", group: "Curved", defaults: { bow: 0.4 }, build: g => {
        const c = ctrl(g), a = Math.atan2(g.y2 - c.cy, g.x2 - c.cx);
        return [{ d: [M(g.x1, g.y1), Q(c.cx, c.cy, g.x2, g.y2)] }, barb(g.x2, g.y2, a, 1)];
    }},
    arrow_curved_dbl: { label: "Curved, both ends", group: "Curved", defaults: { bow: 0.4 }, build: g => {
        const c = ctrl(g);
        const a2 = Math.atan2(g.y2 - c.cy, g.x2 - c.cx), a1 = Math.atan2(g.y1 - c.cy, g.x1 - c.cx);
        return [{ d: [M(g.x1 - Math.cos(a1) * HEAD * 0.6, g.y1 - Math.sin(a1) * HEAD * 0.6),
                      Q(c.cx, c.cy, g.x2 - Math.cos(a2) * HEAD * 0.6, g.y2 - Math.sin(a2) * HEAD * 0.6)] },
                head(g.x2, g.y2, a2), head(g.x1, g.y1, a1)];
    }},
    box: { label: "Rectangle", group: "Boxes", build: g => [{ rect: bbox(g) }] },
    box_round: { label: "Rounded", group: "Boxes", defaults: { radius: 10 },
        build: g => [{ rect: { ...bbox(g), r: g.radius ?? 10 } }] },
    box_dashed: { label: "Dashed box", group: "Boxes", defaults: { radius: 6 },
        build: g => [{ rect: { ...bbox(g), r: g.radius ?? 6 }, dash: [7, 5] }] },
    box_shadow: { label: "Shadow box", group: "Boxes", z: -1, defaults: { radius: 10, z: -1 },
        build: g => [{ rect: { ...bbox(g), r: g.radius ?? 10 }, fillColor: "#ffffff", shadow: true }] },
    ellipse: { label: "Ellipse", group: "Boxes", build: g => {
        const b = bbox(g);
        return [{ ellipse: { cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2 } }];
    }},
    ellipse_dashed: { label: "Dashed ellipse", group: "Boxes", build: g => {
        const b = bbox(g);
        return [{ ellipse: { cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2 }, dash: [7, 5] }];
    }},
    bracket_square: { label: "Brackets [ ]", group: "Boxes", build: g => {
        const b = bbox(g), t = Math.min(12, b.w * 0.25);
        return [{ d: [M(b.x + t, b.y), L(b.x, b.y), L(b.x, b.y + b.h), L(b.x + t, b.y + b.h)] },
                { d: [M(b.x + b.w - t, b.y), L(b.x + b.w, b.y), L(b.x + b.w, b.y + b.h), L(b.x + b.w - t, b.y + b.h)] }];
    }},
    bracket_round: { label: "Parentheses ( )", group: "Boxes", build: g => {
        const b = bbox(g), t = Math.min(14, b.w * 0.3);
        return [{ d: [M(b.x + t, b.y), Q(b.x, b.y + b.h / 2, b.x + t, b.y + b.h)] },
                { d: [M(b.x + b.w - t, b.y), Q(b.x + b.w, b.y + b.h / 2, b.x + b.w - t, b.y + b.h)] }];
    }},
    line: { label: "Line", group: "Marks", build: g => [{ d: [M(g.x1, g.y1), L(g.x2, g.y2)] }] },
    line_dashed: { label: "Dashed line", group: "Marks", build: g => [{ d: [M(g.x1, g.y1), L(g.x2, g.y2)], dash: [7, 5] }] },
    plus: { label: "Plus sign", group: "Marks", fixed: true, build: g => {
        const s = 9;
        return [{ d: [M(g.x1 - s, g.y1), L(g.x1 + s, g.y1)], lw: 1.4 },
                { d: [M(g.x1, g.y1 - s), L(g.x1, g.y1 + s)], lw: 1.4 }];
    }},
};

export function buildPrims(g: Graphic): Prim[] {
    return (SHAPES[g.kind] ?? SHAPES.line).build(g);
}

export const zOf = (g: Graphic): number => g.z ?? SHAPES[g.kind]?.z ?? 0;