import { uiState } from "./ui-state";
import { state } from "../state";
import { findAtomNearPosition, getBondAtCoords, centerOfPoints, rotatePoint, angleOfMouseMovement, isPointInPolygon } from "../geometry";
import { setMode } from "../ui/toolbar";
import { calculateNewAtomPosition } from "../chemistry";
import { MOLECULE_TEMPLATES, TemplateData } from "../templates";
import { Atom, Bond } from "../types";
import { pendingTemplate, cancelTemplate, updateTemplatePreview, placeTemplate } from "../chemistry/template-manager";
import { initTextEditor, openTextEditor } from "../ui/text-editor"
import { rotateAtoms3D } from "./projection-3d";

let movingAtom: Atom | null = null;
let lastPanMouseX = 0;
let lastPanMouseY = 0;
let isRotating = false;
let rotationcenter: {x: number, y: number};
let initialAtomPosition = new Map<number, { x: number, y: number }>();
let atomToEdit: Atom | null = null;
const textEditorDiv = document.getElementById('custom-text-editor')!;
//const textEditorInput = document.getElementById('custom-text-input') as HTMLInputElement;
//const textEditorFlip = document.getElementById('custom-text-flip') as HTMLInputElement;
//const textEditorAlign = document.getElementById('custom-text-align') as HTMLInputElement;
let isRotating3D = false;
let lastMouseX = 0;
let lastMouseY = 0;
let alignSelection: Atom[] = [];
// ...

