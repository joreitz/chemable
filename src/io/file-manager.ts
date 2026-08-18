// src/io/file-manager.ts
import { state } from "../state";
import { uiState } from "../core/ui-state";
import { generateSmiles } from "../smiles";
import { generate3DModelPython } from "../chemistry/rdkit-3d";
import { generateSVG, generateXYZ, convertSdfToXyz } from "../export";
import { jsPDF } from "jspdf";
import { clipboard } from "electron";
import { insertTemplate } from "../chemistry/template-manager"
import "svg2pdf.js";
import { applySdfToCanvas } from "../chemistry/optimize-3d";

const RCOV: { [s: string]: number } = { H:0.31,B:0.84,C:0.76,N:0.71,O:0.66,F:0.57,Na:1.66,Mg:1.41,Al:1.21,Si:1.11,P:1.07,S:1.05,Cl:1.02,K:2.03,Ca:1.76,Ti:1.60,V:1.53,Cr:1.39,Mn:1.39,Fe:1.32,Co:1.26,Ni:1.24,Cu:1.32,Zn:1.22,Br:1.20,I:1.39,Se:1.20,Mo:1.54,Ru:1.46,Rh:1.42,Pd:1.39,Ag:1.45,Pt:1.36,Au:1.36 };

function xyzToMolblock(text: string): string {
    const lines = text.split(/\r?\n/);
    const n = parseInt(lines[0], 10);
    if (!Number.isFinite(n) || n <= 0) throw new Error("atom count missing in line 1");
    const cap = (s: string) => s[0].toUpperCase() + s.slice(1).toLowerCase(); // "FE" -> "Fe"
    const atoms: { s: string; x: number; y: number; z: number }[] = [];
    for (let i = 2; i < 2 + n; i++) {
        const t = lines[i]?.trim().split(/\s+/);
        if (!t || t.length < 4) throw new Error(`bad atom line ${i + 1}`);
        atoms.push({ s: cap(t[0]), x: +t[1], y: +t[2], z: +t[3] });
    }
    const bonds: [number, number][] = [];
    for (let a = 0; a < atoms.length; a++) for (let b = a + 1; b < atoms.length; b++) {
        const dx = atoms[a].x - atoms[b].x, dy = atoms[a].y - atoms[b].y, dz = atoms[a].z - atoms[b].z;
        const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const lim = ((RCOV[atoms[a].s] ?? 0.77) + (RCOV[atoms[b].s] ?? 0.77)) * 1.3;
        if (d > 0.4 && d < lim) bonds.push([a + 1, b + 1]);
    }
    const p3 = (v: number) => String(v).padStart(3);
    const f  = (v: number) => v.toFixed(4).padStart(10);
    const out = ["xyz", "  Chemable xyz import", ""];
    out.push(`${p3(atoms.length)}${p3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`);
    for (const a of atoms) out.push(`${f(a.x)}${f(a.y)}${f(a.z)} ${a.s.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
    for (const [i, j] of bonds) out.push(`${p3(i)}${p3(j)}  1  0  0  0  0`);
    out.push("M  END");
    return out.join("\n") + "\n";
}

export function initFileManager(render: () => void) {
    
    // --- 3D XYZ EXPORT ---
    document.getElementById('btn-export-xyz')?.addEventListener('click', async () => {
        const atoms = state.getAtoms();
        const bonds = state.getBonds();
        const smiles = generateSmiles(atoms, bonds);
        
        if (!smiles) {
            alert("Nothing to export!");
            return;
        }

        try {
            document.body.style.cursor = "wait";
            
            const sdfString = await generate3DModelPython(smiles);
            
            const xyzString = convertSdfToXyz(sdfString);

            const blob = new Blob([xyzString], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement("a");
            link.href = url;
            link.download = "molecule_3d_rdkit.xyz";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (err) {
            console.error(err);
            alert("RDKit 3D-Export didn't work: " + (err as Error).message);
        } finally {
            document.body.style.cursor = "default";
        }
    });

    const xyzInput = document.getElementById("xyz-file-input") as HTMLInputElement;
    document.getElementById("btn-import-xyz")?.addEventListener("click", () => xyzInput?.click());
        xyzInput?.addEventListener("change", async () => {
            const f = xyzInput.files?.[0]; if (!f) return;
            try {
                applySdfToCanvas(xyzToMolblock(await f.text()), render, false);
                if (!state.is3DMode) state.set3DMode(true);
                render();
            } catch (e) { alert("XYZ import failed: " + (e as Error).message); }
            xyzInput.value = "";  
    });

    // --- SVG EXPORT ---
    document.getElementById('btn-export-svg')?.addEventListener('click', () => {
        const atoms = state.getAtoms();
        const bonds = state.getBonds();
        const selectedIds = state.getSelectedAtomIds();

        const svgString = generateSVG(atoms, bonds, selectedIds, uiState.currentFontSize);
        if (!svgString) {
            alert("Nothing to export!");
            return;
        }

        const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = selectedIds.size > 0 ? "molekuel_auswahl.svg" : "molekuel_komplett.svg";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // --- PDF EXPORT ---
    document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
        const atoms = state.getAtoms();
        const bonds = state.getBonds();
        const selectedIds = state.getSelectedAtomIds();

        const svgString = generateSVG(atoms, bonds, selectedIds, uiState.currentFontSize);
        if (!svgString) {
            alert("Nothing to export!");
            return;
        }

        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
        const svgElement = svgDoc.documentElement;

        const width = parseFloat(svgElement.getAttribute("width") || "500");
        const height = parseFloat(svgElement.getAttribute("height") || "500");
        const orientation = width > height ? "l" : "p";
        
        const doc = new jsPDF({ orientation: orientation, unit: "pt", format: [width, height] });

        try {
            await doc.svg(svgElement as any, { x: 0, y: 0, width: width, height: height });
            const fileName = selectedIds.size > 0 ? "molekuel_auswahl.pdf" : "molekuel_komplett.pdf";
            doc.save(fileName);
        } catch (err) {
            console.error("Error while exporting PDF:", err);
            alert("There was an error creating the PDF.");
        }
    });

    // --- SPEICHERN (.chem) ---
    document.getElementById('btn-save')?.addEventListener('click', () => {
        const data = JSON.stringify({
            version: 2,
            atoms: state.getAtoms(),
            bonds: state.getBonds(),
            graphics: state.getGraphics()
        });
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "molekuel.chem";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // --- LADEN ---
    const fileInput = document.getElementById('file-load') as HTMLInputElement;
    document.getElementById('btn-load')?.addEventListener('click', () => {
        fileInput?.click(); 
    });

    fileInput?.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            try {
                let jsonStr = content;
                if (file.name.endsWith('.svg')) {
                    const match = content.match(/<desc id="chemable-data">(.*?)<\/desc>/);
                    if (match && match[1]) {
                        jsonStr = match[1];
                    } else {
                        alert("This SVG does not contain chemable-specific data.");
                        return;
                    }
                }
                const parsed = JSON.parse(jsonStr);
                if (parsed.atoms && parsed.bonds) {
                    state.saveState();
                    state.setAtoms(parsed.atoms);
                    state.setBonds(parsed.bonds);
                    state.setGraphics(parsed.graphics ?? []);
                    state.clearGraphicSelection();
                    render();
                }
            } catch (err) {
                alert("Error while loading file!");
            }
        };
        reader.readAsText(file);
        fileInput.value = ""; 
    });
    const smilesDialog = document.getElementById('smiles-dialog');
    const smilesInput = document.getElementById('smiles-input') as HTMLInputElement;

    document.getElementById('btn-smiles')?.addEventListener('click', () => {
        const currentSmiles = generateSmiles(state.getAtoms(), state.getBonds());
        if (smilesInput) smilesInput.value = currentSmiles;
        if (smilesDialog) smilesDialog.style.display = 'block';
        smilesInput?.focus();
        smilesInput?.select();
    });

    document.getElementById('smiles-btn-close')?.addEventListener('click', () => {
        if (smilesDialog) smilesDialog.style.display = 'none';
    });

    document.getElementById('smiles-btn-import')?.addEventListener('click', () => {
        const inputStr = smilesInput?.value.trim();
        if (inputStr) {
            console.log("SMILES will be imported:", inputStr);
        }
        if (smilesDialog) smilesDialog.style.display = 'none';
    });

    smilesInput?.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            
            if (key === 'c') {
                const start = smilesInput.selectionStart || 0;
                const end = smilesInput.selectionEnd || smilesInput.value.length;
                const textToCopy = start !== end ? smilesInput.value.substring(start, end) : smilesInput.value;
                
                clipboard.writeText(textToCopy);
                e.preventDefault();
            } 
            else if (key === 'v') {
                const pasteText = clipboard.readText();
                const start = smilesInput.selectionStart || 0;
                const end = smilesInput.selectionEnd || 0;
                
                smilesInput.value = smilesInput.value.substring(0, start) + pasteText + smilesInput.value.substring(end);
                smilesInput.selectionStart = smilesInput.selectionEnd = start + pasteText.length;
                e.preventDefault();
            }
        }
        
        // Enter-Taste lädt das Molekül direkt
        if (e.key === 'Enter') {
            document.getElementById('smiles-btn-import')?.click();
        }
    });
}