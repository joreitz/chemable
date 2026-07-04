import { listDatasets, createDataset, loadDataset, addSpecies, addFile, absPath } from "./store";
import { MolDataset, Species, DataEntry } from "./types";
import { parseOrca, OrcaData } from "./orca-parser";
import { addSolvation } from "./store"; 

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
        if (d.coords) L.push(`Coordinates: ${d.coords.length} Atome`);
        if (d.mulliken) L.push(`Mulliken: ${d.mulliken.length} Atome${d.mulliken[0]?.spin !== undefined ? " (+Spin)" : ""}`);
        if (d.brokenSym) L.push(`BS: ${d.brokenSym.coupling ?? "?"} · J(3) = ${d.brokenSym.J3} cm⁻¹ (J1 ${d.brokenSym.J1} / J2 ${d.brokenSym.J2})`);
        if (d.freqs) { const im = d.freqs.filter(x => x < -1).length; L.push(`Freq: ${d.freqs.length} Modes${im ? ` · ⚠ ${im} imaginary` : ""}`); }
        if (d.ir) L.push(`IR: ${d.ir.length} Modes with intensities`);
        if (d.thermo) L.push(`Thermo: ZPE ${f(d.thermo.zpeEh)} · H ${f(d.thermo.enthalpyEh)} · G ${f(d.thermo.gibbsEh)} Eh`);
        if (d.tddft) L.push(`TD-DFT: ${d.tddft.length} States`);
        if (d.absorption) L.push(`UV-Vis: ${d.absorption.length} Transitions (${d.absorption.filter(a => a.fosc > 1e-6).length} allowed)`);
        if (d.nmr) L.push(`NMR: ${d.nmr.length} Nuclei (σ_iso)`);
        if (d.solvation) L.push(`Solvation detected: ${d.solvation.model} / ${d.solvation.solvent ?? "?"}`);
        if (d.meta?.runtime) L.push(`Runtime: ${d.meta.runtime}`);
        return L.map(x => `<div style="font-size:12px;padding:1px 0;">${x}</div>`).join("");
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
        if (e.kind === "orca-out" || e.kind === "xyz" || e.kind === "file") {

            if (e.kind === "orca-out") {
                const box = document.createElement("div");
                box.style.cssText = "margin-top:10px;padding:10px;background:#eef2ff;border-radius:8px;";
                try { box.innerHTML = renderOrcaSummary(parseOrca(fs.readFileSync(absPath(ds!, e), "utf8"))); }
                catch (err) { box.textContent = "Parse error: " + err; }
                detail.appendChild(box);
            }
            
            const pre = document.createElement("pre");
            pre.style.cssText = "margin-top:12px; padding:10px; background:#f8f8f8; border:1px solid #ddd; border-radius:8px; font-size:11px; line-height:1.35; overflow:auto; max-height:calc(100% - 90px); white-space:pre;";
            try {
                const raw = fs.readFileSync(absPath(ds!, e), "utf8");
                const MAX = 2_000_000;   
                pre.textContent = raw.length > MAX ? raw.slice(0, MAX) + "\n\n… [abbr., full file on hard drive]" : raw;
            } catch (err) { pre.textContent = "Read error: " + err; }
            detail.appendChild(pre);
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