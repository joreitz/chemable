import { state } from "../state";
import { saveSelectionAsTemplate } from "../chemistry/user-templates";
import { refreshTemplateMenu } from "./template-menu";

let menuEl: HTMLDivElement | null = null;
let dlgEl: HTMLDivElement | null = null;
let renderFn: () => void = () => {};

export function initContextMenu(render: () => void) {
    renderFn = render;
    menuEl = document.getElementById("canvas-context-menu") as HTMLDivElement;
    dlgEl = document.getElementById("tpl-save-dialog") as HTMLDivElement;

    document.addEventListener("mousedown", e => {
        if (menuEl && menuEl.style.display === "block" && !menuEl.contains(e.target as Node)) closeContextMenu();
    }, true);
    document.addEventListener("keydown", e => { if (e.key === "Escape") { closeContextMenu(); closeSaveDialog(); } });

    document.getElementById("tpl-save-ok")?.addEventListener("click", () => {
        const inp = document.getElementById("tpl-save-name") as HTMLInputElement;
        const res = saveSelectionAsTemplate(inp.value.trim());
        alert(res.msg);
        if (res.ok) { refreshTemplateMenu(renderFn); closeSaveDialog(); }
    });
    document.getElementById("tpl-save-cancel")?.addEventListener("click", closeSaveDialog);
}

export function closeContextMenu() { if (menuEl) menuEl.style.display = "none"; }
function closeSaveDialog() { if (dlgEl) dlgEl.style.display = "none"; }

export function openContextMenu(clientX: number, clientY: number) {
    if (!menuEl) return;
    const n = state.getSelectedAtomIds().size;
    const items = [
        { label: `Save as template…  (${n})`, off: n < 2, run: openSaveDialog },
        { label: "Duplicate", off: n < 1, run: duplicateSelection },
        { label: "Delete", off: n < 1, run: deleteSelection },
        { label: "Clear selection", off: n < 1, run: () => { state.clearSelection(); renderFn(); } },
    ];
    menuEl.innerHTML = "";
    items.forEach(it => {
        const b = document.createElement("button");
        b.textContent = it.label; b.disabled = it.off;
        b.onclick = () => { closeContextMenu(); it.run(); };
        menuEl!.appendChild(b);
    });
    menuEl.style.left = clientX + "px";
    menuEl.style.top = clientY + "px";
    menuEl.style.display = "block";
}

function openSaveDialog() {
    if (!dlgEl) return;
    const inp = document.getElementById("tpl-save-name") as HTMLInputElement;
    inp.value = ""; dlgEl.style.display = "block"; inp.focus();
}

function duplicateSelection() {
    const atoms = state.getAtoms(), bonds = state.getBonds(), sel = state.getSelectedAtomIds();
    state.saveState();
    const map = new Map<number, number>();
    atoms.filter(a => sel.has(a.id)).forEach(a => {
        const id = state.getNextId(); map.set(a.id, id);
        state.addAtom({ ...a, id, x: a.x + 30, y: a.y + 30 });
    });
    bonds.filter(b => sel.has(b.id1) && sel.has(b.id2))
         .forEach(b => state.addBond({ ...b, id1: map.get(b.id1)!, id2: map.get(b.id2)! }));
    state.selectAtoms([...map.values()]);
    renderFn();
}

function deleteSelection() {
    const sel = state.getSelectedAtomIds();
    state.saveState();
    state.setBonds(state.getBonds().filter(b => !sel.has(b.id1) && !sel.has(b.id2)));
    state.setAtoms(state.getAtoms().filter(a => !sel.has(a.id)));
    state.clearSelection();
    renderFn();
}