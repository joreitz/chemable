// src/cube-viewer.ts — Cube/MO-Viewer auf 3Dmol.js
// Multi-MO-Cubes (Multiwfn-Labels), mehrere Panes nebeneinander, verschiebbares+resizebares Fenster,
// ±Isoflächen (Slider+Eingabe), 2 gespeicherte Farben, Presets, PNG-Export (mit Panel-Auswahl),
// "Auf Zeichenfläche"-Button. Neues Einlesen ersetzt die alte Session (Cache-Reset).

import { applySdfToCanvas } from "./chemistry/optimize-3d";
import { state } from "./state";

type Repr = "ballstick" | "wire";
interface AtomStyle { color?: string; scale?: number; stickRadius?: number; repr?: Repr; }
interface Selection extends AtomStyle { index: string; }
interface Preset { name?: string; background?: string; default?: AtomStyle; elements?: { [el: string]: AtomStyle }; selections?: Selection[]; }
interface MOSource { header: string[]; rawData: string; nums: number[] | null; nmo: number; pts: number; }
type ParseResult = { kind: "single"; cube: string } | { kind: "multi"; source: MOSource; labels: string[] };
interface Pane { root: HTMLDivElement; body: HTMLDivElement; sel: HTMLSelectElement; viewer: any; current: string | null; isoShapes: any[]; }

const LS_KEY = "chemable.cubeviewer.prefs";
const LS_PRESET = "chemable.cubeviewer.preset";
interface CubePrefs { colorPlus: string; colorMinus: string; iso: number; }
const DEFAULTS: CubePrefs = { colorPlus: "#3b82f6", colorMinus: "#ef4444", iso: 0.02 };

// Z -> Symbol / kovalente Radien (Å) für die Bindungserkennung beim Canvas-Transfer
const SYM = ["", "H","He","Li","Be","B","C","N","O","F","Ne","Na","Mg","Al","Si","P","S","Cl","Ar","K","Ca","Sc","Ti","V","Cr","Mn","Fe","Co","Ni","Cu","Zn","Ga","Ge","As","Se","Br","Kr","Rb","Sr","Y","Zr","Nb","Mo","Tc","Ru","Rh","Pd","Ag","Cd","In","Sn","Sb","Te","I","Xe"];
const RCOV: { [s: string]: number } = { H:0.31,B:0.84,C:0.76,N:0.71,O:0.66,F:0.57,Si:1.11,P:1.07,S:1.05,Cl:1.02,Br:1.20,I:1.39,Se:1.20 };
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
function atomsToXYZ(a: { s: string; x: number; y: number; z: number }[]): string {
    return `${a.length}\n\n` + a.map(x => `${x.s} ${x.x.toFixed(6)} ${x.y.toFixed(6)} ${x.z.toFixed(6)}`).join("\n") + "\n";
}

export let openCubeExternal: ((name: string, text: string) => void) | null = null;

