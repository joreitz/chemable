export let verboose = true;
if (verboose) {console.log("🚀 Renderer.ts wird geladen...")} ;

import { ChemablePlugin, ChemableContext } from "./plugin-api";
import { registerPlugin } from "./plugin-manager";
import { analyzerPlugin } from "./plugins/analyzer";
import { ehtPlugin } from "./plugins/eht";
import { ipcRenderer, clipboard, nativeImage } from 'electron';
registerPlugin(analyzerPlugin);

import { state } from "./state";
import { Atom, Bond } from "./types";
import { findAtomNearPosition, getBondAtCoords, isPointInPolygon, rotatePoint, centerOfPoints, angleOfMouseMovement } from "./geometry";
import { applyAutoLayout, calculateNewAtomPosition } from "./chemistry";
import { drawScene } from "./draw";
import { periodicTable } from "./pse";
import { elementLayout } from "./pse_layout";
import * as fs from 'fs';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import { generateSmiles, parseSmiles } from './smiles';
import { init3DViewer } from "./viewer3d";
import { generateSVG, generateXYZ, convertSdfToXyz } from "./export";
import { MOLECULE_TEMPLATES, TemplateData } from "./templates";

//Template Variablen
let pendingTemplate: TemplateData | null = null;
let pendingTemplatePreview: { atoms: Atom[], bonds: Bond[] } | null = null;
let templateTargetAtom: Atom | null = null;
let templateTargetBond: Bond | null = null;

// Lokale UI-Variablen 
let editMode: "draw" | "move" | "erase" | "select" | "text" | "arrow" = "draw";
let currentFontSize = 16;
let showValenceWarnings = true;
let showGrid = false;
let currentBondLength = 60; 
let currentBondType = 1; // 1 = Normal, 5 = Keil (Wedge), 6 = Gestrichelt (Dash)

// Für das Auswahl-Tool
let lassoPath: {x: number, y: number}[] = []; 
let isDraggingSelection = false; 
let isRotating = false;
let rotationcenter: {x: number, y: number};
let initialAtomPosition = new Map<number, { x: number, y: number }>();

// Maus-Status
let dragStartAtom: Atom | null = null;
let dragStartX = 0;
let dragStartY = 0;
let currentMouseX = 0;
let currentMouseY = 0;
let movingAtom: Atom | null = null;

// Canvas Setup
const canvas = document.getElementById('chemBoard') as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
let panX = 0;
let panY = 0;
let isPanning = false;
let lastPanMouseX = 0;
let lastPanMouseY = 0;

let globalBondSpacing = 5;
let globalFontFamily = "Arial";
let globalColor = "#000000";

function insertTemplate(templateName: string) {
    pendingTemplate = MOLECULE_TEMPLATES[templateName];
    if (!pendingTemplate) return;
    
    setMode("draw"); 
    state.clearSelection(); 
    render();
}

function initTemplates() {
    const container = document.getElementById('template-dropdown');
    if (!container) return;
    container.innerHTML = ''; // Verhindert doppeltes Einfügen

    Object.keys(MOLECULE_TEMPLATES).forEach(name => {
        const btn = document.createElement('button');
        btn.innerText = name;
        // WICHTIG: Wir übergeben jetzt den NAMEN des Templates, nicht mehr den SMILES String!
        btn.onclick = () => insertTemplate(name);
        container.appendChild(btn);
    });
}

document.getElementById('smiles-btn-import')?.addEventListener('click', () => {
    const inputStr = smilesInput.value.trim();
    if (inputStr) {
        insertTemplate(inputStr); 
    }
    smilesDialog.style.display = 'none';
});

function copyToOffice() {
    const atoms = state.getAtoms();
    const bonds = state.getBonds();
    const selectedIds = state.getSelectedAtomIds();
    
    const svgString = generateSVG(atoms, bonds, selectedIds, currentFontSize);
    if (!svgString) return;

    clipboard.write({
        html: svgString,
        text: svgString 
    });
    console.log("Copied to clipboard!");
}

function openTextEditor(atom: Atom) {
    atomToEdit = atom;
    const rect = canvas.getBoundingClientRect();
    textEditorDiv.style.left = (atom.x + panX + rect.left) + 'px';
    textEditorDiv.style.top = (atom.y + panY + rect.top - 50) + 'px';
    textEditorDiv.style.display = 'block';
    textEditorInput.value = atom.customLabel || "";
    textEditorFlip.checked = atom.autoFlip || false;
    textEditorAlign.checked = atom.alignFirstLetter || false;
    setTimeout(() => textEditorInput.focus(), 10);
}

