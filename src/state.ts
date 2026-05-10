import { Atom, Bond, EditorState } from "./types";

// --- PRIVATE DATEN (Single Source of Truth) ---
let atoms: Atom[] = [];
let bonds: Bond[] = [];
let nextId = 1;
let currentElement = "C";
let selectedAtomIDs = new Set<number>();
let historyState: EditorState[] = [];
let is3DMode = false;

// --- PUBLIC INTERFACE ---
export const state = {
    getAtoms: () => atoms,
    getBonds: () => bonds,
    getCurrentElement: () => currentElement,
    
    getNextId: () => nextId++, 

    setAtoms: (newAtoms: Atom[]) => { 
        atoms = newAtoms; 
        
        let maxId = 0;
        atoms.forEach(a => { if (a.id > maxId) maxId = a.id; });
        if (maxId >= nextId) {
            nextId = maxId + 1;
        }
    },
    setBonds: (newBonds: Bond[]) => { bonds = newBonds; },
    setCurrentElement: (el: string) => { currentElement = el; },

    addAtom: (atom: Atom) => { atoms.push(atom); },
    addBond: (bond: Bond) => { bonds.push(bond); },

    // ----------------------------
    // HISTORY & MANAGEMENT
    // ----------------------------

    saveState: () => {
        const snapshot: EditorState = {
            atoms: JSON.parse(JSON.stringify(atoms)),
            bonds: JSON.parse(JSON.stringify(bonds)),
            nextId: nextId,
            currentElement: currentElement
        };
        historyState.push(snapshot);
        console.log("State saved. History size:", historyState.length);
    },

    getSelectedAtomIds: () => selectedAtomIDs,
    selectAtoms: (ids: number[]) => {
        selectedAtomIDs = new Set(ids);
    },

    addToSelection: (ids: number[]) => {
        ids.forEach(id => selectedAtomIDs.add(id));
    },

    clearSelection: () => {
        selectedAtomIDs.clear();
    },

    isSelected: (atomId: number) => selectedAtomIDs.has(atomId),

    // Schritt zurück
    undo: (): boolean => {
        if (historyState.length === 0) {
            console.log("Nothing to undo.");
            return false; 
        }

        const lastState = historyState.pop();
        if (!lastState) return false;

        atoms = lastState.atoms;
        bonds = lastState.bonds;
        nextId = lastState.nextId;
        currentElement = lastState.currentElement;

        console.log("Undo successful. Atoms:", atoms.length);
        return true; 
    },

    get is3DMode() { return is3DMode; },
    set3DMode: (val: boolean) => { is3DMode = val; },
    
    clear: () => {
        state.saveState();
        atoms = [];
        bonds = [];
        nextId = 1;
        // currentElement behalten wir meistens bei
    }

    //Lasso
}
