// src/chemistry.ts
import { periodicTable } from "./pse";
import { Atom, Bond } from "./types";
import { getAngle } from "./geometry";

// --- HELPER ---
const SUBSCRIPT_NUMBERS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
const SUPERSCRIPT_NUMBERS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function toSubscript(num: number): string {
    return num.toString().split('').map(d => SUBSCRIPT_NUMBERS[parseInt(d)] || d).join('');
}

function formatCharge(charge?: number): string {
    if (!charge || charge === 0) return "";
    if (charge === 1) return "⁺";
    if (charge === -1) return "⁻";
    // Für Werte wie +2 oder -2:
    return Math.abs(charge).toString().split('').map(d => SUPERSCRIPT_NUMBERS[parseInt(d)] || d).join('') + (charge > 0 ? "⁺" : "⁻");
}

function getAdjustedValence(element: string, charge: number, baseValence: number): number {
    if (!charge) return baseValence;
    // Gruppe 14 (C, Si): Ladung reduziert Valenz (C+ = 3 Bindungen, C- = 3 Bindungen + freies Elektronenpaar)
    if (["C", "Si"].includes(element)) return Math.max(0, baseValence - Math.abs(charge));

    if (["N", "P", "O", "S", "F", "Cl", "Br", "I"].includes(element)) return Math.min(0, baseValence + charge);
    
    return baseValence;
}

export function getImplicitHydrogens(atom: Atom, bonds: Bond[]): number {
    const data = periodicTable[atom.element];
    if (!data) return 0;
    
    let targetValence = Math.max(...data.valency);
    targetValence = getAdjustedValence(atom.element, atom.charge || 0, targetValence);
    if (atom.radical) targetValence -= 1;

    let currentBonds = 0;
    for (const bond of bonds) {
        if (bond.id1 === atom.id || bond.id2 === atom.id) {
            // FIX: Keile (5) und Dashes (6) zählen chemisch als 1 Einfachbindung!
            if (bond.type === 5 || bond.type === 6) currentBonds += 1;
            else if (bond.type !== 4) currentBonds += bond.type;
        }
    }
    return Math.max(0, targetValence - currentBonds);
}

export function getAtomLabel(atom: Atom, bonds: Bond[], bondOnRight: boolean = false, showHydrogens: boolean = true): string {
    const hCount = getImplicitHydrogens(atom, bonds);
    
    if (atom.element === "C") {
        const connectedBonds = bonds.filter(b => b.id1 === atom.id || b.id2 === atom.id).length;
        if (connectedBonds >= 2 || (connectedBonds === 1 && !atom.charge && !atom.radical)) {
            return ""; 
        }
        if (hCount === 0) return "C";
        if (hCount === 1) return bondOnRight ? "HC" : "CH";
        return bondOnRight ? "H" + toSubscript(hCount) + "C" : "CH" + toSubscript(hCount);
    }
    
    if (!showHydrogens || hCount === 0) return atom.element;
    
    if (hCount === 1) return bondOnRight ? "H" + atom.element : atom.element + "H";
    
    return bondOnRight 
        ? "H" + toSubscript(hCount) + atom.element
        : atom.element + "H" + toSubscript(hCount);
}

export function isTransitionMetal(element: string): boolean {
    const metals = [
        "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
        "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd",
        "La", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
        "Al", "Ga", "In", "Sn", "Pb", "Bi"
    ];
    return metals.includes(element);
}

export function hasValenceError(atom: Atom, bonds: Bond[]): boolean {
    if (isTransitionMetal(atom.element)) {
        return false; 
    }
    const data = periodicTable[atom.element];
    if (!data) return false;
    
    let targetValence = Math.max(...data.valency);
    targetValence = getAdjustedValence(atom.element, atom.charge || 0, targetValence);
    if (atom.radical) targetValence -= 1;

    let currentBonds = 0;
    for (const bond of bonds) {
        if (bond.id1 === atom.id || bond.id2 === atom.id) {
            if (bond.type === 5 || bond.type === 6) currentBonds += 1;
            else if (bond.type !== 4) currentBonds += bond.type;
        }
    }
    return currentBonds > targetValence;
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
        angle = getAngle(partner, clickedAtom) + (Math.PI / 3); 
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

    return lengthInPm * 0.6; 
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

    const totalArms = connections.length + (incomingAngle !== null ? 1 : 0);
    
    let currentAngle = 0;
    let nextBendDirection = bendDirection;

    if (incomingAngle !== null) {
        // --- MITTEN DRIN ---
        if (totalArms === 2) {
            // KETTE (Zick-Zack)
            const deviation = (Math.PI / 3) * bendDirection; 
            currentAngle = incomingAngle + deviation;
            nextBendDirection = bendDirection * -1; 
        } else {
            // VERZWEIGUNG
            let angleStep = (2 * Math.PI) / totalArms;
            if (totalArms === 3) angleStep = (2 * Math.PI) / 3; 
            if (totalArms >= 4) angleStep = Math.PI / 2;
            const spread = angleStep * (connections.length - 1);
            currentAngle = incomingAngle - (spread / 2);
            nextBendDirection = 1;
        }
    } else {
        // --- STARTPUNKT ---
        currentAngle = -Math.PI / 6; 
        if (connections.length === 2) {
            currentAngle = (5 * Math.PI) / 6; 
        } else if (connections.length > 2) {
             let angleStep = (2 * Math.PI) / connections.length;
             if (connections.length === 3) angleStep = 2*Math.PI/3;
             if (connections.length === 4) angleStep = Math.PI/2;
             currentAngle -= (angleStep * (connections.length - 1)) / 2;
        }
    }

    // 2. Platzierung und Rekursion
    for (let i = 0; i < connections.length; i++) {
        const conn = connections[i];
        
        // --- FIX: Prüfen, ob der Nachbar überhaupt in unserer Liste ist (Selektion) ---
        const neighbor = atoms.find(a => a.id === conn.neighborId);
        if (!neighbor) continue; 

        const dist = getIdealBondLength(conn.bond, atoms);

        neighbor.x = rootAtom.x + Math.cos(currentAngle) * dist;
        neighbor.y = rootAtom.y + Math.sin(currentAngle) * dist;

        recursiveLayout(neighbor.id, atoms, bonds, visited, currentAngle, nextBendDirection);

        // Winkel weiterdrehen
        if (connections.length > 1) {
             let step = (2 * Math.PI) / totalArms;
             if (incomingAngle === null) {
                 step = (2 * Math.PI) / connections.length;
                 if (connections.length === 3) step = 2*Math.PI/3;
                 if (connections.length === 4) step = Math.PI/2;
                 if (connections.length === 2) step = Math.PI; 
             } else {
                 if (totalArms === 3) step = (2 * Math.PI) / 3;
                 if (totalArms >= 4) step = Math.PI / 2;
             }
             currentAngle += step;
        }
    }
}

