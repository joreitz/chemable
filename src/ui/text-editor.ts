import { state } from "../state";
import { Atom } from "../types";
import { uiState } from "../core/ui-state";

export let atomToEdit: Atom | null = null;

export function openTextEditor(atom: Atom, canvas: HTMLCanvasElement) {
    const textEditorDiv = document.getElementById('custom-text-editor')!;
    const textEditorInput = document.getElementById('custom-text-input') as HTMLInputElement;
    const textEditorFlip = document.getElementById('custom-text-flip') as HTMLInputElement;
    const textEditorAlign = document.getElementById('custom-text-align') as HTMLInputElement;

    atomToEdit = atom;
    const rect = canvas.getBoundingClientRect();
    textEditorDiv.style.left = (atom.x + uiState.panX + rect.left) + 'px';
    textEditorDiv.style.top = (atom.y + uiState.panY + rect.top - 50) + 'px';
    textEditorDiv.style.display = 'block';
    textEditorInput.value = atom.customLabel || "";
    textEditorFlip.checked = atom.autoFlip || false;
    textEditorAlign.checked = atom.alignFirstLetter || false;
    setTimeout(() => textEditorInput.focus(), 10);
}

export function initTextEditor(render: () => void) {
    const textEditorDiv = document.getElementById('custom-text-editor')!;
    const textEditorInput = document.getElementById('custom-text-input') as HTMLInputElement;
    const textEditorFlip = document.getElementById('custom-text-flip') as HTMLInputElement;
    const textEditorAlign = document.getElementById('custom-text-align') as HTMLInputElement;

    function saveCustomText() {
        if (atomToEdit) {
            state.saveState();
            const val = textEditorInput.value.trim();
            atomToEdit.customLabel = val === "" ? undefined : val;
            atomToEdit.autoFlip = textEditorFlip.checked;
            atomToEdit.alignFirstLetter = textEditorAlign.checked;
            atomToEdit = null;
            textEditorDiv.style.display = 'none';
            render();
        }
    }

    document.getElementById('custom-text-save')?.addEventListener('click', saveCustomText);
    textEditorInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveCustomText();
        if (e.key === 'Escape') {
            atomToEdit = null;
            textEditorDiv.style.display = 'none';
        }
    });
}