// src/smiles.ts
import { Atom, Bond } from "./types";

function getSmilesAtomString(atom: Atom): string {
    if (atom.element.startsWith('[')) return atom.element;

    if (atom.charge || atom.radical) {
        let chargeStr = "";
        if (atom.charge) {
            if (atom.charge === 1) chargeStr = "+";
            else if (atom.charge === -1) chargeStr = "-";
            else if (atom.charge > 1) chargeStr = `+${atom.charge}`;
            else if (atom.charge < -1) chargeStr = `${atom.charge}`; // z.B. "-2"
        }
        return `[${atom.element}${chargeStr}]`;
    }

    const organicSubset = ["B", "C", "N", "O", "P", "S", "F", "Cl", "Br", "I"];
    if (!organicSubset.includes(atom.element)) {
        return `[${atom.element}]`;
    }

    return atom.element;
}

export function generateSmiles(atoms: Atom[], bonds: Bond[]): string {
    if (atoms.length === 0) return "";
    
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

    let smiles = "";
    let ringCounter = 1;
    
    const atomRingClosures: Record<number, string[]> = {};
    atoms.forEach(a => atomRingClosures[a.id] = []);

    const treeEdges = new Set<Bond>();
    const ringEdges = new Set<Bond>();
    const globalVisited = new Set<number>();

    for (const a of atoms) {
        if (globalVisited.has(a.id) || a.element === "DUMMY" || a.element === "TEXT") continue;
        
        const dfsBuildTree = (currId: number, prevId: number | null) => {
            globalVisited.add(currId);
            for (const n of adj[currId]) {
                if (n.to.id === prevId) continue;
                
                if (globalVisited.has(n.to.id)) {
                    // Ring gefunden! 
                    if (!ringEdges.has(n.bond)) {
                        ringEdges.add(n.bond);
                        const rNum = ringCounter++;
                        let rStr = rNum.toString();
                        
                        if (rNum > 9) rStr = "%" + rStr; 
                        
                        let prefix = "";
                        if (n.bond.type === 2) prefix = "=";
                        if (n.bond.type === 3) prefix = "#";
                        
                        atomRingClosures[currId].push(prefix + rStr);
                        atomRingClosures[n.to.id].push(rStr); 
                    }
                } else {
                    treeEdges.add(n.bond);
                    dfsBuildTree(n.to.id, currId);
                }
            }
        };
        dfsBuildTree(a.id, null);
    }

    // SMILES String aufbauen
    const printed = new Set<number>();
    
    function dfsPrint(curr: Atom, prev: Atom | null) {
        printed.add(curr.id);
        
        smiles += getSmilesAtomString(curr);

        if (atomRingClosures[curr.id].length > 0) {
            smiles += atomRingClosures[curr.id].join('');
        }

        const children = adj[curr.id].filter(n => n.to.id !== prev?.id && treeEdges.has(n.bond) && !printed.has(n.to.id));
        
        for (let i = 0; i < children.length; i++) {
            const isLast = i === children.length - 1;
            if (!isLast) smiles += '(';
            
            if (children[i].bond.type === 2) smiles += '=';
            if (children[i].bond.type === 3) smiles += '#';
            
            dfsPrint(children[i].to, curr);
            
            if (!isLast) smiles += ')';
        }
    }

    // Generierung für alle (auch unverbundene) Moleküle starten
    for (const a of atoms) {
        if (!printed.has(a.id) && a.element !== "DUMMY" && a.element !== "TEXT") {
            if (smiles !== "") smiles += ".";
            dfsPrint(a, null);
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
            i++; 
        }
    }
    
    return { atoms, bonds };
}