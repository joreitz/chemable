import { MOLECULE_TEMPLATES } from "../templates";
import { insertTemplate } from "../chemistry/template-manager";

export function initTemplateMenu(render: () => void) {
    const container = document.getElementById('template-dropdown');
    if (container) {
        container.innerHTML = ''; 
        Object.keys(MOLECULE_TEMPLATES).forEach(name => {
            const btn = document.createElement('button');
            btn.innerText = name;
            btn.onclick = () => insertTemplate(name, render);
            container.appendChild(btn);
        });
    }

    const smilesDialog = document.getElementById('smiles-dialog');
    const smilesInput = document.getElementById('smiles-input') as HTMLInputElement;

    document.getElementById('smiles-btn-import')?.addEventListener('click', () => {
        const inputStr = smilesInput.value.trim();
        if (inputStr) {
            insertTemplate(inputStr, render); 
        }
        if (smilesDialog) smilesDialog.style.display = 'none';
    });
}