function calcTemplatePreview(x: number, y: number) {
    if (!pendingTemplate) return null;
    const scale = currentBondLength / 40;
    
    const tAtoms: Atom[] = pendingTemplate.atoms.map(a => ({ id: a.id, element: a.element, x: a.x * scale, y: a.y * scale }));
    const tBonds: Bond[] = pendingTemplate.bonds.map(b => ({ ...b }));

    const atoms = state.getAtoms();
    const bonds = state.getBonds();
    
    templateTargetAtom = null;
    templateTargetBond = null;

    const hitAtom = findAtomNearPosition(x, y, atoms, 20);
    const hitBond = !hitAtom ? getBondAtCoords(x, y, bonds, atoms) : null;

    if (hitAtom) {
        templateTargetAtom = hitAtom;
        const rootT = tAtoms[0]; // Das erste Atom des Rings klebt am Zielatom
        
        let cx = 0, cy = 0;
        tAtoms.forEach(a => { cx += a.x; cy += a.y; });
        cx /= tAtoms.length; cy /= tAtoms.length;
        const tAngle = Math.atan2(cy - rootT.y, cx - rootT.x);

        const neighbors = bonds
            .filter(b => b.id1 === hitAtom.id || b.id2 === hitAtom.id)
            .map(b => atoms.find(a => a.id === (b.id1 === hitAtom.id ? b.id2 : b.id1)))
            .filter((a): a is Atom => !!a);
        
        let targetAngle = Math.PI / 6; // Standard: 30 Grad
        if (neighbors.length === 1) {
            targetAngle = Math.atan2(hitAtom.y - neighbors[0].y, hitAtom.x - neighbors[0].x);
        } else if (neighbors.length > 1) {
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

        const rotation = targetAngle - tAngle;
        tAtoms.forEach(a => {
            const rx = a.x - rootT.x;
            const ry = a.y - rootT.y;
            a.x = hitAtom.x + rx * Math.cos(rotation) - ry * Math.sin(rotation);
            a.y = hitAtom.y + rx * Math.sin(rotation) + ry * Math.cos(rotation);
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
        const tAngle = Math.atan2(ta2.y - ta1.y, ta2.x - ta1.x);

        const rotation = targetAngle - tAngle;
        
        let cx = 0, cy = 0;
        tAtoms.forEach(a => {
            const rx = a.x * Math.cos(rotation) - a.y * Math.sin(rotation);
            const ry = a.x * Math.sin(rotation) + a.y * Math.cos(rotation);
            cx += rx; cy += ry;
        });
        cx /= tAtoms.length; cy /= tAtoms.length;

        const tcOffsetX = cx - (ta1.x * Math.cos(rotation) - ta1.y * Math.sin(rotation));
        const tcOffsetY = cy - (ta1.x * Math.sin(rotation) + ta1.y * Math.cos(rotation));
        const centerCross = tcOffsetX * targetVec.y - tcOffsetY * targetVec.x;
        const mouseCross = (x - a1.x) * targetVec.y - (y - a1.y) * targetVec.x;
        
        const needsFlip = Math.sign(mouseCross) !== Math.sign(centerCross);

        tAtoms.forEach(a => {
            let relX = a.x - ta1.x; let relY = a.y - ta1.y;
            
            
            if (needsFlip) {
                const angleT = Math.atan2(ta2.y - ta1.y, ta2.x - ta1.x);
                let rx = relX * Math.cos(-angleT) - relY * Math.sin(-angleT);
                let ry = relX * Math.sin(-angleT) + relY * Math.cos(-angleT);
                ry = -ry; 
                relX = rx * Math.cos(angleT) - ry * Math.sin(angleT);
                relY = rx * Math.sin(angleT) + ry * Math.cos(angleT);
            }

            
            const rotX = relX * Math.cos(rotation) - relY * Math.sin(rotation);
            const rotY = relX * Math.sin(rotation) + relY * Math.cos(rotation);
            a.x = a1.x + rotX; a.y = a1.y + rotY;
        });

    } else {
        
        let cx = 0, cy = 0;
        tAtoms.forEach(a => { cx += a.x; cy += a.y; });
        cx /= tAtoms.length; cy /= tAtoms.length;
        tAtoms.forEach(a => { a.x = x + (a.x - cx); a.y = y + (a.y - cy); });
    }

    return { atoms: tAtoms, bonds: tBonds };
}

function render() {
    drawScene(ctx, canvas.width, canvas.height, state.getAtoms(), state.getBonds(), {
        showValenceWarnings,
        showGrid,
        panX,
        panY,
        selectedAtomId: null, 
        dragStartAtom,
        mousePos: { x: currentMouseX, y: currentMouseY },
        lassoPath: lassoPath,
        selectedAtomIds: state.getSelectedAtomIds(),
        fontSize: currentFontSize, // <--- NEU
        globalBondSpacing,
        globalFontFamily,
        globalColor
    });
    if (pendingTemplatePreview) {
        ctx.save();
        ctx.globalAlpha = 0.4; // Halbtransparent
        ctx.strokeStyle = "#007bff";
        ctx.fillStyle = "#007bff";
        ctx.lineWidth = 2;
        
        pendingTemplatePreview.bonds.forEach(b => {
            const a1 = pendingTemplatePreview!.atoms.find(a => a.id === b.id1);
            const a2 = pendingTemplatePreview!.atoms.find(a => a.id === b.id2);
            if(a1 && a2) {
                ctx.beginPath();
                ctx.moveTo(a1.x + panX, a1.y + panY);
                ctx.lineTo(a2.x + panX, a2.y + panY);
                ctx.stroke();
            }
        });
        
        pendingTemplatePreview.atoms.forEach(a => {
            ctx.beginPath();
            ctx.arc(a.x + panX, a.y + panY, 4, 0, 2*Math.PI);
            ctx.fill();
        });
        ctx.restore();
    }
}

// Undo-Funktion
function performUndo() {
    const changed = state.undo();
    if (changed) {
        render();
    }
}

// --- EVENT LISTENER (MAUS) ---

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2 && pendingTemplate) {
        pendingTemplate = null; pendingTemplatePreview = null;
        render();
        return; 
    }

    if (pendingTemplatePreview && e.button === 0) {
        state.saveState();
        const idMap = new Map<number, number>();
        const skipAtoms = new Set<number>(); 
        
        if (templateTargetAtom) {
            idMap.set(pendingTemplatePreview.atoms[0].id, templateTargetAtom.id);
            skipAtoms.add(pendingTemplatePreview.atoms[0].id);
        } else if (templateTargetBond) {
            idMap.set(pendingTemplatePreview.bonds[0].id1, templateTargetBond.id1);
            idMap.set(pendingTemplatePreview.bonds[0].id2, templateTargetBond.id2);
            skipAtoms.add(pendingTemplatePreview.bonds[0].id1);
            skipAtoms.add(pendingTemplatePreview.bonds[0].id2);
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

        pendingTemplate = null;
        pendingTemplatePreview = null;
        render();
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) - panX;
    const y = (e.clientY - rect.top) - panY;
    const atoms = state.getAtoms();
    const bonds = state.getBonds();

    if (e.button === 2) {
        const selectedIDs = state.getSelectedAtomIds();
        if (selectedIDs.size > 0) {
            isRotating = true;
            dragStartX = x; 
            dragStartY = y;
            
            const selectedAtoms = atoms.filter(atom => selectedIDs.has(atom.id));
            initialAtomPosition.clear();
            selectedAtoms.forEach(atom => {
                initialAtomPosition.set(atom.id, {x: atom.x, y: atom.y});
            });
            rotationcenter = centerOfPoints(selectedAtoms.map(a => ({x: a.x, y: a.y})));
            state.saveState();
        }
        return;
    }

    if (e.button === 0) {
        dragStartX = x;
        dragStartY = y;

        if (editMode === "text") {
            state.saveState();
            const textAtom: Atom = { id: state.getNextId(), element: "TEXT", customLabel: "Reaktion 1", x, y };
            state.addAtom(textAtom);
            openTextEditor(textAtom); // Öffnet sofort das Eingabefeld!
            render();
            return;
        } 
        else if (editMode === "arrow") {
            dragStartAtom = { id: Date.now(), element: "DUMMY", x, y };
            return;
        }
        else if (editMode === "draw") {
            dragStartAtom = findAtomNearPosition(x, y, atoms, 20);
            
            if (dragStartAtom && dragStartAtom.element === "TEXT") {
                dragStartAtom = null;
            }
        }
        else if (editMode === "move") {
            movingAtom = findAtomNearPosition(x, y, atoms, 20);
        } 
        else if (editMode === "erase") {
            const atomHit = findAtomNearPosition(x, y, atoms, 20);
            if (atomHit) {
                state.saveState(); 
                state.setAtoms(atoms.filter(a => a.id !== atomHit.id));
                state.setBonds(bonds.filter(b => b.id1 !== atomHit.id && b.id2 !== atomHit.id));
            } else {
                const bondHit = getBondAtCoords(x, y, bonds, atoms);
                if (bondHit) {
                    state.saveState(); 
                    state.setBonds(bonds.filter(b => b !== bondHit));
                }
            }
        } else if (editMode === "select") {
            const clickedAtom = findAtomNearPosition(x, y, atoms, 20);
            const selectedIDs = state.getSelectedAtomIds();
            
            if (clickedAtom && selectedIDs.has(clickedAtom.id)) {
                isDraggingSelection = true;
                state.saveState();
            } 
            else {
                state.clearSelection();
                lassoPath = [{ x, y }];
            }
        }
    }
    render();
});

// --- MOUSEMOVE ---
canvas.addEventListener('mousemove', (e) => {
    
    if (isPanning) {
        panX += e.clientX - lastPanMouseX;
        panY += e.clientY - lastPanMouseY;
        lastPanMouseX = e.clientX;
        lastPanMouseY = e.clientY;
        
        // Wenn das Textfeld offen ist, schieben wir es mit!
        if (textEditorDiv.style.display === 'block' && atomToEdit) {
            const rect = canvas.getBoundingClientRect();
            textEditorDiv.style.left = (atomToEdit.x + panX + rect.left) + 'px';
            textEditorDiv.style.top = (atomToEdit.y + panY + rect.top - 50) + 'px';
        }
        
        render();
        return;
    }

    if (pendingTemplate) {
        pendingTemplatePreview = calcTemplatePreview(currentMouseX, currentMouseY);
        render();
        return; 
    }

    
    const rect = canvas.getBoundingClientRect();
    currentMouseX = (e.clientX - rect.left) - panX;
    currentMouseY = (e.clientY - rect.top) - panY;

    if ((editMode === "draw" || editMode === "arrow") && dragStartAtom) {
        if (editMode === "arrow") {
            currentMouseX = currentMouseX; 
        } else if (!e.ctrlKey) {
            const dx = currentMouseX - dragStartAtom.x;
            const dy = currentMouseY - dragStartAtom.y;
            const rawDist = Math.sqrt(dx*dx + dy*dy);
            
            if (rawDist > 10) {
                const standardLength = currentBondLength; 
                const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 6)) * (Math.PI / 6);
                
                currentMouseX = dragStartAtom.x + Math.cos(angle) * standardLength;
                currentMouseY = dragStartAtom.y + Math.sin(angle) * standardLength;
            }
        }
        render();
    } 
    else if (editMode === "move" && movingAtom) {
        let targetX = currentMouseX;
        let targetY = currentMouseY;

        if (!e.ctrlKey) {
            const bonds = state.getBonds();
            const atoms = state.getAtoms();
            
            const connectedBonds = bonds.filter(b => b.id1 === movingAtom!.id || b.id2 === movingAtom!.id);

            if (connectedBonds.length === 1) {
                const neighborId = connectedBonds[0].id1 === movingAtom!.id ? connectedBonds[0].id2 : connectedBonds[0].id1;
                const neighbor = atoms.find(a => a.id === neighborId);
                
                if (neighbor) {
                    const dx = currentMouseX - neighbor.x;
                    const dy = currentMouseY - neighbor.y;
                    
                    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 6)) * (Math.PI / 6);
                    
                    targetX = neighbor.x + Math.cos(angle) * currentBondLength;
                    targetY = neighbor.y + Math.sin(angle) * currentBondLength;
                }
            } else {
                const snapGrid = 15; // 15px Raster fühlt sich beim freien Bewegen sehr gut an
                targetX = Math.round(currentMouseX / snapGrid) * snapGrid;
                targetY = Math.round(currentMouseY / snapGrid) * snapGrid;
            }
        }

        movingAtom.x = targetX;
        movingAtom.y = targetY;
        render();
    } 
    else if (editMode === "select") {
        if (isDraggingSelection) {
            const dx = currentMouseX - dragStartX;
            const dy = currentMouseY - dragStartY;
            const atoms = state.getAtoms();
            const selectedIds = state.getSelectedAtomIds();
        
            atoms.forEach(atom => {
                if (selectedIds.has(atom.id)) {
                    atom.x += dx;
                    atom.y += dy;
                }
            });

            dragStartX = currentMouseX;
            dragStartY = currentMouseY;
            render();
        } 
        else if (lassoPath.length > 0) {
            const lastPoint = lassoPath[lassoPath.length - 1];
            const dx = currentMouseX - lastPoint.x;
            const dy = currentMouseY - lastPoint.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist > 5) {
                lassoPath.push({ x: currentMouseX, y: currentMouseY });
                render(); 
            }
        }
    } 
    else if (isRotating) {
        const currentAngle = angleOfMouseMovement({x: currentMouseX, y: currentMouseY}, rotationcenter);
        const startAngle = angleOfMouseMovement({x: dragStartX, y: dragStartY}, rotationcenter);
        const angleDelta = currentAngle - startAngle;

        const atoms = state.getAtoms();
        const selectedIDs = state.getSelectedAtomIds();
        const selectedAtoms = atoms.filter(atom => selectedIDs.has(atom.id));

        selectedAtoms.forEach(atom => {
            const initialPos = initialAtomPosition.get(atom.id);
            if (initialPos) {
                const rotated = rotatePoint(initialPos, rotationcenter, angleDelta);
                atom.x = rotated.x;
                atom.y = rotated.y;
            }
        });
        render();
    }
});

