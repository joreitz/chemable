// src/io/file-manager.ts
import { state } from "../state";
import { uiState } from "../core/ui-state";
import { generateSmiles } from "../smiles";
import { generateSVG, generateXYZ, convertSdfToXyz } from "../export";
import { jsPDF } from "jspdf";
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
            const response = await fetch(`https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}/sdf?get3d=true`);

            if (!response.ok) throw new Error("Error with 3D calculation.");

            const sdfString = await response.text();
            const xyzString = convertSdfToXyz(sdfString);

            const blob = new Blob([xyzString], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement("a");
            link.href = url;
            link.download = "molecule_3d.xyz";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (err) {
            console.error(err);
            alert("3D-Export failed: " + (err as Error).message + "\n\nFalling back to 2D export.");
            
            const fallbackXyz = generateXYZ(atoms);
            const blob = new Blob([fallbackXyz], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "molekuel_2d_planar.xyz";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
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
            alert("Nichts zum Exportieren vorhanden!");
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
            alert("Nichts zum Exportieren vorhanden!");
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
            console.error("Fehler beim PDF Export:", err);
            alert("Es gab einen Fehler beim Erstellen des PDFs.");
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
                        alert("Dieses SVG enthält keine Moleküldaten.");
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
                alert("Fehler beim Laden der Datei!");
            }
        };
        reader.readAsText(file);
        fileInput.value = ""; 
    });
}