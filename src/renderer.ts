import { periodicTable } from "./pse";
import { Atom, Bond, EditorState} from "./types.js"

//Interfaces immer mit großem Anfangsbuchstaben

let historyState: EditorState[] = [];

//State
let atoms: Atom[] = [];
let bonds: Bond[] = [];
let currentElement = "C";
let nextId = 1;
let selectedAtom: Atom | null = null;
let clickedAtom: Atom | null = null;
let dragStartAtom: Atom | null = null;
let dragStartX = 0;
let dragStartY = 0;
let currentMouseX = 0;
let currentMouseY = 0;
let editMode: "draw" | "move" | "erase" = "draw";
let movingAtom: Atom | null = null;
let showValenceWarnings = true;


function getAngle(fromId: number, toId: number): number {
    const atom1 = getAtomByID(fromId);
    const atom2 = getAtomByID(toId);
    
    // Sicherheitscheck, falls ein Atom gelöscht wurde
    if (!atom1 || !atom2) return 0;

    const dx = atom2.x - atom1.x;
    const dy = atom2.y - atom1.y;
    
    return Math.atan2(dy, dx);
}

function getPartnerAtomId(bond: Bond, myAtomId: number): number {
    if (bond.id1 === myAtomId) {
        return bond.id2;
    } else {
        return bond.id1;
    }
}

function findAtomNearPosition(x: number, y: number, tolerance: number, excludeId: number): Atom | null {
    for (const atom of atoms) {
       
        if (atom.id === excludeId) continue;

        // Abstand berechnen 
        const dx = atom.x - x;
        const dy = atom.y - y;
        const distance = Math.sqrt(dx*dx + dy*dy); 

        if (distance < tolerance) {
            return atom; 
        }
    }
    return null; // Nichts gefunden
}

// Prüft, ob ein Winkel an einem Atom noch frei ist
function isAngleFree(centerId: number, angleToCheck: number): boolean {
    const neighbors = bonds.filter(b => b.id1 === centerId || b.id2 === centerId);
    
    for (const bond of neighbors) {
        const partnerId = (bond.id1 === centerId) ? bond.id2 : bond.id1;
        const angleExisting = getAngle(centerId, partnerId);
        
        // Winkel-Differenz berechnen
        const diff = Math.atan2(Math.sin(angleToCheck - angleExisting), Math.cos(angleToCheck - angleExisting));
        
        // Wenn der Winkel zu ähnlich ist (< 15 Grad), ist er belegt
        if (Math.abs(diff) < 0.26) { 
            return false;
        }
    }
    return true;
}

function newAtomPosition(clickedAtom: Atom) {
    const startid = clickedAtom.id;
    const verbundeneBindungen = bonds.filter(b => b.id1 === startid || b.id2 === startid);
    const anzahlNachbarn = verbundeneBindungen.length;

    // Radius holen (Hier nehmen wir den Radius des AKTUELLEN Elements + des Clickt-Atoms)
    // Vereinfacht für den Moment fest:
    const radius = 60; 

    let winkel = 0;

    if (anzahlNachbarn === 0) {
        winkel = -Math.PI / 6;
    } else if (anzahlNachbarn === 1) {
        const bond = verbundeneBindungen[0];
        const idPartner = getPartnerAtomId(bond, startid);
        const winkelAnkunft = getAngle(idPartner, startid);
        winkel = winkelAnkunft + (Math.PI / 3); 
    } else if (anzahlNachbarn === 2) {
        const idPartner1 = getPartnerAtomId(verbundeneBindungen[0], startid);
        const idPartner2 = getPartnerAtomId(verbundeneBindungen[1], startid);
        const w1 = getAngle(startid, idPartner1);
        const w2 = getAngle(startid, idPartner2);
        const dx = Math.cos(w1) + Math.cos(w2);
        const dy = Math.sin(w1) + Math.sin(w2);
        winkel = Math.atan2(dy, dx) + Math.PI;
    } else {
        const bond = verbundeneBindungen[anzahlNachbarn - 1];
        const idPartner = getPartnerAtomId(bond, startid);
        const wLast = getAngle(startid, idPartner);
        winkel = wLast + (Math.PI / 3);
    }

    // --- KOLLISIONS-CHECK (Neu) ---
    // Wenn der Winkel belegt ist, drehen wir weiter
    let attempts = 0;
    while (!isAngleFree(startid, winkel) && attempts < 36) {
        winkel += 0.3; // ca. 17 Grad weiterdrehen
        attempts++;
    }

    const newx = Math.cos(winkel) * radius + clickedAtom.x;
    const newy = Math.sin(winkel) * radius + clickedAtom.y;

    return [newx, newy];
}

