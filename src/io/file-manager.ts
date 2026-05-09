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
        const data = JSON.stringify({ atoms: state.getAtoms(), bonds: state.getBonds() });
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