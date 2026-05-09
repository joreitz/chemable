// src/core/clipboard.ts
import { clipboard, nativeImage } from 'electron';
import { state } from "../state";
import { uiState } from "./ui-state";
import { setMode } from "../ui/toolbar";
import { generateSVG } from "../export";
import { Atom, Bond } from "../types";

let clipboardData: { atoms: Atom[], bonds: Bond[] } | null = null;

export function copySelection() {
    const selectedIds = state.getSelectedAtomIds();
    if (selectedIds.size === 0) return;
    
    const atoms = state.getAtoms().filter(a => selectedIds.has(a.id));
    const bonds = state.getBonds().filter(b => selectedIds.has(b.id1) && selectedIds.has(b.id2));
    
    clipboardData = JSON.parse(JSON.stringify({ atoms, bonds }));

    const svgString = generateSVG(state.getAtoms(), state.getBonds(), selectedIds, uiState.currentFontSize);
    
    if (svgString) {
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        const img = new Image();
        img.onload = () => {
            const tempCanvas = document.createElement('canvas');
            const scale = 4; 
            tempCanvas.width = img.width * scale;
            tempCanvas.height = img.height * scale;
            const tCtx = tempCanvas.getContext('2d');
            
            if (tCtx) {
                tCtx.fillStyle = '#ffffff';
                tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                tCtx.scale(scale, scale); 
                tCtx.drawImage(img, 0, 0);
                
                const pngDataUrl = tempCanvas.toDataURL('image/png');
                
                const htmlString = `
                    <html>
                    <body>
                        <img src="${pngDataUrl}" width="${img.width}" height="${img.height}" />
                    </body>
                    </html>
                `;
                
                clipboard.write({
                    html: htmlString,
                    image: nativeImage.createFromDataURL(pngDataUrl)
                });
                console.log("Kopiert (Daten im HTML-Kommentar versteckt)");
            }
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }
}

export function pasteSelection(render: () => void) {
    state.saveState();
    
    let pastedAtoms: Atom[] | null = null;
    let pastedBonds: Bond[] | null = null;
    const sysHtml = clipboard.readHTML() || "";

    const match = sysHtml.match(/CHEMABLE_JSON_START (.*?) CHEMABLE_JSON_END/);
    if (match && match[1]) {
        try {
            const parsed = JSON.parse(match[1]);
            pastedAtoms = parsed.atoms;
            pastedBonds = parsed.bonds;
        } catch(e) {}
    }

    if (!pastedAtoms && clipboardData) {
        pastedAtoms = JSON.parse(JSON.stringify(clipboardData.atoms));
        pastedBonds = JSON.parse(JSON.stringify(clipboardData.bonds));
    }

    if (!pastedAtoms || pastedAtoms.length === 0) return;

    const idMap = new Map<number, number>();
    const pastedAtomIds: number[] = [];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pastedAtoms.forEach(a => {
        minX = Math.min(minX, a.x); minY = Math.min(minY, a.y);
        maxX = Math.max(maxX, a.x); maxY = Math.max(maxY, a.y);
    });
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const dx = uiState.currentMouseX - centerX;
    const dy = uiState.currentMouseY - centerY;

    pastedAtoms.forEach(a => {
        const newId = state.getNextId();
        idMap.set(a.id, newId);
        state.addAtom({ ...a, id: newId, x: a.x + dx, y: a.y + dy });
        pastedAtomIds.push(newId);
    });

    if (pastedBonds) {
        pastedBonds.forEach(b => {
            state.addBond({ ...b, id1: idMap.get(b.id1)!, id2: idMap.get(b.id2)! });
        });
    }

    state.clearSelection();
    state.selectAtoms(pastedAtomIds);
    setMode("select"); 
    
    uiState.isDraggingSelection = true;
    uiState.dragStartX = uiState.currentMouseX;
    uiState.dragStartY = uiState.currentMouseY;
    
    render();
}

export function cutSelection(render: () => void) {
    copySelection(); 
    if (state.getSelectedAtomIds().size === 0) return;
    
    state.saveState();
    const selectedIds = state.getSelectedAtomIds();
    state.setAtoms(state.getAtoms().filter(a => !selectedIds.has(a.id)));
    state.setBonds(state.getBonds().filter(b => !selectedIds.has(b.id1) && !selectedIds.has(b.id2)));
    state.clearSelection();
    render();
}