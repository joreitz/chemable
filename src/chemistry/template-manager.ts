import { state } from "../state";
import { uiState } from "../core/ui-state";
import { MOLECULE_TEMPLATES, TemplateData } from "../templates";
import { Atom, Bond } from "../types";
import { findAtomNearPosition, getBondAtCoords } from "../geometry";
import { setMode } from "../ui/toolbar";

type Anchor =
    | { kind: "atom"; atomId: number }
    | { kind: "bond"; bond: Bond }
    | { kind: "free"; x: number; y: number };

export let pendingTemplate: TemplateData | null = null;
export let pendingTemplatePreview: { atoms: Atom[]; bonds: Bond[] } | null = null;
export let templateTargetAtom: Atom | null = null;
export let templateTargetBond: Bond | null = null;
export let templatePhase: "hover" | "orient" = "hover";

let anchor: Anchor | null = null;
let orientAngle = 0;
let flipped = false;
const SNAP = Math.PI / 6;                     // 30° – identisch zum Zeichen-Raster

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function insertTemplate(templateName: string, render: () => void) {
    const t = MOLECULE_TEMPLATES[templateName];
    if (!t) return;
    pendingTemplate = t;
    templatePhase = "hover"; anchor = null; flipped = false; orientAngle = 0;
    setMode("draw"); state.clearSelection(); render();
}

function centroidOf(p: { x: number; y: number }[]) {
    let cx = 0, cy = 0; p.forEach(q => { cx += q.x; cy += q.y; });
    return { x: cx / p.length, y: cy / p.length };
}
function refBondLength(t: TemplateData) {
    const b = t.bonds[0];
    const a1 = t.atoms.find(a => a.id === b.id1)!, a2 = t.atoms.find(a => a.id === b.id2)!;
    return Math.hypot(a2.x - a1.x, a2.y - a1.y) || 60;
}
function cloneScaled(t: TemplateData, k: number) {
    return {
        atoms: t.atoms.map(a => ({ ...a, x: a.x * k, y: a.y * k })) as Atom[],
        bonds: t.bonds.map(b => ({ ...b })) as Bond[]
    };
}
// Nur echte Ringe dürfen Bindungsordnungen rotieren
function isSimpleRing(t: TemplateData) {
    if (t.atoms.length !== t.bonds.length) return false;
    const deg = new Map<number, number>();
    t.bonds.forEach(b => { deg.set(b.id1, (deg.get(b.id1) || 0) + 1); deg.set(b.id2, (deg.get(b.id2) || 0) + 1); });
    return t.atoms.every(a => deg.get(a.id) === 2);
}
// Fusionsbindung bekommt den Typ der Zielbindung; Alternanz bleibt erhalten
function alignFusionTypes(bonds: Bond[], targetType: number) {
    if (bonds[0].type === targetType) return;
    const types = bonds.map(b => b.type);
    for (let s = 1; s < types.length; s++) {
        if (types[s] === targetType) {
            bonds.forEach((b, i) => { b.type = types[(i + s) % types.length]; });
            return;
        }
    }
}

function resolveAnchor(x: number, y: number): Anchor {
    const atoms = state.getAtoms(), bonds = state.getBonds();
    const hitAtom = findAtomNearPosition(x, y, atoms, 20);
    if (hitAtom && hitAtom.element !== "TEXT" && hitAtom.element !== "DUMMY")
        return { kind: "atom", atomId: hitAtom.id };
    const hitBond = getBondAtCoords(x, y, bonds, atoms);
    if (hitBond && hitBond.type !== 4) return { kind: "bond", bond: hitBond };
    return { kind: "free", x, y };
}

