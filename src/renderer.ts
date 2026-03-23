export let verboose = true;
if (verboose) {console.log("🚀 Renderer.ts wird geladen...")} ;

import { ChemablePlugin, ChemableContext } from "./plugin-api";
import { registerPlugin } from "./plugin-manager";
import { analyzerPlugin } from "./plugins/analyzer";
import { ehtPlugin } from "./plugins/eht";
registerPlugin(analyzerPlugin);

import { state } from "./state";
import { Atom, Bond } from "./types";
import { findAtomNearPosition, getBondAtCoords, isPointInPolygon, rotatePoint, centerOfPoints, angleOfMouseMovement } from "./geometry";
import { applyAutoLayout, calculateNewAtomPosition } from "./chemistry";
import { drawScene } from "./draw";
import { periodicTable } from "./pse";
import { elementLayout } from "./pse_layout";
import * as fs from 'fs';
import { generateSVG } from "./export";
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import { generateSmiles, parseSmiles } from './smiles';

// Lokale UI-Variablen (Dinge, die NICHT im History-Undo gespeichert werden müssen)
let editMode: "draw" | "move" | "erase" | "select" | "text" | "arrow" = "draw";
let currentFontSize = 16;
let showValenceWarnings = true;
let showGrid = false;
let currentBondLength = 60; // (Standard: 60)
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
    // A) PANNING (Verschieben der Arbeitsfläche)
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        isPanning = true;
        lastPanMouseX = e.clientX;
        lastPanMouseY = e.clientY;
        canvas.style.cursor = "grabbing";
        return; 
    }

    // WELT-Koordinaten berechnen (unter Berücksichtigung des Pannings)
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) - panX;
    const y = (e.clientY - rect.top) - panY;
    const atoms = state.getAtoms();
    const bonds = state.getBonds();

    // B) ROTATION (Rechtsklick)
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

    // C) NORMALE WERKZEUGE (Linksklick)
    if (e.button === 0) {
        // WICHTIG: IMMER Startkoordinaten speichern, damit mouseup weiß, wie weit gezogen wurde!
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
            // Wir erstellen ein temporäres "Dummy" Atom für den Startpunkt
            dragStartAtom = { id: Date.now(), element: "DUMMY", x, y };
            return;
        }
        else if (editMode === "draw") {
            // NUR schauen, ob wir auf einem Atom starten. 
            dragStartAtom = findAtomNearPosition(x, y, atoms, 20);
            
            // Reine Freitext-Elemente dürfen niemals als Startpunkt für Bindungen dienen!
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
            
            // Wenn man auf ein bereits markiertes Atom klickt -> Auswahl verschieben
            if (clickedAtom && selectedIDs.has(clickedAtom.id)) {
                isDraggingSelection = true;
                state.saveState();
            } 
            // Ansonsten -> Neue Lasso-Auswahl starten
            else {
                state.clearSelection();
                lassoPath = [{ x, y }];
            }
        }
    }
    render();
});

