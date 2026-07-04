import { listDatasets, createDataset, loadDataset, addSpecies, addFile, absPath } from "./store";
import { MolDataset, Species, DataEntry } from "./types";
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

    function renderDetail(sp: Species, e: DataEntry) {
        detail.innerHTML = `<div style="font-weight:600;">${e.label}</div>
            <div style="font-size:12px;color:#666;">Typ: ${e.kind} · Spezies: ${sp.label}</div>
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