canvas.addEventListener('mouseup', (e) => {
    
    if (isPanning) {
        isPanning = false;
        setMode(editMode); 
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    let x = e.clientX - rect.left - panX;
    let y = e.clientY - rect.top - panY;
    
    if ((editMode === "draw" || editMode === "arrow") && dragStartAtom && !e.ctrlKey) {
        const dx = x - dragStartAtom.x;
        const dy = y - dragStartAtom.y;
        const rawDist = Math.sqrt(dx*dx + dy*dy);
        
        if (rawDist > 10) {
            const standardLength = currentBondLength;
            const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 6)) * (Math.PI / 6);
            
            x = dragStartAtom.x + Math.cos(angle) * standardLength;
            y = dragStartAtom.y + Math.sin(angle) * standardLength;
        }
    }

    if (editMode === "move") {
        if (movingAtom) state.saveState(); 
        movingAtom = null;
        return;
    }

    if (editMode === "select") {
        if (isDraggingSelection) {
            isDraggingSelection = false;
        } 
        else if (lassoPath.length > 0) {
            lassoPath.push({x: lassoPath[0].x, y: lassoPath[0].y}); 
            const atoms = state.getAtoms();
            const newSelection: number[] = [];
            for (const atom of atoms) {
                if (isPointInPolygon({x: atom.x, y: atom.y}, lassoPath)) {
                    newSelection.push(atom.id);
                }
            }
            state.selectAtoms(newSelection);
            lassoPath = []; 
            render();
        }
        return; 
    }

    if (editMode === "erase") return;

    if (isRotating) {
        isRotating = false;
        initialAtomPosition.clear();
        return;
    }

    if (editMode === "draw" || editMode === "arrow") {
        const atoms = state.getAtoms();
        const bonds = state.getBonds();
        const distance = Math.sqrt((x - dragStartX)**2 + (y - dragStartY)**2);
        const wasDragging = distance > 10;
        const currentEl = state.getCurrentElement(); 

        if (dragStartAtom) {
            if (editMode === "arrow") {
                if (wasDragging) {
                    state.saveState();
                    const startAtom: Atom = { id: state.getNextId(), element: "DUMMY", x: dragStartAtom.x, y: dragStartAtom.y };
                    state.addAtom(startAtom);
                    const endAtom: Atom = { id: state.getNextId(), element: "DUMMY", x, y };
                    state.addAtom(endAtom);
                    state.addBond({ id1: startAtom.id, id2: endAtom.id, type: 4 });
                }
                dragStartAtom = null;
                render();
                return;
            }

            let dragEndAtom = findAtomNearPosition(x, y, atoms, 20);

            if (dragEndAtom && dragEndAtom.element === "TEXT") {
                dragEndAtom = null;
            }

            if (dragEndAtom && dragEndAtom.id !== dragStartAtom.id) {
                const exists = bonds.some(b => 
                    (b.id1 === dragStartAtom!.id && b.id2 === dragEndAtom.id) || 
                    (b.id1 === dragEndAtom.id && b.id2 === dragStartAtom!.id)
                );
                if (!exists) {
                    state.saveState();
                    state.addBond({ id1: dragStartAtom.id, id2: dragEndAtom.id, type: currentBondType });
                }
            } else {
                if (wasDragging) {
                    state.saveState();
                    const newAtom: Atom = { id: state.getNextId(), element: currentEl, x, y };
                    state.addAtom(newAtom);
                    state.addBond({ id1: dragStartAtom.id, id2: newAtom.id, type: currentBondType });
                } else {
                    const pos = calculateNewAtomPosition(dragStartAtom, bonds, atoms, currentBondLength);
                    const neighbor = findAtomNearPosition(pos.x, pos.y, atoms, 10); 
                    
                    if (!neighbor) {
                        state.saveState();
                        const newAtom: Atom = { id: state.getNextId(), element: currentEl, x: pos.x, y: pos.y };
                        state.addAtom(newAtom);
                        state.addBond({ id1: dragStartAtom.id, id2: newAtom.id, type: currentBondType });
                    }
                }
            }
            dragStartAtom = null; // Reset
        } else if (editMode === "draw") {
            const clickedBond = getBondAtCoords(x, y, bonds, atoms);
            
            if (clickedBond && !wasDragging) {
                // Klick auf Bindung
                state.saveState();
                if (currentBondType === 1) {
                    // Wenn normaler Stift: Typ durchwechseln (Einfach, Zweifach, Dreifach)
                    clickedBond.type = (clickedBond.type % 3) + 1; 
                } else if (currentBondType === 5 || currentBondType === 6) {
                    // Wenn Keil (5) oder Dash (6) ausgewählt ist
                    if (clickedBond.type === currentBondType) {
                        // Wenn die Bindung schon dieser Typ ist -> FLIPPEN (IDs tauschen)
                        const tempId = clickedBond.id1;
                        clickedBond.id1 = clickedBond.id2;
                        clickedBond.id2 = tempId;
                    } else {
                        // Sonst normal in diesen Typ umwandeln
                        clickedBond.type = currentBondType;
                    }
                }
            } else if (!wasDragging && !clickedBond) {
                // Klick ins Leere -> FREIES ATOM ERSTELLEN
                state.saveState();
                const newAtom: Atom = { id: state.getNextId(), element: currentEl, x, y };
                state.addAtom(newAtom);
            }
        }
    }
    render();
});

