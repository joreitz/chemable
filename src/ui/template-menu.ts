// src/ui/template-menu.ts   (VOLLSTÄNDIGER ERSATZ)
import { MOLECULE_TEMPLATES } from "../templates";
import { insertTemplate } from "../chemistry/template-manager";
import { mergeUserTemplates, isUserTemplate, deleteUserTemplate } from "../chemistry/user-templates";

export function refreshTemplateMenu(render: () => void) {
    const container = document.getElementById('template-dropdown');
    if (!container) return;
    container.innerHTML = '';
    Object.keys(MOLECULE_TEMPLATES).forEach(name => {
        const row = document.createElement('div');
        row.style.cssText = "display:flex; align-items:center;";
        const btn = document.createElement('button');
        btn.innerText = name; btn.style.flex = "1";
        btn.onclick = () => insertTemplate(name, render);
        row.appendChild(btn);
        if (isUserTemplate(name)) {
            const del = document.createElement('button');
            del.innerText = "×"; del.title = "Delete template";
            del.style.cssText = "width:28px; flex:0 0 28px; color:#c00;";
            del.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Delete template "${name}"?`)) { deleteUserTemplate(name); refreshTemplateMenu(render); }
            };
            row.appendChild(del);
        }
        container.appendChild(row);
    });
}

export function initTemplateMenu(render: () => void) {
    mergeUserTemplates();
    refreshTemplateMenu(render);

    const smilesDialog = document.getElementById('smiles-dialog');
    const smilesInput = document.getElementById('smiles-input') as HTMLInputElement;
    document.getElementById('smiles-btn-import')?.addEventListener('click', () => {
        const s = smilesInput.value.trim();
        if (s) insertTemplate(s, render);
        if (smilesDialog) smilesDialog.style.display = 'none';
    });
}