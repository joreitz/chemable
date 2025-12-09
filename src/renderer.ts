import { periodicTable, ElementData } from "./pse";
//Interfaces immer mit großem Anfangsbuchstaben

interface Atom {
    id: number;
    element: string;
    x: number;
    y: number;
}

interface Bond {
    id1: number;
    id2: number;
    type: number; // 1: Single; 2: Double; 3: Triple; [4: Keil (vorne); 5: Keil(hinten) noch nicht implementiert]
}

interface EditorState {
    atoms: Atom[];
    bonds: Bond[];
    nextId: number;
    currentElement: string;
}

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

function newAtomPosition(clickedAtom: Atom) {
    const startid = clickedAtom.id;
    console.log("--- Klick auf Atom " + startid + " ---");
    
    // 1. Alle Bindungen finden
    const verbundeneBindungen = bonds.filter(b => b.id1 === startid || b.id2 === startid);
    const anzahlNachbarn = verbundeneBindungen.length;
    console.log("Anzahl Nachbarn: " + anzahlNachbarn);

    // 2. Radius festlegen (Provisorisch 60, damit wir Fehler ausschließen)
    const radius = 60; 

    let winkel = 0;

    if (anzahlNachbarn === 0) {
        // Fall 1: Erstes Atom -> Startet leicht nach oben (-30 Grad)
        console.log("Fall: Startpunkt");
        winkel = -Math.PI / 6;

    } else if (anzahlNachbarn === 1) {
        // Fall 2: Verlängerung
        console.log("Fall: Kette verlängern");
        const bond = verbundeneBindungen[0];
        
        // HIER nutzen wir jetzt den sicheren Helfer:
        const idPartner = getPartnerAtomId(bond, startid);
        console.log("Partner ist Atom " + idPartner);

        // Winkel berechnen: VOM Partner ZU uns (A -> B)
        const winkelAnkunft = getAngle(idPartner, startid);
        
        // Um 60 Grad abknicken
        // (Für eine echte Zick-Zack-Linie müssten wir eigentlich prüfen, wie der VORGÄNGER war,
        // aber für jetzt reicht +60 Grad, das ergibt Kreise/Spiralen, ist aber technisch korrekt)
        winkel = winkelAnkunft + (Math.PI / 3); 

    } else if (anzahlNachbarn === 2) {
        // Fall 3: Verzweigung (Y-Form)
        console.log("Fall: Verzweigung");
        
        // Sicher die Partner-IDs holen
        const idPartner1 = getPartnerAtomId(verbundeneBindungen[0], startid);
        const idPartner2 = getPartnerAtomId(verbundeneBindungen[1], startid);

        const w1 = getAngle(startid, idPartner1);
        const w2 = getAngle(startid, idPartner2);

        // Vektor-Addition (Einheitskreis)
        const dx = Math.cos(w1) + Math.cos(w2);
        const dy = Math.sin(w1) + Math.sin(w2);
        
        // Winkel genau gegenüber der Resultierenden
        winkel = Math.atan2(dy, dx) + Math.PI;

    } else {
        // Fall 4: Stern / Überfüllt
        console.log("Fall: Stern");
        const bond = verbundeneBindungen[anzahlNachbarn - 1]; // Letzte Bindung
        const idPartner = getPartnerAtomId(bond, startid);
        const wLast = getAngle(startid, idPartner);
        
        winkel = wLast + (Math.PI / 3);
    }

    // 3. Neue Position
    const newx = Math.cos(winkel) * radius + clickedAtom.x;
    const newy = Math.sin(winkel) * radius + clickedAtom.y;

    // Optional: Logge das Ergebnis
    console.log("Neue Position berechnet:", newx, newy);

    return [newx, newy];
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
    
    ctx.font = "bold 14px Arial"; // Schriftart
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const atom of atoms) {
        // 1. Weißer Kreis (Hintergrund), damit Bindungen nicht durch den Text gehen
        ctx.beginPath();
        ctx.arc(atom.x, atom.y, 11, 0, Math.PI * 2); // Radius 11
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();

        // 2. Schwarzer Rand um das Atom (Optional - sieht oft sauberer aus)
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#000000";
        ctx.stroke();

        // 3. Das Elementsymbol (z.B. "C")
        ctx.fillStyle = "#000000";
        // Spezialfall: Wenn selectedAtom, dann vielleicht rot färben?
        if (selectedAtom && selectedAtom.id === atom.id) {
            ctx.fillStyle = "#FF0000";
        }
        
        ctx.fillText(atom.element, atom.x, atom.y);
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
function renderBonds() {
    if (!ctx) return;

    bonds.forEach(bond => {
        const atom1 = getAtomByID(bond.id1);
        const atom2 = getAtomByID(bond.id2);

        if (atom1 && atom2) {


                ctx.beginPath();
                ctx.lineWidth = 3;
                ctx.strokeStyle = "black";

            if (bond.type == 1) {

                ctx.moveTo(atom1.x, atom1.y);
                ctx.lineTo(atom2.x, atom2.y);
                ctx.stroke();      
                
            } else if (bond.type == 2) {

                const dx = atom2.x - atom1.x;
                const dy = atom2.y - atom1.y;
                const distxy = Math.sqrt(dx**2+dy**2);

                if (distxy > 0) {

                    const offsetX = (dy/distxy)*4
                    const offsetY = -(dx/distxy)*4

                    ctx.moveTo(atom1.x + offsetX, atom1.y + offsetY);
                    ctx.lineTo(atom2.x + offsetX, atom2.y + offsetY);

                    ctx.moveTo(atom1.x - offsetX, atom1.y - offsetY);
                    ctx.lineTo(atom2.x - offsetX, atom2.y - offsetY);

                }
                ctx.stroke();

            } else if (bond.type == 3) {

                const dx = atom2.x - atom1.x;
                const dy = atom2.y - atom1.y;
                const distxy = Math.sqrt(dx**2+dy**2);

                if (distxy > 0) {

                    const offsetX = (dy/distxy)*4.5
                    const offsetY = -(dx/distxy)*4.5

                    ctx.moveTo(atom1.x + offsetX, atom1.y + offsetY);
                    ctx.lineTo(atom2.x + offsetX, atom2.y + offsetY);

                    ctx.moveTo(atom1.x, atom1.y);
                    ctx.lineTo(atom2.x, atom2.y);

                    ctx.moveTo(atom1.x - offsetX, atom1.y - offsetY);
                    ctx.lineTo(atom2.x - offsetX, atom2.y - offsetY);

                }
                ctx.stroke();

            } else if (bond.type == 4) {

            } else {

            }

        }
    })
}

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

function getAtomAtCoords(x: number, y: number): Atom | undefined {
    const clickTolerance = 25; //25 pixel Tolleranz
    return atoms.find(atom => {
        const distance = Math.sqrt(
            (atom.x -x) ** 2 + (atom.y -y) ** 2
        );
        return distance < clickTolerance;
    })
}

function handleSingleClick(clickedAtom: Atom) {
    // 1. Zielposition berechnen (Zick-Zack oder Stern)
    const pos = newAtomPosition(clickedAtom);
    
    // 2. Schauen, ob an der Zielposition schon ein Atom ist (Ringschluss?)
    const existingNeighbor = findAtomNearPosition(pos[0], pos[1], 20, clickedAtom.id);

    if (existingNeighbor) {
        // --- FALL A: POTENTIELLER RINGSCHLUSS ---
        
        // Prüfen: Existiert die Bindung schon?
        const schonVerbunden = bonds.some(b => 
            (b.id1 === clickedAtom.id && b.id2 === existingNeighbor.id) ||
            (b.id1 === existingNeighbor.id && b.id2 === clickedAtom.id)
        );

        if (schonVerbunden) {
            console.log("Bindung existiert bereits. Abbruch.");
        } else {
            // ECHTER RINGSCHLUSS
            saveState(); 
            console.log("Ringschluss zu Atom " + existingNeighbor.id);
            
            bonds.push({
                id1: clickedAtom.id,
                id2: existingNeighbor.id,
                type: 1
            });
        }

    } else {
        // --- FALL B: KETTE VERLÄNGERN ---
        
        saveState();

        // Neues Atom erstellen
        const newAtom: Atom = {
            id: nextId++,
            element: clickedAtom.element, // Übernimmt Element vom Vorgänger
            x: pos[0],
            y: pos[1]
        };
        atoms.push(newAtom);

        // Neue Bindung erstellen
        bonds.push({
            id1: clickedAtom.id,
            id2: newAtom.id,
            type: 1
        });
    }
    
    draw(); // Wichtig: Neu zeichnen!
}

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Koordinaten merken für die Distanz-Berechnung später
    dragStartX = x;
    dragStartY = y;

    // Prüfen: Haben wir auf ein Atom gedrückt?
    dragStartAtom = findAtomNearPosition(x, y, 20, -1); 
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    currentMouseX = e.clientX - rect.left;
    currentMouseY = e.clientY - rect.top;

    // Wichtig: Neu zeichnen, damit die Linie der Maus folgt!
    draw(); 
});