// Vorschlagswinkel im Hover: Zickzack statt linearer Fortsetzung
function autoAttachAngle(a: Atom, mx: number, my: number): number {
    const atoms = state.getAtoms(), bonds = state.getBonds();
    const nb = bonds.filter(b => b.id1 === a.id || b.id2 === a.id)
        .map(b => atoms.find(n => n.id === (b.id1 === a.id ? b.id2 : b.id1)))
        .filter((n): n is Atom => !!n);
    const mouseAng = Math.atan2(my - a.y, mx - a.x);
    if (nb.length === 0) return Math.round(mouseAng / SNAP) * SNAP;
    if (nb.length === 1) {
        const base = Math.atan2(a.y - nb[0].y, a.x - nb[0].x);
        const c = [base + Math.PI / 3, base - Math.PI / 3];
        return Math.abs(angDiff(c[0], mouseAng)) <= Math.abs(angDiff(c[1], mouseAng)) ? c[0] : c[1];
    }
    const angs = nb.map(n => Math.atan2(n.y - a.y, n.x - a.x)).sort((p, q) => p - q);
    let best = 0, maxGap = -1;
    for (let i = 0; i < angs.length; i++) {
        let gap = angs[(i + 1) % angs.length] - angs[i];
        if (gap <= 0) gap += 2 * Math.PI;
        if (gap > maxGap) { maxGap = gap; best = angs[i] + gap / 2; }
    }
    return best;
}

function buildPreview(mx: number, my: number) {
    if (!pendingTemplate || !anchor) return null;
    const anc = anchor;
    const atoms = state.getAtoms();
    templateTargetAtom = null; templateTargetBond = null;
    const refLen = refBondLength(pendingTemplate);

    if (anc.kind === "bond") {
        const a1 = atoms.find(a => a.id === anc.bond.id1), a2 = atoms.find(a => a.id === anc.bond.id2);
        if (!a1 || !a2) return null;
        const tgtLen = Math.hypot(a2.x - a1.x, a2.y - a1.y) || uiState.currentBondLength;
        const { atoms: tA, bonds: tB } = cloneScaled(pendingTemplate, tgtLen / refLen);
        if (isSimpleRing(pendingTemplate)) alignFusionTypes(tB, anc.bond.type);
        templateTargetBond = anc.bond;

        const p1 = tA.find(a => a.id === tB[0].id1)!, p2 = tA.find(a => a.id === tB[0].id2)!;
        const c = centroidOf(tA);
        // Seite: Ring landet dort, wo die Maus ist (gilt in hover UND orient)
        const mouseCross = (a2.x - a1.x) * (my - a1.y) - (a2.y - a1.y) * (mx - a1.x);
        const tplCross = (p2.x - p1.x) * (c.y - p1.y) - (p2.y - p1.y) * (c.x - p1.x);
        if (Math.abs(mouseCross) > 1e-6) flipped = Math.sign(mouseCross) !== Math.sign(tplCross);

        const axis = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const rot = Math.atan2(a2.y - a1.y, a2.x - a1.x) - axis;
        const bx = p1.x, by = p1.y;                     
        const ca = Math.cos(-axis), sa = Math.sin(-axis);
        const cb = Math.cos(axis),  sb = Math.sin(axis);
        const cr = Math.cos(rot),   sr = Math.sin(rot);
        tA.forEach(a => {
            let rx = a.x - bx, ry = a.y - by;
            if (flipped) {                               
                const ux = rx * ca - ry * sa;
                const uy = -(rx * sa + ry * ca);
                rx = ux * cb - uy * sb;
                ry = ux * sb + uy * cb;
            }
            a.x = a1.x + rx * cr - ry * sr;
            a.y = a1.y + rx * sr + ry * cr;
        });
        return { atoms: tA, bonds: tB };
    }

    if (anc.kind === "atom") {
        const host = atoms.find(a => a.id === anc.atomId);
        if (!host) return null;
        templateTargetAtom = host;
        const { atoms: tA, bonds: tB } = cloneScaled(pendingTemplate, uiState.currentBondLength / refLen);
        const ang = templatePhase === "orient" ? orientAngle : autoAttachAngle(host, mx, my);
        const root = tA[0], c = centroidOf(tA);
        const rot = ang - Math.atan2(c.y - root.y, c.x - root.x);
        const ax = host.x + Math.cos(ang) * uiState.currentBondLength;
        const ay = host.y + Math.sin(ang) * uiState.currentBondLength;
        const r0x = root.x, r0y = root.y;
        tA.forEach(a => {
            const rx = a.x - r0x, ry = a.y - r0y;
            a.x = ax + rx * Math.cos(rot) - ry * Math.sin(rot);
            a.y = ay + rx * Math.sin(rot) + ry * Math.cos(rot);
        });
        return { atoms: tA, bonds: tB };
    }

    const { atoms: tA, bonds: tB } = cloneScaled(pendingTemplate, uiState.currentBondLength / refLen);
    const c = centroidOf(tA);
    const rot = templatePhase === "orient" ? orientAngle : 0;
    const ox = templatePhase === "orient" ? anc.x : mx;
    const oy = templatePhase === "orient" ? anc.y : my;
    tA.forEach(a => {
        const rx = a.x - c.x, ry = a.y - c.y;
        a.x = ox + rx * Math.cos(rot) - ry * Math.sin(rot);
        a.y = oy + rx * Math.sin(rot) + ry * Math.cos(rot);
    });
    return { atoms: tA, bonds: tB };
}