// Subscript-Mapping 
const SUBSCRIPT_NUMBERS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

function toSubscript(num: number): string {
    return num.toString().split('').map(d => SUBSCRIPT_NUMBERS[parseInt(d)] || d).join('');
}

function getImplicitHydrogens(atom: Atom): number {
    const data = periodicTable[atom.element];
    if (!data) return 0;
    
    const maxValence = Math.max(...data.valency);
    
    let currentBonds = 0;
    for (const bond of bonds) {
        if (bond.id1 === atom.id || bond.id2 === atom.id) {
            currentBonds += bond.type; // Doppelbindung zählt 2, Dreifach 3
        }
    }
    
    return Math.max(0, maxValence - currentBonds);
}

function getAtomLabel(atom: Atom): string {
    const hCount = getImplicitHydrogens(atom);
    
    // --- SONDERFALL KOHLENSTOFF ---
    if (atom.element === "C") {
        // Wenn C noch volle 4 H hat (isoliert), zeigen wir "CH₄"
        if (hCount === 4) {
            return "CH" + toSubscript(4);
        }
        // Sobald Bindungen da sind (hCount < 4), zeigen wir GAR NICHTS (Skelett)
        return ""; 
    }

    // --- ALLE ANDEREN ELEMENTE (O, N, etc.) ---
    // Hier zeigen wir das Element + H an (z.B. "OH" oder "NH₂")
    if (hCount === 0) return atom.element;
    if (hCount === 1) return atom.element + "H";
    return atom.element + "H" + toSubscript(hCount);
}

//Canvaszugriff
const canvas = document.getElementById('chemBoard') as HTMLCanvasElement;
const ctx = canvas.getContext("2d");

function draw() {
    // Sicherheitscheck: Wenn ctx null ist, brechen wir ab
    if (!ctx) return;

    // 1. Alles sauber machen
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ----------------------------
    // SCHRITT A: BINDUNGEN ZEICHNEN
    // ----------------------------
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#000000";

    for (const bond of bonds) {
        const atom1 = getAtomByID(bond.id1);
        const atom2 = getAtomByID(bond.id2);

        // Wenn ein Atom gelöscht wurde, Bindung ignorieren
        if (!atom1 || !atom2) continue;

        // Vektor-Mathematik für saubere parallele Linien
        const dx = atom2.x - atom1.x;
        const dy = atom2.y - atom1.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length === 0) continue; // Verhindert Absturz bei 0-Länge

        // "Normalenvektor" berechnen (Senkrecht zur Bindung)
        // Das sorgt dafür, dass die Doppelbindung immer im richtigen Winkel steht
        const nx = -dy / length;
        const ny = dx / length;
        const offset = 4; // Pixel-Abstand der Linien bei Doppelbindung

        ctx.beginPath();

        if (bond.type === 1) {
            // --- Einfachbindung ---
            ctx.moveTo(atom1.x, atom1.y);
            ctx.lineTo(atom2.x, atom2.y);

        } else if (bond.type === 2) {
            // --- Doppelbindung ---
            // Linie 1 (versetzt nach oben/links)
            ctx.moveTo(atom1.x + nx * offset, atom1.y + ny * offset);
            ctx.lineTo(atom2.x + nx * offset, atom2.y + ny * offset);
            // Linie 2 (versetzt nach unten/rechts)
            ctx.moveTo(atom1.x - nx * offset, atom1.y - ny * offset);
            ctx.lineTo(atom2.x - nx * offset, atom2.y - ny * offset);

        } else if (bond.type === 3) {
            // --- Dreifachbindung ---
            // Linie 1 (Mitte)
            ctx.moveTo(atom1.x, atom1.y);
            ctx.lineTo(atom2.x, atom2.y);
            // Linie 2 (Versatz +)
            ctx.moveTo(atom1.x + nx * (offset + 1), atom1.y + ny * (offset + 1));
            ctx.lineTo(atom2.x + nx * (offset + 1), atom2.y + ny * (offset + 1));
            // Linie 3 (Versatz -)
            ctx.moveTo(atom1.x - nx * (offset + 1), atom1.y - ny * (offset + 1));
            ctx.lineTo(atom2.x - nx * (offset + 1), atom2.y - ny * (offset + 1));
        }

        ctx.stroke();
    }

    // ----------------------------
    // SCHRITT B: ATOME ZEICHNEN
    // ----------------------------
    // Atome kommen NACH den Bindungen, damit sie die Linienenden verdecken
    
