// src/viewer3d.ts
import { state } from "./state";
import { generateSmiles } from "./smiles";
import { applySdfToCanvas } from "./chemistry/optimize-3d"; // NEU: Import
import { generate3DModelPython } from "./chemistry/rdkit-3d";
import { generate2DModelPython } from "./chemistry/rdkit-3d";

export function init3DViewer(render: () => void) {
    const viewer3dDialog = document.getElementById('viewer3d-dialog');
    const container3d = document.getElementById('container-3d');
    let glViewer: any = null; 
    let currentSdfData: string | null = null; 

    document.getElementById('btn-use-on-canvas')?.addEventListener('click', async () => {
    if (!currentSdfData) {
        alert("Bitte lass zuerst eine Struktur im 3D Viewer generieren.");
        return;
    }

    try {
        document.body.style.cursor = "wait";
        const btn = document.getElementById('btn-use-on-canvas') as HTMLButtonElement;
        if (btn) btn.disabled = true;

        applySdfToCanvas(currentSdfData, render);

        if (viewer3dDialog) viewer3dDialog.style.display = 'none';

        if (!state.is3DMode) {
            state.set3DMode(true);
            const toggleBtn = document.getElementById('btn-toggle-3d');
            if (toggleBtn) toggleBtn.innerText = "2D Modus";
        }

        render();

        console.log("Worked.");

    } catch (err) {
        console.error("Fehler beim Übertragen auf Canvas:", err);
        alert("Didn't work: " + (err as Error).message);
    } finally {
        document.body.style.cursor = "default";
        const btn = document.getElementById('btn-use-on-canvas') as HTMLButtonElement;
        if (btn) btn.disabled = false;
    }
});

    document.getElementById('btn-3d')?.addEventListener('click', async () => {
        const smiles = generateSmiles(state.getAtoms(), state.getBonds());
        if (!smiles) return alert("Please draw a molecule first.");

        if (viewer3dDialog) viewer3dDialog.style.display = 'flex';
        if (!container3d) return;
        
        container3d.innerHTML = "<div style='padding:40px; text-align:center;'>Generating 3D structure...<br><small>Python RDKit: UFF Optimization running...</small></div>";

        try {
            const sdfData = await generate3DModelPython(smiles);
            
            container3d.innerHTML = ""; 
            const $3Dmol = (window as any).$3Dmol;
            glViewer = $3Dmol.createViewer(container3d, { backgroundColor: 'white' });
            glViewer.addModel(sdfData, "sdf");
            glViewer.setStyle({}, { stick: { radius: 0.15 }, sphere: { scale: 0.3 } });
            glViewer.zoomTo();
            glViewer.render();

        } catch (err) {
            console.error(err);
            container3d.innerHTML = `<div style='padding:40px; color:red; text-align:center;'>Error: ${(err as Error).message}</div>`;
        }
    });

    document.getElementById('btn-apply-3d')?.addEventListener('click', () => {
        if (currentSdfData) {
            applySdfToCanvas(currentSdfData, render);
            if (viewer3dDialog) viewer3dDialog.style.display = 'none';
        }
    });

    document.getElementById('btn-close-3d')?.addEventListener('click', () => {
        if (viewer3dDialog) viewer3dDialog.style.display = 'none';
        if (glViewer) glViewer.clear(); 
    });
}