export function updateTemplatePreview(x: number, y: number, render: () => void, freeRotate = false) {
    if (!pendingTemplate) return false;
    if (templatePhase === "hover") {
        anchor = resolveAnchor(x, y);
    } else if (anchor) {
        const anc = anchor;
        let raw: number | null = null;
        if (anc.kind === "atom") {
            const host = state.getAtoms().find(a => a.id === anc.atomId);
            if (host) raw = Math.atan2(y - host.y, x - host.x);
        } else if (anc.kind === "free") {
            raw = Math.atan2(y - anc.y, x - anc.x);
        }
        if (raw !== null) orientAngle = freeRotate ? raw : Math.round(raw / SNAP) * SNAP;
    }
    pendingTemplatePreview = buildPreview(x, y);
    render();
    return true;
}

// 1. Klick: Anker einfrieren
export function beginTemplateOrient(x: number, y: number, render: () => void) {
    if (!pendingTemplate) return false;
    anchor = resolveAnchor(x, y);
    templatePhase = "orient";
    const anc = anchor;
    if (anc.kind === "atom") {
        const host = state.getAtoms().find(a => a.id === anc.atomId);
        orientAngle = host ? autoAttachAngle(host, x, y) : 0;    // kein Sprung beim Umschalten
    } else orientAngle = 0;
    pendingTemplatePreview = buildPreview(x, y);
    render();
    return true;
}

export function clearPendingTemplate() { pendingTemplate = null; }

export function cancelTemplate(render: () => void) {
    pendingTemplate = null; pendingTemplatePreview = null;
    anchor = null; templatePhase = "hover";
    render(); return true;
}

// Rechtsklick: erst zurück in hover, dann erst Abbruch
export function templateBack(render: () => void) {
    if (templatePhase === "orient") {
        templatePhase = "hover"; anchor = null; pendingTemplatePreview = null;
        render(); return true;
    }
    return cancelTemplate(render);
}

export function placeTemplate(render: () => void) {
    if (!pendingTemplatePreview) return false;
    state.saveState();
    const idMap = new Map<number, number>();
    const skip = new Set<number>();
    const fuse = pendingTemplatePreview.bonds[0];

    if (templateTargetBond) {
        idMap.set(fuse.id1, templateTargetBond.id1);
        idMap.set(fuse.id2, templateTargetBond.id2);
        skip.add(fuse.id1); skip.add(fuse.id2);
        // Zielbindung behält ihren Typ – alignFusionTypes hat den Ring bereits angepasst
    }

    pendingTemplatePreview.atoms.forEach(a => {
        if (skip.has(a.id)) return;
        const newId = state.getNextId();
        idMap.set(a.id, newId);
        state.addAtom({ ...a, id: newId });
    });

    pendingTemplatePreview.bonds.forEach(b => {
        if (templateTargetBond && b === fuse) return;
        const n1 = idMap.get(b.id1)!, n2 = idMap.get(b.id2)!;
        const exists = state.getBonds().some(ex =>
            (ex.id1 === n1 && ex.id2 === n2) || (ex.id1 === n2 && ex.id2 === n1));
        if (!exists) state.addBond({ id1: n1, id2: n2, type: b.type });
    });

    if (templateTargetAtom) {
        const rootId = idMap.get(pendingTemplatePreview.atoms[0].id)!;
        state.addBond({ id1: templateTargetAtom.id, id2: rootId, type: 1 });
    }

    pendingTemplate = null; pendingTemplatePreview = null;
    anchor = null; templatePhase = "hover";
    render(); return true;
}