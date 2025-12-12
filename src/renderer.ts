import { state } from "./state";
import { Atom, Bond } from "./types";
import { findAtomNearPosition, getBondAtCoords } from "./geometry";
import { applyAutoLayout, calculateNewAtomPosition } from "./chemistry";
import { drawScene } from "./draw";
import { periodicTable } from "./pse";
import { elementLayout } from "./pse_layout";

// Lokale UI-Variablen (Dinge, die NICHT im History-Undo gespeichert werden müssen)
let editMode: "draw" | "move" | "erase" = "draw";
let showValenceWarnings = true;

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

// Wrapper fürs Zeichnen
function render() {
    drawScene(ctx, canvas.width, canvas.height, state.getAtoms(), state.getBonds(), {
        showValenceWarnings,
        selectedAtomId: null, 
        dragStartAtom,
        mousePos: { x: currentMouseX, y: currentMouseY }
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

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const atoms = state.getAtoms();
    const bonds = state.getBonds();

    if (editMode === "erase") {
        const atomHit = findAtomNearPosition(x, y, atoms, 20);
        if (atomHit) {
            state.saveState(); // Sichern
            const newAtoms = atoms.filter(a => a.id !== atomHit.id);
            const newBonds = bonds.filter(b => b.id1 !== atomHit.id && b.id2 !== atomHit.id);
            state.setAtoms(newAtoms);
            state.setBonds(newBonds);
            render();
            return;
        }
        const bondHit = getBondAtCoords(x, y, bonds, atoms);
        if (bondHit) {
            state.saveState(); // Sichern
            state.setBonds(bonds.filter(b => b !== bondHit));
            render();
        }

    } else if (editMode === "move") {
        movingAtom = findAtomNearPosition(x, y, atoms, 20);

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
    } else {
        render();
    }
});

canvas.addEventListener('mouseup', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (editMode === "move") {
        if (movingAtom) state.saveState(); // Nach Verschieben speichern
        movingAtom = null;
        return;
    }

    if (editMode === "erase") return;

    // --- ZEICHEN LOGIK ---
    const atoms = state.getAtoms();
    const bonds = state.getBonds();
    const distance = Math.sqrt((x - dragStartX)**2 + (y - dragStartY)**2);
    const wasDragging = distance > 10;
    
    // WICHTIG: Hier holen wir das Element JETZT aus dem State!
    const currentEl = state.getCurrentElement(); 

    if (dragStartAtom) {
        const dragEndAtom = findAtomNearPosition(x, y, atoms, 20);

        if (dragEndAtom && dragEndAtom.id !== dragStartAtom.id) {
            // A) Verbinden
            const exists = bonds.some(b => 
                (b.id1 === dragStartAtom!.id && b.id2 === dragEndAtom.id) || 
                (b.id1 === dragEndAtom.id && b.id2 === dragStartAtom!.id)
            );
            if (!exists) {
                state.saveState();
                state.addBond({ id1: dragStartAtom.id, id2: dragEndAtom.id, type: 1 });
            }
        } else {
            // B) Ins Leere gezogen -> Neues Atom + Bindung
            if (wasDragging) {
                state.saveState();
                const newAtom: Atom = { id: state.getNextId(), element: currentEl, x, y };
                state.addAtom(newAtom);
                state.addBond({ id1: dragStartAtom.id, id2: newAtom.id, type: 1 });
            } else {
                // C) Klick -> Skelett-Modus
                const pos = calculateNewAtomPosition(dragStartAtom, bonds, atoms);
                const neighbor = findAtomNearPosition(pos.x, pos.y, atoms, 20, dragStartAtom.id);
                
                if (neighbor) {
                    // Ring schließen
                    // Prüfen ob Bindung schon existiert
                    const exists = bonds.some(b => 
                        (b.id1 === dragStartAtom!.id && b.id2 === neighbor.id) || 
                        (b.id1 === neighbor.id && b.id2 === dragStartAtom!.id)
                    );
                    if (!exists) {
                        state.saveState();
                        state.addBond({ id1: dragStartAtom.id, id2: neighbor.id, type: 1 });
                    }
                } else {
                    // Neues Atom anbauen
                    state.saveState();
                    const newAtom: Atom = { id: state.getNextId(), element: currentEl, x: pos.x, y: pos.y };
                    state.addAtom(newAtom);
                    state.addBond({ id1: dragStartAtom.id, id2: newAtom.id, type: 1 });
                }
            }
        }
        dragStartAtom = null;
    } else {
        // Start im Leeren
        const clickedBond = getBondAtCoords(x, y, bonds, atoms);
        if (clickedBond && !wasDragging) {
            state.saveState();
            clickedBond.type = (clickedBond.type % 3) + 1; // 1->2->3->1
        } else if (!wasDragging && !clickedBond) {
            // Freies Atom
            state.saveState();
            const newAtom: Atom = { id: state.getNextId(), element: currentEl, x, y };
            state.addAtom(newAtom);
        }
    }
    render();
});

// --- UI BUTTONS ---

// WICHTIG: Hier setzen wir den State, nicht mehr eine lokale Variable!

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
function setMode(mode: "draw" | "move" | "erase") {
    editMode = mode;
    // Buttons reset
    document.getElementById('btn-draw')!.style.backgroundColor = "";
    document.getElementById('btn-move')!.style.backgroundColor = "";
    document.getElementById('btn-erase')!.style.backgroundColor = "";
    
    // Aktiven Button färben
    document.getElementById(`btn-${mode}`)!.style.backgroundColor = "#ddd";
    
    // Cursor anpassen
    if (mode === "erase") canvas.style.cursor = "not-allowed"; // oder url(...)
    else if (mode === "move") canvas.style.cursor = "move";
    else canvas.style.cursor = "crosshair";
}

document.getElementById('btn-draw')?.addEventListener('click', () => setMode("draw"));
document.getElementById('btn-move')?.addEventListener('click', () => setMode("move"));
document.getElementById('btn-erase')?.addEventListener('click', () => setMode("erase"));
document.getElementById('btn-clean')?.addEventListener('click', () => {
    state.saveState();
    applyAutoLayout(state.getAtoms(), state.getBonds());
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
// Start!
render();