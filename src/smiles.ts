// src/smiles.ts
import { Atom, Bond } from "./types";

// --- 1. SMILES EXPORT (Generator) ---
export function generateSmiles(atoms: Atom[], bonds: Bond[]): string {
    if (atoms.length === 0) return "";
    
    // Adjazenzliste bauen (Wer ist mit wem verbunden?)
    const adj: Record<number, {to: Atom, bond: Bond}[]> = {};
    atoms.forEach(a => adj[a.id] = []);
    bonds.forEach(b => {
        const a1 = atoms.find(a => a.id === b.id1);
        const a2 = atoms.find(a => a.id === b.id2);
        if (a1 && a2) {
            adj[a1.id].push({to: a2, bond: b});
            adj[a2.id].push({to: a1, bond: b});
        }
    });

    const visited = new Set<number>();
    let smiles = "";
    let ringCounter = 1;
    const ringMap = new Map<string, number>();

    function dfs(curr: Atom, prev: Atom | null) {
        visited.add(curr.id);
        
        // Element + Ladung formatieren (z.B. [O-])
        let elStr = curr.element;
        if (curr.charge || curr.radical) {
            let chargeStr = "";
            if (curr.charge) chargeStr = curr.charge > 0 ? `+${curr.charge === 1 ? '' : curr.charge}` : `-${curr.charge === -1 ? '' : Math.abs(curr.charge)}`;
            elStr = `[${curr.element}${chargeStr}]`;
        }
        smiles += elStr;

        const neighbors = adj[curr.id].filter(n => n.to.id !== prev?.id);
        const unvisited = neighbors.filter(n => !visited.has(n.to.id));
        const ringClosures = neighbors.filter(n => visited.has(n.to.id));

        // Ringschlüsse verarbeiten (Zahlen 1-9)
        for (const r of ringClosures) {
            const bondId = [curr.id, r.to.id].sort().join('-');
            if (!ringMap.has(bondId)) {
                ringMap.set(bondId, ringCounter++);
            }
            const rNum = ringMap.get(bondId)!;
            if (r.bond.type === 2) smiles += '=';
            if (r.bond.type === 3) smiles += '#';
            smiles += rNum.toString();
        }

        // Verzweigungen verarbeiten
        for (let i = 0; i < unvisited.length; i++) {
            const isLast = i === unvisited.length - 1;
            if (!isLast) smiles += '(';
            if (unvisited[i].bond.type === 2) smiles += '=';
            if (unvisited[i].bond.type === 3) smiles += '#';
            dfs(unvisited[i].to, curr);
            if (!isLast) smiles += ')';
        }
    }

    // Für unverbundene Moleküle (z.B. Ionen oder Reaktionsgleichungen)
    for (const a of atoms) {
        if (!visited.has(a.id) && a.element !== "DUMMY" && a.element !== "TEXT") {
            if (smiles !== "") smiles += ".";
            dfs(a, null);
        }
    }

    return smiles;
}

// --- 2. SMILES IMPORT (Parser) ---
export function parseSmiles(smiles: string, startX: number, startY: number): { atoms: Atom[], bonds: Bond[] } {
    const atoms: Atom[] = [];
    const bonds: Bond[] = [];
    const stack: Atom[] = [];
    const rings: Record<number, Atom> = {};
    
    let currentAtom: Atom | null = null;
    let currentBondType = 1;
    let nextId = Date.now(); 

    let x = startX;
    let y = startY;
    let i = 0;

    while (i < smiles.length) {
        const char = smiles[i];
        
        if (char === '(') {
            if (currentAtom) stack.push(currentAtom);
            i++;
        } else if (char === ')') {
            currentAtom = stack.pop() || null;
            i++;
        } else if (char === '=') {
            currentBondType = 2; i++;
        } else if (char === '#') {
            currentBondType = 3; i++;
        } else if (char === '.') {
            currentAtom = null; 
            x += 100; // Platz für neues Molekül machen
            i++;
        } else if (char >= '1' && char <= '9') {
            const ringNum = parseInt(char);
            if (rings[ringNum]) {
                bonds.push({ id1: currentAtom!.id, id2: rings[ringNum].id, type: currentBondType });
                delete rings[ringNum];
                currentBondType = 1;
            } else if (currentAtom) {
                rings[ringNum] = currentAtom;
            }
            i++;
        } else if (char === '[') {
            const end = smiles.indexOf(']', i);
            if (end === -1) { i++; continue; }
            const block = smiles.substring(i + 1, end);
            
            const elMatch = block.match(/[a-zA-Z]+/);
            let element = elMatch ? elMatch[0] : 'C';
            element = element.charAt(0).toUpperCase() + element.slice(1);
            
            let charge = 0;
            if (block.includes('+')) {
                const m = block.match(/\+(\d*)/);
                charge = (m && m[1]) ? parseInt(m[1]) : 1;
            } else if (block.includes('-')) {
                const m = block.match(/\-(\d*)/);
                charge = (m && m[1]) ? -parseInt(m[1]) : -1;
            }

            const atom: Atom = { id: nextId++, element, x, y, charge: charge !== 0 ? charge : undefined };
            atoms.push(atom);
            if (currentAtom) bonds.push({ id1: currentAtom.id, id2: atom.id, type: currentBondType });
            currentAtom = atom;
            currentBondType = 1;
            
            x += 40; y = (y === startY) ? startY + 20 : startY; // Zick-Zack Layout
            i = end + 1;
        } else if (/[a-zA-Z]/.test(char)) {
            let element = char;
            // Erkennung von Elementen wie Cl, Br (nur wenn erster Buchstabe groß ist)
            if (i + 1 < smiles.length && /[a-z]/.test(smiles[i+1]) && char === char.toUpperCase()) {
                element += smiles[i+1];
                i++;
            }
            element = element.charAt(0).toUpperCase() + element.slice(1);
            
            const atom: Atom = { id: nextId++, element, x, y };
            atoms.push(atom);
            if (currentAtom) bonds.push({ id1: currentAtom.id, id2: atom.id, type: currentBondType });
            currentAtom = atom;
            currentBondType = 1;
            
            x += 40; y = (y === startY) ? startY + 20 : startY; // Zick-Zack Layout
            i++;
        } else {
            i++; // Stereochemie (@, \, /) für einfaches 2D ignorieren
        }
    }
    
    return { atoms, bonds };
}