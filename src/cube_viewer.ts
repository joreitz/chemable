// src/cube-viewer.ts — Cube/MO-Viewer auf 3Dmol.js
// Multi-MO-Cubes (Multiwfn-Labels), mehrere Panes nebeneinander, verschiebbares+resizebares Fenster,
// ±Isoflächen (Slider+Eingabe), 2 gespeicherte Farben, Presets, PNG-Export (mit Panel-Auswahl),
// "Auf Zeichenfläche"-Button. Neues Einlesen ersetzt die alte Session (Cache-Reset).

import { applySdfToCanvas } from "./chemistry/optimize-3d";
import { state } from "./state";

type Repr = "ballstick" | "wire";
interface AtomStyle { color?: string; scale?: number; stickRadius?: number; repr?: Repr; }
interface Selection extends AtomStyle { index: string; layer?: boolean; }
interface Preset { name?: string; background?: string; default?: AtomStyle; elements?: { [el: string]: AtomStyle }; selections?: Selection[]; }
interface MOSource { header: string[]; rawData: string; nums: number[] | null; nmo: number; pts: number; }
type ParseResult = { kind: "single"; cube: string } | { kind: "multi"; source: MOSource; labels: string[] };
interface Pane { root: HTMLDivElement; body: HTMLDivElement; label: HTMLSpanElement; viewer: any; current: string | null; isoShapes: any[]; }
const LS_KEY = "chemable.cubeviewer.prefs";
const LS_PRESET = "chemable.cubeviewer.preset";
interface CubePrefs { colorPlus: string; colorMinus: string; iso: number; }
const DEFAULTS: CubePrefs = { colorPlus: "#3b82f6", colorMinus: "#ef4444", iso: 0.02 };

// Z -> Symbol / kovalente Radien (Å) für die Bindungserkennung beim Canvas-Transfer
const SYM = ["", "H","He","Li","Be","B","C","N","O","F","Ne","Na","Mg","Al","Si","P","S","Cl","Ar","K","Ca","Sc","Ti","V","Cr","Mn","Fe","Co","Ni","Cu","Zn","Ga","Ge","As","Se","Br","Kr","Rb","Sr","Y","Zr","Nb","Mo","Tc","Ru","Rh","Pd","Ag","Cd","In","Sn","Sb","Te","I","Xe"];
const RCOV: { [s: string]: number } = { H:0.31,B:0.84,C:0.76,N:0.71,O:0.66,F:0.57,Na:1.66,Mg:1.41,Al:1.21,Si:1.11,P:1.07,S:1.05,Cl:1.02,K:2.03,Ca:1.76,Ti:1.60,V:1.53,Cr:1.39,Mn:1.39,Fe:1.32,Co:1.26,Ni:1.24,Cu:1.32,Zn:1.22,Br:1.20,I:1.39,Se:1.20,Mo:1.54,Ru:1.46,Rh:1.42,Pd:1.39,Ag:1.45,Pt:1.36,Au:1.36 };
const BOHR = 0.529177;

function loadPrefs(): CubePrefs {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") }; } catch { return { ...DEFAULTS }; }
}
function savePrefs(p: CubePrefs) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {} }
function loadPreset(): Preset | null {
    try { const s = localStorage.getItem(LS_PRESET); return s ? JSON.parse(s) : null; } catch { return null; }
}
function savePreset(p: Preset | null) {
    try { if (p) localStorage.setItem(LS_PRESET, JSON.stringify(p)); else localStorage.removeItem(LS_PRESET); } catch {}
}

function ensureNums(src: MOSource): number[] {
    if (!src.nums) {
        const arr: number[] = [];
        for (const x of src.rawData.split(/\s+/)) { if (!x) continue; const v = parseFloat(x); if (!Number.isNaN(v)) arr.push(v); }
        src.nums = arr; src.rawData = "";
    }
    return src.nums;
}
function buildMOCube(src: MOSource, k: number): string {
    const nums = ensureNums(src);
    const body: string[] = []; let col = 0, row = "";
    for (let p = 0; p < src.pts; p++) {
        const val = nums[p * src.nmo + k] ?? 0;
        row += (val >= 0 ? " " : "") + val.toExponential(5) + " ";
        if (++col === 6) { body.push(row.trimEnd()); row = ""; col = 0; }
    }
    if (row) body.push(row.trimEnd());
    return src.header.concat(body).join("\n") + "\n";
}
function displayLabel(l: string): string { return /^-?\d+$/.test(l) ? "MO " + l : l; }
function parseIndexSpec(spec: string): { set: Set<number>; invert: boolean } {
    let s = spec.trim(); let invert = false;
    if (s.startsWith("!")) { invert = true; s = s.slice(1); }
    else if (/^\\.*\\$/.test(s)) { invert = true; s = s.replace(/\\/g, ""); }
    const set = new Set<number>();
    for (const part of s.split(",")) {
        const p = part.trim(); if (!p) continue;
        const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
        if (m) { for (let i = Math.min(+m[1], +m[2]); i <= Math.max(+m[1], +m[2]); i++) set.add(i); }
        else if (/^\d+$/.test(p)) set.add(+p);
    }
    return { set, invert };
}
function parseCubeMeta(text: string): ParseResult {
    const lines = text.split(/\r?\n/);
    const h3 = lines[2].trim().split(/\s+/);
    let natoms = parseInt(h3[0], 10);
    const isMO = natoms < 0; natoms = Math.abs(natoms);
    const nval = h3.length >= 5 ? parseInt(h3[4], 10) : 1;
    const nx = Math.abs(parseInt(lines[3].trim().split(/\s+/)[0], 10));
    const ny = Math.abs(parseInt(lines[4].trim().split(/\s+/)[0], 10));
    const nz = Math.abs(parseInt(lines[5].trim().split(/\s+/)[0], 10));
    const atomLines = lines.slice(6, 6 + natoms);
    let dataStart = 6 + natoms; let labels: string[] = [];
    if (isMO) {
        const toks = lines[dataStart].trim().split(/\s+/).filter(Boolean);
        const nmoCount = parseInt(toks[0], 10);
        labels = toks.slice(1); let li = dataStart + 1;
        while (labels.length < nmoCount && li < lines.length) { labels.push(...lines[li].trim().split(/\s+/).filter(Boolean)); li++; }
        labels = labels.slice(0, nmoCount); dataStart = li;
    } else if (nval > 1) { labels = Array.from({ length: nval }, (_, i) => String(i + 1)); }
    else { return { kind: "single", cube: text }; }
    const header = [lines[0] ?? "", lines[1] ?? "", `${natoms} ${h3.slice(1, 4).join(" ")}`, lines[3], lines[4], lines[5], ...atomLines];
    return { kind: "multi", source: { header, rawData: lines.slice(dataStart).join(" "), nums: null, nmo: labels.length || 1, pts: nx * ny * nz }, labels };
}