// ... (Bindungen wurden bereits gezeichnet) ...

    // ----------------------------
    // SCHRITT B: ATOME ZEICHNEN
    // ----------------------------
    ctx.font = "bold 14px Arial"; 
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const atom of atoms) {
        // 1. Label berechnen (z.B. "CH₄", "OH" oder "" für Skelett-C)
        const label = getAtomLabel(atom);

        // --- SKELETT-MODUS ---
        // Wenn kein Label da ist (gebundener Kohlenstoff), zeichnen wir NICHTS.
        // Ausnahme: Wenn er selektiert ist oder einen Fehler hat, müssen wir ihn trotzdem sehen.
        const isHiddenCarbon = (label === "");
        
        const hasError = showValenceWarnings && hasValenceError(atom);
        const isSelected = (selectedAtom && selectedAtom.id === atom.id);

        // Wenn es ein unsichtbares C ist UND keine Warnung/Selektion aktiv ist -> Überspringen
        if (isHiddenCarbon && !hasError && !isSelected) {
            continue; 
        }

        // --- HINTERGRUND & KREIS ---
        
        // Warnung (Rot) im Hintergrund
        if (hasError) {
            ctx.beginPath();
            ctx.arc(atom.x, atom.y, 18, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
            ctx.fill();
        }

        // Weißer Kreis (damit Bindungen nicht durch den Text gehen)
        // Nur zeichnen, wenn wir auch Text haben oder das Atom selektiert ist
        if (!isHiddenCarbon || isSelected) {
            ctx.beginPath();
            ctx.arc(atom.x, atom.y, 11, 0, Math.PI * 2); 
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();

        }

        // --- TEXT ZEICHNEN ---
        if (!isHiddenCarbon) {
            ctx.fillStyle = "#000000";
            if (isSelected) ctx.fillStyle = "#FF0000"; // Selektion hat Vorrang
            
            ctx.fillText(label, atom.x, atom.y);
        } else if (isSelected) {
            // Wenn unsichtbares C selektiert ist, zeichnen wir einen kleinen roten Punkt
            ctx.fillStyle = "#FF0000";
            ctx.beginPath();
            ctx.arc(atom.x, atom.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ----------------------------
    // SCHRITT C: DRAG-VORSCHAU (Gummiband)
    // ----------------------------
    if (dragStartAtom) {
        ctx.beginPath();
        ctx.moveTo(dragStartAtom.x, dragStartAtom.y);
        ctx.lineTo(currentMouseX, currentMouseY);
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#888888"; // Grau
        ctx.setLineDash([5, 5]); // Gestrichelt
        ctx.stroke();
        
        ctx.setLineDash([]); // Zurücksetzen auf durchgezogen für den nächsten Frame
    }
}

function saveState() {
    console.log("Speichere Zustand... Neuer Stack:", historyState.length + 1);
    const snapshot: EditorState = {
        atoms: JSON.parse(JSON.stringify(atoms)),
        bonds: JSON.parse(JSON.stringify(bonds)),
        nextId: nextId,
        currentElement: currentElement
    }; 

    historyState.push(snapshot);
}

function undo() {
    console.log("Undo wurde geklickt! Stack-Länge:", historyState.length);
    if (historyState.length == 0) {
        return "Nothing to undo."
    } else {const lastState = historyState.pop()
    atoms = lastState!.atoms;
    bonds = lastState!.bonds;
    nextId = lastState!.nextId;
    currentElement = lastState!.currentElement;
    draw();
    };
}

//helper 
function getAtomByID(id: number): Atom | undefined {
    return atoms.find(atom => atom.id === id);
}

//Bindungen

// Atome hinzufügen
function addAtom(x: number, y: number) {
    const newAtom: Atom = {
        id: nextId++,
        element: currentElement,
        x: x,
        y: y
    };
    saveState();
    atoms.push(newAtom);
    draw();
}

function isClickOnBond(x: number, y: number, bond: Bond): boolean {
    const atom1 = getAtomByID(bond.id1);
    const atom2 = getAtomByID(bond.id2);

    if (!atom1 || !atom2) return false;

    const distX = x - atom1.x;
    const distY = y - atom1.y;

    const distAtomX = atom2.x - atom1.x;
    const distAtomY = atom2.y - atom1.y;

    const skalarprodukt = distX * distAtomX + distY * distAtomY;
    const lenSQ = distAtomX**2 + distAtomY**2;

    let param = -1;
    if (lenSQ !== 0)
        param = skalarprodukt / lenSQ

    let X, Y;
    if (param < 0) {
        X = atom1.x;
        Y = atom1.y;
    } else if (param > 1) {
        X = atom2.x;
        Y = atom2.y;
    } else {
        X = atom1.x + param * distAtomX;
        Y = atom1.y + param * distAtomY;
    }
    const dX = x - X;
    const dY = y - Y;
    return Math.sqrt(dX**2+dY**2) < 10;
}

function getBondAtCoords(x: number, y: number): Bond | undefined {
    return bonds.find(bond => isClickOnBond(x, y, bond));
}

function handleSingleClick(clickedAtom: Atom) {
    const pos = newAtomPosition(clickedAtom);
    const existingNeighbor = findAtomNearPosition(pos[0], pos[1], 20, clickedAtom.id);

    if (existingNeighbor) {
        // Ringschluss
        const schonVerbunden = bonds.some(b => 
            (b.id1 === clickedAtom.id && b.id2 === existingNeighbor.id) ||
            (b.id1 === existingNeighbor.id && b.id2 === clickedAtom.id)
        );

        if (!schonVerbunden) {
            saveState(); 
            bonds.push({
                id1: clickedAtom.id,
                id2: existingNeighbor.id,
                type: 1
            });
        }
    } else {
        // Kette verlängern
        saveState();

        const newAtom: Atom = {
            id: nextId++,
            element: currentElement, // <--- WICHTIG: Hier nehmen wir jetzt das ausgewählte Tool!
            x: pos[0],
            y: pos[1]
        };
        atoms.push(newAtom);

        bonds.push({
            id1: clickedAtom.id,
            id2: newAtom.id,
            type: 1
        });
    }
    draw(); 
}

function hasValenceError(atom: Atom): boolean {
    const elementInfo = periodicTable[atom.element];
    if (!elementInfo) return false; // Unbekannte Elemente ignorieren

    // 1. Maximale Valenz aus dem PSE holen (z.B. C = 4, O = 2)
    const maxValence = Math.max(...elementInfo.valency); 

    // 2. Aktuelle Bindungen zählen (Doppelbindungen zählen doppelt!)
    let currentBondCount = 0;
    for (const bond of bonds) {
        if (bond.id1 === atom.id || bond.id2 === atom.id) {
            currentBondCount += bond.type;
        }
    }

    // 3. Fehler melden, wenn Limit überschritten
    return currentBondCount > maxValence;
}

function deleteAtom(atomToDelete: Atom) {
    saveState(); // Wichtig: Erst Zustand für Undo sichern!

    // 1. Atom aus der Liste entfernen
    atoms = atoms.filter(a => a.id !== atomToDelete.id);

    // 2. Alle Bindungen entfernen, die mit diesem Atom verbunden waren
    bonds = bonds.filter(b => b.id1 !== atomToDelete.id && b.id2 !== atomToDelete.id);

    draw();
}

function deleteBond(bondToDelete: Bond) {
    saveState();
    // Bindung entfernen (Atome bleiben erhalten)
    bonds = bonds.filter(b => b !== bondToDelete);
    draw();
}

// 1. MAUS DRÜCKEN
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (editMode === "erase") {
        // --- RADIER-MODUS ---
        
        // 1. Versuchen, ein Atom zu treffen
        const atomHit = findAtomNearPosition(x, y, 20, -1);
        if (atomHit) {
            deleteAtom(atomHit);
            return; // Fertig, nicht weitermachen
        }

        // 2. Falls kein Atom getroffen, schauen ob wir eine Bindung treffen
        const bondHit = getBondAtCoords(x, y);
        if (bondHit) {
            deleteBond(bondHit);
        }

    } else if (editMode === "move") {
        // --- MOVE-MODUS ---
        movingAtom = findAtomNearPosition(x, y, 20, -1);

    } else {
        // --- DRAW-MODUS ---
        dragStartX = x;
        dragStartY = y;
        dragStartAtom = findAtomNearPosition(x, y, 20, -1);
    }
});

// 2. MAUS BEWEGEN
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    currentMouseX = e.clientX - rect.left;
    currentMouseY = e.clientY - rect.top;

    if (editMode === "move" && movingAtom) {
        movingAtom.x = currentMouseX;
        movingAtom.y = currentMouseY;
        draw(); 
    } else {
        draw(); // Vorschau-Linie
    }
});

