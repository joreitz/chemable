export let verboose = true;
if (verboose) {console.log("🚀 Renderer.ts wird geladen...")} ;

import { state } from "./state";
import { Atom, Bond } from "./types";
import { findAtomNearPosition, getBondAtCoords, isPointInPolygon, rotatePoint, centerOfPoints, angleOfMouseMovement } from "./geometry";
import { applyAutoLayout, calculateNewAtomPosition } from "./chemistry";
import { drawScene } from "./draw";
import { periodicTable } from "./pse";
import { elementLayout } from "./pse_layout";

// Lokale UI-Variablen (Dinge, die NICHT im History-Undo gespeichert werden müssen)
let editMode: "draw" | "move" | "erase" | "select" = "draw";
let showValenceWarnings = true;

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

function render() {
    if (verboose) {console.log("🎨 Render wird aufgerufen. Atome:", state.getAtoms().length);}
    drawScene(ctx, canvas.width, canvas.height, state.getAtoms(), state.getBonds(), {
        showValenceWarnings,
        selectedAtomId: null, 
        dragStartAtom,
        mousePos: { x: currentMouseX, y: currentMouseY },
        lassoPath: lassoPath,
        selectedAtomIds: state.getSelectedAtomIds()
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
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const atoms = state.getAtoms();
    const bonds = state.getBonds();

    // 1. RADIERER MODUS
    if (editMode === "erase") {
        const atomHit = findAtomNearPosition(x, y, atoms, 20);
        if (atomHit) {
            state.saveState(); 
            const newAtoms = atoms.filter(a => a.id !== atomHit.id);
            const newBonds = bonds.filter(b => b.id1 !== atomHit.id && b.id2 !== atomHit.id);
            state.setAtoms(newAtoms);
            state.setBonds(newBonds);
            render();
            return;
        }
        const bondHit = getBondAtCoords(x, y, bonds, atoms);
        if (bondHit) {
            state.saveState(); 
            state.setBonds(bonds.filter(b => b !== bondHit));
            render();
        }
    
    // 2. VERSCHIEBE MODUS (Einzeln)
    } else if (editMode === "move") {
        movingAtom = findAtomNearPosition(x, y, atoms, 20);
    
    } else if (e.button ===2) {
        if (state.getSelectedAtomIds().size >0) {
            const selectedIDs = state.getSelectedAtomIds();
            const allAtoms = state.getAtoms();
            const selectedAtoms = allAtoms.filter(atom => selectedIDs.has(atom.id));

            selectedAtoms.forEach(atom => {
                initialAtomPosition.set(atom.id, {x: atom.x, y: atom.y});
            })
            isRotating = true;
            
        }
    // 3. SELEKTIONS MODUS (Lasso) -> NEU
    } else if (editMode === "select") {
        const atomHit = findAtomNearPosition(x, y, atoms, 20);

        // A) Klick auf ein Atom, das SCHON ausgewählt ist -> Auswahl verschieben
        if (atomHit && state.isSelected(atomHit.id)) {
            isDraggingSelection = true;
            dragStartX = x;
            dragStartY = y;
            state.saveState(); // Zustand vor dem Verschieben sichern
        } 
        // B) Klick ins Leere oder auf ein nicht-markiertes -> Neues Lasso starten
        else {
            state.clearSelection(); // Alte Auswahl weg
            lassoPath = [{x, y}];   // Pfad starten
            render();
        }

    // 4. ZEICHEN MODUS (Der Standard-Fall "else")
    // WICHTIG: Wenn dieser Block fehlt, passiert beim Klicken nichts!
    } else {
        dragStartX = x;
        dragStartY = y;
        dragStartAtom = findAtomNearPosition(x, y, atoms, 20);
    }
});


canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    currentMouseX = e.clientX - rect.left;
    currentMouseY = e.clientY - rect.top;

    if (editMode === "move" && movingAtom) {
        movingAtom.x = currentMouseX;
        movingAtom.y = currentMouseY;
        render();

    } else if (editMode === "select") {
        if (isDraggingSelection) {
        // --- GRUPPE VERSCHIEBEN ---
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

    } else if (lassoPath.length > 0) {
    // --- LASSO MALEN ---
    
        const lastPoint = lassoPath[lassoPath.length - 1];
    
        const dx = currentMouseX - lastPoint.x;
        const dy = currentMouseY - lastPoint.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist > 5) {
            lassoPath.push({ x: currentMouseX, y: currentMouseY });
            render(); // Jetzt wird viel seltener gerendert!
        } else render();

    } else if (isRotating) {

        state.saveState();
        const atoms = state.getAtoms();
        const selectedIDs = state.getSelectedAtomIds();
        const selectedAtoms = atoms.filter(atom => selectedIDs.has(atom.id));
        rotationcenter = centerOfPoints(selectedAtoms.map(a => ({x: a.x, y: a.y})));
        const angle = angleOfMouseMovement(
            {x: currentMouseX, y: currentMouseY}, 
            rotationcenter
        ) - angleOfMouseMovement(
            {x: dragStartX, y: dragStartY}, 
            rotationcenter
        );
        dragStartX = currentMouseX;
        dragStartY = currentMouseY;

        selectedAtoms.forEach(atom => {
            const initialPos = selectedAtoms.find(pos => pos.id === atom.id);
            if (initialPos) {
                const rotated = rotatePoint(initialPos, rotationcenter, angle);
                atom.x = rotated.x;
                atom.y = rotated.y;
            }
            
        });
        render();
    }
}});

