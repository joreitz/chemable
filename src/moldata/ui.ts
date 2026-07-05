import { listDatasets, createDataset, loadDataset, addSpecies, addFile, absPath } from "./store";
import { MolDataset, Species, DataEntry } from "./types";
import { parseOrca, OrcaData } from "./orca-parser";
import { addSolvation } from "./store"; 
import { plotSpectrum } from "./spectrum";
import { simulate1H } from "./nmr-sim";

const fs = (window as any).require("fs");
const { webUtils } = (window as any).require("electron");

let ds: MolDataset | null = null;
let selected: DataEntry | null = null;

export function initMoleculeData() {
    const dialog = document.getElementById("moldata-dialog")!;
    const tree   = document.getElementById("moldata-tree")!;
    const detail = document.getElementById("moldata-detail")!;
    const title  = document.getElementById("moldata-title")!;
    const dsForm = document.getElementById("moldata-ds-form")!;
    const spForm = document.getElementById("moldata-sp-form")!;

    function renderTree() {
        tree.innerHTML = "";
        if (!ds) {
            title.textContent = "Molecule Data";
            for (const name of listDatasets()) {
                const row = document.createElement("div");
                row.textContent = `📁 ${name}`;
                row.style.cssText = "font-size:13px;padding:6px;cursor:pointer;border-radius:6px;";
                row.onmouseenter = () => row.style.background = "#f0f0f0";
                row.onmouseleave = () => row.style.background = "";
                row.onclick = () => {
                    ds = loadDataset(name);
                    dsForm.style.display = "none"; spForm.style.display = "flex";
                    renderTree();
                };
                tree.appendChild(row);
            }
            return;
        }
        title.textContent = ds.name;
        for (const sp of ds.species) {
            const head = document.createElement("div");
            head.textContent = `▸ ${sp.label}  (q=${sp.charge}, M=${sp.multiplicity})`;
            head.style.cssText = "font-weight:600;font-size:13px;padding:6px 4px 2px;cursor:copy;";
            head.addEventListener("dragover", ev => ev.preventDefault());
            head.addEventListener("drop", ev => {
                ev.preventDefault(); ev.stopPropagation();
                for (const f of Array.from(ev.dataTransfer?.files ?? [])) {
                    const p = webUtils?.getPathForFile ? webUtils.getPathForFile(f) : (f as any).path;
                    if (p) addFile(ds!, sp, p);
                }
            head.onclick = () => renderSpeciesDetail(sp);
                renderTree();
            });
            tree.appendChild(head);
            for (const e of sp.entries) {
                const row = document.createElement("div");
                row.textContent = `   ${e.kind === "cube" ? "▦" : e.kind === "orca-out" ? "≡" : "·"} ${e.label}`;
                row.style.cssText = "font-size:12px;padding:2px 4px 2px 14px;cursor:pointer;border-radius:4px;";
                if (selected?.id === e.id) row.style.background = "#e0e7ff";
                row.onclick = () => { selected = e; renderTree(); renderDetail(sp, e); };
                tree.appendChild(row);
            }
        }
    }

    function renderSpeciesDetail(sp: Species) {
        detail.innerHTML = `<div style="font-weight:600;">${sp.label}</div>
            <div style="font-size:12px;color:#666;">q=${sp.charge} · M=${sp.multiplicity} · ${sp.entries.length} Files</div>
            <div style="font-weight:600;font-size:13px;margin-top:12px;">Solvation</div>`;
        for (const s of sp.solvation ?? []) {
            const row = document.createElement("div");
            row.style.cssText = "font-size:12px;padding:2px 0;";
            row.textContent = `${s.method} / ${s.solvent}: ${s.valueEh} Eh`;
            detail.appendChild(row);
        }
        const form = document.createElement("div");
        form.style.cssText = "display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;";
        form.innerHTML = `
            <input id="solv-method" placeholder="Method (CPCM...)" style="flex:1;min-width:100px;padding:4px;border:1px solid #ccc;border-radius:6px;font-size:12px;">
            <input id="solv-lm" placeholder="LM" style="width:90px;padding:4px;border:1px solid #ccc;border-radius:6px;font-size:12px;">
            <input id="solv-val" type="number" step="any" placeholder="ΔG_solv [Eh]" style="width:110px;padding:4px;border:1px solid #ccc;border-radius:6px;font-size:12px;">`;
        const add = document.createElement("button");
        add.textContent = "Add"; add.className = "btn-primary"; add.style.cssText = "width:auto;padding:4px 12px;margin:0;font-size:12px;";
        add.onclick = () => {
            const v = parseFloat((document.getElementById("solv-val") as HTMLInputElement).value);
            if (Number.isNaN(v)) return;
            addSolvation(ds!, sp, {
                method: (document.getElementById("solv-method") as HTMLInputElement).value || "?",
                solvent: (document.getElementById("solv-lm") as HTMLInputElement).value || "?",
                valueEh: v,
            });
            renderSpeciesDetail(sp);
        };
        form.appendChild(add); detail.appendChild(form);
    }

    function renderOrcaSummary(d: OrcaData): string {
        const f = (n?: number, dig = 6) => n !== undefined ? n.toFixed(dig) : "—";
        const L: string[] = [];
        if (d.meta?.version) L.push(`ORCA ${d.meta.version}`);
        if (d.meta?.inputLine) L.push(`Input: ${d.meta.inputLine}`);
        L.push(`q=${d.meta?.charge ?? "—"} · M=${d.meta?.mult ?? "—"} · E = ${f(d.finalEnergyEh)} Eh`);
        if (d.s2 !== undefined) L.push(`⟨S²⟩ = ${d.s2}`);
        if (d.coords) L.push(`Coordinates: ${d.coords.length} Atoms`);
        if (d.mulliken) L.push(`Mulliken: ${d.mulliken.length} Atoms${d.mulliken[0]?.spin !== undefined ? " (+Spin)" : ""}`);
        if (d.brokenSym) L.push(`BS: ${d.brokenSym.coupling ?? "?"} · J(3) = ${d.brokenSym.J3} cm⁻¹ (J1 ${d.brokenSym.J1} / J2 ${d.brokenSym.J2})`);
        if (d.freqs) { const im = d.freqs.filter(x => x < -1).length; L.push(`Freq: ${d.freqs.length} Modes${im ? ` · ⚠ ${im} imaginary` : ""}`); }
        if (d.ir) L.push(`IR: ${d.ir.length} Modes with intensities`);
        if (d.thermo) L.push(`Thermo: ZPE ${f(d.thermo.zpeEh)} · H ${f(d.thermo.enthalpyEh)} · G ${f(d.thermo.gibbsEh)} Eh`);
        if (d.tddft) L.push(`TD-DFT: ${d.tddft.length} States`);
        if (d.absorption) L.push(`UV-Vis: ${d.absorption.length} Transitions (${d.absorption.filter(a => a.fosc > 1e-6).length} allowed)`);
        if (d.nmr) L.push(`NMR: ${d.nmr.length} Nuclei (σ_iso)`);
        if (d.solvation) L.push(`Solvation detected: ${d.solvation.model} / ${d.solvation.solvent ?? "?"}`);
        if (d.meta?.runtime) L.push(`Runtime: ${d.meta.runtime}`);
        if (d.ssc) L.push(`J-Couplings: ${d.ssc.length} Pairs`);
        return L.map(x => `<div style="font-size:12px;padding:1px 0;">${x}</div>`).join("");
    }

    function plotSection(title: string) {
        const root = document.createElement("details"); root.open = true;
        root.style.cssText = "margin-top:10px;";
        root.innerHTML = `<summary style="cursor:pointer;font-weight:600;font-size:13px;">${title}</summary>`;
        const controls = document.createElement("div");
        controls.style.cssText = "display:flex;gap:8px;align-items:center;font-size:12px;padding:6px 0;flex-wrap:wrap;";
        const canvas = document.createElement("canvas");
        canvas.width = 640; canvas.height = 260;
        canvas.style.cssText = "width:100%;max-width:720px;border:1px solid #eee;border-radius:8px;background:#fff;";
        root.append(controls, canvas);
        return { root, canvas, controls };
    }
    function numInput(val: number, w = 70) {
        const i = document.createElement("input");
        i.type = "number"; i.step = "any"; i.value = String(val);
        i.style.cssText = `width:${w}px;padding:3px;border:1px solid #ccc;border-radius:5px;`;
        return i;
    }

    function irPlot(d: OrcaData): HTMLElement {
        const { root, canvas, controls } = plotSection("IR-Spectrum");
        const wIn = numInput(12);
        controls.append("FWHM [cm⁻¹]:", wIn);
        const draw = () => plotSpectrum(canvas, {
            sticks: d.ir!.filter(m => m.freq > 0).map(m => ({ x: m.freq, y: m.intensity })),
            xLabel: "cm⁻¹", width: parseFloat(wIn.value) || 12, shape: "lorentz", invertX: true,
        });
        wIn.oninput = draw; draw();
        return root;
    }

    function uvPlot(d: OrcaData): HTMLElement {
        const { root, canvas, controls } = plotSection("UV-Vis (TD-DFT)");
        const unit = document.createElement("select");
        unit.innerHTML = `<option value="nm">nm</option><option value="eV">eV</option>`;
        const wIn = numInput(0.25);
        controls.append("Unit:", unit, "FWHM [eV]:", wIn);
        const draw = () => {
            const wEV = parseFloat(wIn.value) || 0.25;
            const allowed = d.absorption!.filter(a => a.fosc > 1e-8);   // Triplett-fosc=0 raus
            if (unit.value === "eV")
                plotSpectrum(canvas, { sticks: allowed.map(a => ({ x: a.eV, y: a.fosc })), xLabel: "eV", width: wEV, shape: "gauss" });
            else {
                // FWHM eV->nm am Bandenmittel genähert (w_nm = 1239.84*w/E²) —  trial
                const mid = allowed.reduce((s, a) => s + a.eV, 0) / (allowed.length || 1) || 3;
                plotSpectrum(canvas, { sticks: allowed.map(a => ({ x: a.nm, y: a.fosc })), xLabel: "nm", width: 1239.84 * wEV / (mid * mid), shape: "gauss" });
            }
        };
        unit.onchange = draw; wIn.oninput = draw; draw();
        return root;
    }

    const NMR_REF_KEY = "chemable.moldata.nmrRefs";
    function nmrPlot(d: OrcaData): HTMLElement {
        const { root, canvas, controls } = plotSection("NMR");
        const els = [...new Set(d.nmr!.map(r => r.el))];
        const elSel = document.createElement("select");
        els.forEach(el => { const o = document.createElement("option"); o.value = o.textContent = el; elSel.appendChild(o); });
        const refs = JSON.parse(localStorage.getItem(NMR_REF_KEY) || "{}");
        const refIn = numInput(refs[els[0]] ?? 0, 90);
        const wIn = numInput(0.5);
        controls.append("Kern:", elSel, "σ_ref [ppm] (0 = absolut):", refIn, "FWHM:", wIn);
        const draw = () => {
            const el = elSel.value, ref = parseFloat(refIn.value) || 0;
            refs[el] = ref; localStorage.setItem(NMR_REF_KEY, JSON.stringify(refs));
            const rows = d.nmr!.filter(r => r.el === el);
            plotSpectrum(canvas, {
                sticks: rows.map(r => ({ x: ref ? ref - r.isotropic : r.isotropic, y: 1 })),
                xLabel: ref ? "δ [ppm]" : "σ_iso [ppm]",
                width: parseFloat(wIn.value) || 0.5, shape: "lorentz", invertX: true,
            });
        };
        elSel.onchange = () => { refIn.value = String(refs[elSel.value] ?? 0); draw(); };
        refIn.oninput = draw; wIn.oninput = draw; draw();
        return root;
    }

    function nmrSimPlot(d: OrcaData): HTMLElement {
        const { root, canvas, controls } = plotSection("NMR-Simulation (J-Couplings)");

        let idxMap: number[] = []; 
        (root as HTMLDetailsElement).open = false;
        const shiftsIn = document.createElement("input");
        shiftsIn.placeholder = "Shifts ppm: 1.2, 1.2, 1.2, 3.4, 3.4";
        shiftsIn.style.cssText = "flex:1 1 100%;padding:4px;border:1px solid #ccc;border-radius:5px;font-size:12px;";
        const jIn = document.createElement("input");
        jIn.placeholder = "J Hz: 0-3 7.1, 1-3 7.1, 2-3 7.1, 0-4 7.1 ...";
        jIn.style.cssText = "flex:1 1 100%;padding:4px;border:1px solid #ccc;border-radius:5px;font-size:12px;";
        const freqIn = numInput(400);
        const go = document.createElement("button");
        go.textContent = "Simulate"; go.className = "btn-primary"; go.style.cssText = "width:auto;padding:4px 14px;margin:0;";
        controls.append(shiftsIn, jIn, "MHz:", freqIn, go);
        const fill = document.createElement("button");
        fill.textContent = "δ from Calculation (H)";
        fill.className = "tool-btn"; fill.style.cssText = "width:auto;padding:4px 10px;border:1px solid #ddd;font-size:12px;";
        fill.onclick = () => {
            const refs = JSON.parse(localStorage.getItem(NMR_REF_KEY) || "{}");
            const ref = refs["H"];
            if (!ref) { shiftsIn.value = "Set σ_ref for H in the NMR-plot (TMS ~31-32 ppm at GIAO-DFT)"; return; }
            const hs = d.nmr!.filter(r => r.el === "H");
            idxMap = hs.map(r => r.idx);
            shiftsIn.value = hs.map(r => (ref - r.isotropic).toFixed(2)).join(", ");
            shiftsIn.title = "ORCA-Indices: " + idxMap.join(", ");
        };
        controls.append(fill);
        const lwIn = numInput(2, 50);
        controls.append("LW [Hz]:", lwIn);  
        go.onclick = () => {
            try {
                const shifts = shiftsIn.value.split(",").map(s => parseFloat(s)).filter(x => !Number.isNaN(x));
                const js: [number, number, number][] = [];
                for (const m of jIn.value.matchAll(/(\d+)\s*-\s*(\d+)\s+(-?[\d.]+)/g)) js.push([+m[1], +m[2], +m[3]]);
                const { x, y } = simulate1H({ shifts, js }, parseFloat(freqIn.value) || 400, undefined, undefined, 4096, parseFloat(lwIn.value) || 2);
                const yMax = Math.max(...y) || 1;
                //  Direct-Draw:
                const ctx = canvas.getContext("2d")!;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = "#4f46e5"; ctx.lineWidth = 1.2; ctx.beginPath();
                for (let i = 0; i < x.length; i++) {
                    const X = 10 + (1 - (x[i] - x[0]) / (x[x.length - 1] - x[0])) * (canvas.width - 20); // ppm invertiert
                    const Y = 10 + (1 - y[i] / yMax) * (canvas.height - 30);
                    i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
                }
                ctx.stroke();
            } catch (err) { console.error("[nmr-sim]", err); }
        };
        const jFill = document.createElement("button");
        jFill.textContent = "J from Calculation";
        jFill.className = "tool-btn"; jFill.style.cssText = "width:auto;padding:4px 10px;border:1px solid #ddd;font-size:12px;";
        jFill.onclick = () => {
            if (!d.ssc) { jIn.value = "No SSC data in .out"; return; }
            if (!idxMap.length) { jIn.value = "First set δ (Mapping)!"; return; }
            const pos = new Map(idxMap.map((orca, i) => [orca, i]));
            const JMIN = 0.3;   // Hz — Fernkopplungs-Rauschen kappen, sonst explodiert das Spinsystem
            jIn.value = d.ssc
                .filter(j => pos.has(j.a) && pos.has(j.b) && Math.abs(j.isoHz) >= JMIN)
                .map(j => `${pos.get(j.a)}-${pos.get(j.b)} ${j.isoHz.toFixed(2)}`)
                .join(", ");
        };
        controls.append(jFill);
        return root;
    }


    function renderDetail(sp: Species, e: DataEntry) {
        detail.innerHTML = `<div style="font-weight:600;">${e.label}</div>
            <div style="font-size:12px;color:#666;">Type: ${e.kind} · Species: ${sp.label}</div>
            <div style="font-size:11px;color:#999;word-break:break-all;">${absPath(ds!, e)}</div>`;
        if (e.kind === "cube") {
            const btn = document.createElement("button");
            btn.textContent = "Open in Cube Viewer";
            btn.className = "btn-primary";
            btn.style.cssText = "width:auto; padding:6px 14px; margin-top:12px;";
            btn.onclick = async () => {
                try {
                    const text = fs.readFileSync(absPath(ds!, e), "utf8");
                    await (window as any).__openCube?.(e.file, text);
                    dialog.style.display = "none";
                } catch (err) { console.error("[moldata] open cube failed:", err); }
            };
            detail.appendChild(btn);
        }
        if (e.kind === "orca-out") {
            let d: OrcaData | null = null;
            const box = document.createElement("div");
            box.style.cssText = "margin-top:10px;padding:10px;background:#eef2ff;border-radius:8px;";
            try { d = parseOrca(fs.readFileSync(absPath(ds!, e), "utf8")); box.innerHTML = renderOrcaSummary(d); }
            catch (err) { box.textContent = "Parse error: " + err; }
            detail.appendChild(box);
            if (d?.ir?.length) detail.appendChild(irPlot(d));
            if (d?.absorption?.length) detail.appendChild(uvPlot(d));
            if (d?.nmr?.length) detail.appendChild(nmrPlot(d));
            if (d?.nmr?.length) detail.appendChild(nmrSimPlot(d));
            
        }
    }

    document.getElementById("btn-moldata")?.addEventListener("click", () => {
        dialog.style.display = "flex";
        const hint = listDatasets();
        (document.getElementById("moldata-ds-name") as HTMLInputElement).placeholder =
            hint.length ? `Open: ${hint.join(", ")} — or new name` : "New dataset name";
        renderTree();
    });
    document.getElementById("btn-moldata-ds-open")?.addEventListener("click", () => {
        const name = (document.getElementById("moldata-ds-name") as HTMLInputElement).value.trim();
        if (!name) return;
        ds = listDatasets().includes(name) ? loadDataset(name) : createDataset(name);
        dsForm.style.display = "none"; spForm.style.display = "flex";
        renderTree();
    });
    document.getElementById("btn-moldata-sp-add")?.addEventListener("click", () => {
        if (!ds) return;
        const label = (document.getElementById("moldata-sp-label") as HTMLInputElement).value.trim();
        if (!label) return;
        const q = parseInt((document.getElementById("moldata-sp-q") as HTMLInputElement).value || "0", 10);
        const m = parseInt((document.getElementById("moldata-sp-m") as HTMLInputElement).value || "1", 10);
        addSpecies(ds, label, q, m);
        (document.getElementById("moldata-sp-label") as HTMLInputElement).value = "";
        renderTree();
    });
    document.getElementById("btn-moldata-add-species")?.addEventListener("click", () => {
        if (ds) spForm.style.display = "flex";
    });
    document.getElementById("btn-moldata-close")?.addEventListener("click", () => dialog.style.display = "none");
    document.getElementById("btn-moldata-switch")?.addEventListener("click", () => {
        ds = null; selected = null;
        dsForm.style.display = "flex"; spForm.style.display = "none";
        renderTree();
    });
}