export function initCubeViewer(render: () => void) {
    const dialog    = document.getElementById("cube-dialog");
    const grid      = document.getElementById("cube-grid");
    const fileInput = document.getElementById("cube-file-input") as HTMLInputElement;
    const presetInput = document.getElementById("cube-preset-input") as HTMLInputElement;
    const isoSlider = document.getElementById("cube-iso") as HTMLInputElement;
    const isoNum    = document.getElementById("cube-iso-num") as HTMLInputElement;
    const colPlus   = document.getElementById("cube-col-plus") as HTMLInputElement;
    const colMinus  = document.getElementById("cube-col-minus") as HTMLInputElement;
    const chkH      = document.getElementById("cube-show-h") as HTMLInputElement;
    const chkLabel = document.getElementById("cube-show-label") as HTMLInputElement;
    const reprBtns  = document.querySelectorAll<HTMLButtonElement>("[data-cube-repr]");

    let cubes: { [name: string]: string } = {};
    let sources: { [key: string]: MOSource } = {};
    let entryToSrc: { [name: string]: { src: string; k: number } } = {};
    let entryNames: string[] = [];
    let volCache: { [name: string]: any } = {};

    const panes: Pane[] = [];
    let repr: Repr = "ballstick";
    let showH = true;
    let showLabels = false;
    let preset: Preset | null = loadPreset();
    const prefs = loadPrefs();

    if (colPlus)   colPlus.value = prefs.colorPlus;
    if (colMinus)  colMinus.value = prefs.colorMinus;
    if (isoSlider) isoSlider.value = String(prefs.iso);
    if (isoNum)    isoNum.value = String(prefs.iso);

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
        const r = s.repr ?? repr;                       // Preset gewinnt, sonst Toolbar-Buttons
        if (r === "ballstick") {
            const o: any = { stick: { radius: s.stickRadius ?? 0.12 }, sphere: { scale: s.scale ?? 0.25 } };
            if (s.color) { o.stick.color = s.color; o.sphere.color = s.color; }
            return o;
        }
        const o: any = { stick: { radius: s.stickRadius ?? 0.05 } };  // wire = nur dünner Stick
        if (s.color) o.stick.color = s.color;
        return o;
    }
    function applySelectionsOn(v: any) {
        if (!preset?.selections) return;
        const atoms = v.selectedAtoms({});                       // Reihenfolge = Datei-/ORCA-Reihenfolge
        console.log("[cube] selections, atoms:", atoms.length);  // trial: läuft's? Atomzahl plausibel?
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
        if (!showH) v.setStyle({ elem: "H" }, {});
    }
    function styleModel(m: any, sel: AtomStyle, layerWins = false) {
        m.setStyle({}, elemSpec(sel));
        if (preset?.elements)
            for (const [el, s] of Object.entries(preset.elements)) {
                const merged = layerWins ? { ...s, ...sel } : { ...sel, ...s };  // Overlay: Layer-Geometrie gewinnt, Element-Farbe bleibt
                m.setStyle({ elem: el }, elemSpec(merged));
            }
        if (!showH) m.setStyle({ elem: "H" }, {});
    }
    function buildModels(v: any, cubeText: string) {
        const layers = (preset?.selections ?? []).filter(s => (s as any).layer && s.index);
        if (!layers.length) {                                  
            v.addModel(cubeText, "cube");
            applyStyleOn(v);                                    // inkl. nicht-layer selections
            return;
        }
        const atoms = cubeAtoms(cubeText);
        console.log("[cube] total atoms:", atoms.length, "layers:", layers.map(l => l.index));
        const claimed = new Set<number>();
        for (const sel of layers) {                             // Overlay-Modelle: je eigenes XYZ
            const { set, invert } = parseIndexSpec(String(sel.index));
            const pick: typeof atoms = [];
            atoms.forEach((a, i) => { if (set.has(i + 1) !== invert) { pick.push(a); claimed.add(i); } });
            console.log("[cube] layer", sel.index, "-> picked", pick.length);
            if (!pick.length) continue;
            const mo = v.addModel(atomsToXYZ(pick), "xyz");
            mo.assignBonds();                                   // Bindungen aus Abständen (sonst kein Wire sichtbar)
            styleModel(mo, sel, true);
        }
        const base = atoms.filter((_, i) => !claimed.has(i));   // Basis: der Rest, default-Stil
        const mb = v.addModel(atomsToXYZ(base), "xyz");
        mb.assignBonds();
        styleModel(mb, preset?.default ?? {});
    }
    function applyLabelsOn(v: any) {
        v.removeAllLabels();                          // Labels überleben 
        if (!showLabels) return;
        const atoms = v.selectedAtoms({});            // {} = alle Atome
        console.log("[cube] labels:", atoms.length);  // trial:
        atoms.forEach((a: any, i: number) => {
            if (!showH && a.elem === "H") return;
            v.addLabel(`${a.elem}${(a.index ?? i) + 1}`, {
                position: { x: a.x, y: a.y, z: a.z },
                fontSize: 11, fontColor: "black",
                backgroundColor: "white", backgroundOpacity: 0.55, inFront: true,
            });
        });
    }
    function drawIsoOn(v: any, name: string, smoothness: number): any[] {
        const vol = getVol(name);
        const val = parseFloat(isoSlider.value);
        return [
            v.addIsosurface(vol, { isoval:  val, color: prefs.colorPlus,  opacity: 0.85, smoothness }),
            v.addIsosurface(vol, { isoval: -val, color: prefs.colorMinus, opacity: 0.85, smoothness }),
        ];
    }
    function paneRedraw(p: Pane, keepView: boolean) {
        if (!p.viewer || !p.current) return;
        const keep = keepView ? p.viewer.getView() : null;
        p.viewer.removeAllModels(); p.viewer.removeAllShapes(); p.isoShapes = [];
        p.viewer.setBackgroundColor(bg());
        materialize(p.current);
        buildModels(p.viewer, cubes[p.current]);     // Modelle + Styles (inkl. Layer)
        applyLabelsOn(p.viewer);                     // einmal!
        p.isoShapes = drawIsoOn(p.viewer, p.current, 5);
        if (keep) p.viewer.setView(keep); else p.viewer.zoomTo();
        p.viewer.render();  
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
    function addPane(moName?: string): Pane {
        const root = document.createElement("div");
        root.style.cssText = "display:flex;flex-direction:column;min-width:220px;min-height:200px;border:1px solid rgba(0,0,0,0.1);border-radius:8px;overflow:hidden;flex:1;";
        const bar = document.createElement("div");
        bar.style.cssText = "display:flex;gap:6px;align-items:center;padding:4px 6px;background:rgba(0,0,0,0.03);";
        const sel = document.createElement("select");
        sel.style.cssText = "flex:1;padding:3px;border-radius:5px;font-size:12px;";
        const close = document.createElement("button");
        close.textContent = "×"; close.title = "Pane schließen"; close.style.cssText = "padding:0 8px;font-size:14px;";
        const body = document.createElement("div");
        body.style.cssText = "flex:1;position:relative;background:#fff;";
        bar.append(sel, close); root.append(bar, body); grid!.appendChild(root);

        const p: Pane = { root, body, sel, viewer: null, current: moName ?? entryNames[0] ?? null, isoShapes: [] };
        p.viewer = (window as any).$3Dmol.createViewer(body, { backgroundColor: bg() });
        fillSelect(sel, p.current);
        sel.addEventListener("change", () => { p.current = sel.value; paneRedraw(p, true); });
        close.addEventListener("click", () => {
            if (panes.length <= 1) return;
            panes.splice(panes.indexOf(p), 1); root.remove(); resizeAll();
        });
        new ResizeObserver(() => p.viewer?.resize()).observe(body);
        panes.push(p);
        if (p.current) paneRedraw(p, false);
        requestAnimationFrame(() => { p.viewer?.zoomTo(); p.viewer?.render(); });  // erzwingt sichtbares erstes Frame
        return p;
    }
    function resetSession() {
        cubes = {}; sources = {}; entryToSrc = {}; entryNames = []; volCache = {};
        while (panes.length) { const p = panes.pop()!; try { p.viewer?.clear(); } catch {} p.root.remove(); }
    }
    async function ingest(files: File[]) {
        const cubeFiles = files.filter(f => /\.cube?$/i.test(f.name));
        if (!cubeFiles.length) return;
        resetSession();
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
        v = Math.max(0.0001, v);
        if (isoNum) isoNum.value = String(v);
        if (isoSlider) isoSlider.value = String(Math.min(v, parseFloat(isoSlider.max)));
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

    // Bei mehreren Panels: kleines Auswahl-Popup, welche exportiert werden
    function openPhotoChooser(scale: number) {
        const ov = document.createElement("div");
        ov.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:20;";
        const box = document.createElement("div");
        box.style.cssText = "background:#fff;border-radius:10px;padding:16px;min-width:240px;max-height:70%;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,0.3);";
        box.innerHTML = "<div style='font-weight:600;margin-bottom:10px;'>Welche Panels exportieren?</div>";
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
        const ok = document.createElement("button"); ok.textContent = "Exportieren"; ok.className = "btn-primary"; ok.style.flex = "1";
        const cancel = document.createElement("button"); cancel.textContent = "Abbrechen"; cancel.className = "btn-secondary"; cancel.style.flex = "1";
        btnRow.append(ok, cancel); box.appendChild(btnRow); ov.appendChild(box);
        (dialog || document.body).appendChild(ov);
        cancel.onclick = () => ov.remove();
        ok.onclick = () => { panes.forEach((p, i) => { if (checks[i].checked) exportPanePNG(p, scale); }); ov.remove(); };
    }

    function toCanvas() {
        const p = panes[0];
        if (!p?.current) return;
        materialize(p.current);
        try {
            applySdfToCanvas(cubeToMolblock(cubes[p.current]), render, false);
            if (!state.is3DMode) state.set3DMode(true);
            render();
            if (dialog) dialog.style.display = "none";
        } catch (e) { console.error("[cube] Transfer auf Canvas fehlgeschlagen:", e); }
    }

    // --- Events ---
    fileInput?.addEventListener("change", () => { if (fileInput.files) ingest(Array.from(fileInput.files)); });
    document.getElementById("btn-cube-add-pane")?.addEventListener("click", () => { if (entryNames.length) addPane(); });
    document.getElementById("btn-cube-sync")?.addEventListener("click", () => {
        const v = panes[0]?.viewer?.getView();
        if (v) panes.slice(1).forEach(p => { p.viewer.setView(v); p.viewer.render(); });
    });
    document.getElementById("btn-cube-to-canvas")?.addEventListener("click", toCanvas);

    presetInput?.addEventListener("change", async () => {
        const f = presetInput.files?.[0]; if (!f) return;
        try {
            preset = JSON.parse(await f.text()); savePreset(preset);
            allPanes(p => { p.viewer.setBackgroundColor(bg()); paneRedraw(p, true); });
        } catch (e) { console.warn("[cube] Preset-JSON ungültig:", e); }
    });
    document.getElementById("btn-cube-preset-clear")?.addEventListener("click", () => {
        preset = null; savePreset(null);
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

    let isoTimer: any = null;
    isoSlider?.addEventListener("input", () => {
        const v = parseFloat(isoSlider.value);
        if (isoNum) isoNum.value = String(v);
        clearTimeout(isoTimer);
        allPanes(p => paneIso(p, 1));
        isoTimer = setTimeout(() => { prefs.iso = v; savePrefs(prefs); allPanes(p => paneIso(p, 5)); }, 120);
    });
    isoNum?.addEventListener("change", () => setIso(parseFloat(isoNum.value)));
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
            const V = 120; // so viel bleibt garantiert greifbar
            let x = e.clientX - ox, y = e.clientY - oy;
            x = Math.max(V - w, Math.min(x, window.innerWidth  - w)); // rechte Kante/Handle bleibt sichtbar
            y = Math.max(0,     Math.min(y, window.innerHeight - V)); // Titelleiste bleibt oben drin
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
        if (dialog) dialog.style.display = "none";
    });
    
}