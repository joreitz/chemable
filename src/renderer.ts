export let verboose = true;
if (verboose) { console.log("Renderer will be loaded...") };

// --- IMPORTS ---
import { analyzerPlugin } from "./plugins/analyzer";
import { ehtPlugin } from "./plugins/eht";
import { initKnowItAll } from "./plugins/knowitall";
import { registerPlugin, triggerPluginStateChange } from "./plugin-manager";
registerPlugin(analyzerPlugin);

import { state } from "./state";
import { drawScene } from "./draw";
import { uiState } from "./core/ui-state";
import { init3DViewer } from "./viewer3d";

// --- MODULE IMPORTS ---
import { initToolbar } from "./ui/toolbar";
import { initMouseHandler } from "./core/mouse-interactions";
import { initHotkeys } from "./core/hotkeys";
import { initFileManager } from "./io/file-manager";
import { initTemplateMenu } from "./ui/template-menu";
import { initTextEditor } from "./ui/text-editor";
import { initPSEMenu } from "./ui/pse-menu";
import { initStyleMenu } from "./ui/style-menu";
import { pendingTemplatePreview, templateTargetAtom } from "./chemistry/template-manager";

const canvas = document.getElementById('chemBoard') as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// --- RENDER-FUNKTION ---
function render() {
    drawScene(ctx, canvas.width, canvas.height, state.getAtoms(), state.getBonds(), {
        showValenceWarnings: uiState.showValenceWarnings,
        showGrid: uiState.showGrid,
        panX: uiState.panX,
        panY: uiState.panY,
        selectedAtomId: null, 
        dragStartAtom: uiState.dragStartAtom,
        mousePos: { x: uiState.currentMouseX, y: uiState.currentMouseY },
        lassoPath: uiState.lassoPath,
        selectedAtomIds: state.getSelectedAtomIds(),
        fontSize: uiState.currentFontSize, 
        globalBondSpacing: uiState.globalBondSpacing,
        globalFontFamily: uiState.globalFontFamily,
        globalColor: uiState.globalColor,
        showImplicitHydrogens: uiState.showImplicitHydrogens
    });

    if (pendingTemplatePreview) {
        ctx.save();
        ctx.globalAlpha = 0.4; 
        ctx.strokeStyle = "#007bff";
        ctx.fillStyle = "#007bff";
        ctx.lineWidth = 2;
        
        if (templateTargetAtom) {
            ctx.beginPath();
            ctx.moveTo(templateTargetAtom.x + uiState.panX, templateTargetAtom.y + uiState.panY);
            ctx.lineTo(pendingTemplatePreview.atoms[0].x + uiState.panX, pendingTemplatePreview.atoms[0].y + uiState.panY);
            ctx.stroke();
        }
        
        pendingTemplatePreview.bonds.forEach(b => {
            const a1 = pendingTemplatePreview!.atoms.find(a => a.id === b.id1);
            const a2 = pendingTemplatePreview!.atoms.find(a => a.id === b.id2);
            if(a1 && a2) {
                ctx.beginPath();
                ctx.moveTo(a1.x + uiState.panX, a1.y + uiState.panY);
                ctx.lineTo(a2.x + uiState.panX, a2.y + uiState.panY);
                ctx.stroke();
            }
        });
        
        pendingTemplatePreview.atoms.forEach(a => {
            ctx.beginPath();
            ctx.arc(a.x + uiState.panX, a.y + uiState.panY, 4, 0, 2*Math.PI);
            ctx.fill();
        });
        ctx.restore();
    }
    triggerPluginStateChange();
}

// --- UNDO ---
function performUndo() {
    if (state.undo()) render();
}

// --- FENSTER-DRAG ---
function makeDraggable(elementId: string) {
    const elmnt = document.getElementById(elementId);
    if (!elmnt) return;
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    elmnt.onmousedown = (e) => {
        const targetTag = (e.target as HTMLElement).tagName;
        if (targetTag === 'BUTTON' || targetTag === 'INPUT' || targetTag === 'SELECT') return;
        e.preventDefault();
        pos3 = e.clientX; pos4 = e.clientY;
        document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
        document.onmousemove = (e) => {
            e.preventDefault();
            pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
            pos3 = e.clientX; pos4 = e.clientY;
            elmnt!.style.top = (elmnt!.offsetTop - pos2) + "px";
            elmnt!.style.left = (elmnt!.offsetLeft - pos1) + "px";
        };
    };
}

// --- INITIALISIERUNG ---
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
}

window.addEventListener('resize', resizeCanvas);

// UI Draggables
makeDraggable("menubar");
makeDraggable("toolbar");
makeDraggable("pse-menu");
makeDraggable("style-panel");

// Module starten
init3DViewer(render);
initToolbar(render, performUndo);
initMouseHandler(canvas, render);
initHotkeys(canvas, render, performUndo);
initFileManager(render);
initTemplateMenu(render);
initTextEditor(render);
initPSEMenu();
initStyleMenu(render);
initKnowItAll(render);
// Erster Start
resizeCanvas();