// --- UI BUTTONS ---

document.getElementById('btn-clear')?.addEventListener('click', () => { 
    state.clear(); 
    render(); 
});

document.getElementById('btn-grid')?.addEventListener('click', () => {
    showGrid = !showGrid;
    const btn = document.getElementById('btn-grid');
    if (btn) {
        btn.innerText = showGrid ? "🔲 Grid: On" : "🔲 Grid: Off";
        btn.style.backgroundColor = showGrid ? "#ccffcc" : "#eee";
    }
    render();
});

document.getElementById('btn-undo')?.addEventListener('click', performUndo);


document.getElementById('btn-export-xyz')?.addEventListener('click', async () => {
    const atoms = state.getAtoms();
    const bonds = state.getBonds();
    
    const smiles = generateSmiles(atoms, bonds);
    if (!smiles) {
        alert("Nothing to export!");
        return;
    }

    try {
        document.body.style.cursor = "wait";

        const response = await fetch(`https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}/sdf?get3d=true`);

        if (!response.ok) {
            throw new Error("Error with 3D calculation. Is the molecular connectivity valid?");
        }

        const sdfString = await response.text();
        

        const xyzString = convertSdfToXyz(sdfString);

        const blob = new Blob([xyzString], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.href = url;
        link.download = "molecule_3d.xyz";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error(err);
        alert("3D-Export failed: " + (err as Error).message + "\n\nFalling back to 2D export.");
        
        const fallbackXyz = generateXYZ(atoms);
        const blob = new Blob([fallbackXyz], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "molekuel_2d_planar.xyz";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } finally {
        document.body.style.cursor = "default";
    }
});

const textEditorDiv = document.getElementById('custom-text-editor')!;
const textEditorInput = document.getElementById('custom-text-input') as HTMLInputElement;
const textEditorFlip = document.getElementById('custom-text-flip') as HTMLInputElement;
const textEditorAlign = document.getElementById('custom-text-align') as HTMLInputElement;
let atomToEdit: Atom | null = null;


let clipboardData: { atoms: Atom[], bonds: Bond[] } | null = null;
let hotkeys = JSON.parse(localStorage.getItem('chemable-hotkeys') || '{"copy":"c","paste":"v","cut":"x","undo":"z","text":"t","draw":"d","move":"m","erase":"e","select":"l","arrow":"a"}');

function copySelection() {
    const selectedIds = state.getSelectedAtomIds();
    if (selectedIds.size === 0) return;
    
    const atoms = state.getAtoms().filter(a => selectedIds.has(a.id));
    const bonds = state.getBonds().filter(b => selectedIds.has(b.id1) && selectedIds.has(b.id2));
    
    clipboardData = JSON.parse(JSON.stringify({ atoms, bonds }));

    const svgString = generateSVG(state.getAtoms(), state.getBonds(), selectedIds, currentFontSize);
    
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
                const jsonData = JSON.stringify({ atoms, bonds });
                
                // Wir verstecken die Daten in einem HTML-Kommentar - Word zeigt diesen nicht an!
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
                    // KEIN 'text' Feld mehr, damit Word nicht den rohen String einfügt!
                });
                console.log("Kopiert (Daten im HTML-Kommentar versteckt)");
            }
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }
}

