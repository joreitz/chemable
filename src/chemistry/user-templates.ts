import { MOLECULE_TEMPLATES, TemplateData } from "../templates";
import { state } from "../state";

const KEY = "chemable-user-templates";

export function loadUserTemplates(): Record<string, TemplateData> {
    try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; }
}
function persist(t: Record<string, TemplateData>) { localStorage.setItem(KEY, JSON.stringify(t)); }

export function mergeUserTemplates() {
    Object.entries(loadUserTemplates()).forEach(([n, d]) => { MOLECULE_TEMPLATES[n] = d; });
}
export function isUserTemplate(name: string) { return name in loadUserTemplates(); }
export function deleteUserTemplate(name: string) {
    const t = loadUserTemplates(); delete t[name]; persist(t); delete MOLECULE_TEMPLATES[name];
}

export function saveSelectionAsTemplate(name: string, targetLen = 60): { ok: boolean; msg: string } {
    if (!name.trim()) return { ok: false, msg: "Name fehlt." };
    const atoms = state.getAtoms(), bonds = state.getBonds(), sel = state.getSelectedAtomIds();
    const picked = atoms.filter(a => sel.has(a.id) && a.element !== "TEXT" && a.element !== "DUMMY");
    if (picked.length < 2) return { ok: false, msg: "Mindestens 2 Atome markieren." };

    const ids = new Set(picked.map(a => a.id));
    const inner = bonds.filter(b => ids.has(b.id1) && ids.has(b.id2) && b.type !== 4);
    if (!inner.length) return { ok: false, msg: "Auswahl enthält keine Bindung." };

    const anchorBond = inner[0];                                  // = spätere Fusionsbindung
    const order = [anchorBond.id1, anchorBond.id2,
                   ...picked.map(a => a.id).filter(id => id !== anchorBond.id1 && id !== anchorBond.id2)];
    const idMap = new Map<number, number>();
    order.forEach((old, i) => idMap.set(old, i + 1));

    const avg = inner.reduce((s, b) => {
        const p = atoms.find(a => a.id === b.id1)!, q = atoms.find(a => a.id === b.id2)!;
        return s + Math.hypot(q.x - p.x, q.y - p.y);
    }, 0) / inner.length;
    const k = targetLen / (avg || targetLen);

    let cx = 0, cy = 0; picked.forEach(a => { cx += a.x; cy += a.y; });
    cx /= picked.length; cy /= picked.length;                      // beides teilen – sonst Drift

    const tpl: TemplateData = {
        atoms: order.map(oldId => {
            const a = atoms.find(x => x.id === oldId)!;
            return { id: idMap.get(oldId)!, element: a.element,
                     x: (a.x - cx) * k, y: (a.y - cy) * k,
                     charge: a.charge, customLabel: a.customLabel };
        }),
        bonds: [anchorBond, ...inner.filter(b => b !== anchorBond)]
            .map(b => ({ id1: idMap.get(b.id1)!, id2: idMap.get(b.id2)!, type: b.type }))
    };

    const store = loadUserTemplates();
    store[name] = tpl; persist(store);
    MOLECULE_TEMPLATES[name] = tpl;
    return { ok: true, msg: `Template "${name}" gespeichert (${tpl.atoms.length} Atome).` };
}