// Cube-Atome -> V2000-Molblock (Abstands-Bindungserkennung, nur Einfachbindungen)
function cubeToMolblock(text: string): string {
    const lines = text.split(/\r?\n/);
    const natoms = Math.abs(parseInt(lines[2].trim().split(/\s+/)[0], 10));
    const unit = parseInt(lines[3].trim().split(/\s+/)[0], 10) > 0 ? BOHR : 1; // +Voxelzahl => Bohr
    const atoms: { s: string; x: number; y: number; z: number }[] = [];
    
    for (let i = 6; i < 6 + natoms; i++) {
        const t = lines[i].trim().split(/\s+/);
        atoms.push({ s: SYM[parseInt(t[0], 10)] || "C", x: +t[2] * unit, y: +t[3] * unit, z: +t[4] * unit });
    }
    const bonds: [number, number][] = [];
    for (let a = 0; a < atoms.length; a++) for (let b = a + 1; b < atoms.length; b++) {
        const dx = atoms[a].x - atoms[b].x, dy = atoms[a].y - atoms[b].y, dz = atoms[a].z - atoms[b].z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const lim = ((RCOV[atoms[a].s] ?? 0.77) + (RCOV[atoms[b].s] ?? 0.77)) * 1.3;
        if (d > 0.4 && d < lim) bonds.push([a + 1, b + 1]);
    }
    const p3 = (n: number) => String(n).padStart(3);
    const f = (v: number) => v.toFixed(4).padStart(10);
    const out = ["cube", "  Chemable cube->canvas", ""];
    out.push(`${p3(atoms.length)}${p3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`);
    for (const a of atoms) out.push(`${f(a.x)}${f(a.y)}${f(a.z)} ${a.s.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
    for (const [i, j] of bonds) out.push(`${p3(i)}${p3(j)}  1  0  0  0  0`);
    out.push("M  END");
    return out.join("\n") + "\n";
}

function atomsToMolblock(atoms: { s: string; x: number; y: number; z: number }[]): string {
    const bonds: [number, number][] = [];
    for (let a = 0; a < atoms.length; a++) for (let b = a + 1; b < atoms.length; b++) {
        const dx = atoms[a].x - atoms[b].x, dy = atoms[a].y - atoms[b].y, dz = atoms[a].z - atoms[b].z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const lim = ((RCOV[atoms[a].s] ?? 0.77) + (RCOV[atoms[b].s] ?? 0.77)) * 1.3;
        if (d > 0.4 && d < lim) bonds.push([a + 1, b + 1]);
    }
    const p3 = (n: number) => String(n).padStart(3);
    const f = (v: number) => v.toFixed(4).padStart(10);
    const out = ["layer", "  Chemable layer", ""];
    out.push(`${p3(atoms.length)}${p3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`);
    for (const a of atoms) out.push(`${f(a.x)}${f(a.y)}${f(a.z)} ${a.s.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
    for (const [i, j] of bonds) out.push(`${p3(i)}${p3(j)}  1  0  0  0  0`);
    out.push("M  END");
    return out.join("\n") + "\n";
}

function cubeAtoms(text: string): { s: string; x: number; y: number; z: number }[] {
    const lines = text.split(/\r?\n/);
    const natoms = Math.abs(parseInt(lines[2].trim().split(/\s+/)[0], 10));
    const unit = parseInt(lines[3].trim().split(/\s+/)[0], 10) > 0 ? BOHR : 1;
    const out: { s: string; x: number; y: number; z: number }[] = [];
    for (let i = 6; i < 6 + natoms; i++) {
        const t = lines[i].trim().split(/\s+/);
        out.push({ s: SYM[parseInt(t[0], 10)] || "C", x: +t[2] * unit, y: +t[3] * unit, z: +t[4] * unit });
    }
    return out;
}

export let openCubeExternal: ((name: string, text: string) => void) | null = null;

export function initCubeViewer(render: () => void) {
    const dialog    = document.getElementById("cube-dialog");
    const grid      = document.getElementById("cube-grid");
    const fileInput = document.getElementById("cube-file-input") as HTMLInputElement;
    const presetInput = document.getElementById("cube-preset-input") as HTMLInputElement;
    const isoNum    = document.getElementById("cube-iso-num") as HTMLInputElement;
    const colPlus   = document.getElementById("cube-col-plus") as HTMLInputElement;
    const colMinus  = document.getElementById("cube-col-minus") as HTMLInputElement;
    const chkH      = document.getElementById("cube-show-h") as HTMLInputElement;
    const chkLabel = document.getElementById("cube-show-label") as HTMLInputElement;
    const reprBtns  = document.querySelectorAll<HTMLButtonElement>("[data-cube-repr]");
    let activePane: Pane | null = null;
    let cubes: { [name: string]: string } = {};
    let sources: { [key: string]: MOSource } = {};
    let entryToSrc: { [name: string]: { src: string; k: number } } = {};
    let entryNames: string[] = [];
    let volCache: { [name: string]: any } = {};

    const panes: Pane[] = [];
    let repr: Repr = "ballstick";
    let showH = true;
    let showLabels = false;
    let hKeep = new Set<number>();                                        
    const userSel = new Map<number, AtomStyle & { hidden?: boolean }>();
    let preset: Preset | null = null;
    const prefs = loadPrefs();

    if (colPlus)   colPlus.value = prefs.colorPlus;
    if (colMinus)  colMinus.value = prefs.colorMinus;

    if (isoNum)    isoNum.value = String(prefs.iso);

    let rail: HTMLDivElement | null = null;
    let railList: HTMLDivElement | null = null;
    let railCollapsed = false;
    let railToggle: HTMLButtonElement | null = null;
    let hiddenBar: HTMLDivElement | null = null;
    if (grid) {
        grid.style.position = "relative";
        rail = document.createElement("div");
        rail.id = "cube-rail";
        rail.style.cssText =
            "position:absolute;left:8px;top:8px;bottom:8px;width:150px;z-index:5;padding:6px;" +
            "background:rgba(245,245,245,0.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);" +
            "border:1px solid rgba(0,0,0,0.08);border-radius:8px;overflow:hidden;display:none;" +
            "flex-direction:column;transition:width 0.12s ease;";
        railToggle = document.createElement("button");
        railToggle.style.cssText = "border:none;background:none;cursor:pointer;font-size:13px;padding:2px 4px;align-self:flex-end;";
        railToggle.title = "Collapse / expand";
        railToggle.textContent = "«";
        railToggle.addEventListener("click", () => {
            railCollapsed = !railCollapsed;
            railToggle!.textContent = railCollapsed ? "»" : "«";
            rail!.style.width = railCollapsed ? "28px" : "150px";
            railList!.style.display = railCollapsed ? "none" : "block";
            layoutPanes();
        });
        railList = document.createElement("div");
        railList.style.cssText = "flex:1;overflow-y:auto;";
        rail.append(railToggle, railList);
        grid.appendChild(rail);
        hiddenBar = document.createElement("div");
        hiddenBar.style.cssText =
            "position:absolute;right:8px;top:8px;z-index:6;display:none;gap:4px;flex-wrap:wrap;max-width:45%;" +
            "padding:6px;background:rgba(245,245,245,0.72);backdrop-filter:blur(6px);" +
            "border:1px solid rgba(0,0,0,0.08);border-radius:8px;font-size:11px;align-items:center;";
        grid.appendChild(hiddenBar);
    }

    function setActivePane(p: Pane | null) {
        activePane = p;
        panes.forEach(x => x.root.style.outline = x === p ? "2px solid #3b82f6" : "none");
        refreshRail();
    }
    function selectVolume(name: string) {
        if (!activePane) activePane = panes[0] ?? null;
        if (!activePane) return;
        activePane.current = name;
        activePane.label.textContent = name;
        paneRedraw(activePane, true);       // Kamera behalten
        refreshRail();
    }
    function refreshRail() {
        if (!rail || !railList) return;
        railList.innerHTML = "";
        entryNames.forEach(name => {
            const on = activePane?.current === name;
            const item = document.createElement("button");
            item.textContent = name; item.title = name;
            item.style.cssText =
                "display:block;width:100%;text-align:left;margin:2px 0;padding:6px 8px;border:none;border-radius:6px;" +
                "font-size:12px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" +
                (on ? "background:#3b82f6;color:#fff;font-weight:600;" : "background:rgba(255,255,255,0.55);color:#222;");
            item.addEventListener("click", () => selectVolume(name));
            railList!.appendChild(item);
        });
        rail.style.display = entryNames.length ? "flex" : "none";
        layoutPanes();
    }
    function bg(): string { return preset?.background || "white"; }
    function materialize(name: string) {
        if (cubes[name]) return;
        const r = entryToSrc[name];
        if (r) cubes[name] = buildMOCube(sources[r.src], r.k);
    }
    function getVol(name: string) {
        materialize(name);
        if (!volCache[name]) volCache[name] = new (window as any).$3Dmol.VolumeData(cubes[name], "cube");
        return volCache[name];
    }
    function baseAtomSpec(): any {
        return repr === "ballstick" ? { stick: { radius: 0.12 }, sphere: { scale: 0.25 } } : { stick: { radius: 0.05 } };
    }
    function elemSpec(s: AtomStyle): any {
        const r = s.repr ?? repr;                       // Preset gewinnt
        if (r === "ballstick") {
            const o: any = { stick: { radius: s.stickRadius ?? 0.12 }, sphere: { scale: s.scale ?? 0.25 } };
            if (s.color) { o.stick.color = s.color; o.sphere.color = s.color; }
            return o;
        }
        const o: any = { stick: { radius: s.stickRadius ?? 0.05 } };  // wire = nur dünner Stick
        if (s.color) o.stick.color = s.color;
        return o;
    }
    function tagModel(m: any, g: number[]) {
        m.selectedAtoms({}).forEach((a: any, i: number) => { a.__gidx = g[i]; });
    }
    function hideHOnModel(m: any, g: number[]) {
        if (showH) return;
        const hs = m.selectedAtoms({ elem: "H" })
                    .filter((a: any) => !hKeep.has(g[a.index]))
                    .map((a: any) => a.index);
        if (hs.length) m.setStyle({ index: hs }, {});
    }
    function applyUserSelModel(m: any, g: number[]) {
        for (const [gi, s] of userSel) {
            const loc = g.indexOf(gi);
            if (loc >= 0) m.setStyle({ index: [loc] }, s.hidden ? {} : elemSpec(s));
        }
    }
    function applySelectionsOn(v: any) {
        if (!preset?.selections) return;
        const atoms = v.selectedAtoms({});                       
        console.log("[cube] selections, atoms:", atoms.length); 
        for (const sel of preset.selections) {
            if (sel.index == null) continue;
            const { set, invert } = parseIndexSpec(String(sel.index));
            const picked = atoms.filter((_: any, i: number) => set.has(i + 1) !== invert)
                                .map((a: any) => a.index);
            if (picked.length) v.setStyle({ index: picked }, elemSpec(sel));
        }
    }
    function applyStyleOn(v: any) {
        if (!v) return;
        v.setStyle({}, baseAtomSpec());
        if (preset?.default) v.setStyle({}, elemSpec(preset.default));
        if (preset?.elements) for (const [el, s] of Object.entries(preset.elements)) v.setStyle({ elem: el }, elemSpec(s));
        applySelectionsOn(v);
    }
    function styleModel(m: any, sel: AtomStyle, layerWins = false) {
        m.setStyle({}, elemSpec(sel));
        if (preset?.elements)
            for (const [el, s] of Object.entries(preset.elements)) {
                const merged = layerWins ? { ...s, ...sel } : { ...sel, ...s };  // Overlay: Layer-Geometrie gewinnt, Element-Farbe bleibt
                m.setStyle({ elem: el }, elemSpec(merged));
            }
    }
    function buildModels(v: any, cubeText: string) {
        const layers = (preset?.selections ?? []).filter(s => s.layer && s.index);
        const atoms = cubeAtoms(cubeText);
        const finish = (m: any, g: number[]) => { tagModel(m, g); hideHOnModel(m, g); applyUserSelModel(m, g); };

        if (!layers.length) {
            const m = v.addModel(cubeText, "cube");
            applyStyleOn(v);
            finish(m, atoms.map((_, i) => i + 1));
            return;
        }
        for (const sel of layers) {
            const { set, invert } = parseIndexSpec(String(sel.index));
            const pick: typeof atoms = [], g: number[] = [];
            atoms.forEach((a, i) => { if (set.has(i + 1) !== invert) { pick.push(a); g.push(i + 1); } });
            if (!pick.length) continue;
            const m = v.addModel(atomsToMolblock(pick), "sdf");
            styleModel(m, sel, true);
            finish(m, g);
        }
        const full = v.addModel(atomsToMolblock(atoms), "sdf");
        styleModel(full, preset?.default ?? {});
        finish(full, atoms.map((_, i) => i + 1));
    }
    
    function applyLabelsOn(v: any) {
        v.removeAllLabels();
        if (!showLabels) return;
        const atoms = v.getModel((v.getNumModels?.() ?? 1) - 1)?.selectedAtoms({}) ?? v.selectedAtoms({});
        atoms.forEach((a: any, i: number) => {
            const gi = a.__gidx ?? ((a.index ?? i) + 1);
            if (!showH && a.elem === "H" && !hKeep.has(gi)) return;
            if (userSel.get(gi)?.hidden) return;
            v.addLabel(`${a.elem}${gi}`, {
                position: { x: a.x, y: a.y, z: a.z },
                fontSize: 11, fontColor: "black",
                backgroundColor: "white", backgroundOpacity: 0.55, inFront: true,
            });
        });
    }
    function drawIsoOn(v: any, name: string, smoothness: number): any[] {
        const vol = getVol(name);
        const val = prefs.iso;   
        return [
            v.addIsosurface(vol, { isoval:  val, color: prefs.colorPlus,  opacity: 0.85, smoothness }),
            v.addIsosurface(vol, { isoval: -val, color: prefs.colorMinus, opacity: 0.85, smoothness }),
        ];
    }
    let atomPopup: HTMLDivElement | null = null;
    function closeAtomPopup() { atomPopup?.remove(); atomPopup = null; }
    function openAtomPopup(atom: any, ev: MouseEvent) {
        closeAtomPopup();
        const idx = atom.__gidx ?? ((atom.index ?? 0) + 1);
        const cur = userSel.get(idx) ?? {};
        const box = document.createElement("div"); atomPopup = box;
        const r = (dialog as HTMLElement).getBoundingClientRect();
        box.style.cssText =
            `position:absolute;left:${(ev?.clientX ?? r.left + 60) - r.left + 8}px;top:${(ev?.clientY ?? r.top + 60) - r.top + 8}px;` +
            "z-index:30;background:#fff;border-radius:10px;padding:10px;box-shadow:0 8px 30px rgba(0,0,0,0.25);" +
            "font-size:12px;display:flex;flex-direction:column;gap:6px;min-width:170px;";

        const title = document.createElement("div");
        title.style.cssText = "font-weight:600;display:flex;justify-content:space-between;align-items:center;";
        title.textContent = `${atom.elem}${idx}`;
        const x = document.createElement("button");
        x.textContent = "×"; x.style.cssText = "border:none;background:none;cursor:pointer;font-size:14px;";
        x.onclick = closeAtomPopup; title.appendChild(x);

        const reprSel = document.createElement("select");
        for (const [v, t] of [["", "Repr: default"], ["ballstick", "Ball & Stick"], ["wire", "Wire"]])
            { const o = document.createElement("option"); o.value = v; o.textContent = t; reprSel.appendChild(o); }
        reprSel.value = cur.repr ?? "";

        const colRow = document.createElement("label");
        colRow.style.cssText = "display:flex;gap:8px;align-items:center;cursor:pointer;";
        const colOn = document.createElement("input"); colOn.type = "checkbox"; colOn.checked = !!cur.color;
        const col = document.createElement("input"); col.type = "color"; col.value = cur.color ?? "#909090";
        colRow.append(colOn, col, document.createTextNode("Custom color"));

        const hideRow = document.createElement("label");
        hideRow.style.cssText = "display:flex;gap:8px;align-items:center;cursor:pointer;";
        const hide = document.createElement("input"); hide.type = "checkbox"; hide.checked = !!cur.hidden;
        hideRow.append(hide, document.createTextNode("Hide atom"));

        const reset = document.createElement("button");
        reset.textContent = "Reset atom"; reset.className = "tool-btn";
        reset.style.cssText = "justify-content:center;border:1px solid #ddd;";

        function commit() {
            const s: AtomStyle & { hidden?: boolean } = {};
            if (reprSel.value) s.repr = reprSel.value as Repr;
            if (colOn.checked) s.color = col.value;
            if (hide.checked) s.hidden = true;
            if (Object.keys(s).length) userSel.set(idx, s); else userSel.delete(idx);
            allPanes(p => paneRedraw(p, true));
        }
        reprSel.onchange = commit;
        col.oninput = () => { colOn.checked = true; commit(); };
        colOn.onchange = commit; hide.onchange = commit;
        reset.onclick = () => { userSel.delete(idx); allPanes(p => paneRedraw(p, true)); closeAtomPopup(); };

        box.append(title, reprSel, colRow, hideRow, reset);
        (dialog as HTMLElement).appendChild(box);
    }
    function atomOnlySel(v: any): any {
        const els = Array.from(new Set(v.selectedAtoms({}).map((a: any) => a.elem)));
        return els.length ? { elem: els } : {};
    }
    function refreshHiddenBar() {
        if (!hiddenBar) return;
        const hidden = [...userSel.entries()].filter(([, s]) => s.hidden).map(([i]) => i).sort((a, b) => a - b);
        hiddenBar.innerHTML = "";
        if (!hidden.length) { hiddenBar.style.display = "none"; return; }

        const cap = document.createElement("span");
        cap.textContent = "Hidden:"; cap.style.cssText = "font-weight:600;margin-right:2px;";
        hiddenBar.appendChild(cap);

        hidden.forEach(idx => {
            const b = document.createElement("button");
            b.textContent = `#${idx} ×`;
            b.title = "Show this atom again";
            b.style.cssText = "border:none;border-radius:5px;padding:3px 6px;cursor:pointer;background:#3b82f6;color:#fff;";
            b.onclick = () => { userSel.delete(idx); allPanes(p => paneRedraw(p, true)); };
            hiddenBar!.appendChild(b);
        });

        const all = document.createElement("button");
        all.textContent = "Show all";
        all.style.cssText = "border:1px solid #ccc;border-radius:5px;padding:3px 6px;cursor:pointer;background:#fff;margin-left:4px;";
        all.onclick = () => {
            [...userSel.entries()].forEach(([i, s]) => { if (s.hidden) userSel.delete(i); });
            allPanes(p => paneRedraw(p, true));
        };
        hiddenBar.appendChild(all);
    }
    function paneRedraw(p: Pane, keepView: boolean) {
        if (!p.viewer || !p.current) return;
        const keep = keepView ? p.viewer.getView() : null;
        p.viewer.removeAllModels(); p.viewer.removeAllShapes(); p.isoShapes = [];
        p.viewer.setBackgroundColor(bg());
        materialize(p.current);
        buildModels(p.viewer, cubes[p.current]);     
        p.viewer.setClickable({}, true, (a: any, _v: any, ev: any) => openAtomPopup(a, ev));
        applyLabelsOn(p.viewer);                     
        p.isoShapes = drawIsoOn(p.viewer, p.current, 5);
        p.viewer.zoomTo(atomOnlySel(p.viewer));      
        if (keep) {
            const v = p.viewer.getView();            
            v[4] = keep[4]; v[5] = keep[5]; v[6] = keep[6]; v[7] = keep[7];   
            p.viewer.setView(v);
        }
        p.viewer.render();
        refreshHiddenBar();
    }
    function paneIso(p: Pane, smoothness: number) {
        if (!p.viewer || !p.current) return;
        p.isoShapes.forEach(s => p.viewer.removeShape(s));
        p.isoShapes = drawIsoOn(p.viewer, p.current, smoothness);
        p.viewer.render();
    }
    const allPanes = (f: (p: Pane) => void) => panes.forEach(f);
    function resizeAll() { allPanes(p => p.viewer?.resize()); }

    function fillSelect(sel: HTMLSelectElement, value: string | null) {
        sel.innerHTML = "";
        entryNames.forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o); });
        if (value) sel.value = value;
    }
    function layoutPanes() {
        if (!grid) return;
        const n = panes.length;
        grid.style.display = "grid";
        grid.style.gap = "8px";
        grid.style.gridTemplateColumns = n <= 1 ? "1fr" : "1fr 1fr";
        grid.style.gridTemplateRows    = n <= 2 ? "1fr" : "1fr 1fr";
        const railW = (rail && rail.style.display !== "none") ? (railCollapsed ? 44 : 166) : 8;
        grid.style.padding = `8px 8px 8px ${railW}px`;
        requestAnimationFrame(resizeAll);
    }
    function addPane(moName?: string): Pane {
        const root = document.createElement("div");
        root.style.cssText = "display:flex;flex-direction:column;min-width:0;min-height:0;" +
                             "border:1px solid rgba(0,0,0,0.1);border-radius:8px;overflow:hidden;";
        const bar = document.createElement("div");
        bar.style.cssText = "display:flex;gap:6px;align-items:center;padding:4px 6px;background:rgba(0,0,0,0.03);";
        const label = document.createElement("span");
        label.style.cssText = "flex:1;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
        const close = document.createElement("button");
        close.textContent = "×"; close.title = "Close pane"; close.style.cssText = "padding:0 8px;font-size:14px;";
        const body = document.createElement("div");
        body.style.cssText = "flex:1;position:relative;background:#fff;";
        bar.append(label, close); root.append(bar, body); grid!.appendChild(root);

        const p: Pane = { root, body, label, viewer: null, current: moName ?? entryNames[0] ?? null, isoShapes: [] };
        label.textContent = p.current ?? "—";
        p.viewer = (window as any).$3Dmol.createViewer(body, { backgroundColor: bg() });
        root.addEventListener("pointerdown", () => setActivePane(p));
        close.addEventListener("click", (e) => {
            e.stopPropagation();
            if (panes.length <= 1) return;
            panes.splice(panes.indexOf(p), 1); root.remove();
            if (activePane === p) setActivePane(panes[0] ?? null);
            layoutPanes();
        });
        new ResizeObserver(() => p.viewer?.resize()).observe(body);
        panes.push(p);
        layoutPanes();
        setActivePane(p);
        if (p.current) paneRedraw(p, false);
        requestAnimationFrame(() => p.viewer?.resize());
        return p;
    }
    function resetSession() {
        cubes = {}; sources = {}; entryToSrc = {}; entryNames = []; volCache = {};
        activePane = null;
        while (panes.length) { const p = panes.pop()!; try { p.viewer?.clear(); } catch {} p.root.remove(); }
        refreshRail();
        userSel.clear(); closeAtomPopup(); refreshHiddenBar();
    }
    async function ingest(files: File[]) {
        const cubeFiles = files.filter(f => /\.cube?$/i.test(f.name));
        if (!cubeFiles.length) return;
        activePane = null;
        
        for (const f of cubeFiles) {
            const text = await f.text();
            const base = f.name.replace(/\.cube?$/i, "");
            let res: ParseResult;
            try { res = parseCubeMeta(text); } catch { res = { kind: "single", cube: text }; }
            if (res.kind === "single") {
                let n = base, i = 2; while (entryNames.includes(n)) n = `${base} (${i++})`;
                entryNames.push(n); cubes[n] = res.cube;
            } else {
                let srcKey = base, j = 2; while (srcKey in sources) srcKey = `${base}#${j++}`;
                sources[srcKey] = res.source;
                res.labels.forEach((lab, k) => {
                    const disp = res.source.nmo > 1 ? displayLabel(lab) : base;
                    let n = disp, i = 2; while (entryNames.includes(n)) n = `${disp} (${i++})`;
                    entryNames.push(n); entryToSrc[n] = { src: srcKey, k };
                });
            }
        }
        addPane(entryNames[0]);
    }

    (window as any).__openCube = async (name: string, text: string) => {
        if (!dialog) return;
        dialog.style.left = dialog.style.top = dialog.style.right = dialog.style.bottom = "";
        dialog.style.width = dialog.style.height = "";
        dialog.style.display = "flex";
        await ingest([new File([text], name)]);
        resizeAll();
    };

    function setIso(v: number) {
        if (Number.isNaN(v)) return;
        v = Math.min(1, Math.max(0.0001, v));
        if (isoNum) isoNum.value = String(v);
        prefs.iso = v; savePrefs(prefs);
        allPanes(p => paneIso(p, 5));
    }

    function exportPanePNG(p: Pane, scale: number) {
        if (!p.viewer || !p.current) return;
        materialize(p.current);
        const view = p.viewer.getView();
        const rect = p.body.getBoundingClientRect();
        const aspect = rect.width / rect.height || 1;
        let h = Math.round((rect.height || 600) * scale);
        let w = Math.round(h * aspect);
        const MAX = 4096;
        if (w > MAX || h > MAX) { const k = MAX / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
        const off = document.createElement("div");
        off.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px;`;
        document.body.appendChild(off);
        const ev = (window as any).$3Dmol.createViewer(off, { backgroundColor: bg() });
        buildModels(ev, cubes[p.current]);
        drawIsoOn(ev, p.current, 8);
        ev.setView(view); ev.render();
        const a = document.createElement("a");
        a.href = ev.pngURI();
        a.download = p.current.replace(/[^\w.-]+/g, "_") + `_${w}x${h}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        try { ev.clear(); } catch {}
        off.remove();
    }

    function openPhotoChooser(scale: number) {
        const ov = document.createElement("div");
        ov.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:20;";
        const box = document.createElement("div");
        box.style.cssText = "background:#fff;border-radius:10px;padding:16px;min-width:240px;max-height:70%;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,0.3);";
        box.innerHTML = "<div style='font-weight:600;margin-bottom:10px;'>Export which panels?</div>";        
        const checks: HTMLInputElement[] = [];
        panes.forEach((p, i) => {
            const row = document.createElement("label");
            row.style.cssText = "display:flex;gap:8px;align-items:center;font-size:13px;padding:4px 0;cursor:pointer;";
            const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true; checks.push(cb);
            row.append(cb, document.createTextNode(`Panel ${i + 1}: ${p.current ?? "—"}`));
            box.appendChild(row);
        });
        const btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex;gap:8px;margin-top:12px;";
        const ok = document.createElement("button"); ok.textContent = "Export"; ok.className = "btn-primary"; ok.style.flex = "1";
        const cancel = document.createElement("button"); cancel.textContent = "Cancel"; cancel.className = "btn-secondary"; cancel.style.flex = "1";
        btnRow.append(ok, cancel); box.appendChild(btnRow); ov.appendChild(box);
        (dialog || document.body).appendChild(ov);
        cancel.onclick = () => ov.remove();
        ok.onclick = () => { panes.forEach((p, i) => { if (checks[i].checked) exportPanePNG(p, scale); }); ov.remove(); };
    }

    function isVisibleAtom(gi: number, elem: string): boolean {
        if (userSel.get(gi)?.hidden) return false;
        if (!showH && elem === "H" && !hKeep.has(gi)) return false;
        return true;
    }
    function toCanvas() {
        const p = activePane ?? panes[0];
        if (!p?.current) return;
        materialize(p.current);
        try {
            const atoms = cubeAtoms(cubes[p.current]);
            const keep = atoms.filter((a, i) => isVisibleAtom(i + 1, a.s));
            if (!keep.length) { console.warn("[cube] nichts Sichtbares zu übertragen"); return; }
            applySdfToCanvas(atomsToMolblock(keep), render, false);
            if (!state.is3DMode) state.set3DMode(true);
            render();
            if (dialog) dialog.style.display = "none";
        } catch (e) { console.error("[cube] Transfer auf Canvas fehlgeschlagen:", e); }
    }

    // --- Events ---
    fileInput?.addEventListener("change", () => { if (fileInput.files) ingest(Array.from(fileInput.files)); });
    document.getElementById("btn-cube-add-pane")?.addEventListener("click", () => {
        if (!entryNames.length) return;
        if (panes.length >= 4) { console.warn("[cube] max. 4 Panes"); return; }
        addPane();
    });
    document.getElementById("btn-cube-sync")?.addEventListener("click", () => {
        const src = panes[0]?.viewer?.getView();
        if (!src) return;
        panes.slice(1).forEach(p => {
            const v = p.viewer.getView();
            v[3] = src[3];                                                   
            v[4] = src[4]; v[5] = src[5]; v[6] = src[6]; v[7] = src[7];       
            p.viewer.setView(v); p.viewer.render();
        });
    });
    document.getElementById("btn-cube-to-canvas")?.addEventListener("click", toCanvas);

    presetInput?.addEventListener("change", async () => {
        const f = presetInput.files?.[0]; if (!f) return;
        try {
            preset = JSON.parse(await f.text()); savePreset(preset);
            allPanes(p => { p.viewer.setBackgroundColor(bg()); paneRedraw(p, true); });
        } catch (e) { console.warn("[cube] Preset-JSON ungültig:", e); }
        presetInput.value = "";   // gleiche Datei erneut wählbar
    });
    document.getElementById("btn-cube-preset-clear")?.addEventListener("click", () => {
        preset = null; savePreset(null);
        presetInput.value = "";   // sonst zeigt der Input noch den alten Dateinamen + blockt re-select
        allPanes(p => { p.viewer.setBackgroundColor(bg()); paneRedraw(p, true); });
    });

    reprBtns.forEach(b => b.addEventListener("click", () => {
        reprBtns.forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        repr = (b.dataset.cubeRepr as Repr) || "ballstick";
        allPanes(p => paneRedraw(p, true));
    }));
    chkH?.addEventListener("change", () => { showH = chkH.checked; allPanes(p => paneRedraw(p, true)); });
    chkLabel?.addEventListener("change", () => { showLabels = chkLabel.checked; allPanes(p => paneRedraw(p, true)); });
    const hKeepInput = document.getElementById("cube-h-keep") as HTMLInputElement;
    hKeepInput?.addEventListener("change", () => {
        hKeep = parseIndexSpec(hKeepInput.value).set;
        allPanes(p => paneRedraw(p, true));
    });
    let hKeepTimer: any = null;
    const applyHKeep = () => {
        hKeep = parseIndexSpec(hKeepInput.value).set;
        allPanes(p => paneRedraw(p, true));
    };
    hKeepInput?.addEventListener("input", () => { clearTimeout(hKeepTimer); hKeepTimer = setTimeout(applyHKeep, 250); });
    hKeepInput?.addEventListener("change", applyHKeep);

    let isoTimer: any = null;
    isoNum?.addEventListener("input", () => {
        const v = parseFloat(isoNum.value);
        if (Number.isNaN(v) || v <= 0) return;              // "", "0", "0." beim Tippen: abwarten, nichts zurückschreiben
        prefs.iso = Math.min(1, Math.max(0.0001, v));       // nur intern clampen
        clearTimeout(isoTimer);
        allPanes(p => paneIso(p, 1));                       // grober Live-Redraw
        isoTimer = setTimeout(() => { savePrefs(prefs); allPanes(p => paneIso(p, 5)); }, 150);
    });
    const val = parseFloat(isoNum.value) || prefs.iso;
    isoNum?.addEventListener("change", () => {              // blur/Enter: 
        let v = parseFloat(isoNum.value);
        if (Number.isNaN(v)) v = prefs.iso;                 // leeres Feld 
        setIso(v);
    });
    colPlus?.addEventListener("input",  () => { prefs.colorPlus  = colPlus.value;  savePrefs(prefs); allPanes(p => paneIso(p, 5)); });
    colMinus?.addEventListener("input", () => { prefs.colorMinus = colMinus.value; savePrefs(prefs); allPanes(p => paneIso(p, 5)); });

    document.getElementById("btn-cube-fit")?.addEventListener("click", () => allPanes(p => { p.viewer.zoomTo(); p.viewer.render(); }));
    document.getElementById("btn-cube-export")?.addEventListener("click", () => {
        const sel = document.getElementById("cube-export-scale") as HTMLSelectElement;
        const scale = parseInt(sel?.value || "4", 10);
        if (panes.length <= 1) { if (panes[0]) exportPanePNG(panes[0], scale); }
        else openPhotoChooser(scale);
    });

    dialog?.addEventListener("dragover", e => e.preventDefault());
    dialog?.addEventListener("drop", e => {
        e.preventDefault();
        if (e.dataTransfer?.files?.length) ingest(Array.from(e.dataTransfer.files));
    });
    if (dialog) new ResizeObserver(resizeAll).observe(dialog);

    // Verschiebbar per Titelleiste
    const handle = document.getElementById("cube-drag-handle");
    if (dialog && handle) {
        
        let ox = 0, oy = 0, dragging = false;
        handle.style.cursor = "move";

        handle.addEventListener("pointerdown", (e) => {
            dragging = true;
            const r = dialog.getBoundingClientRect();
            ox = e.clientX - r.left; oy = e.clientY - r.top;
            dialog.style.left = r.left + "px"; dialog.style.top = r.top + "px";
            dialog.style.width = r.width + "px"; dialog.style.height = r.height + "px";  // Größe einfrieren
            (dialog.style as any).right = "auto"; (dialog.style as any).bottom = "auto";
            (e.target as Element).setPointerCapture(e.pointerId);
        });

        handle.addEventListener("pointermove", (e) => {
            if (!dragging) return;
            const w = dialog.offsetWidth;
            const V = 120; 
            let x = e.clientX - ox, y = e.clientY - oy;
            x = Math.max(V - w, Math.min(x, window.innerWidth  - w)); 
            y = Math.max(0,     Math.min(y, window.innerHeight - V)); 
            dialog.style.left = x + "px";
            dialog.style.top  = y + "px";
        });
        handle.addEventListener("pointerup", (e) => { dragging = false; try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {} });
    }

    document.getElementById("btn-cube")?.addEventListener("click", () => {
        if (!dialog) { console.warn("[cube] #cube-dialog is missing in the DOM."); return; }
        dialog.style.left = dialog.style.top = "";
        dialog.style.right = dialog.style.bottom = "";
        dialog.style.width = dialog.style.height = "";   // 
        dialog.style.display = "flex";
        resizeAll();
    });
    document.getElementById("btn-cube-close")?.addEventListener("click", () => {
        resetSession();
        if (fileInput) fileInput.value = "";   // sonst feuert 'change' nicht beim erneuten Wählen derselben Datei
        if (dialog) dialog.style.display = "none";
    });
    
}