function pasteSelection() {
    state.saveState();
    
    let pastedAtoms: Atom[] | null = null;
    let pastedBonds: Bond[] | null = null;
    const sysHtml = clipboard.readHTML() || "";

    // Daten aus dem HTML-Kommentar extrahieren
    const match = sysHtml.match(/CHEMABLE_JSON_START (.*?) CHEMABLE_JSON_END/);
    if (match && match[1]) {
        try {
            const parsed = JSON.parse(match[1]);
            pastedAtoms = parsed.atoms;
            pastedBonds = parsed.bonds;
        } catch(e) {}
    }

    // Fallback auf internen Speicher
    if (!pastedAtoms && clipboardData) {
        pastedAtoms = JSON.parse(JSON.stringify(clipboardData.atoms));
        pastedBonds = JSON.parse(JSON.stringify(clipboardData.bonds));
    }

    if (!pastedAtoms || pastedAtoms.length === 0) return;

    const idMap = new Map<number, number>();
    const pastedAtomIds: number[] = [];

    // Zentrum der neuen Atome finden
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pastedAtoms.forEach(a => {
        minX = Math.min(minX, a.x); minY = Math.min(minY, a.y);
        maxX = Math.max(maxX, a.x); maxY = Math.max(maxY, a.y);
    });
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Offset berechnen: Klebt jetzt direkt an der Maus
    const dx = currentMouseX - centerX;
    const dy = currentMouseY - centerY;

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
    if (typeof setMode === "function") setMode("select"); 
    
    // Drag-Status aktivieren, damit es an der Maus "hängt"
    isDraggingSelection = true;
    dragStartX = currentMouseX;
    dragStartY = currentMouseY;
    
    render();
}

function cutSelection() {
    copySelection(); 
    if (state.getSelectedAtomIds().size === 0) return;
    
    state.saveState();
    const selectedIds = state.getSelectedAtomIds();
    state.setAtoms(state.getAtoms().filter(a => !selectedIds.has(a.id)));
    state.setBonds(state.getBonds().filter(b => !selectedIds.has(b.id1) && !selectedIds.has(b.id2)));
    state.clearSelection();
    render();
}


// ==========================================
// --- KEYDOWN LISTENER ---
// ==========================================

