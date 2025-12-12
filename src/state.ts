import { Atom, Bond, EditorState } from "./types"

// Die Daten sind privat (nicht direkt exportiert), damit niemand sie versehentlich überschreibt
let atoms: Atom[] = [];
let bonds: Bond[] = [];
let nextId = 1;

// Wir bieten Funktionen an, um die Daten zu lesen und zu ändern
export const state = {
    getAtoms: () => atoms,
    getBonds: () => bonds,
    
    addAtom: (atom: Atom) => {
        atoms.push(atom);
        nextId++; // oder id logik anpassen
    },
    
    setAtoms: (newAtoms: Atom[]) => { atoms = newAtoms; },
    setBonds: (newBonds: Bond[]) => { bonds = newBonds; },
    
    getNextId: () => nextId++,
};
