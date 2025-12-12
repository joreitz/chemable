import { periodicTable } from "./pse";
import { Atom, Bond } from "./types";
import { getAngle } from "./geometry";

// --- HELPER ---
const SUBSCRIPT_NUMBERS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

function toSubscript(num: number): string {
    return num.toString().split('').map(d => SUBSCRIPT_NUMBERS[parseInt(d)] || d).join('');
}

export function getImplicitHydrogens(atom: Atom, bonds: Bond[]): number {
    const data = periodicTable[atom.element];
    if (!data) return 0;
    const maxValence = Math.max(...data.valency);
    let currentBonds = 0;
    for (const bond of bonds) {
        if (bond.id1 === atom.id || bond.id2 === atom.id) currentBonds += bond.type;
    }
    return Math.max(0, maxValence - currentBonds);
}

export function getAtomLabel(atom: Atom, bonds: Bond[]): string {
    const hCount = getImplicitHydrogens(atom, bonds);
    if (atom.element === "C") {
        if (hCount === 4) return "CH" + toSubscript(4);
        return ""; 
    }
    if (hCount === 0) return atom.element;
    if (hCount === 1) return atom.element + "H";
    return atom.element + "H" + toSubscript(hCount);
}

export function hasValenceError(atom: Atom, bonds: Bond[]): boolean {
    const data = periodicTable[atom.element];
    if (!data) return false;
    const maxValence = Math.max(...data.valency);
    let currentBonds = 0;
    for (const bond of bonds) {
        if (bond.id1 === atom.id || bond.id2 === atom.id) currentBonds += bond.type;
    }
    return currentBonds > maxValence;
}

export function calculateNewAtomPosition(clickedAtom: Atom, bonds: Bond[], atoms: Atom[], radius: number = 60): { x: number, y: number } {
    const startid = clickedAtom.id;
    const connectedBonds = bonds.filter(b => b.id1 === startid || b.id2 === startid);
    const neighborCount = connectedBonds.length;
    let angle = 0;
    const getPartner = (bond: Bond) => atoms.find(a => a.id === (bond.id1 === startid ? bond.id2 : bond.id1))!;

    if (neighborCount === 0) angle = -Math.PI / 6;
    else if (neighborCount === 1) {
        const partner = getPartner(connectedBonds[0]);
        angle = getAngle(partner, clickedAtom) + (Math.PI / 3); // Zick-Zack Standard beim Zeichnen
    } else if (neighborCount === 2) {
        const p1 = getPartner(connectedBonds[0]);
        const p2 = getPartner(connectedBonds[1]);
        const w1 = getAngle(clickedAtom, p1);
        const w2 = getAngle(clickedAtom, p2);
        const dx = Math.cos(w1) + Math.cos(w2);
        const dy = Math.sin(w1) + Math.sin(w2);
        angle = Math.atan2(dy, dx) + Math.PI;
    } else {
        const lastPartner = getPartner(connectedBonds[neighborCount - 1]);
        angle = getAngle(clickedAtom, lastPartner) + (Math.PI / 3);
    }
    return { x: Math.cos(angle) * radius + clickedAtom.x, y: Math.sin(angle) * radius + clickedAtom.y };
}

export function getIdealBondLength(bond: Bond, atoms: Atom[]): number {
    const a1 = atoms.find(a => a.id === bond.id1);
    const a2 = atoms.find(a => a.id === bond.id2);
    if (!a1 || !a2) return 60;
    const e1 = periodicTable[a1.element];
    const e2 = periodicTable[a2.element];
    if (!e1 || !e2) return 60;

    let lengthInPm = 0;
    if (bond.type === 1) lengthInPm = e1.covSingleBondRadius + e2.covSingleBondRadius;
    else if (bond.type === 2) lengthInPm = (e1.covDoubleBondRadius || e1.covSingleBondRadius) + (e2.covDoubleBondRadius || e2.covSingleBondRadius);
    else if (bond.type === 3) lengthInPm = (e1.covTripleBondRadius || e1.covSingleBondRadius) + (e2.covTripleBondRadius || e2.covSingleBondRadius);

    return lengthInPm * 0.6; // Pixel-Faktor
}

// --- CLEAN UP ALGORITHMUS ---