document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;

    const key = event.key.toLowerCase();
    const isCtrl = event.ctrlKey || event.metaKey;
    
    if (key === 'escape' && pendingTemplate) {
        pendingTemplate = null; pendingTemplatePreview = null;
        render();
    }
    
    if (isCtrl && key === hotkeys.copy) { copySelection(); event.preventDefault(); }
    else if (isCtrl && key === hotkeys.paste) { pasteSelection(); event.preventDefault(); }
    else if (isCtrl && key === hotkeys.cut) { cutSelection(); event.preventDefault(); }
    else if (isCtrl && key === hotkeys.undo) { performUndo(); event.preventDefault(); }
    
    else if (!isCtrl) {
        if (key === hotkeys.draw) { setMode("draw"); }
        else if (key === hotkeys.move) { setMode("move"); }
        else if (key === hotkeys.erase) { setMode("erase"); }
        else if (key === hotkeys.select) { setMode("select"); }
        else if (key === hotkeys.arrow) { setMode("arrow"); }
        
        // Das Text-Werkzeug / Edit-Overlay
        else if (key === hotkeys.text) {
            const atoms = state.getAtoms();
            const hoveredAtom = findAtomNearPosition(currentMouseX, currentMouseY, atoms, 20);
            if (hoveredAtom) {
                openTextEditor(hoveredAtom);
                event.preventDefault();
            } else if (editMode !== "text") {
                setMode("text");
            }
        }
    }

    // 3. Feste Hotkeys für Chemie (+, -, *)
    if (key === '+' || key === '-' || key === '*') {
        const atoms = state.getAtoms();
        const hoveredAtom = findAtomNearPosition(currentMouseX, currentMouseY, atoms, 20);
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


function setMode(mode: "draw" | "move" | "erase" | "select" | "text" | "arrow", activeBtnId?: string) {
    editMode = mode;
    
    // 1. Alle Buttons resetten (Klasse "active" entfernen)
    const tools = document.querySelectorAll('.tool-btn');
    tools.forEach(el => el.classList.remove('active'));
    
    // 2. Den aktiven Button markieren
    // Entweder die übergebene ID (z.B. "btn-wedge") oder Standard ("btn-draw")
    const btnIdToActivate = activeBtnId || `btn-${mode}`;
    const activeBtn = document.getElementById(btnIdToActivate);
    if (activeBtn) activeBtn.classList.add('active');
    
    // 3. Cursor anpassen
    if (mode === "erase") canvas.style.cursor = "not-allowed";
    else if (mode === "move") canvas.style.cursor = "move";
    else if (mode === "select") canvas.style.cursor = "default";
    else canvas.style.cursor = "crosshair";
}

document.getElementById('btn-draw')?.addEventListener('click', () => {
    setMode("draw", "btn-draw");
    currentBondType = 1;
});

document.getElementById('btn-wedge')?.addEventListener('click', () => {
    setMode("draw", "btn-wedge"); 
    currentBondType = 5;
});

document.getElementById('btn-dash')?.addEventListener('click', () => {
    setMode("draw", "btn-dash"); 
    currentBondType = 6;
});

document.getElementById('btn-move')?.addEventListener('click', () => setMode("move"));
document.getElementById('btn-erase')?.addEventListener('click', () => setMode("erase"));
document.getElementById('btn-clean')?.addEventListener('click', () => {
    state.saveState();
    
    const allAtoms = state.getAtoms();
    const allBonds = state.getBonds();
    const selectedIds = state.getSelectedAtomIds();

    if (selectedIds.size > 0) {
        // --- A. NUR AUSWAHL AUFRÄUMEN ---
        // Wir erstellen eine Liste, die NUR die markierten Atome enthält
        const selectedAtoms = allAtoms.filter(a => selectedIds.has(a.id));
        
        // WICHTIG: Die Bindungen müssen wir trotzdem alle übergeben, 
        // damit er weiß, wer mit wem verbunden ist.
        // Der Algorithmus verschiebt aber nur die Atome, die im Array sind.
        applyAutoLayout(selectedAtoms, allBonds);
        
    } else {
        // --- B. ALLES AUFRÄUMEN (Standard) ---
        applyAutoLayout(allAtoms, allBonds);
    }
    
    render();
});
document.getElementById('btn-warnings')?.addEventListener('click', () => {
    showValenceWarnings = !showValenceWarnings;
    
    const btn = document.getElementById('btn-warnings');
    if (btn) {
        if (showValenceWarnings) {
            btn.innerText = "Warnings: On";
            btn.style.backgroundColor = "#ffcccc"; 
        } else {
            btn.innerText = "Warnings: Off";
            btn.style.backgroundColor = "#ccffcc"; 
        }
    }
    render();
});
document.getElementById('btn-select')?.addEventListener('click', () => {
    setMode("select");
    // Optional: Cursor ändern
    canvas.style.cursor = "default";
});

const pseMenu = document.getElementById('pse-menu');
const pseGrid = document.getElementById('pse-grid');
const currentElDisplay = document.getElementById('current-element-display');

// --- HOTKEY DIALOG LOGIK ---
const hotkeyDialog = document.getElementById('hotkeys-dialog');
const btnHotkeys = document.getElementById('btn-hotkeys');

if (btnHotkeys && hotkeyDialog) {
    btnHotkeys.addEventListener('click', () => {
        // Werte aus dem aktuellen hotkeys-Objekt in die Input-Felder laden
        (document.getElementById('hk-copy') as HTMLInputElement).value = hotkeys.copy || 'c';
        (document.getElementById('hk-paste') as HTMLInputElement).value = hotkeys.paste || 'v';
        (document.getElementById('hk-cut') as HTMLInputElement).value = hotkeys.cut || 'x';
        (document.getElementById('hk-undo') as HTMLInputElement).value = hotkeys.undo || 'z';
        (document.getElementById('hk-text') as HTMLInputElement).value = hotkeys.text || 't';
        
        // Dialog sichtbar machen
        hotkeyDialog.style.display = 'block';
    });
}

document.getElementById('hk-btn-close')?.addEventListener('click', () => {
    if (hotkeyDialog) hotkeyDialog.style.display = 'none';
});

document.getElementById('hk-btn-save')?.addEventListener('click', () => {
    // Neue Werte auslesen und speichern
    hotkeys.copy = (document.getElementById('hk-copy') as HTMLInputElement).value.toLowerCase() || 'c';
    hotkeys.paste = (document.getElementById('hk-paste') as HTMLInputElement).value.toLowerCase() || 'v';
    hotkeys.cut = (document.getElementById('hk-cut') as HTMLInputElement).value.toLowerCase() || 'x';
    hotkeys.undo = (document.getElementById('hk-undo') as HTMLInputElement).value.toLowerCase() || 'z';
    hotkeys.text = (document.getElementById('hk-text') as HTMLInputElement).value.toLowerCase() || 't';
    
    // Im Browser/Electron LocalStorage sichern
    localStorage.setItem('chemable-hotkeys', JSON.stringify(hotkeys));
    
    // Dialog schließen
    if (hotkeyDialog) hotkeyDialog.style.display = 'none';
});

function initPSE() {
    if (!pseGrid) return;
    pseGrid.innerHTML = ""; // Leer machen

    // Wir gehen durch unsere Layout-Daten
    for (const [symbol, pos] of Object.entries(elementLayout)) {
        // Daten aus dem PSE holen (Farbe etc.)
        const data = periodicTable[symbol];
        if (!data) continue; // Sollte nicht passieren, wenn Layout und JSON synchron sind

        const btn = document.createElement('div');
        btn.className = 'element-btn';
        btn.innerText = symbol;
        
        // Grid-Position setzen (CSS Grid)
        btn.style.gridColumn = pos.col.toString();
        btn.style.gridRow = pos.row.toString();
        
        // Farbe setzen (CPK Farben aus deiner JSON)
        btn.style.backgroundColor = data.colorValue || "#eee";

        // Klick-Event
        btn.addEventListener('click', () => {
            state.setCurrentElement(symbol);
            console.log("Neues Element gewählt:", symbol);
            
            // UI Update
            if (currentElDisplay) currentElDisplay.innerText = `[ ${symbol} ]`;
            
            // Menü schließen
            if (pseMenu) pseMenu.style.display = 'none';
        });

        pseGrid.appendChild(btn);
    }
}

document.getElementById('btn-arrow')?.addEventListener('click', () => setMode("arrow"));
document.getElementById('btn-text')?.addEventListener('click', () => setMode("text"));


const fontSlider = document.getElementById('font-size-slider') as HTMLInputElement;
const fontVal = document.getElementById('font-size-val');
fontSlider?.addEventListener('input', () => {
    currentFontSize = parseInt(fontSlider.value);
    if (fontVal) fontVal.innerText = currentFontSize.toString();
    render();
});

init3DViewer();
// Initialisierung aufrufen
initPSE();

// Button: PSE öffnen
document.getElementById('btn-pse')?.addEventListener('click', () => {
    if (pseMenu) {
        // Toggle: Wenn offen -> zu, wenn zu -> offen
        const isVisible = pseMenu.style.display === 'block';
        pseMenu.style.display = isVisible ? 'none' : 'block';
    }
});
// Button: PSE schließen
document.getElementById('btn-close-pse')?.addEventListener('click', () => {
    if (pseMenu) pseMenu.style.display = 'none';
});

const bondLengthSlider = document.getElementById('bond-length-slider') as HTMLInputElement;
const bondLengthVal = document.getElementById('bond-length-val');
let preSlideStateSaved = false;

bondLengthSlider?.addEventListener('input', (e) => {
    // 1. Nur beim Starten des Ziehens EINEN Undo-Schritt speichern
    if (!preSlideStateSaved) {
        state.saveState();
        preSlideStateSaved = true;
    }

    const newLength = parseInt(bondLengthSlider.value);
    if (bondLengthVal) bondLengthVal.innerText = newLength.toString();

    const atoms = state.getAtoms();
    if (atoms.length > 0) {
        // 2. Skalierungsfaktor berechnen
        const factor = newLength / currentBondLength;
        
        // 3. Zentrum des gesamten Moleküls berechnen
        let centerX = 0, centerY = 0;
        for (const a of atoms) { 
            centerX += a.x; 
            centerY += a.y; 
        }
        centerX /= atoms.length;

        // 4. Alle Atome vom Zentrum aus skalieren (Streckung/Stauchung)
        for (const a of atoms) {
            a.x = centerX + (a.x - centerX) * factor;
            a.y = centerY + (a.y - centerY) * factor;
        }
    }
    
    // 5. Neue Länge als aktuellen Standard setzen
    currentBondLength = newLength;
    render();
});

bondLengthSlider?.addEventListener('change', () => {
    preSlideStateSaved = false;
});

// EXPORT LOGIK 
document.getElementById('btn-export-svg')?.addEventListener('click', () => {
    const atoms = state.getAtoms();
    const bonds = state.getBonds();
    const selectedIds = state.getSelectedAtomIds();

    const svgString = generateSVG(atoms, bonds, selectedIds, currentFontSize);
    if (!svgString) {
        alert("Nichts zum Exportieren vorhanden!");
        return;
    }

    // Wir erzeugen einen Download-Link und klicken ihn per Code an
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    // Dateiname anpassen, je nachdem ob es eine Auswahl oder das ganze Bild ist
    link.download = selectedIds.size > 0 ? "molekuel_auswahl.svg" : "molekuel_komplett.svg";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});
// PDF
document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
    const atoms = state.getAtoms();
    const bonds = state.getBonds();
    const selectedIds = state.getSelectedAtomIds();

    // 1. Wir generieren wieder unseren sauberen SVG-Code
    const svgString = generateSVG(atoms, bonds, selectedIds);
    if (!svgString) {
        alert("Nichts zum Exportieren vorhanden!");
        return;
    }

    // 2. jsPDF (bzw. svg2pdf) braucht ein echtes HTML/DOM-Element zum Konvertieren,
    //    also wandeln wir unseren String kurz in ein unsichtbares SVG-Element um.
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
    const svgElement = svgDoc.documentElement;

    // 3. Breite und Höhe exakt so auslesen, wie wir sie im SVG berechnet haben
    const width = parseFloat(svgElement.getAttribute("width") || "500");
    const height = parseFloat(svgElement.getAttribute("height") || "500");

    // 4. Ein neues, leeres PDF erstellen
    // - Format passen wir dynamisch an die Molekülgröße an (width, height)
    // - Ausrichtung (Quer/Hoch) machen wir davon abhängig, was länger ist
    const orientation = width > height ? "l" : "p";
    const doc = new jsPDF({
        orientation: orientation,
        unit: "pt", // Wir rechnen in Pixeln/Punkten, genau wie auf dem Canvas
        format: [width, height]
    });

    try {
        // 5. Das SVG-Element in das PDF zeichnen lassen
        await doc.svg(svgElement as any, {
            x: 0,
            y: 0,
            width: width,
            height: height
        });

        // 6. Das fertige PDF speichern (öffnet den Download-Dialog)
        const fileName = selectedIds.size > 0 ? "molekuel_auswahl.pdf" : "molekuel_komplett.pdf";
        doc.save(fileName);
        
    } catch (err) {
        console.error("Fehler beim PDF Export:", err);
        alert("Es gab einen Fehler beim Erstellen des PDFs.");
    }
});
document.getElementById('btn-save')?.addEventListener('click', () => {
    const data = JSON.stringify({
        atoms: state.getAtoms(),
        bonds: state.getBonds()
    });
    
    // Erzeugt eine kleine .chem Datei (sehr platzsparend)
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "molekuel.chem";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

const fileInput = document.getElementById('file-load') as HTMLInputElement;
document.getElementById('btn-load')?.addEventListener('click', () => {
    fileInput.click(); // Öffnet den Datei-Dialog
});

fileInput?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const content = event.target?.result as string;
        try {
            let jsonStr = content;
            
            // Wenn es ein SVG ist, versuchen wir unseren unsichtbaren Tag auszulesen!
            if (file.name.endsWith('.svg')) {
                const match = content.match(/<desc id="chemable-data">(.*?)<\/desc>/);
                if (match && match[1]) {
                    jsonStr = match[1];
                } else {
                    alert("Dieses SVG wurde nicht mit diesem Editor erstellt oder enthält keine Moleküldaten.");
                    return;
                }
            }
            // In src/renderer.ts
            const parsed = JSON.parse(jsonStr);
            if (parsed.atoms && parsed.bonds) {
                state.saveState();
                state.setAtoms(parsed.atoms);
                state.setBonds(parsed.bonds);
                
                // Wir müssen dem State sagen, dass er die ID hochzählen muss, 
                // damit neue Atome nicht die IDs der geladenen überschreiben.
                // (Optional: Implementiere eine kleine setNextId Funktion in state.ts, 
                // oder das hier reicht als Workaround vorerst aus).
                
                render();
            }
        } catch (err) {
            alert("Fehler beim Laden der Datei!");
        }
    };
    reader.readAsText(file);
    fileInput.value = ""; // Reset, damit man die gleiche Datei nochmal laden kann
});

