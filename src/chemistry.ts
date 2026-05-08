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
    // Gruppen 15, 16, 17: + erhöht Bindigkeit (N+ = 4, O+ = 3), - senkt Bindigkeit (N- = 2, O- = 1)
    if (["N", "P", "O", "S", "F", "Cl", "Br", "I"].includes(element)) return Math.max(0, baseValence + charge);
    
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

export function getAtomLabel(atom: Atom, bonds: Bond[], bondOnRight: boolean = false): string {
    const hCount = getImplicitHydrogens(atom, bonds);
    const chargeStr = formatCharge(atom.charge);
    
    // Für Kohlenstoff
    if (atom.element === "C") {
        if (atom.charge || atom.radical) {
            if (hCount === 0) return "C" + chargeStr;
            if (hCount === 1) return bondOnRight ? "HC" + chargeStr : "CH" + chargeStr;
            return bondOnRight ? "H" + toSubscript(hCount) + "C" + chargeStr : "CH" + toSubscript(hCount) + chargeStr;
        } else {
            if (hCount === 4) return bondOnRight ? "H₄C" : "CH₄";
            return ""; // Skelett-C bleibt unsichtbar
        }
    }
    
    // Für alle anderen Heteroatome (O, N, S, etc.)
    if (hCount === 0) return atom.element + chargeStr;
    if (hCount === 1) return bondOnRight ? "H" + atom.element + chargeStr : atom.element + "H" + chargeStr;
    
    return bondOnRight 
        ? "H" + toSubscript(hCount) + atom.element + chargeStr 
        : atom.element + "H" + toSubscript(hCount) + chargeStr;
}

export function hasValenceError(atom: Atom, bonds: Bond[]): boolean {
    const data = periodicTable[atom.element];
    if (!data) return false;
    
    let targetValence = Math.max(...data.valency);
    targetValence = getAdjustedValence(atom.element, atom.charge || 0, targetValence);
    if (atom.radical) targetValence -= 1;

    let currentBonds = 0;
    for (const bond of bonds) {
        if (bond.id1 === atom.id || bond.id2 === atom.id) {
            // FIX: Auch hier! Keile und Dashes sind Einfachbindungen!
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

export function applyForceLayout(atoms: Atom[], bonds: Bond[], iterations: number = 150) {
    if (atoms.length === 0) return;

    const idealDist = 60;   
    const kRepulsion = 2500; 
    const kAttraction = 0.08; 

    for (let i = 0; i < iterations; i++) {
        const forces = new Map<number, { fx: number, fy: number }>();
        atoms.forEach(a => forces.set(a.id, { fx: 0, fy: 0 }));

        for (let j = 0; j < atoms.length; j++) {
            for (let l = j + 1; l < atoms.length; l++) {
                const a = atoms[j];
                const b = atoms[l];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const distSq = dx * dx + dy * dy || 1;
                const dist = Math.sqrt(distSq);

                const force = kRepulsion / distSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                forces.get(a.id)!.fx += fx;
                forces.get(a.id)!.fy += fy;
                forces.get(b.id)!.fx -= fx;
                forces.get(b.id)!.fy -= fy;
            }
        }

        bonds.forEach(bond => {
            const a = atoms.find(at => at.id === bond.id1);
            const b = atoms.find(at => at.id === bond.id2);
            if (!a || !b) return;

            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            
            // Federkraft (Hookesches Gesetz)
            const targetDist = getIdealBondLength(bond, atoms) || idealDist;
            const force = (dist - targetDist) * kAttraction;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            forces.get(a.id)!.fx -= fx;
            forces.get(a.id)!.fy -= fy;
            forces.get(b.id)!.fx += fx;
            forces.get(b.id)!.fy += fy;
        });

        atoms.forEach(a => {
            const f = forces.get(a.id)!;
            a.x += Math.max(-15, Math.min(15, f.fx));
            a.y += Math.max(-15, Math.min(15, f.fy));
        });
    }
}

// Wir behalten die alte Funktion als Alias bei, damit wir nicht alles umbauen müssen
export function applyAutoLayout(atoms: Atom[], bonds: Bond[]) {
    applyForceLayout(atoms, bonds);
}