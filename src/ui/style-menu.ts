// src/ui/style-menu.ts
import { state } from "../state";
import { uiState } from "../core/ui-state";

export function initStyleMenu(render: () => void) {
   
    const fontSlider = document.getElementById('font-size-slider') as HTMLInputElement;
    if (fontSlider) fontSlider.value = uiState.currentFontSize.toString()
    const fontVal = document.getElementById('font-size-val');
    fontSlider?.addEventListener('input', () => {
        uiState.currentFontSize = parseInt(fontSlider.value);
        if (fontVal) fontVal.innerText = uiState.currentFontSize.toString();
        render();
    });

    // --- BINDUNGSLÄNGE (SKALIERUNG) ---
    const bondLengthSlider = document.getElementById('bond-length-slider') as HTMLInputElement;
    const bondLengthVal = document.getElementById('bond-length-val');
    let preSlideStateSaved = false;

    bondLengthSlider?.addEventListener('input', (e) => {
        if (!preSlideStateSaved) { state.saveState(); preSlideStateSaved = true; }

        const newLength = parseInt(bondLengthSlider.value);
        if (bondLengthVal) bondLengthVal.innerText = newLength.toString();

        const atoms = state.getAtoms();
        if (atoms.length > 0) {
            const factor = newLength / uiState.currentBondLength;
            let centerX = 0, centerY = 0;
            for (const a of atoms) { centerX += a.x; centerY += a.y; }
            centerX /= atoms.length;

            for (const a of atoms) {
                a.x = centerX + (a.x - centerX) * factor;
                a.y = centerY + (a.y - centerY) * factor;
            }
        }
        uiState.currentBondLength = newLength;
        render();
    });
    bondLengthSlider?.addEventListener('change', () => { preSlideStateSaved = false; });

    // --- STYLE PANEL (Farbe, Abstand, Schriftart) ---
    const stylePanel = document.getElementById('style-panel');
    const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
    const spacingSlider = document.getElementById('bond-spacing-slider') as HTMLInputElement;
    const spacingVal = document.getElementById('bond-spacing-val');
    const fontSelect = document.getElementById('font-family-select') as HTMLSelectElement;

    document.getElementById('btn-style-menu')?.addEventListener('click', () => {
        if (stylePanel) stylePanel.style.display = stylePanel.style.display === 'block' ? 'none' : 'block';
    });
    document.getElementById('btn-close-style-panel')?.addEventListener('click', () => {
        if (stylePanel) stylePanel.style.display = 'none';
    });

    let preStyleStateSaved = false;
    colorPicker?.addEventListener('change', () => { preStyleStateSaved = false; });
    spacingSlider?.addEventListener('change', () => { preStyleStateSaved = false; });

    colorPicker?.addEventListener('input', () => {
        const newColor = colorPicker.value;
        const selectedIds = state.getSelectedAtomIds();
        if (!preStyleStateSaved) { state.saveState(); preStyleStateSaved = true; }
        
        if (selectedIds.size > 0) {
            state.getAtoms().forEach(a => { if (selectedIds.has(a.id)) a.color = newColor; });
            state.getBonds().forEach(b => { if (selectedIds.has(b.id1) && selectedIds.has(b.id2)) b.color = newColor; });
        } else {
            uiState.globalColor = newColor; 
        }
        render();
    });

    spacingSlider?.addEventListener('input', () => {
        const newSpacing = parseFloat(spacingSlider.value);
        if (spacingVal) spacingVal.innerText = newSpacing.toString();
        const selectedIds = state.getSelectedAtomIds();
        
        if (!preStyleStateSaved) { state.saveState(); preStyleStateSaved = true; }
        
        if (selectedIds.size > 0) {
            state.getBonds().forEach(b => { if (selectedIds.has(b.id1) && selectedIds.has(b.id2)) b.spacing = newSpacing; });
        } else {
            uiState.globalBondSpacing = newSpacing;
        }
        render();
    });

    fontSelect?.addEventListener('change', () => {
        const newFont = fontSelect.value;
        const selectedIds = state.getSelectedAtomIds();
        state.saveState();
        if (selectedIds.size > 0) {
            state.getAtoms().forEach(a => { if (selectedIds.has(a.id)) a.fontFamily = newFont; });
        } else {
            uiState.globalFontFamily = newFont;
        }
        render();
    });
}