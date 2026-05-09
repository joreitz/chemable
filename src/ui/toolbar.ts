// src/ui/toolbar.ts
import { uiState } from "../core/ui-state";
import { state } from "../state";
import { generate2DModelPython } from "../chemistry/rdkit-3d";
import { applySdfToCanvas } from "../chemistry/optimize-3d"
import { generateSmiles } from "../smiles";

export function setMode(mode: any, activeBtnId?: string) {
        uiState.editMode = mode;
        
        const tools = document.querySelectorAll('.tool-btn');
        tools.forEach(el => el.classList.remove('active'));
        
        const btnIdToActivate = activeBtnId || `btn-${mode}`;
        const activeBtn = document.getElementById(btnIdToActivate);
        if (activeBtn) activeBtn.classList.add('active');
        
        const canvas = document.getElementById('chemBoard') as HTMLCanvasElement;
        if (canvas) {
            if (mode === "erase") canvas.style.cursor = "not-allowed";
            else if (mode === "move") canvas.style.cursor = "move";
            else if (mode === "select") canvas.style.cursor = "default";
            else canvas.style.cursor = "crosshair";
        }
    }

export function initToolbar(render: () => void, performUndo: () => void) {

    // --- WERKZEUGE ---
    document.getElementById('btn-draw')?.addEventListener('click', () => { setMode("draw", "btn-draw"); uiState.currentBondType = 1; });
    document.getElementById('btn-wedge')?.addEventListener('click', () => { setMode("draw", "btn-wedge"); uiState.currentBondType = 5; });
    document.getElementById('btn-dash')?.addEventListener('click', () => { setMode("draw", "btn-dash"); uiState.currentBondType = 6; });
    document.getElementById('btn-move')?.addEventListener('click', () => setMode("move"));
    document.getElementById('btn-erase')?.addEventListener('click', () => setMode("erase"));
    document.getElementById('btn-select')?.addEventListener('click', () => { setMode("select"); });
    document.getElementById('btn-arrow')?.addEventListener('click', () => setMode("arrow"));
    document.getElementById('btn-text')?.addEventListener('click', () => setMode("text"));
    document.getElementById('btn-rotate-3d')?.addEventListener('click', () => setMode("rotate_3d"));
    document.getElementById('btn-test-3d')?.addEventListener('click', () => {
        let toggle = false;
        state.getAtoms().forEach(a => {
            a.orig3DX = a.x;
            a.orig3DY = a.y;
            a.orig3DZ = toggle ? 40 : -40; 
            a.z = a.orig3DZ;
            toggle = !toggle;
        });
        render();
    });
    document.getElementById('btn-toggle-3d')?.addEventListener('click', (e) => {
    // Globalen State umkehren
    state.set3DMode(!state.is3DMode); 
    
    // Button-Text anpassen
    const btn = e.target as HTMLButtonElement;
    btn.innerText = state.is3DMode ? "2D Modus" : "3D Modus";
    
    // Canvas neu zeichnen
    render(); 
    });

    // --- AKTIONEN ---
    document.getElementById('btn-clear')?.addEventListener('click', () => { state.clear(); render(); });
    document.getElementById('btn-undo')?.addEventListener('click', performUndo);

    //  Toggle
    document.getElementById('btn-grid')?.addEventListener('click', () => {
        uiState.showGrid = !uiState.showGrid;
        const btn = document.getElementById('btn-grid');
        if (btn) {
            btn.innerText = uiState.showGrid ? "🔲 Grid: On" : "🔲 Grid: Off";
            btn.style.backgroundColor = uiState.showGrid ? "#ccffcc" : "#eee";
        }
        render();
    });
    document.getElementById('btn-toggle-hydrogens')?.addEventListener('click', () => {
        uiState.showImplicitHydrogens = !uiState.showImplicitHydrogens;
        
        // Optional: Optisches Feedback am Button selbst (gedrückt / nicht gedrückt)
        const btn = document.getElementById('btn-toggle-hydrogens');
        if (btn) {
            btn.style.backgroundColor = uiState.showImplicitHydrogens ? "" : "#ddd";
        }
        
        render(); // Direkt neu zeichnen!
    });

    // Warnings Toggle
    document.getElementById('btn-warnings')?.addEventListener('click', () => {
        uiState.showValenceWarnings = !uiState.showValenceWarnings;
        const btn = document.getElementById('btn-warnings');
        if (btn) {
            if (uiState.showValenceWarnings) {
                btn.innerText = "Warnings: On";
                btn.style.backgroundColor = "#ffcccc"; 
            } else {
                btn.innerText = "Warnings: Off";
                btn.style.backgroundColor = "#ccffcc"; 
            }
        }
        render();
    });

    document.getElementById('btn-clean')?.addEventListener('click', async () => {
        const smiles = generateSmiles(state.getAtoms(), state.getBonds());
        if (!smiles) {
            alert("Das Zeichenbrett ist leer.");
            return;
        }
        
        try {
            document.body.style.cursor = "wait";
            const cleanSdf = await generate2DModelPython(smiles);
            
            applySdfToCanvas(cleanSdf, render, false); 
            
        } catch (e) {
            alert("Cleanup fehlgeschlagen: " + (e as Error).message);
        } finally {
            document.body.style.cursor = "default";
        }
    });

    // Charges
    document.getElementById('btn-charge-plus')?.addEventListener('click', () => setMode("charge_plus"));
    document.getElementById('btn-charge-minus')?.addEventListener('click', () => setMode("charge_minus"));
    document.getElementById('btn-radical')?.addEventListener('click', () => setMode("radical"));
}