const smilesDialog = document.getElementById('smiles-dialog')!;
const smilesInput = document.getElementById('smiles-input') as HTMLInputElement;

document.getElementById('btn-smiles')?.addEventListener('click', () => {
    // 1. Export: Wenn man klickt, wird das aktuelle Molekül als SMILES berechnet
    const currentSmiles = generateSmiles(state.getAtoms(), state.getBonds());
    smilesInput.value = currentSmiles;
    
    // 2. Dialog anzeigen
    smilesDialog.style.display = 'block';
    smilesInput.focus();
    smilesInput.select(); // Direkt markieren zum schnellen Kopieren (Strg+C)
});

document.getElementById('smiles-btn-close')?.addEventListener('click', () => {
    smilesDialog.style.display = 'none';
});

// src/renderer.ts

// src/renderer.ts

// In src/renderer.ts

document.getElementById('smiles-btn-import')?.addEventListener('click', () => {
    const inputStr = smilesInput.value.trim();
    if (!inputStr) return;

    state.saveState();
    
    // Zentrum berechnen
    const rect = canvas.getBoundingClientRect();
    const startX = (rect.width / 2) - panX;
    const startY = (rect.height / 2) - panY;
    
    // 1. SMILES parsen
    const { atoms: parsedAtoms, bonds: parsedBonds } = parseSmiles(inputStr, startX, startY);
    
    // --- DER WICHTIGSTE TEIL: ID-MAPPING ---
    const idMap = new Map<number, number>();
    const newAtoms: Atom[] = [];

    parsedAtoms.forEach(a => {
        const oldId = a.id;
        const newId = state.getNextId(); 
        idMap.set(oldId, newId);
        
        // Jitter hinzufügen, damit Atome nicht exakt aufeinander liegen
        const newAtom = { 
            ...a, 
            id: newId,
            x: a.x + (Math.random() - 0.5) * 20,
            y: a.y + (Math.random() - 0.5) * 20
        };
        state.addAtom(newAtom);
        newAtoms.push(newAtom);
    });

    // 2. Bindungen mit den NEUEN IDs hinzufügen!
    parsedBonds.forEach(b => {
        const realId1 = idMap.get(b.id1);
        const realId2 = idMap.get(b.id2);
        
        if (realId1 !== undefined && realId2 !== undefined) {
            state.addBond({ 
                id1: realId1, 
                id2: realId2,
                type: b.type // Typ aus SMILES beibehalten (wichtig für Doppelbindungen!)
            });
        }
    });

    // 3. Layout anwenden & UI aufräumen
    applyAutoLayout(newAtoms, state.getBonds());
    state.clearSelection(); // Entfernt die lästigen blauen Kreise!
    
    smilesDialog.style.display = 'none';
    render();
});
// --- STYLE MENU LOGIK ---
const stylePanel = document.getElementById('style-panel');
const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
const spacingSlider = document.getElementById('bond-spacing-slider') as HTMLInputElement;
const spacingVal = document.getElementById('bond-spacing-val');
const fontSelect = document.getElementById('font-family-select') as HTMLSelectElement;