// 3. MAUS LOSLASSEN
canvas.addEventListener('mouseup', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 1. War es ein Klick oder ein Ziehen? (Toleranz: 10 Pixel)
    const dx = x - dragStartX;
    const dy = y - dragStartY;
    const distance = Math.sqrt(dx*dx + dy*dy);
    const wasDragging = distance > 10; 

    // --- SZENARIO 1: Wir haben ein Atom gezogen ---
    if (dragStartAtom) {
        // Haben wir auf einem existierenden Atom losgelassen?
        const dragEndAtom = findAtomNearPosition(x, y, 20, -1);

        if (dragEndAtom && dragEndAtom.id !== dragStartAtom.id) {
            // A) VERBINDEN (Drag auf existierendes Atom)
            const exists = bonds.some(b => 
                (b.id1 === dragStartAtom!.id && b.id2 === dragEndAtom.id) ||
                (b.id1 === dragEndAtom.id && b.id2 === dragStartAtom!.id)
            );
            if (!exists) {
                saveState();
                bonds.push({ id1: dragStartAtom.id, id2: dragEndAtom.id, type: 1 });
            }

        } else {
            // Wir haben kein Atom getroffen.
            
            if (wasDragging) {
                // B) MANUELLES PLATZIEREN (Drag ins Leere)
                // Wir erstellen ein neues Atom genau dort, wo die Maus ist.
                saveState();

                const newAtom: Atom = {
                    id: nextId++,
                    element: currentElement, // Das aktuell ausgewählte Element (z.B. "C" oder "O")
                    x: x,
                    y: y
                };
                atoms.push(newAtom);

                // Und verbinden es mit dem Start-Atom
                bonds.push({
                    id1: dragStartAtom.id,
                    id2: newAtom.id,
                    type: 1
                });

            } else {
                // C) AUTOMATIK / SKELETT (Klick ohne Ziehen)
                // Deine Zick-Zack-Logik
                handleSingleClick(dragStartAtom);
            }
        }

        dragStartAtom = null; // Reset
        draw();
        return; // WICHTIG: Hier beenden, damit nicht aus Versehen noch Atome im Hintergrund erstellt werden
    }

    // --- SZENARIO 2: Klick ins Leere oder auf Bindung (Start war kein Atom) ---
    
    const clickedBond = getBondAtCoords(x, y);

    if (clickedBond) {
        // Nur wenn NICHT gezogen wurde, ändern wir den Typ (sonst ändert man ihn beim "Drüberziehen")
        if (!wasDragging) {
            saveState();
            if (clickedBond.type === 1) clickedBond.type = 2;
            else if (clickedBond.type === 2) clickedBond.type = 3;
            else clickedBond.type = 1;
        }
    } else {
        // Freies Atom setzen (nur bei Klick)
        if (!wasDragging) {
            addAtom(x, y); 
        }
    }
    
    draw();
});

