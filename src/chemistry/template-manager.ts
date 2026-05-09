// src/chemistry/template-manager.ts
import { state } from "../state";
import { uiState } from "../core/ui-state";
import { MOLECULE_TEMPLATES, TemplateData } from "../templates";
import { Atom, Bond } from "../types";
import { findAtomNearPosition, getBondAtCoords } from "../geometry";
import { setMode } from "../ui/toolbar";

export let pendingTemplate: TemplateData | null = null;
export let pendingTemplatePreview: { atoms: Atom[], bonds: Bond[] } | null = null;
export let templateTargetAtom: Atom | null = null;
export let templateTargetBond: Bond | null = null;

export function insertTemplate(templateName: string, render: () => void) {
    pendingTemplate = MOLECULE_TEMPLATES[templateName];
    if (!pendingTemplate) return;
    
    setMode("draw"); 
    state.clearSelection(); 
    render();
}

export function calcTemplatePreview(x: number, y: number) {
    if (!pendingTemplate) return null;

    const atoms = state.getAtoms();
    const bonds = state.getBonds();
    
    templateTargetAtom = null;
    templateTargetBond = null;

    const hitAtom = findAtomNearPosition(x, y, atoms, 20);
    const hitBond = !hitAtom ? getBondAtCoords(x, y, bonds, atoms) : null;

    const tBond0 = pendingTemplate.bonds[0];
    const origA1 = pendingTemplate.atoms.find(a => a.id === tBond0.id1)!;
    const origA2 = pendingTemplate.atoms.find(a => a.id === tBond0.id2)!;
    const tOrigDist = Math.sqrt((origA2.x - origA1.x)**2 + (origA2.y - origA1.y)**2) || 40;

    let scale = uiState.currentBondLength / tOrigDist; 

    if (hitBond) {
        const a1 = atoms.find(a => a.id === hitBond.id1)!;
        const a2 = atoms.find(a => a.id === hitBond.id2)!;
        const targetDist = Math.sqrt((a2.x - a1.x)**2 + (a2.y - a1.y)**2);
        scale = targetDist / tOrigDist; 
    }

    const tAtoms: Atom[] = pendingTemplate.atoms.map(a => ({ id: a.id, element: a.element, x: a.x * scale, y: a.y * scale }));
    const tBonds: Bond[] = pendingTemplate.bonds.map(b => ({ ...b }));

    if (hitAtom) {
        templateTargetAtom = hitAtom;
        
        const rootT = tAtoms[0]; 
        const rootTx = rootT.x;
        const rootTy = rootT.y;
        
        const neighbors = bonds
            .filter(b => b.id1 === hitAtom.id || b.id2 === hitAtom.id)
            .map(b => atoms.find(a => a.id === (b.id1 === hitAtom.id ? b.id2 : b.id1)))
            .filter((a): a is Atom => !!a);
        
        let targetAngle = 0;
        if (neighbors.length === 0) {
            const rawAngle = Math.atan2(y - hitAtom.y, x - hitAtom.x);
            targetAngle = Math.round(rawAngle / (Math.PI/6)) * (Math.PI/6);
        } else if (neighbors.length === 1) {
            targetAngle = Math.atan2(hitAtom.y - neighbors[0].y, hitAtom.x - neighbors[0].x) + Math.PI;
        } else {
            let angles = neighbors.map(n => Math.atan2(n.y - hitAtom.y, n.x - hitAtom.x)).sort((a, b) => a - b);
            let maxGap = 0, bestAngle = 0;
            for(let i=0; i<angles.length; i++) {
                const next = (i+1) % angles.length;
                let gap = angles[next] - angles[i];
                if (gap < 0) gap += 2*Math.PI;
                if (gap > maxGap) { maxGap = gap; bestAngle = angles[i] + gap/2; }
            }
            targetAngle = bestAngle;
        }

        const attachX = hitAtom.x + Math.cos(targetAngle) * uiState.currentBondLength;
        const attachY = hitAtom.y + Math.sin(targetAngle) * uiState.currentBondLength;

        let cx = 0, cy = 0;
        tAtoms.forEach(a => { cx += a.x; cy += a.y; });
        cx /= tAtoms.length; cy /= tAtoms.length;
        
        const centerAngle = Math.atan2(cy - rootTy, cx - rootTx);
        const rotation = targetAngle - centerAngle;

        tAtoms.forEach(a => {
            const rx = a.x - rootTx;
            const ry = a.y - rootTy;
            a.x = attachX + rx * Math.cos(rotation) - ry * Math.sin(rotation);
            a.y = attachY + rx * Math.sin(rotation) + ry * Math.cos(rotation);
        });

    } else if (hitBond) {
        templateTargetBond = hitBond;
        const a1 = atoms.find(a => a.id === hitBond.id1)!;
        const a2 = atoms.find(a => a.id === hitBond.id2)!;
        
        const targetVec = { x: a2.x - a1.x, y: a2.y - a1.y };
        const targetAngle = Math.atan2(targetVec.y, targetVec.x);

        const tBond = tBonds[0];
        const ta1 = tAtoms.find(a => a.id === tBond.id1)!;
        const ta2 = tAtoms.find(a => a.id === tBond.id2)!;
        const ta1x = ta1.x;
        const ta1y = ta1.y;
        const ta2x = ta2.x;
        const ta2y = ta2.y;

        const tAngle = Math.atan2(ta2y - ta1y, ta2x - ta1x);
        const rotation = targetAngle - tAngle;
        
        let cx = 0, cy = 0;
        tAtoms.forEach(a => { cx += a.x; cy += a.y; });
        cx /= tAtoms.length; cy /= tAtoms.length;

        const relCx = cx - ta1x;
        const relCy = cy - ta1y;
        const rotCx = relCx * Math.cos(rotation) - relCy * Math.sin(rotation);
        const rotCy = relCx * Math.sin(rotation) + relCy * Math.cos(rotation);
        
        const centerCross = rotCx * targetVec.y - rotCy * targetVec.x;
        const mouseCross = (x - a1.x) * targetVec.y - (y - a1.y) * targetVec.x;
        
        const needsFlip = Math.sign(mouseCross) !== Math.sign(centerCross);

        tAtoms.forEach(a => {
            let relX = a.x - ta1x; 
            let relY = a.y - ta1y;
            
            if (needsFlip) {
                const angleT = Math.atan2(ta2y - ta1y, ta2x - ta1x);
                let rx = relX * Math.cos(-angleT) - relY * Math.sin(-angleT);
                let ry = relX * Math.sin(-angleT) + relY * Math.cos(-angleT);
                ry = -ry; 
                relX = rx * Math.cos(angleT) - ry * Math.sin(angleT);
                relY = rx * Math.sin(angleT) + ry * Math.cos(angleT);
            }

            const rotX = relX * Math.cos(rotation) - relY * Math.sin(rotation);
            const rotY = relX * Math.sin(rotation) + relY * Math.cos(rotation);
            a.x = a1.x + rotX; 
            a.y = a1.y + rotY;
        });

    } else {
        let cx = 0, cy = 0;
        tAtoms.forEach(a => { cx += a.x; cy += a.y; });
        cx /= tAtoms.length; cy /= tAtoms.length;
        tAtoms.forEach(a => { a.x = x + (a.x - cx); a.y = y + (a.y - cy); });
    }

    return { atoms: tAtoms, bonds: tBonds };
}

