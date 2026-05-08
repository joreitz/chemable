// src/viewer3d.ts
import { state } from "./state";
import { generateSmiles } from "./smiles";

export function init3DViewer() {
    const viewer3dDialog = document.getElementById('viewer3d-dialog');
    const container3d = document.getElementById('container-3d');
    let glViewer: any = null; 

    document.getElementById('btn-3d')?.addEventListener('click', async () => {
        const smiles = generateSmiles(state.getAtoms(), state.getBonds());
        if (!smiles) {
            alert("Please draw a valid molecule before opening the 3D viewer.");
            return;
        }

        if (viewer3dDialog) {
            viewer3dDialog.style.display = 'flex';
        }

        if (!container3d) return;
        container3d.innerHTML = "<div style='padding:40px; text-align:center; font-family:sans-serif;'>Generating 3D structure...<br><small>Force field optimization in progress</small></div>";

        try {
            const response = await fetch(`https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}/sdf?get3d=true`);

            if (!response.ok) {
                throw new Error("Could not calculate 3D structure. Is the molecular connectivity (SMILES) valid?");
            }

            const sdfData = await response.text();

            // 3Dmol.js Viewer initialisieren
            container3d.innerHTML = ""; 
            
            const $3Dmol = (window as any).$3Dmol;
            
            glViewer = $3Dmol.createViewer(container3d, { 
                defaultcolors: $3Dmol.rasmolElementColors,
                backgroundColor: 'white' 
            });

            // SDF Modell laden und darstellen
            glViewer.addModel(sdfData, "sdf");
            glViewer.setStyle({}, { 
                stick: { radius: 0.15, colorscheme: 'Jmol' }, 
                sphere: { scale: 0.3, colorscheme: 'Jmol' } 
            });
            
            glViewer.zoomTo();
            glViewer.render();

        } catch (err) {
            console.error(err);
            container3d.innerHTML = `<div style='padding:40px; color:red; text-align:center; font-family:sans-serif;'>Error: ${(err as Error).message}</div>`;
        }
    });

    document.getElementById('btn-close-3d')?.addEventListener('click', () => {
        if (viewer3dDialog) viewer3dDialog.style.display = 'none';
        if (glViewer) glViewer.clear(); // RAM freigeben
    });
}