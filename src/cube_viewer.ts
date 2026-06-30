// src/cube-viewer.ts
// Cube-Viewer (Pfad A): .cube-Dateien inkl. Multi-MO (z. B. Multiwfn), 3Dmol.js.
// Ball-and-stick / Wire, H ein/aus, MO-Dropdown (Namen aus den Labels der Datei),
// symmetrische ±-Isoflächen (Slider + Eingabe), 2 speicherbare Farben, Drag&Drop,
// Orientierung fixen, hochauflösender PNG-Export, ladbare Darstellungs-Presets.

type Repr = "ballstick" | "wire";

interface AtomStyle { color?: string; scale?: number; stickRadius?: number; }
interface Preset { name?: string; background?: string; default?: AtomStyle; elements?: { [el: string]: AtomStyle }; }

interface MOSource { header: string[]; rawData: string; nums: number[] | null; nmo: number; pts: number; }
type ParseResult =
    | { kind: "single"; cube: string }
    | { kind: "multi"; source: MOSource; labels: string[] };

const LS_KEY = "chemable.cubeviewer.prefs";
const LS_PRESET = "chemable.cubeviewer.preset";
interface CubePrefs { colorPlus: string; colorMinus: string; iso: number; }
const DEFAULTS: CubePrefs = { colorPlus: "#3b82f6", colorMinus: "#ef4444", iso: 0.02 };

function loadPrefs(): CubePrefs {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") }; }
    catch { return { ...DEFAULTS }; }
}
function savePrefs(p: CubePrefs) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* egal */ } }
function loadPreset(): Preset | null {
    try { const s = localStorage.getItem(LS_PRESET); return s ? JSON.parse(s) : null; } catch { return null; }
}
function savePreset(p: Preset | null) {
    try { if (p) localStorage.setItem(LS_PRESET, JSON.stringify(p)); else localStorage.removeItem(LS_PRESET); } catch { /* egal */ }
}

// Werte erst bei Bedarf aus dem rohen Datenblock parsen (spart Freeze beim Laden)
function ensureNums(src: MOSource): number[] {
    if (!src.nums) {
        const arr: number[] = [];
        for (const x of src.rawData.split(/\s+/)) {
            if (!x) continue;
            const v = parseFloat(x);
            if (!Number.isNaN(v)) arr.push(v);
        }
        src.nums = arr;
        src.rawData = ""; // Rohtext freigeben
    }
    return src.nums;
}

// Ein einzelnes MO als eigenständige Single-Field-Cube zusammenbauen
function buildMOCube(src: MOSource, k: number): string {
    const nums = ensureNums(src);
    const body: string[] = [];
    let col = 0, row = "";
    for (let p = 0; p < src.pts; p++) {
        const val = nums[p * src.nmo + k] ?? 0; // MO-Index ist pro Gitterpunkt innenliegend
        row += (val >= 0 ? " " : "") + val.toExponential(5) + " ";
        if (++col === 6) { body.push(row.trimEnd()); row = ""; col = 0; }
    }
    if (row) body.push(row.trimEnd());
    return src.header.concat(body).join("\n") + "\n";
}

function displayLabel(l: string): string { return /^-?\d+$/.test(l) ? "MO " + l : l; }

// Header lesen, Single- vs. Multi-Cube erkennen. Bei Multi: Labels + Rohdaten zurückgeben.
function parseCubeMeta(text: string): ParseResult {
    const lines = text.split(/\r?\n/);
    const h3 = lines[2].trim().split(/\s+/);
    let natoms = parseInt(h3[0], 10);
    const isMO = natoms < 0;
    natoms = Math.abs(natoms);
    const nval = h3.length >= 5 ? parseInt(h3[4], 10) : 1;
    const nx = Math.abs(parseInt(lines[3].trim().split(/\s+/)[0], 10));
    const ny = Math.abs(parseInt(lines[4].trim().split(/\s+/)[0], 10));
    const nz = Math.abs(parseInt(lines[5].trim().split(/\s+/)[0], 10));
    const atomLines = lines.slice(6, 6 + natoms);

    let dataStart = 6 + natoms;
    let labels: string[] = [];
    if (isMO) {
        const toks = lines[dataStart].trim().split(/\s+/).filter(Boolean);
        const nmoCount = parseInt(toks[0], 10);
        labels = toks.slice(1);
        let li = dataStart + 1;
        while (labels.length < nmoCount && li < lines.length) {
            labels.push(...lines[li].trim().split(/\s+/).filter(Boolean)); li++;
        }
        labels = labels.slice(0, nmoCount);
        dataStart = li;
    } else if (nval > 1) {
        labels = Array.from({ length: nval }, (_, i) => String(i + 1));
    } else {
        return { kind: "single", cube: text };
    }

    const header = [
        lines[0] ?? "", lines[1] ?? "",
        `${natoms} ${h3.slice(1, 4).join(" ")}`,
        lines[3], lines[4], lines[5],
        ...atomLines,
    ];
    return {
        kind: "multi",
        source: { header, rawData: lines.slice(dataStart).join(" "), nums: null, nmo: labels.length || 1, pts: nx * ny * nz },
        labels,
    };
}