canvas.addEventListener('mouseup', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // --- SZENARIO 1: Wir haben ein Atom gezogen (Drag & Drop oder Klick) ---
    if (dragStartAtom) {
        const dragEndAtom = findAtomNearPosition(x, y, 20, -1);

        if (dragEndAtom && dragEndAtom.id !== dragStartAtom.id) {
            // A) Drag & Drop Verbindung ziehen
            const exists = bonds.some(b => 
                (b.id1 === dragStartAtom!.id && b.id2 === dragEndAtom.id) ||
                (b.id1 === dragEndAtom.id && b.id2 === dragStartAtom!.id)
            );
            if (!exists) {
                saveState();
                bonds.push({ id1: dragStartAtom.id, id2: dragEndAtom.id, type: 1 });
            }
        } else {
            // B) Wir haben auf dem gleichen Atom losgelassen -> Skelett-Logik!
            handleSingleClick(dragStartAtom);
        }

        dragStartAtom = null; // Reset
        draw();
        return; // Fertig
    }

    // --- SZENARIO 2: Wir haben NICHT auf einem Atom gestartet ---
    // Das heißt: Wir haben auf eine Bindung oder ins Leere geklickt.
    
    // Check: Wurde eine Bindung getroffen?
    const clickedBond = getBondAtCoords(x, y); // Deine alte Funktion nutzen

    if (clickedBond) {
        // C) Bindungs-Typ ändern (Dein alter Code)
        saveState();
        if (clickedBond.type === 1) clickedBond.type = 2;
        else if (clickedBond.type === 2) clickedBond.type = 3;
        else clickedBond.type = 1;
    } else {
        // D) Ins Leere geklickt -> Freies Atom setzen (Dein alter Code)
        addAtom(x, y); 
    }
    
    draw();
});
//

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

draw();