import { listDatasets, createDataset, loadDataset, saveDataset, addSpecies, addFile, absPath } from "./store";
import { MolDataset, Species, DataEntry } from "./types";

let ds: MolDataset | null = null;
let selected: DataEntry | null = null;

export function initMoleculeData() {
    const dialog = document.getElementById("moldata-dialog")!;
    const tree   = document.getElementById("moldata-tree")!;
    const detail = document.getElementById("moldata-detail")!;
    const title  = document.getElementById("moldata-title")!;

    function renderTree() {
        tree.innerHTML = "";
        if (!ds) return;
        title.textContent = ds.name;
        for (const sp of ds.species) {
            const head = document.createElement("div");
            head.textContent = `▸ ${sp.label}  (q=${sp.charge}, M=${sp.multiplicity})`;
            head.style.cssText = "font-weight:600;font-size:13px;padding:6px 4px 2px;";
            tree.appendChild(head);
            for (const e of sp.entries) {
                const row = document.createElement("div");
                row.textContent = `   ${e.kind === "cube" ? "▦" : e.kind === "orca-out" ? "≡" : "·"} ${e.label}`;
                row.style.cssText = "font-size:12px;padding:2px 4px 2px 14px;cursor:pointer;border-radius:4px;";
                if (selected?.id === e.id) row.style.background = "#e0e7ff";
                row.onclick = () => { selected = e; renderTree(); renderDetail(sp, e); };
                tree.appendChild(row);
            }
            // Drop-Zone pro Spezies
            head.style.cursor = "copy";
            head.addEventListener("dragover", ev => ev.preventDefault());
            head.addEventListener("drop", ev => {
                ev.preventDefault(); ev.stopPropagation();
                for (const f of Array.from(ev.dataTransfer?.files ?? []))
                    addFile(ds!, sp, (f as any).path);   // Electron: File.path = absoluter Pfad
                renderTree();
            });
        }
    }
    function renderDetail(sp: Species, e: DataEntry) {
        detail.innerHTML = `<div style="font-weight:600;">${e.label}</div>
            <div style="font-size:12px;color:#666;">Typ: ${e.kind} · Spezies: ${sp.label}</div>
            <div style="font-size:11px;color:#999;word-break:break-all;">${absPath(ds!, e)}</div>`;
        // Phase 2-4 docken hier an: Parser + Plot / Cube-Viewer-Öffnen
    }

    document.getElementById("btn-moldata")?.addEventListener("click", () => {
        dialog.style.display = "flex";
        if (!ds) {
            const existing = listDatasets();
            const name = prompt(existing.length
                ? `Dataset öffnen (vorhanden: ${existing.join(", ")}) oder neuen Namen eingeben:`
                : "Name für neues Dataset:");
            if (!name) { dialog.style.display = "none"; return; }
            ds = existing.includes(name) ? loadDataset(name) : createDataset(name);
        }
        renderTree();
    });
    document.getElementById("btn-moldata-add-species")?.addEventListener("click", () => {
        if (!ds) return;
        const label = prompt("Spezies-Label (z.B. 'Triplett', 'Fe(III)'):"); if (!label) return;
        const q = parseInt(prompt("Ladung:", "0") || "0", 10);
        const m = parseInt(prompt("Multiplizität:", "1") || "1", 10);
        addSpecies(ds, label, q, m); renderTree();
    });
    document.getElementById("btn-moldata-close")?.addEventListener("click", () => dialog.style.display = "none");
}