// Menü öffnen/schließen
document.getElementById('btn-style-menu')?.addEventListener('click', () => {
    if (stylePanel) {
        stylePanel.style.display = stylePanel.style.display === 'block' ? 'none' : 'block';
    }
});
document.getElementById('btn-close-style-panel')?.addEventListener('click', () => {
    if (stylePanel) stylePanel.style.display = 'none';
});

// Blocker, damit Undo beim Schieben des Sliders nicht tausende Speicherstände macht
let preStyleStateSaved = false;
colorPicker?.addEventListener('change', () => { preStyleStateSaved = false; });
spacingSlider?.addEventListener('change', () => { preStyleStateSaved = false; });

// Farbe ändern
colorPicker?.addEventListener('input', () => {
    const newColor = colorPicker.value;
    const selectedIds = state.getSelectedAtomIds();
    
    if (!preStyleStateSaved) { state.saveState(); preStyleStateSaved = true; }
    
    if (selectedIds.size > 0) {
        // Atome färben
        state.getAtoms().forEach(a => { if (selectedIds.has(a.id)) a.color = newColor; });
        
        // WICHTIG: && statt || verwenden! Nur Bindungen färben, die KOMPLETT im Lasso liegen
        state.getBonds().forEach(b => { 
            if (selectedIds.has(b.id1) && selectedIds.has(b.id2)) b.color = newColor; 
        });
    } else {
        globalColor = newColor; 
    }
    render();
});

// Abstand der Doppelbindung ändern
spacingSlider?.addEventListener('input', () => {
    const newSpacing = parseFloat(spacingSlider.value);
    if (spacingVal) spacingVal.innerText = newSpacing.toString();
    const selectedIds = state.getSelectedAtomIds();
    
    if (!preStyleStateSaved) { state.saveState(); preStyleStateSaved = true; }
    
    if (selectedIds.size > 0) {
        state.getBonds().forEach(b => {
            // WICHTIG: Auch hier && statt || verwenden!
            if (selectedIds.has(b.id1) && selectedIds.has(b.id2)) b.spacing = newSpacing;
        });
    } else {
        globalBondSpacing = newSpacing;
    }
    render();
});

// Schriftart ändern
fontSelect?.addEventListener('change', () => {
    const newFont = fontSelect.value;
    const selectedIds = state.getSelectedAtomIds();
    
    state.saveState();
    if (selectedIds.size > 0) {
        state.getAtoms().forEach(a => { if (selectedIds.has(a.id)) a.fontFamily = newFont; });
    } else {
        globalFontFamily = newFont;
    }
    render();
});

initPSE();
initTemplates();

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
}

function makeDraggable(elementId: string) {
    const elmnt = document.getElementById(elementId);
    if (!elmnt) return;
    
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    elmnt.onmousedown = dragMouseDown;

    function dragMouseDown(e: MouseEvent) {
        // Nicht ziehen, wenn man auf einen Button, Input oder Select klickt!
        const targetTag = (e.target as HTMLElement).tagName;
        if (targetTag === 'BUTTON' || targetTag === 'INPUT' || targetTag === 'SELECT') return;
        
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e: MouseEvent) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // Neue Position setzen
        elmnt!.style.top = (elmnt!.offsetTop - pos2) + "px";
        elmnt!.style.left = (elmnt!.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

makeDraggable("menubar");
makeDraggable("toolbar");
makeDraggable("pse-menu");
makeDraggable("style-panel");

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 
render();