export function initMouseHandler(canvas: HTMLCanvasElement, render: () => void) {
    let activeChargeAtom: any = null;
    canvas.addEventListener('mousedown', (e) => {
        
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            uiState.isPanning = true;
            lastPanMouseX = e.clientX;
            lastPanMouseY = e.clientY;
            canvas.style.cursor = "grabbing";
            return; 
        }
    
        if (e.button === 2 && pendingTemplate) {
            cancelTemplate(render);
            return; 
        }

        if (uiState.editMode === "align_3d" && e.button === 0) {
            const atoms = state.getAtoms();
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) - uiState.panX;
            const y = (e.clientY - rect.top) - uiState.panY;
            
            const clickedAtom = findAtomNearPosition(x, y, atoms, 20);
            if (clickedAtom) {
                if (!alignSelection.some(a => a.id === clickedAtom.id)) {
                    alignSelection.push(clickedAtom);
                }

                if (alignSelection.length === 2) {
                    const a1 = alignSelection[0];
                    const a2 = alignSelection[1];
                    const dx = a2.x - a1.x;
                    const dy = a2.y - a1.y;
                    
                    const currentAngle = Math.atan2(dy, dx);
                    const targetAngle = -Math.PI / 2;
                    const deltaAngle = targetAngle - currentAngle;

                    const cx = (a1.x + a2.x) / 2;
                    const cy = (a1.y + a2.y) / 2;

                    state.saveState();
                    atoms.forEach(a => {
                        const rot = rotatePoint({x: a.x, y: a.y}, {x: cx, y: cy}, deltaAngle);
                        a.x = rot.x;
                        a.y = rot.y;
                        
                        if (a.orig3DX !== undefined && a.orig3DY !== undefined) {
                            const rot3D = rotatePoint({x: a.orig3DX, y: a.orig3DY}, {x: cx, y: cy}, deltaAngle);
                            a.orig3DX = rot3D.x;
                            a.orig3DY = rot3D.y;
                        }
                    });
                    alignSelection = []; 
                }
                render();
            }
            return;
        }
    
        if (pendingTemplate && e.button === 0) {
            placeTemplate(render);
            return;
        }

        if (uiState.editMode === "rotate_3d" && e.button === 0) {
            isRotating3D = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            return;
        }

        if (uiState.editMode === "charge_plus" || uiState.editMode === "charge_minus" || uiState.editMode === "radical") {
            const atoms = state.getAtoms();
            const clickedAtom = findAtomNearPosition(uiState.currentMouseX, uiState.currentMouseY, atoms, 20);
            
            if (clickedAtom) {
                state.saveState();
                const isReverse = e.button === 2; 

                if (uiState.editMode === "charge_plus") {
                    clickedAtom.charge = (clickedAtom.charge || 0) + (isReverse ? -1 : 1);
                } else if (uiState.editMode === "charge_minus") {
                    clickedAtom.charge = (clickedAtom.charge || 0) + (isReverse ? 1 : -1);
                } else if (uiState.editMode === "radical") {
                    clickedAtom.radical = !clickedAtom.radical; 
                }
                
                activeChargeAtom = clickedAtom;
                
                activeChargeAtom.chargeAngle = Math.atan2(uiState.currentMouseY - clickedAtom.y, uiState.currentMouseX - clickedAtom.x);
                render();
            }
            return; 
        }

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) - uiState.panX;
        const y = (e.clientY - rect.top) - uiState.panY;
        const atoms = state.getAtoms();
        const bonds = state.getBonds();
    
        if (e.button === 2) {
            const selectedIDs = state.getSelectedAtomIds();
            if (selectedIDs.size > 0) {
                isRotating = true;
                uiState.dragStartX = x; 
                uiState.dragStartY = y;
                
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
            uiState.dragStartX = x;
            uiState.dragStartY = y;
    
            if (uiState.editMode === "text") {
                state.saveState();
                const textAtom: Atom = { id: state.getNextId(), element: "TEXT", customLabel: "Reaktion 1", x, y };
                state.addAtom(textAtom);
                openTextEditor(textAtom, canvas); // Öffnet sofort das Eingabefeld!
                render();
                return;
            } 
            else if (uiState.editMode === "arrow") {
                uiState.dragStartAtom = { id: Date.now(), element: "DUMMY", x, y };
                return;
            } 
            else if (uiState.editMode === "draw") {
                uiState.dragStartAtom = findAtomNearPosition(x, y, atoms, 20);
                
                if (uiState.dragStartAtom && uiState.dragStartAtom.element === "TEXT") {
                    uiState.dragStartAtom = null;
                }
            }
            else if (uiState.editMode === "move") {
                movingAtom = findAtomNearPosition(x, y, atoms, 20);
            } 
            else if (uiState.editMode === "erase") {
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
            } else if (uiState.editMode === "select") {
                const clickedAtom = findAtomNearPosition(x, y, atoms, 20);
                const selectedIDs = state.getSelectedAtomIds();
                
                if (clickedAtom && selectedIDs.has(clickedAtom.id)) {
                    uiState.isDraggingSelection = true;
                    state.saveState();
                } 
                else {
                    state.clearSelection();
                    uiState.lassoPath = [{ x, y }];
                }
            }
        }
        render();
    });

    canvas.addEventListener('mousemove', (e) => {
        
        const rect = canvas.getBoundingClientRect();
        uiState.currentMouseX = (e.clientX - rect.left) - uiState.panX;
        uiState.currentMouseY = (e.clientY - rect.top) - uiState.panY;
        
        if (isRotating3D) {
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;

            rotateAtoms3D(state.getAtoms(), dx, dy);
            render();
            return;
        }

        if (uiState.isPanning) {
            uiState.panX += e.clientX - lastPanMouseX;
            uiState.panY += e.clientY - lastPanMouseY;
            lastPanMouseX = e.clientX;
            lastPanMouseY = e.clientY;
            
            if (textEditorDiv.style.display === 'block' && atomToEdit) {
                const rect = canvas.getBoundingClientRect();
                textEditorDiv.style.left = (atomToEdit.x + uiState.panX + rect.left) + 'px';
                textEditorDiv.style.top = (atomToEdit.y + uiState.panY + rect.top - 50) + 'px';
            }
            
            render();
            return;
        }
    
        if (pendingTemplate) {
            updateTemplatePreview(uiState.currentMouseX, uiState.currentMouseY, render);
            return; 
        }
        
        if (activeChargeAtom) {
            activeChargeAtom.chargeAngle = Math.atan2(uiState.currentMouseY - activeChargeAtom.y, uiState.currentMouseX - activeChargeAtom.x);
            render();
            return;
        }

        if ((uiState.editMode === "draw" || uiState.editMode === "arrow") && uiState.dragStartAtom) {
            if (uiState.editMode === "arrow") {
                uiState.currentMouseX = uiState.currentMouseX; 
            } else if (!e.ctrlKey) {
                const dx = uiState.currentMouseX - uiState.dragStartAtom.x;
                const dy = uiState.currentMouseY - uiState.dragStartAtom.y;
                const rawDist = Math.sqrt(dx*dx + dy*dy);
                
                if (rawDist > 10) {
                    const standardLength = uiState.currentBondLength; 
                    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 6)) * (Math.PI / 6);
                    
                    uiState.currentMouseX = uiState.dragStartAtom.x + Math.cos(angle) * standardLength;
                    uiState.currentMouseY = uiState.dragStartAtom.y + Math.sin(angle) * standardLength;
                }
            }
            render();
        }
        else if (isRotating) {
            const currentAngle = angleOfMouseMovement({x: uiState.currentMouseX, y: uiState.currentMouseY}, rotationcenter);
            const startAngle = angleOfMouseMovement({x: uiState.dragStartX, y: uiState.dragStartY}, rotationcenter);
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
        else if (uiState.editMode === "move" && movingAtom) {
            let targetX = uiState.currentMouseX;
            let targetY = uiState.currentMouseY;
    
            if (!e.ctrlKey) {
                const bonds = state.getBonds();
                const atoms = state.getAtoms();
                
                const connectedBonds = bonds.filter(b => b.id1 === movingAtom!.id || b.id2 === movingAtom!.id);
    
                if (connectedBonds.length === 1) {
                    const neighborId = connectedBonds[0].id1 === movingAtom!.id ? connectedBonds[0].id2 : connectedBonds[0].id1;
                    const neighbor = atoms.find(a => a.id === neighborId);
                    
                    if (neighbor) {
                        const dx = uiState.currentMouseX - neighbor.x;
                        const dy = uiState.currentMouseY - neighbor.y;
                        
                        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 6)) * (Math.PI / 6);
                        
                        targetX = neighbor.x + Math.cos(angle) * uiState.currentBondLength;
                        targetY = neighbor.y + Math.sin(angle) * uiState.currentBondLength;
                    }
                } else {
                    const snapGrid = 15; // 15px Raster fühlt sich beim freien Bewegen sehr gut an
                    targetX = Math.round(uiState.currentMouseX / snapGrid) * snapGrid;
                    targetY = Math.round(uiState.currentMouseY / snapGrid) * snapGrid;
                }
            }
    
            movingAtom.x = targetX;
            movingAtom.y = targetY;
            render();
        } 
        else if (uiState.editMode === "select") {
            if (uiState.isDraggingSelection) {
                const dx = uiState.currentMouseX - uiState.dragStartX;
                const dy = uiState.currentMouseY - uiState.dragStartY;
                const atoms = state.getAtoms();
                const selectedIds = state.getSelectedAtomIds();
            
                atoms.forEach(atom => {
                    if (selectedIds.has(atom.id)) {
                        atom.x += dx;
                        atom.y += dy;
                    }
                });
    
                uiState.dragStartX = uiState.currentMouseX;
                uiState.dragStartY = uiState.currentMouseY;
                render();
            } 
            else if (uiState.lassoPath.length > 0) {
                const lastPoint = uiState.lassoPath[uiState.lassoPath.length - 1];
                const dx = uiState.currentMouseX - lastPoint.x;
                const dy = uiState.currentMouseY - lastPoint.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
    
                if (dist > 5) {
                    uiState.lassoPath.push({ x: uiState.currentMouseX, y: uiState.currentMouseY });
                    render(); 
                }
            }
        } 
        
    });

    canvas.addEventListener('mouseup', (e) => {
        
        if (uiState.isPanning) {
            uiState.isPanning = false;
            setMode(uiState.editMode); 
            return;
        }
        
        if (isRotating) {
            isRotating = false;
            initialAtomPosition.clear();
            state.saveState();
            return;
        }

        const rect = canvas.getBoundingClientRect();
        let x = e.clientX - rect.left - uiState.panX;
        let y = e.clientY - rect.top - uiState.panY;
        
        if (isRotating3D) {
            isRotating3D = false;
            state.saveState(); 
            return;
        }

        if (activeChargeAtom) {
            activeChargeAtom = null;
            return;
        }

        if ((uiState.editMode === "draw" || uiState.editMode === "arrow") && uiState.dragStartAtom && !e.ctrlKey) {
            const dx = x - uiState.dragStartAtom.x;
            const dy = y - uiState.dragStartAtom.y;
            const rawDist = Math.sqrt(dx*dx + dy*dy);
            
            if (rawDist > 10) {
                const standardLength = uiState.currentBondLength;
                const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 6)) * (Math.PI / 6);
                
                x = uiState.dragStartAtom.x + Math.cos(angle) * standardLength;
                y = uiState.dragStartAtom.y + Math.sin(angle) * standardLength;
            }
        }
    
        if (uiState.editMode === "move") {
            if (movingAtom) state.saveState(); 
            movingAtom = null;
            return;
        }
    
        if (uiState.editMode === "select") {
            if (uiState.isDraggingSelection) {
                uiState.isDraggingSelection = false;
            } 
            else if (uiState.lassoPath.length > 0) {
                uiState.lassoPath.push({x: uiState.lassoPath[0].x, y: uiState.lassoPath[0].y}); 
                const atoms = state.getAtoms();
                const newSelection: number[] = [];
                for (const atom of atoms) {
                    if (isPointInPolygon({x: atom.x, y: atom.y}, uiState.lassoPath)) {
                        newSelection.push(atom.id);
                    }
                }
                state.selectAtoms(newSelection);
                uiState.lassoPath = []; 
                render();
            }
            return; 
        }
    
        if (uiState.editMode === "erase") return;
    
        if (uiState.editMode === "draw" || uiState.editMode === "arrow") {
            const atoms = state.getAtoms();
            const bonds = state.getBonds();
            const distance = Math.sqrt((x - uiState.dragStartX)**2 + (y - uiState.dragStartY)**2);
            const wasDragging = distance > 10;
            const currentEl = state.getCurrentElement(); 
    
            if (uiState.dragStartAtom) {
                if (uiState.editMode === "arrow") {
                    if (wasDragging) {
                        state.saveState();
                        const startAtom: Atom = { id: state.getNextId(), element: "DUMMY", x: uiState.dragStartAtom.x, y: uiState.dragStartAtom.y };
                        state.addAtom(startAtom);
                        const endAtom: Atom = { id: state.getNextId(), element: "DUMMY", x, y };
                        state.addAtom(endAtom);
                        state.addBond({ id1: startAtom.id, id2: endAtom.id, type: 4 });
                    }
                    uiState.dragStartAtom = null;
                    render();
                    return;
                }
    
                let dragEndAtom = findAtomNearPosition(x, y, atoms, 20);
    
                if (dragEndAtom && dragEndAtom.element === "TEXT") {
                    dragEndAtom = null;
                }
    
                if (dragEndAtom && dragEndAtom.id !== uiState.dragStartAtom.id) {
                    const exists = bonds.some(b => 
                        (b.id1 === uiState.dragStartAtom!.id && b.id2 === dragEndAtom.id) || 
                        (b.id1 === dragEndAtom.id && b.id2 === uiState.dragStartAtom!.id)
                    );
                    if (!exists) {
                        state.saveState();
                        state.addBond({ id1: uiState.dragStartAtom.id, id2: dragEndAtom.id, type: uiState.currentBondType });
                    }
                } else {
                    if (wasDragging) {
                        state.saveState();
                        const newAtom: Atom = { id: state.getNextId(), element: currentEl, x, y };
                        state.addAtom(newAtom);
                        state.addBond({ id1: uiState.dragStartAtom.id, id2: newAtom.id, type: uiState.currentBondType });
                    } else {
                        const pos = calculateNewAtomPosition(uiState.dragStartAtom, bonds, atoms, uiState.currentBondLength);
                        const neighbor = findAtomNearPosition(pos.x, pos.y, atoms, 10); 
                        
                        if (!neighbor) {
                            state.saveState();
                            const newAtom: Atom = { id: state.getNextId(), element: currentEl, x: pos.x, y: pos.y };
                            state.addAtom(newAtom);
                            state.addBond({ id1: uiState.dragStartAtom.id, id2: newAtom.id, type: uiState.currentBondType });
                        }
                    }
                }
                uiState.dragStartAtom = null; // Reset
            } else if (uiState.editMode === "draw") {
                const clickedBond = getBondAtCoords(x, y, bonds, atoms);
                
                if (clickedBond && !wasDragging) {
                    state.saveState();
                    if (uiState.currentBondType === 1) {
                        clickedBond.type = (clickedBond.type % 3) + 1; 
                    } else if (uiState.currentBondType === 5 || uiState.currentBondType === 6) {
                        if (clickedBond.type === uiState.currentBondType) {
                            const tempId = clickedBond.id1;
                            clickedBond.id1 = clickedBond.id2;
                            clickedBond.id2 = tempId;
                        } else {
                            clickedBond.type = uiState.currentBondType;
                        }
                    }
                } else if (!wasDragging && !clickedBond) {
                    state.saveState();
                    const newAtom: Atom = { id: state.getNextId(), element: currentEl, x, y };
                    state.addAtom(newAtom);
                }
            }
        }
        render();
    });
}