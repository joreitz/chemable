export interface Atom {
    id: number;
    element: string;
    x: number;      // 2D-Projektion X
    y: number;      // 2D-Projektion Y
    z?: number;     // Aktuelle Tiefe (für Fog & Z-Sorting) 
    
    orig3DX?: number;
    orig3DY?: number;
    orig3DZ?: number;

    charge?: number;
    radical?: boolean;
    color?: string;
    fontFamily?: string;
    customLabel?: string;
    autoFlip?: boolean;
    alignFirstLetter?: boolean;
    chargeAngle?: number;
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
    graphics: Graphic[];
    nextId: number;
    currentElement: string;
}

export type GraphicKind = string;

export interface Graphic {
    id: number;
    kind: GraphicKind;
    x1: number; y1: number;
    x2: number; y2: number;
    bow?: number;        
    color?: string;
    lineWidth?: number;
    radius?: number;
    z?: number;     
}