function recursiveLayout(
    rootAtomId: number, 
    atoms: Atom[], 
    bonds: Bond[], 
    visited: Set<number>, 
    incomingAngle: number | null,
    bendDirection: number // 1 oder -1
) {
    visited.add(rootAtomId);
    const rootAtom = atoms.find(a => a.id === rootAtomId)!;

    // 1. Unbesuchte Nachbarn finden
    const connections = bonds
        .filter(b => b.id1 === rootAtomId || b.id2 === rootAtomId)
        .map(b => ({ bond: b, neighborId: (b.id1 === rootAtomId) ? b.id2 : b.id1 }))
        .filter(conn => !visited.has(conn.neighborId));

    if (connections.length === 0) return;

    // Gesamtzahl Arme am Atom (inklusive dem, wo wir herkommen)
    const totalArms = connections.length + (incomingAngle !== null ? 1 : 0);
    
    let currentAngle = 0;
    let nextBendDirection = bendDirection;

    if (incomingAngle !== null) {
        // --- MITTEN DRIN ---
        
        if (totalArms === 2) {
            // KETTE (Zick-Zack)
            // Wir weichen leicht von der Geraden ab (60 Grad)
            const deviation = (Math.PI / 3) * bendDirection; 
            currentAngle = incomingAngle + deviation;
            
            // Nächster Schritt andersrum
            nextBendDirection = bendDirection * -1; 

        } else {
            // VERZWEIGUNG
            // Winkel berechnen (z.B. 120° oder 90°)
            let angleStep = (2 * Math.PI) / totalArms;
            if (totalArms === 3) angleStep = (2 * Math.PI) / 3; // 120°
            if (totalArms >= 4) angleStep = Math.PI / 2;       // 90°

            // Spreizung berechnen
            const spread = angleStep * (connections.length - 1);
            
            // WICHTIG: Startwinkel zentriert um die "Geradeaus"-Richtung
            // (Hier war vorher der Fehler mit + Math.PI)
            currentAngle = incomingAngle - (spread / 2);
            
            // Bei Verzweigungen Reset des Zick-Zacks, damit Ketten danach sauber laufen
            nextBendDirection = 1;
        }

    } else {
        // --- STARTPUNKT ---
        // Standard: Startet nach Rechts (-30°)
        currentAngle = -Math.PI / 6; 
        
        if (connections.length === 2) {
            // Spezialfall: Start ist Mitte einer Kette -> Linear starten (180° versetzt)
            // Erster Arm nach links unten (150°), Zweiter nach rechts unten (-30°)
            // Wir setzen den Start so, dass die Schleife das automatisch macht
            currentAngle = (5 * Math.PI) / 6; // 150°
        } else if (connections.length > 2) {
             let angleStep = (2 * Math.PI) / connections.length;
             if (connections.length === 3) angleStep = 2*Math.PI/3;
             if (connections.length === 4) angleStep = Math.PI/2;
             
             // Zentrieren (dreht das ganze Molekül etwas)
             currentAngle -= (angleStep * (connections.length - 1)) / 2;
        }
    }

    // 2. Platzierung und Rekursion
    for (let i = 0; i < connections.length; i++) {
        const conn = connections[i];
        const neighbor = atoms.find(a => a.id === conn.neighborId)!;
        const dist = getIdealBondLength(conn.bond, atoms);

        // Position setzen
        neighbor.x = rootAtom.x + Math.cos(currentAngle) * dist;
        neighbor.y = rootAtom.y + Math.sin(currentAngle) * dist;

        // Absteigen
        recursiveLayout(neighbor.id, atoms, bonds, visited, currentAngle, nextBendDirection);

        // Winkel weiterdrehen für den nächsten Nachbarn am selben Atom
        if (connections.length > 1) {
             let step = (2 * Math.PI) / totalArms;
             // Startpunkt Sonderbehandlung für schöne Winkel
             if (incomingAngle === null) {
                 step = (2 * Math.PI) / connections.length;
                 if (connections.length === 3) step = 2*Math.PI/3;
                 if (connections.length === 4) step = Math.PI/2;
                 if (connections.length === 2) step = Math.PI; // 180° für Start-Kette
             } else {
                 if (totalArms === 3) step = (2 * Math.PI) / 3;
                 if (totalArms >= 4) step = Math.PI / 2;
             }
             
             // Bei Ketten (totalArms=2) passiert das hier nicht, da loop nur 1x läuft
             currentAngle += step;
        }
    }
}

export function applyAutoLayout(atoms: Atom[], bonds: Bond[]) {
    if (atoms.length === 0) return;
    const visited = new Set<number>();
    
    // Wir sortieren das Start-Atom so, dass wir möglichst am Ende einer Kette starten 
    // oder an einem zentralen Punkt. Für jetzt reicht atoms[0].
    recursiveLayout(atoms[0].id, atoms, bonds, visited, null, 1);
}