export function initCubeViewer() {
    const dialog    = document.getElementById("cube-dialog");
    const container = document.getElementById("cube-canvas");
    const moSelect  = document.getElementById("cube-mo-select") as HTMLSelectElement;
    const fileInput = document.getElementById("cube-file-input") as HTMLInputElement;
    const presetInput = document.getElementById("cube-preset-input") as HTMLInputElement;
    const isoSlider = document.getElementById("cube-iso") as HTMLInputElement;
    const isoNum    = document.getElementById("cube-iso-num") as HTMLInputElement;
    const colPlus   = document.getElementById("cube-col-plus") as HTMLInputElement;
    const colMinus  = document.getElementById("cube-col-minus") as HTMLInputElement;
    const chkH      = document.getElementById("cube-show-h") as HTMLInputElement;
    const chkLock   = document.getElementById("cube-lock-view") as HTMLInputElement;
    const reprBtns  = document.querySelectorAll<HTMLButtonElement>("[data-cube-repr]");

    let viewer: any = null;
    let hint: HTMLDivElement | null = null;

    const cubes: { [name: string]: string } = {};            // gebaute Single-Field-Cube (Cache)
    const sources: { [key: string]: MOSource } = {};         // geteilte Rohdaten je Multi-Datei
    const entryToSrc: { [name: string]: { src: string; k: number } } = {};
    const entryNames: string[] = [];                         // Reihenfolge im Dropdown
    const volCache: { [name: string]: any } = {};

    let current: string | null = null;
    let isoShapes: any[] = [];
    let repr: Repr = "ballstick";
    let showH = true;
    let lockOrientation = chkLock ? chkLock.checked : true;
    let hasFramed = false;
    let preset: Preset | null = loadPreset();
    const prefs = loadPrefs();

    if (colPlus)   colPlus.value = prefs.colorPlus;
    if (colMinus)  colMinus.value = prefs.colorMinus;
    if (isoSlider) isoSlider.value = String(prefs.iso);
    if (isoNum)    isoNum.value = String(prefs.iso);

    function bg(): string { return preset?.background || "white"; }
    function isValid(name: string): boolean { return name in cubes || name in entryToSrc; }
    function materialize(name: string) {
        if (cubes[name]) return;
        const r = entryToSrc[name];
        if (r) cubes[name] = buildMOCube(sources[r.src], r.k);
    }
    function addEntry(name: string, register: (n: string) => void) {
        let n = name, i = 2;
        while (entryNames.includes(n)) n = `${name} (${i++})`;
        entryNames.push(n);
        register(n);
    }

    function ensureViewer() {
        if (viewer || !container) return;
        viewer = (window as any).$3Dmol.createViewer(container, { backgroundColor: bg() });
        ensureHint();
    }
    function ensureHint() {
        if (hint || !container) return;
        hint = document.createElement("div");
        hint.textContent = "Drag-and-drop cube files here. Otherwise use file-dialog on the right.";
        hint.style.position = "absolute"; hint.style.inset = "0";
        hint.style.display = "flex"; hint.style.alignItems = "center"; hint.style.justifyContent = "center";
        hint.style.color = "#9ca3af"; hint.style.fontSize = "14px"; hint.style.textAlign = "center";
        hint.style.padding = "24px"; hint.style.pointerEvents = "none";
        container.appendChild(hint);
    }
    function updateEmptyState() { if (hint) hint.style.display = entryNames.length ? "none" : "flex"; }

    function getVol(name: string) {
        materialize(name);
        if (!volCache[name]) volCache[name] = new (window as any).$3Dmol.VolumeData(cubes[name], "cube");
        return volCache[name];
    }

    function baseAtomSpec(): any {
        return repr === "ballstick"
            ? { stick: { radius: 0.12 }, sphere: { scale: 0.25 } }
            : { stick: { radius: 0.05 } };
    }
    function elemSpec(s: AtomStyle): any {
        if (repr === "ballstick") {
            const o: any = { stick: { radius: s.stickRadius ?? 0.12 }, sphere: { scale: s.scale ?? 0.25 } };
            if (s.color) { o.stick.color = s.color; o.sphere.color = s.color; }
            return o;
        }
        const o: any = { stick: { radius: s.stickRadius ?? 0.05 } };
        if (s.color) o.stick.color = s.color;
        return o;
    }
    function applyStyleOn(v: any) {
        if (!v) return;
        v.setStyle({}, baseAtomSpec());
        if (preset?.default) v.setStyle({}, elemSpec(preset.default));
        if (preset?.elements) for (const [el, s] of Object.entries(preset.elements)) v.setStyle({ elem: el }, elemSpec(s));
        if (!showH) v.setStyle({ elem: "H" }, {});
    }

    function drawIsoOn(v: any, smoothness: number): any[] {
        const vol = getVol(current!);
        const val = parseFloat(isoSlider.value);
        return [
            v.addIsosurface(vol, { isoval:  val, color: prefs.colorPlus,  opacity: 0.85, smoothness }),
            v.addIsosurface(vol, { isoval: -val, color: prefs.colorMinus, opacity: 0.85, smoothness }),
        ];
    }
    function drawIso(smoothness: number) {
        if (!viewer || !current) return;
        isoShapes.forEach(s => viewer.removeShape(s));
        isoShapes = drawIsoOn(viewer, smoothness);
        viewer.render();
    }

    function fullRedraw() {
        ensureViewer();
        if (!viewer || !current) return;
        materialize(current);
        const keep = (lockOrientation && hasFramed) ? viewer.getView() : null;
        viewer.removeAllModels();
        viewer.removeAllShapes();
        isoShapes = [];
        viewer.setBackgroundColor(bg());
        viewer.addModel(cubes[current], "cube");
        applyStyleOn(viewer);
        isoShapes = drawIsoOn(viewer, 5);
        if (keep) viewer.setView(keep);
        else { viewer.zoomTo(); hasFramed = true; }
        viewer.render();
        updateEmptyState();
    }

    function rebuildSelect() {
        moSelect.innerHTML = "";
        entryNames.forEach(name => {
            const o = document.createElement("option");
            o.value = name; o.textContent = name;
            moSelect.appendChild(o);
        });
        if (current && isValid(current)) moSelect.value = current;
    }

    async function ingest(files: File[]) {
        const cubeFiles = files.filter(f => /\.cube?$/i.test(f.name));
        if (!cubeFiles.length) return;
        for (const f of cubeFiles) {
            const text = await f.text();
            const base = f.name.replace(/\.cube?$/i, "");
            let res: ParseResult;
            try { res = parseCubeMeta(text); }
            catch { res = { kind: "single", cube: text }; }

            if (res.kind === "single") {
                addEntry(base, (n) => { cubes[n] = res.cube; delete volCache[n]; });
            } else {
                let srcKey = base, j = 2;
                while (srcKey in sources) srcKey = `${base}#${j++}`;
                sources[srcKey] = res.source;
                res.labels.forEach((lab, k) => {
                    const disp = res.source.nmo > 1 ? displayLabel(lab) : base;
                    addEntry(disp, (n) => { entryToSrc[n] = { src: srcKey, k }; delete volCache[n]; });
                });
            }
        }
        if (!current || !isValid(current)) current = entryNames[0] || null;
        rebuildSelect();
        fullRedraw();
    }

    function setIso(v: number) {
        if (Number.isNaN(v)) return;
        v = Math.max(0.0001, v);
        if (isoNum) isoNum.value = String(v);
        if (isoSlider) isoSlider.value = String(Math.min(v, parseFloat(isoSlider.max)));
        prefs.iso = v; savePrefs(prefs);
        drawIso(5);
    }

    function exportPNG(scale: number) {
        if (!viewer || !current || !container) return;
        materialize(current);
        const $3Dmol = (window as any).$3Dmol;
        const view = viewer.getView();
        const rect = container.getBoundingClientRect();
        const aspect = rect.width / rect.height || 1;
        let h = Math.round((rect.height || 600) * scale);
        let w = Math.round(h * aspect);
        const MAX = 4096;
        if (w > MAX || h > MAX) { const k = MAX / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }

        const off = document.createElement("div");
        off.style.position = "fixed"; off.style.left = "-99999px"; off.style.top = "0";
        off.style.width = w + "px"; off.style.height = h + "px";
        document.body.appendChild(off);

        const ev = $3Dmol.createViewer(off, { backgroundColor: bg() });
        ev.addModel(cubes[current], "cube");
        applyStyleOn(ev);
        drawIsoOn(ev, 8);
        ev.setView(view);
        ev.render();

        const a = document.createElement("a");
        a.href = ev.pngURI();
        a.download = current.replace(/[^\w.-]+/g, "_") + `_${w}x${h}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        try { ev.clear(); } catch { /* egal */ }
        off.remove();
    }

    // --- Events ---
    fileInput?.addEventListener("change", () => { if (fileInput.files) ingest(Array.from(fileInput.files)); });
    moSelect?.addEventListener("change", () => { current = moSelect.value; fullRedraw(); });

    presetInput?.addEventListener("change", async () => {
        const f = presetInput.files?.[0];
        if (!f) return;
        try {
            preset = JSON.parse(await f.text());
            savePreset(preset);
            if (viewer) { viewer.setBackgroundColor(bg()); applyStyleOn(viewer); viewer.render(); }
        } catch (e) { console.warn("[cube] Preset-JSON ungültig:", e); }
    });
    document.getElementById("btn-cube-preset-clear")?.addEventListener("click", () => {
        preset = null; savePreset(null);
        if (viewer) { viewer.setBackgroundColor(bg()); applyStyleOn(viewer); viewer.render(); }
    });

    reprBtns.forEach(b => b.addEventListener("click", () => {
        reprBtns.forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        repr = (b.dataset.cubeRepr as Repr) || "ballstick";
        applyStyleOn(viewer); viewer?.render();
    }));

    chkH?.addEventListener("change", () => { showH = chkH.checked; applyStyleOn(viewer); viewer?.render(); });
    chkLock?.addEventListener("change", () => { lockOrientation = chkLock.checked; });

    let isoTimer: any = null;
    isoSlider?.addEventListener("input", () => {
        const v = parseFloat(isoSlider.value);
        if (isoNum) isoNum.value = String(v);
        clearTimeout(isoTimer);
        drawIso(1);
        isoTimer = setTimeout(() => { prefs.iso = v; savePrefs(prefs); drawIso(5); }, 120);
    });
    isoNum?.addEventListener("change", () => setIso(parseFloat(isoNum.value)));

    colPlus?.addEventListener("input",  () => { prefs.colorPlus  = colPlus.value;  savePrefs(prefs); drawIso(5); });
    colMinus?.addEventListener("input", () => { prefs.colorMinus = colMinus.value; savePrefs(prefs); drawIso(5); });

    document.getElementById("btn-cube-fit")?.addEventListener("click", () => {
        if (viewer) { viewer.zoomTo(); hasFramed = true; viewer.render(); }
    });
    document.getElementById("btn-cube-export")?.addEventListener("click", () => {
        const sel = document.getElementById("cube-export-scale") as HTMLSelectElement;
        exportPNG(parseInt(sel?.value || "4", 10));
    });

    dialog?.addEventListener("dragover", e => e.preventDefault());
    dialog?.addEventListener("drop", e => {
        e.preventDefault();
        if (e.dataTransfer?.files?.length) ingest(Array.from(e.dataTransfer.files));
    });

    document.getElementById("btn-cube")?.addEventListener("click", () => {
        if (!dialog) { console.warn("[cube] #cube-dialog fehlt im DOM."); return; }
        dialog.style.display = "flex";
        ensureViewer();
        updateEmptyState();
        viewer?.resize();
    });
    document.getElementById("btn-cube-close")?.addEventListener("click", () => {
        if (dialog) dialog.style.display = "none";
    });
}