canvas.addEventListener('mouseup', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 1. VERSCHIEBEN BEENDEN
    if (editMode === "move") {
        if (movingAtom) state.saveState(); 
        movingAtom = null;
        return;
    }

    // 2. SELEKTIEREN BEENDEN
    if (editMode === "select") {
        if (isDraggingSelection) {
            console.log("✅ Verschieben beendet.");
            isDraggingSelection = false;
        } 
        else if (lassoPath.length > 0) {
            // Lasso auswerten
            lassoPath.push({x: lassoPath[0].x, y: lassoPath[0].y}); // Schließen
            
            const atoms = state.getAtoms();
            const newSelection: number[] = [];

            // DEBUG: Mal schauen, wie viele Atome wir prüfen
            console.log(`🔍 Prüfe Lasso auf ${atoms.length} Atome...`);

            for (const atom of atoms) {
                const inside = isPointInPolygon({x: atom.x, y: atom.y}, lassoPath);
                if (inside) {
                    newSelection.push(atom.id);
                }
            }

            console.log(`🎯 Ergebnis: ${newSelection.length} Atome im Lasso gefunden.`);

            state.selectAtoms(newSelection);
            lassoPath = []; 
            render();
        }
        return; 
    }

    // 3. RADIERER (Macht nix bei MouseUp)
    if (editMode === "erase") return;

    if (isRotating) {
        isRotating = false;
        initialAtomPosition.clear();
        return;
    }

    // --- 4. ZEICHEN MODUS (Hier werden Atome erstellt!) ---
    
    const atoms = state.getAtoms();
    const bonds = state.getBonds();
    const distance = Math.sqrt((x - dragStartX)**2 + (y - dragStartY)**2);
    const wasDragging = distance > 10;
    
    // Aktuelles Element holen (z.B. "C")
    const currentEl = state.getCurrentElement(); 

    if (dragStartAtom) {
        // Wir haben auf einem Atom gestartet (Ziehen einer Bindung)
        const dragEndAtom = findAtomNearPosition(x, y, atoms, 20);

        if (dragEndAtom && dragEndAtom.id !== dragStartAtom.id) {
            // A) Verbindung zu existierendem Atom
            const exists = bonds.some(b => 
                (b.id1 === dragStartAtom!.id && b.id2 === dragEndAtom.id) || 
                (b.id1 === dragEndAtom.id && b.id2 === dragStartAtom!.id)
            );
            if (!exists) {
                state.saveState();
                state.addBond({ id1: dragStartAtom.id, id2: dragEndAtom.id, type: 1 });
            }
        } else {
            // B) Ziehen ins Leere -> Neues Atom + Bindung
            if (wasDragging) {
                state.saveState();
                const newAtom: Atom = { id: state.getNextId(), element: currentEl, x, y };
                state.addAtom(newAtom);
                state.addBond({ id1: dragStartAtom.id, id2: newAtom.id, type: 1 });
            } else {
                // C) Kurzer Klick auf Atom -> Anbau-Logik (Skelett-Modus)
                const pos = calculateNewAtomPosition(dragStartAtom, bonds, atoms);
                
                // Kollisions-Check: Landen wir auf einem existierenden Atom?
                const neighbor = findAtomNearPosition(pos.x, pos.y, atoms, 10); // Radius etwas kleiner
                
                if (neighbor) {
                   // Ring-Schluss Logik wäre hier, lassen wir simpel
                } else {
                    state.saveState();
                    const newAtom: Atom = { id: state.getNextId(), element: currentEl, x: pos.x, y: pos.y };
                    state.addAtom(newAtom);
                    state.addBond({ id1: dragStartAtom.id, id2: newAtom.id, type: 1 });
                }
            }
        }
        dragStartAtom = null; // Reset
    } else {
        // Wir haben im Leeren gestartet (Klick auf Hintergrund)
        
        const clickedBond = getBondAtCoords(x, y, bonds, atoms);
        
        if (clickedBond && !wasDragging) {
            // Klick auf Bindung -> Typ ändern
            state.saveState();
            clickedBond.type = (clickedBond.type % 3) + 1; 
        } else if (!wasDragging && !clickedBond) {
            // Klick ins Leere -> FREIES ATOM ERSTELLEN
            state.saveState();
            const newAtom: Atom = { id: state.getNextId(), element: currentEl, x, y };
            state.addAtom(newAtom);
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

document.getElementById('btn-undo')?.addEventListener('click', performUndo);

// Tastaturkürzel Undo
document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        performUndo();
    }
});

// Modus umschalten
function setMode(mode: "draw" | "move" | "erase" | "select") {
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
document.getElementById('btn-draw')?.addEventListener('click', () => setMode("draw"));
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

initPSE();
render();