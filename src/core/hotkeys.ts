// src/core/hotkeys.ts
import { uiState } from "./ui-state";
import { state } from "../state";
import { setMode } from "../ui/toolbar";
import { copySelection, pasteSelection, cutSelection } from "./clipboard";
import { pendingTemplate, cancelTemplate } from "../chemistry/template-manager";
import { findAtomNearPosition } from "../geometry";
import { openTextEditor } from "../ui/text-editor";

let hotkeys = JSON.parse(localStorage.getItem('chemable-hotkeys') || '{"copy":"c","paste":"v","cut":"x","undo":"z","text":"t","draw":"d","move":"m","erase":"e","select":"l","arrow":"a"}');

export function initHotkeys(canvas: HTMLCanvasElement, render: () => void, performUndo: () => void) {
    
    // --- KEYDOWN LISTENER ---
    document.addEventListener('keydown', (event) => {
        if (event.target instanceof HTMLInputElement) return;

        const key = event.key.toLowerCase();
        const isCtrl = event.ctrlKey || event.metaKey;
        
        if (key === 'escape' && pendingTemplate) {
            cancelTemplate(render);
            return;
        }

        if (isCtrl && key === hotkeys.copy) { copySelection(); event.preventDefault(); }
        else if (isCtrl && key === hotkeys.paste) { pasteSelection(render); event.preventDefault(); }
        else if (isCtrl && key === hotkeys.cut) { cutSelection(render); event.preventDefault(); }
        else if (isCtrl && key === hotkeys.undo) { performUndo(); event.preventDefault(); }
        
        else if (!isCtrl) {
            if (key === hotkeys.draw) { setMode("draw"); }
            else if (key === hotkeys.move) { setMode("move"); }
            else if (key === hotkeys.erase) { setMode("erase"); }
            else if (key === hotkeys.select) { setMode("select"); }
            else if (key === hotkeys.arrow) { setMode("arrow"); }
            
            else if (key === hotkeys.text) {
                const atoms = state.getAtoms();
                const hoveredAtom = findAtomNearPosition(uiState.currentMouseX, uiState.currentMouseY, atoms, 20);
                if (hoveredAtom) {
                    openTextEditor(hoveredAtom, canvas);
                    event.preventDefault();
                } else if (uiState.editMode !== "text") {
                    setMode("text");
                }
            }
        }

        // Ladungen und Radikale
        if (key === '+' || key === '-' || key === '*') {
            const atoms = state.getAtoms();
            const hoveredAtom = findAtomNearPosition(uiState.currentMouseX, uiState.currentMouseY, atoms, 20);
            if (hoveredAtom) {
                state.saveState(); 
                if (key === '+') {
                    hoveredAtom.charge = (hoveredAtom.charge || 0) + 1;
                    if (hoveredAtom.charge > 3) hoveredAtom.charge = 3; 
                } else if (key === '-') {
                    hoveredAtom.charge = (hoveredAtom.charge || 0) - 1;
                    if (hoveredAtom.charge < -3) hoveredAtom.charge = -3; 
                } else if (key === '*') {
                    hoveredAtom.radical = !hoveredAtom.radical; 
                }
                render();
            }
        }
    });

    // --- HOTKEY DIALOG LOGIK ---
    const hotkeyDialog = document.getElementById('hotkeys-dialog');
    document.getElementById('btn-hotkeys')?.addEventListener('click', () => {
        (document.getElementById('hk-copy') as HTMLInputElement).value = hotkeys.copy || 'c';
        (document.getElementById('hk-paste') as HTMLInputElement).value = hotkeys.paste || 'v';
        (document.getElementById('hk-cut') as HTMLInputElement).value = hotkeys.cut || 'x';
        (document.getElementById('hk-undo') as HTMLInputElement).value = hotkeys.undo || 'z';
        (document.getElementById('hk-text') as HTMLInputElement).value = hotkeys.text || 't';
        if (hotkeyDialog) hotkeyDialog.style.display = 'block';
    });

    document.getElementById('hk-btn-close')?.addEventListener('click', () => {
        if (hotkeyDialog) hotkeyDialog.style.display = 'none';
    });

    document.getElementById('hk-btn-save')?.addEventListener('click', () => {
        hotkeys.copy = (document.getElementById('hk-copy') as HTMLInputElement).value.toLowerCase() || 'c';
        hotkeys.paste = (document.getElementById('hk-paste') as HTMLInputElement).value.toLowerCase() || 'v';
        hotkeys.cut = (document.getElementById('hk-cut') as HTMLInputElement).value.toLowerCase() || 'x';
        hotkeys.undo = (document.getElementById('hk-undo') as HTMLInputElement).value.toLowerCase() || 'z';
        hotkeys.text = (document.getElementById('hk-text') as HTMLInputElement).value.toLowerCase() || 't';
        
        localStorage.setItem('chemable-hotkeys', JSON.stringify(hotkeys));
        if (hotkeyDialog) hotkeyDialog.style.display = 'none';
    });
}