document.addEventListener('keydown', (event) => {
if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
    undo();
}
});

function clearAll() {
    saveState();
    atoms = [];
    bonds = [];
    nextId = 1;
    draw();
}

// Knöpfe
document.getElementById('btn-c')?.addEventListener('click', () => {
    currentElement = "C";
    console.log("Currently: Carbon");
});

document.getElementById('btn-o')?.addEventListener('click', () => {
    currentElement = "O";
    console.log("Currently: Oxygen");
});

document.getElementById('btn-undo')?.addEventListener('click', () => {
    undo();
})

document.getElementById('btn-clear')?.addEventListener('click', () => {
    clearAll();
})

document.getElementById('btn-draw')?.addEventListener('click', () => {
    editMode = "draw";
    document.getElementById('btn-draw')!.style.backgroundColor = "#ddd";
    document.getElementById('btn-move')!.style.backgroundColor = "";
    document.getElementById('btn-erase')!.style.backgroundColor = ""; // Reset Erase
    canvas.style.cursor = "crosshair";
});

document.getElementById('btn-move')?.addEventListener('click', () => {
    editMode = "move";
    document.getElementById('btn-draw')!.style.backgroundColor = "";
    document.getElementById('btn-move')!.style.backgroundColor = "#ddd";
    document.getElementById('btn-erase')!.style.backgroundColor = ""; // Reset Erase
    canvas.style.cursor = "move";
});