export function applyAutoLayout(atoms: Atom[], bonds: Bond[], iterations: number = 300) {
    if (atoms.length === 0) return;

    const kStretch = 0.5;   // Bindungen ziehen sich an
    const kRepel = 2000;    // Atome stoßen sich ab
    const kAngle = 20.0;    // ERZWINGT chemische Winkel (z.B. 120 Grad)

    for (let i = 0; i < iterations; i++) {
        const forces = new Map<number, { fx: number, fy: number }>();
        atoms.forEach(a => forces.set(a.id, { fx: 0, fy: 0 }));

        // 1. Abstoßung
        for (let j = 0; j < atoms.length; j++) {
            for (let l = j + 1; l < atoms.length; l++) {
                const a = atoms[j]; const b = atoms[l];
                const dx = a.x - b.x; const dy = a.y - b.y;
                const d2 = dx * dx + dy * dy || 1;
                
                if (d2 < 60000) { 
                    const f = kRepel / d2;
                    forces.get(a.id)!.fx += (dx / Math.sqrt(d2)) * f;
                    forces.get(a.id)!.fy += (dy / Math.sqrt(d2)) * f;
                    forces.get(b.id)!.fx -= (dx / Math.sqrt(d2)) * f;
                    forces.get(b.id)!.fy -= (dy / Math.sqrt(d2)) * f;
                }
            }
        }

        // 2. Anziehung & Winkel-Spreizung
        atoms.forEach(pivot => {
            const connected = bonds.filter(b => b.id1 === pivot.id || b.id2 === pivot.id);
            const neighbors = connected.map(b => atoms.find(at => at.id === (b.id1 === pivot.id ? b.id2 : b.id1))).filter(n => !!n) as Atom[];

            // Federkraft
            connected.forEach(b => {
                const n = atoms.find(at => at.id === (b.id1 === pivot.id ? b.id2 : b.id1));
                if (!n) return;
                const dx = n.x - pivot.x; const dy = n.y - pivot.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const ideal = getIdealBondLength(b, atoms); 
                const f = (dist - ideal) * kStretch;
                forces.get(pivot.id)!.fx += (dx / dist) * f;
                forces.get(pivot.id)!.fy += (dy / dist) * f;
            });

            // Winkel erzwingen (Macht aus schiefen Ringen echte Hexagone!)
            if (neighbors.length >= 2) {
                for (let j = 0; j < neighbors.length; j++) {
                    for (let k = j + 1; k < neighbors.length; k++) {
                        const n1 = neighbors[j]; const n2 = neighbors[k];
                        const a1 = Math.atan2(n1.y - pivot.y, n1.x - pivot.x);
                        const a2 = Math.atan2(n2.y - pivot.y, n2.x - pivot.x);
                        let diff = a1 - a2;
                        while (diff > Math.PI) diff -= 2*Math.PI;
                        while (diff < -Math.PI) diff += 2*Math.PI;

                        // Bei zwei Nachbarn wollen wir immer ca. 120 Grad anpeilen
                        let target = (2 * Math.PI) / neighbors.length;
                        if (neighbors.length === 2) target = (2 * Math.PI) / 3;

                        const f = (Math.abs(diff) - target) * kAngle;
                        const pushDir = diff > 0 ? 1 : -1;
                        forces.get(n1.id)!.fx += Math.cos(a1 + pushDir * 0.5) * f;
                        forces.get(n1.id)!.fy += Math.sin(a1 + pushDir * 0.5) * f;
                    }
                }
            }
        });

        // 3. Bewegung anwenden
        atoms.forEach(a => {
            const f = forces.get(a.id)!;
            a.x += Math.max(-5, Math.min(5, f.fx));
            a.y += Math.max(-5, Math.min(5, f.fy));
        });
    }
}