export function clearPendingTemplate() {
    pendingTemplate = null;
}

export function cancelTemplate(render: () => void) {
    pendingTemplate = null;
    pendingTemplatePreview = null;
    render();
}

export function updateTemplatePreview(x: number, y: number, render: () => void) {
    if (!pendingTemplate) return false;
    
    pendingTemplatePreview = calcTemplatePreview(x, y); 
    render();
    return true;
}

export function placeTemplate(render: () => void) {
    if (!pendingTemplatePreview) return false;

    state.saveState();
    const idMap = new Map<number, number>();
    const skipAtoms = new Set<number>(); 
    
    if (templateTargetBond) {
        idMap.set(pendingTemplatePreview.bonds[0].id1, templateTargetBond.id1);
        idMap.set(pendingTemplatePreview.bonds[0].id2, templateTargetBond.id2);
        skipAtoms.add(pendingTemplatePreview.bonds[0].id1);
        skipAtoms.add(pendingTemplatePreview.bonds[0].id2);
        
        if (pendingTemplatePreview.bonds[0].type > templateTargetBond.type) {
            templateTargetBond.type = pendingTemplatePreview.bonds[0].type;
        }
    }

    pendingTemplatePreview.atoms.forEach(a => {
        if (!skipAtoms.has(a.id)) {
            const newId = state.getNextId();
            idMap.set(a.id, newId);
            state.addAtom({ ...a, id: newId });
        }
    });

    pendingTemplatePreview.bonds.forEach(b => {
        if (templateTargetBond && 
           ((b.id1 === pendingTemplatePreview!.bonds[0].id1 && b.id2 === pendingTemplatePreview!.bonds[0].id2) || 
            (b.id1 === pendingTemplatePreview!.bonds[0].id2 && b.id2 === pendingTemplatePreview!.bonds[0].id1))) return;

        const newId1 = idMap.get(b.id1)!;
        const newId2 = idMap.get(b.id2)!;
        
        const exists = state.getBonds().some(ex => (ex.id1 === newId1 && ex.id2 === newId2) || (ex.id1 === newId2 && ex.id2 === newId1));
        if (!exists) state.addBond({ id1: newId1, id2: newId2, type: b.type });
    });

    if (templateTargetAtom) {
        const rootTemplateAtomId = idMap.get(pendingTemplatePreview.atoms[0].id)!;
        state.addBond({ id1: templateTargetAtom.id, id2: rootTemplateAtomId, type: 1 });
    }

    pendingTemplate = null;
    pendingTemplatePreview = null;
    render();
    return true;
}