// --- 2. MOUSEMOVE ---
canvas.addEventListener('mousemove', (e) => {
    // A) PANNING (Muss zuerst kommen!)
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

    // WELT-Koordinaten aktualisieren
    const rect = canvas.getBoundingClientRect();
    currentMouseX = (e.clientX - rect.left) - panX;
    currentMouseY = (e.clientY - rect.top) - panY;

    // B) ZEICHNEN (Live-Vorschau mit Snapping)
    if ((editMode === "draw" || editMode === "arrow") && dragStartAtom) {
        // Pfeile lassen wir einfach frei rotieren (ohne Snapping), das ist meistens schöner.
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
    // C) ATOM BEWEGEN
    else if (editMode === "move" && movingAtom) {
        let targetX = currentMouseX;
        let targetY = currentMouseY;

        // Snapping ist aktiv, solange STRG NICHT gedrückt wird
        if (!e.ctrlKey) {
            const bonds = state.getBonds();
            const atoms = state.getAtoms();
            
            // Finde heraus, wie viele Bindungen an diesem Atom hängen
            const connectedBonds = bonds.filter(b => b.id1 === movingAtom!.id || b.id2 === movingAtom!.id);

            if (connectedBonds.length === 1) {
                // Fall 1: End-Atom -> Wir snappen im 30°-Winkel und fester Länge um den Nachbarn!
                const neighborId = connectedBonds[0].id1 === movingAtom!.id ? connectedBonds[0].id2 : connectedBonds[0].id1;
                const neighbor = atoms.find(a => a.id === neighborId);
                
                if (neighbor) {
                    const dx = currentMouseX - neighbor.x;
                    const dy = currentMouseY - neighbor.y;
                    
                    // Auf 30° (PI/6) runden
                    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 6)) * (Math.PI / 6);
                    
                    targetX = neighbor.x + Math.cos(angle) * currentBondLength;
                    targetY = neighbor.y + Math.sin(angle) * currentBondLength;
                }
            } else {
                // Fall 2: Mittleres oder freies Atom -> Wir snappen auf ein unsichtbares Raster
                const snapGrid = 15; // 15px Raster fühlt sich beim freien Bewegen sehr gut an
                targetX = Math.round(currentMouseX / snapGrid) * snapGrid;
                targetY = Math.round(currentMouseY / snapGrid) * snapGrid;
            }
        }

        movingAtom.x = targetX;
        movingAtom.y = targetY;
        render();
    } 
    // D) LASSO & AUSWAHL
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
    // E) ROTATION
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
        setMode(editMode); // Cursor wiederherstellen
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    let x = e.clientX - rect.left - panX;
    let y = e.clientY - rect.top - panY;
    
    // Snapping-Vorschau beim Loslassen anwenden
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

    // 1. VERSCHIEBEN BEENDEN
    if (editMode === "move") {
        if (movingAtom) state.saveState(); 
        movingAtom = null;
        return;
    }

    // 2. SELEKTIEREN BEENDEN
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

    // 3. RADIERER (Macht nix bei MouseUp)
    if (editMode === "erase") return;

    // ROTATION BEENDEN
    if (isRotating) {
        isRotating = false;
        initialAtomPosition.clear();
        return;
    }

    // 4. ZEICHEN MODUS & PFEILE 
    if (editMode === "draw" || editMode === "arrow") {
        const atoms = state.getAtoms();
        const bonds = state.getBonds();
        const distance = Math.sqrt((x - dragStartX)**2 + (y - dragStartY)**2);
        const wasDragging = distance > 10;
        const currentEl = state.getCurrentElement(); 

        if (dragStartAtom) {
            // Sonderfall: Reaktionspfeil
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

            // Normales Zeichnen (Bindung ziehen)
            let dragEndAtom = findAtomNearPosition(x, y, atoms, 20);

            // --- Text-Elemente als Ziel ignorieren ---
            if (dragEndAtom && dragEndAtom.element === "TEXT") {
                dragEndAtom = null;
            }

            if (dragEndAtom && dragEndAtom.id !== dragStartAtom.id) {
                // A) Verbindung zu existierendem Atom
                const exists = bonds.some(b => 
                    (b.id1 === dragStartAtom!.id && b.id2 === dragEndAtom.id) || 
                    (b.id1 === dragEndAtom.id && b.id2 === dragStartAtom!.id)
                );
                if (!exists) {
                    state.saveState();
                    state.addBond({ id1: dragStartAtom.id, id2: dragEndAtom.id, type: currentBondType });
                }
            } else {
                // B) Ziehen ins Leere -> Neues Atom + Bindung
                if (wasDragging) {
                    state.saveState();
                    const newAtom: Atom = { id: state.getNextId(), element: currentEl, x, y };
                    state.addAtom(newAtom);
                    state.addBond({ id1: dragStartAtom.id, id2: newAtom.id, type: currentBondType });
                } else {
                    // C) Kurzer Klick auf Atom -> Anbau-Logik (Skelett-Modus)
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
            // Wir haben im Leeren gestartet (Klick auf Hintergrund oder Klick auf Bindung)
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

// Hier wird ein state gesetzt, also speichern wir den alten Zustand

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

const textEditorDiv = document.getElementById('custom-text-editor')!;
const textEditorInput = document.getElementById('custom-text-input') as HTMLInputElement;
const textEditorFlip = document.getElementById('custom-text-flip') as HTMLInputElement;
const textEditorAlign = document.getElementById('custom-text-align') as HTMLInputElement;
let atomToEdit: Atom | null = null;

// Tastaturkürzel Undo
let clipboardData: { atoms: Atom[], bonds: Bond[] } | null = null;

// Hotkeys aus dem LocalStorage laden (inklusive Werkzeuge!)
let hotkeys = JSON.parse(localStorage.getItem('chemable-hotkeys') || '{"copy":"c","paste":"v","cut":"x","undo":"z","text":"t","draw":"d","move":"m","erase":"e","select":"l","arrow":"a"}');

function copySelection() {
    const selectedIds = state.getSelectedAtomIds();
    if (selectedIds.size === 0) return;
    
    const atoms = state.getAtoms().filter(a => selectedIds.has(a.id));
    const bonds = state.getBonds().filter(b => selectedIds.has(b.id1) && selectedIds.has(b.id2));
    
    clipboardData = JSON.parse(JSON.stringify({ atoms, bonds }));
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

function pasteSelection() {
    if (!clipboardData || clipboardData.atoms.length === 0) return;
    state.saveState();
    
    const idMap = new Map<number, number>();
    const pastedAtomIds: number[] = [];

    let cx = 0, cy = 0;
    clipboardData.atoms.forEach(a => { cx += a.x; cy += a.y; });
    cx /= clipboardData.atoms.length;

    const dx = currentMouseX - cx;
    const dy = currentMouseY - cy;

    clipboardData.atoms.forEach(a => {
        const newId = state.getNextId();
        idMap.set(a.id, newId);
        const newAtom: Atom = { ...a, id: newId, x: a.x + dx, y: a.y + dy };
        state.addAtom(newAtom);
        pastedAtomIds.push(newId);
    });

    clipboardData.bonds.forEach(b => {
        state.addBond({ ...b, id1: idMap.get(b.id1)!, id2: idMap.get(b.id2)!, type: currentBondType });
    });

    state.clearSelection();
    state.selectAtoms(pastedAtomIds);
    setMode("select");
    isDraggingSelection = true; 
    dragStartX = currentMouseX;
    dragStartY = currentMouseY;
    
    render();
}

// ==========================================
// --- DER NEUE KEYDOWN LISTENER ---
// ==========================================

document.addEventListener('keydown', (event) => {
    // Blockieren, wenn der Nutzer gerade in ein Input-Feld tippt!
    if (event.target instanceof HTMLInputElement) return;

    // Hier wird isCtrl definiert! (Prüft, ob Strg oder die Mac-Command-Taste gedrückt ist)
    const key = event.key.toLowerCase();
    const isCtrl = event.ctrlKey || event.metaKey;

    // 1. Die anpassbaren Hotkeys (mit STRG)
    if (isCtrl && key === hotkeys.copy) { copySelection(); event.preventDefault(); }
    else if (isCtrl && key === hotkeys.paste) { pasteSelection(); event.preventDefault(); }
    else if (isCtrl && key === hotkeys.cut) { cutSelection(); event.preventDefault(); }
    else if (isCtrl && key === hotkeys.undo) { performUndo(); event.preventDefault(); }
    
    // 2. Die Werkzeug-Hotkeys (OHNE STRG)
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

// Modus umschalten
function setMode(mode: "draw" | "move" | "erase" | "select" | "text" | "arrow") {
    editMode = mode;
    
    // 1. Alle Buttons resetten (Farbe entfernen)
    // Wir packen die IDs in ein Array, damit wir nichts vergessen
    const btnIds = ['btn-draw', 'btn-move', 'btn-erase', 'btn-select'];
    
    btnIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.backgroundColor = "";
    });
    
    // 2. Den aktiven Button färben
    // Da wir die IDs schlau benannt haben (btn-draw, btn-select...), geht das dynamisch:
    const activeBtn = document.getElementById(`btn-${mode}`);
    if (activeBtn) activeBtn.style.backgroundColor = "#ddd"; // Aktiv-Farbe
    
    // 3. Cursor anpassen
    if (mode === "erase") {
        canvas.style.cursor = "not-allowed"; 
    } else if (mode === "move") {
        canvas.style.cursor = "move";
    } else if (mode === "select") {
        canvas.style.cursor = "default"; // Normaler Pfeil für Auswahl
    } else {
        canvas.style.cursor = "crosshair"; // Fadenkreuz fürs Zeichnen
    }
}
// Das ersetzt die Logik aus meiner letzten Nachricht!
document.getElementById('btn-draw')?.addEventListener('click', () => {
    setMode("draw");
    currentBondType = 1; // Normaler Stift
});

document.getElementById('btn-wedge')?.addEventListener('click', () => {
    setMode("draw");
    currentBondType = 5; // Keil-Stift
});

document.getElementById('btn-dash')?.addEventListener('click', () => {
    setMode("draw");
    currentBondType = 6; // Dash-Stift
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


// Funktion: PSE-Grid einmalig aufbauen
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

//
const fontSlider = document.getElementById('font-size-slider') as HTMLInputElement;
const fontVal = document.getElementById('font-size-val');
fontSlider?.addEventListener('input', () => {
    currentFontSize = parseInt(fontSlider.value);
    if (fontVal) fontVal.innerText = currentFontSize.toString();
    render();
});
//

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

// Wenn man die Maus am Slider loslässt, setzen wir den Speicher-Blocker zurück
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

document.getElementById('smiles-btn-import')?.addEventListener('click', () => {
    const inputStr = smilesInput.value.trim();
    if (inputStr) {
        state.saveState();
        
        // Wir platzieren es in der Mitte des Bildschirms (inkl. Panning)
        const rect = canvas.getBoundingClientRect();
        const startX = (rect.width / 2) - panX;
        const startY = (rect.height / 2) - panY;
        
        // Atome und Bindungen generieren
        const { atoms, bonds } = parseSmiles(inputStr, startX, startY);
        
        // Zum aktuellen State hinzufügen
        atoms.forEach(a => state.addAtom(a));
        bonds.forEach(b => state.addBond({ ...b, type: currentBondType }));
        
        // DER MAGISCHE TRICK: Wir jagen die NEUEN Atome direkt durch das Auto-Layout!
        applyAutoLayout(atoms, state.getBonds());
        
        render();
    }
    smilesDialog.style.display = 'none';
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

// Farbe ändern
colorPicker?.addEventListener('input', () => {
    const newColor = colorPicker.value;
    const selectedIds = state.getSelectedAtomIds();
    
    if (selectedIds.size > 0) {
        state.saveState(); // Fürs Undo
        state.getAtoms().forEach(a => { if (selectedIds.has(a.id)) a.color = newColor; });
        state.getBonds().forEach(b => { 
            if (selectedIds.has(b.id1) || selectedIds.has(b.id2)) b.color = newColor; 
        });
    } else {
        globalColor = newColor; // Globale Variable (siehe Schritt 3 in der vorherigen Nachricht)
    }
    render();
});

// Abstand der Doppelbindung ändern
spacingSlider?.addEventListener('input', () => {
    const newSpacing = parseFloat(spacingSlider.value);
    if (spacingVal) spacingVal.innerText = newSpacing.toString();
    const selectedIds = state.getSelectedAtomIds();
    
    if (selectedIds.size > 0) {
        state.getBonds().forEach(b => {
            if (selectedIds.has(b.id1) || selectedIds.has(b.id2)) b.spacing = newSpacing;
        });
    } else {
        globalBondSpacing = newSpacing;
    }
    render();
});

// Fürs Undo beim Slider-Loslassen (analog zu deinem Bond-Length-Slider)
spacingSlider?.addEventListener('change', () => {
    state.saveState();
});

// Schriftart ändern
fontSelect?.addEventListener('change', () => {
    const newFont = fontSelect.value;
    const selectedIds = state.getSelectedAtomIds();
    
    if (selectedIds.size > 0) {
        state.saveState();
        state.getAtoms().forEach(a => { if (selectedIds.has(a.id)) a.fontFamily = newFont; });
    } else {
        globalFontFamily = newFont;
    }
    render();
});

initPSE();

function resizeCanvas() {
    canvas.width = window.innerWidth - 20;
    canvas.height = window.innerHeight - 80; // Platz für die Toolbar abziehen
    render();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 
render();