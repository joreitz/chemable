// src/cube-viewer.ts
// Cube-Viewer: lädt fertige .cube-Dateien (je Datei = 1 MO), rendert über 3Dmol.js

type Repr = "ballstick" | "wire";

const LS_KEY = "chemable.cubeviewer.prefs";

interface CubePrefs { colorPlus: string; colorMinus: string; iso: number; }

const DEFAULTS: CubePrefs = { colorPlus: "#3b82f6", colorMinus: "#ef4444", iso: 0.02 };

function loadPrefs(): CubePrefs {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") }; }
    catch { return { ...DEFAULTS }; }
}
function savePrefs(p: CubePrefs) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* egal */ }
}

export function initCubeViewer() {
    const dialog    = document.getElementById("cube-dialog");
    const container = document.getElementById("cube-canvas");
    const moSelect  = document.getElementById("cube-mo-select") as HTMLSelectElement;
    const fileInput = document.getElementById("cube-file-input") as HTMLInputElement;
    const isoSlider = document.getElementById("cube-iso") as HTMLInputElement;
    const isoValLbl = document.getElementById("cube-iso-val");
    const colPlus   = document.getElementById("cube-col-plus") as HTMLInputElement;
    const colMinus  = document.getElementById("cube-col-minus") as HTMLInputElement;
    const chkH      = document.getElementById("cube-show-h") as HTMLInputElement;
    const chkLock   = document.getElementById("cube-lock-view") as HTMLInputElement;
    const reprBtns  = document.querySelectorAll<HTMLButtonElement>("[data-cube-repr]");

    let viewer: any = null;
    let hint: HTMLDivElement | null = null;
    const cubes: { [name: string]: string } = {};
    const volCache: { [name: string]: any } = {};
    let current: string | null = null;
    let isoShapes: any[] = [];
    let repr: Repr = "ballstick";
    let showH = true;
    let lockOrientation = chkLock ? chkLock.checked : true; // Standard: fixiert
    let hasFramed = false;                                  // wurde schon einmal zoomTo() gemacht?
    const prefs = loadPrefs();

    if (colPlus)   colPlus.value = prefs.colorPlus;
    if (colMinus)  colMinus.value = prefs.colorMinus;
    if (isoSlider) isoSlider.value = String(prefs.iso);
    if (isoValLbl) isoValLbl.textContent = prefs.iso.toFixed(3);

    function ensureViewer() {
        if (viewer || !container) return;
        const $3Dmol = (window as any).$3Dmol;
        viewer = $3Dmol.createViewer(container, { backgroundColor: "white" });
        ensureHint();
    }

    function ensureHint() {
        if (hint || !container) return;
        hint = document.createElement("div");
        hint.textContent = "Ziehe .cube-Dateien hierher – oder nutze den Datei-Dialog rechts.";
        hint.style.position = "absolute"; hint.style.inset = "0";
        hint.style.display = "flex"; hint.style.alignItems = "center"; hint.style.justifyContent = "center";
        hint.style.color = "#9ca3af"; hint.style.fontSize = "14px"; hint.style.textAlign = "center";
        hint.style.padding = "24px"; hint.style.pointerEvents = "none";
        container.appendChild(hint);
    }
    function updateEmptyState() {
        if (hint) hint.style.display = Object.keys(cubes).length ? "none" : "flex";
    }

    // VolumeData nur einmal pro MO parsen 
    function getVol(name: string) {
        if (!volCache[name]) {
            const $3Dmol = (window as any).$3Dmol;
            volCache[name] = new $3Dmol.VolumeData(cubes[name], "cube");
        }
        return volCache[name];
    }

    function styleSpec() {
        return repr === "ballstick"
            ? { stick: { radius: 0.12 }, sphere: { scale: 0.25 } }
            : { stick: { radius: 0.05 } }; // "Wire" als dünner Stick 
    }

    // Stil + Isoflächen auf einen BELIEBIGEN Viewer anwenden 
    function applyStyleOn(v: any) {
        v.setStyle({}, styleSpec());
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

    // Nur Iso neu zeichnen
    function drawIso(smoothness: number) {
        if (!viewer || !current) return;
        isoShapes.forEach(s => viewer.removeShape(s));
        isoShapes = drawIsoOn(viewer, smoothness);
        viewer.render();
    }

    function fullRedraw() {
        ensureViewer();
        if (!viewer || !current) return;
        // Orientierung übernehmen
        const keep = (lockOrientation && hasFramed) ? viewer.getView() : null;
        viewer.removeAllModels();
        viewer.removeAllShapes();
        isoShapes = [];
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
        Object.keys(cubes).forEach(name => {
            const o = document.createElement("option");
            o.value = name;
            o.textContent = name.replace(/\.cube?$/i, "");
            moSelect.appendChild(o);
        });
        if (current && cubes[current]) moSelect.value = current;
    }

    async function ingest(files: File[]) {
        const cubeFiles = files.filter(f => /\.cube?$/i.test(f.name));
        if (!cubeFiles.length) return;
        for (const f of cubeFiles) {
            cubes[f.name] = await f.text();
            delete volCache[f.name];
        }
        if (!current || !cubes[current]) current = Object.keys(cubes)[0] || null;
        rebuildSelect();
        fullRedraw();
    }

    //  PNG-Export  ---
    function exportPNG(scale: number) {
        if (!viewer || !current || !container) return;
        const $3Dmol = (window as any).$3Dmol;
        const view = viewer.getView(); // live kamera

        const rect = container.getBoundingClientRect();
        const aspect = rect.width / rect.height || 1;
        let h = Math.round((rect.height || 600) * scale);
        let w = Math.round(h * aspect);
        const MAX = 4096; // WebGL-Limit nicht reißen
        if (w > MAX || h > MAX) { const k = MAX / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }

        const off = document.createElement("div");
        off.style.position = "fixed"; off.style.left = "-99999px"; off.style.top = "0";
        off.style.width = w + "px"; off.style.height = h + "px";
        document.body.appendChild(off);

        const ev = $3Dmol.createViewer(off, { backgroundColor: "white" });
        ev.addModel(cubes[current], "cube");
        applyStyleOn(ev);
        drawIsoOn(ev, 8);   // fürs Standbild etwas glatter
        ev.setView(view);   // identische Orientierung wie live
        ev.render();

        const uri: string = ev.pngURI();
        const a = document.createElement("a");
        a.href = uri;
        a.download = current.replace(/\.cube?$/i, "") + `_${w}x${h}.png`;
        document.body.appendChild(a); a.click(); a.remove();

        try { ev.clear(); } catch { /* egal */ }
        off.remove();
    }

    // --- Events ---
    fileInput?.addEventListener("change", () => { if (fileInput.files) ingest(Array.from(fileInput.files)); });
    moSelect?.addEventListener("change", () => { current = moSelect.value; fullRedraw(); });

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
        if (isoValLbl) isoValLbl.textContent = v.toFixed(3);
        clearTimeout(isoTimer);
        drawIso(1);
        isoTimer = setTimeout(() => { prefs.iso = v; savePrefs(prefs); drawIso(5); }, 120);
    });

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
        if (!dialog) { console.warn("[cube] #cube-dialog is missing in the DOM – Splice 3 (Dialog) in index.html?"); return; }
        dialog.style.display = "flex";
        ensureViewer();
        updateEmptyState();
        viewer?.resize();
    });
    document.getElementById("btn-cube-close")?.addEventListener("click", () => {
        if (dialog) dialog.style.display = "none";
    });
}