export interface Atom {
    id: number;
    element: string;
    x: number;
    y: number;
    charge?: number;
    radical?: boolean;
    customLabel?: string;
    autoFlip?: boolean;
    alignFirstLetter?: boolean;
    color?: string;      // Individuelle Farbe
    fontFamily?: string; // Individuelle Schriftart   
}

export interface Bond {
    id1: number;
    id2: number;
    type: number;
    color?: string;      // Individuelle Farbe
    spacing?: number;    // Individueller Abstand für Doppel-/Dreifachbindungen
}

export interface EditorState {
    atoms: Atom[];
    bonds: Bond[];
    nextId: number;
    currentElement: string;
}