document.getElementById('btn-warnings')?.addEventListener('click', () => {
    showValenceWarnings = !showValenceWarnings; // Umschalten
    
    // Button-Text/Farbe aktualisieren für Feedback
    const btn = document.getElementById('btn-warnings');
    if (btn) {
        if (showValenceWarnings) {
            btn.innerText = "⚠️ Warnungen: AN";
            btn.style.backgroundColor = "#ffcccc"; // Rot
        } else {
            btn.innerText = "Warnungen: AUS";
            btn.style.backgroundColor = "#ccffcc"; // Grün/Grau
        }
    }
    
    draw(); // Neu zeichnen, um Kreise auszublenden/anzuzeigen
});

document.getElementById('btn-erase')?.addEventListener('click', () => {
    editMode = "erase";
    
    // Visuelles Feedback (Farben zurücksetzen und Radierer markieren)
    const btnDraw = document.getElementById('btn-draw');
    const btnMove = document.getElementById('btn-move');
    const btnErase = document.getElementById('btn-erase');

    if(btnDraw) btnDraw.style.backgroundColor = "";
    if(btnMove) btnMove.style.backgroundColor = "";
    if(btnErase) btnErase.style.backgroundColor = "#ddd"; // Aktiv markieren
    
    canvas.style.cursor = "not-allowed"; // Oder ein anderes Symbol
});


draw();